# Configuration: CI, security gates & deployment

The CI/CD pipeline is a single workflow, `.github/workflows/static.yml`, that runs on push and PR to `maincd`, on `v*` tags, and via manual dispatch. It builds on **Node 24** with all third-party actions **pinned to commit SHAs**. A separate `.github/workflows/codeql.yml` runs CodeQL static analysis.

## Pipeline (build job, in order)

1. **Supply-chain gate** — `node scripts/check-supply-chain.mjs`, run *before* `npm ci` so a tainted manifest never installs.
2. `npm ci`
3. **`npm audit --audit-level=low`** — fails on any LOW+ advisory.
4. **OSV-Scanner** — scans `package-lock.json`, emits SARIF (uploaded to the Security tab), then a gate fails the build on any LOW+ finding.
5. **Type check** — `npm run typecheck` (app + test projects).
6. **Lint** — `npm run lint` (Biome).
7. **Test** — `npm run test:run` (Vitest).
8. **Build** — `npm run build`.
9. **Bundle-size gate** — `npm run check:bundle-size`.
10. **CycloneDX SBOM** — generated for prod deps, uploaded as an artifact, and attached to the GitHub Release on `v*` tags.
11. **Deploy** — Pages artifact upload + deploy, gated to `maincd` non-PR.

## Security gates in detail

### Supply-chain denylist — `scripts/check-supply-chain.mjs`
Raidy is 100% client-side; the only sanctioned egress is the user explicitly sharing a config via the URL hash. A bundled analytics/error-reporting SDK would be a latent exfiltration path, so the gate fails if any telemetry package (Sentry, PostHog, Amplitude, Mixpanel, Datadog, LogRocket, Segment, FullStory, Hotjar, Google Analytics, …) appears in `dependencies` or `devDependencies`. Runs as the `prebuild` hook too.

### Dependency advisories
Two complementary scanners, both gating at **LOW+**: `npm audit` (npm advisory DB) and **OSV-Scanner** (`osv-scanner.toml`, OSV.dev). There are currently **no waivers**; to add one, append an `[[IgnoredVulns]]` block to `osv-scanner.toml` with a justification and an `ignoreUntil` expiry.

### Bundle-size budgets — `scripts/check-bundle-size.mjs`
Post-build gzip tripwires (regression detection, not hard limits):

| Chunk | Budget (gz) | Why |
|---|---|---|
| `index-<hash>.js` (eager app) | ≤ 420 KiB | First-paint payload; bloat hurts load time. |
| `vendor-pdf-<hash>.js` (lazy) | ≤ 170 KiB | jspdf + jspdf-autotable; catches e.g. html2canvas creeping back. |

When a change legitimately exceeds a budget, bump the threshold in the script on purpose (and note it here).

## Deployment

GitHub Pages, base path `/raidy/` (set in `vite.config.ts`), served at `https://fjacquet.github.io/raidy/`. Deploy runs only on `maincd` (non-PR) via the Pages artifact mechanism.

## Local equivalents

```bash
npm run check:supply-chain      # telemetry denylist
npm audit --audit-level=low     # advisory gate
npm run typecheck && npm run lint && npm run test:run && npm run build
npm run check:bundle-size       # after build
```
