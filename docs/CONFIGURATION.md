# Configuration: CI, security gates & deployment

CI is **federated**: this repository holds thin caller workflows that delegate to reusable
workflows in [`fjacquet/ci`](https://github.com/fjacquet/ci), pinned to `@v1`. There is no
pipeline defined here to read — the steps below live in the central repo, and changing them means
changing it, not this one.

| Workflow | Triggers | Delegates to |
|---|---|---|
| `ci.yml` | push + PR to `main` | `web-ci.yml@v1` (Node 24) |
| `security.yml` | push + PR to `main`, weekly cron (Mon 04:23) | `web-security.yml@v1` |
| `deploy.yml` | push to `main`, manual dispatch | `web-deploy.yml@v1` (build-dir `dist`) |
| `release.yml` | `v*` tags | `web-release.yml@v1` (no npm, no Docker) |
| `dependabot-automerge.yml` | `pull_request_target` from `dependabot[bot]` | — (inline `gh pr merge --auto --rebase`) |

`release.yml` declares `packages: write`, `id-token: write` and `attestations: write` — the first
because the reusable workflow's npm/Docker jobs validate permissions even when skipped, the other
two for the OIDC build-provenance attestation.

## Gates that live in this repository

These are the ones a contributor can run and change locally. Everything else is the central CI's.

| Gate | Command | When |
|---|---|---|
| Supply-chain denylist | `npm run check:supply-chain` | `prebuild`, so every `npm run build` |
| Dead code / unused deps | `npm run check:dead` | `prebuild` **and** `.githooks/pre-commit` |
| Bundle-size budget | `npm run check:bundle-size` | after a build |

**`prebuild` runs both `check-supply-chain` and `check:dead`.** So `npm run build` fails on a
tainted manifest or on dead code, not only in CI.

### Supply-chain denylist — `scripts/check-supply-chain.mjs`

Scans `package.json` for known telemetry/analytics packages and fails before `npm ci` can install
anything. See [ADR 0001](./adr/0001-supply-chain-audit-gate.md) for why this runs ahead of
install rather than after.

### Dead code — `knip`

`knip.json` configures it. Unused exports, unimported files and unused dependencies are invisible
to TypeScript's `noUnusedLocals` and Biome's `noUnusedVariables` — both are file-scoped, and
neither builds an import graph. See [DEVELOPMENT.md](./DEVELOPMENT.md#dead-code-gate--knip) for
how to read a finding (usually a config fault, not a dead symbol).

The pre-commit hook is armed by `npm install`, via the `prepare` script setting
`core.hooksPath .githooks`. No husky.

### Bundle-size budgets — `scripts/check-bundle-size.mjs`

Gz budgets on the eager `index` chunk and the lazy `vendor-pdf` chunk. Run it after `npm run
build`; the sizes come from `dist/`.

## Deployment

`deploy.yml` publishes to GitHub Pages on every push to `main`. The base path is `/raidy/`
(`vite.config.ts`), matching `https://fjacquet.github.io/raidy/`.

Releases are cut by pushing a `vX.Y.Z` tag, which triggers `release.yml` — tarball, zip,
`sbom.cyclonedx.json`, `SHA256SUMS` and a provenance attestation. The GitHub release is created
with GitHub's *auto-generated* notes, not the CHANGELOG body; enrich it afterwards with
`gh release edit vX.Y.Z --notes-file <file>`.

## Local equivalents

```bash
npm run typecheck               # app + test projects
npm run lint                    # Biome
npm run test:run                # Vitest, single pass
npm run check:dead              # knip
npm run check:supply-chain      # telemetry denylist
npm run build                   # runs both prebuild gates first
npm run check:bundle-size       # after build
```
