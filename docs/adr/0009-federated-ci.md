# ADR 0009 — CI is federated to reusable workflows

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

Raidy and its sibling projects need the same pipeline: typecheck, lint, test, build, supply-chain
and advisory gates, SBOM, Pages deploy, tagged releases with provenance. Maintaining that
separately per repository means every improvement — and every security fix — has to be applied N
times, and drifts between applications.

## Decision

Each repository holds **thin caller workflows** that delegate to reusable workflows in
[`fjacquet/ci`](https://github.com/fjacquet/ci), pinned to `@v1`.

| Local file | Delegates to |
|---|---|
| `ci.yml` | `web-ci.yml@v1` |
| `security.yml` | `web-security.yml@v1` |
| `deploy.yml` | `web-deploy.yml@v1` |
| `release.yml` | `web-release.yml@v1` |
| `dependabot-automerge.yml` | — (inline) |

Gates that are project-specific stay local as npm scripts: the supply-chain denylist, the
dead-code gate and the bundle-size budget.

## Consequences

**The pipeline is not readable from this repository**, which is the real cost. A contributor asking
"what runs on my PR" has to open another repo. `docs/CONFIGURATION.md` therefore describes the
delegation and enumerates only the local gates, rather than restating steps it does not own.

**That failure mode has already occurred.** Until 2026-08-05, `CONFIGURATION.md` still described an
eleven-step pipeline in a single `static.yml` workflow, plus a separate `codeql.yml` — neither of
which had existed since federation. Documentation that mirrors a remote pipeline drifts silently,
so this one deliberately does not.

**Changing the pipeline means changing another repository**, with its own review. Good for
consistency, slow for a one-off experiment.

## Alternatives rejected

- **Full pipelines in each repo.** Independent, and immediately divergent.
- **A shared composite action instead of reusable workflows.** Composite actions cannot express
  job-level concerns — permissions, environments, artifact upload — which is most of what this
  pipeline does.
