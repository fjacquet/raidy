# Dead-code sweep: delete what nothing reaches, then keep it that way — Design

**Date**: 2026-08-05
**Status**: Approved
**Scope**: `package.json`, `.githooks/`, `src/components/inputs/topology-options/shared/`, `src/i18n/`, `src/engines/performance/utils/`, and `tests/i18n/`.

## Problem

The codebase enforces unused-code rules at the file level and nowhere else.

Already on, and working: TypeScript's `noUnusedLocals` and `noUnusedParameters`, Biome's `noUnusedImports` and `noUnusedVariables` — the last two as errors.

Structurally invisible to all four: **unused exports across files, files nothing imports, and unused dependencies.** Nothing in the toolchain builds an import graph, so nothing can answer "does anything reach this?"

That gap has a measured cost:

| Finding | Size |
|---|---|
| `recharts` in `dependencies`, never imported | 8.5 MB |
| `js-yaml` in `dependencies`, never imported | 1.0 MB |
| `TopologyContext.tsx` — `TopologyProvider` + `useTopologyContext`, referenced nowhere | 48 lines |
| `getMinIOPS`, `formatPercent`, `formatBytesLocalized` — one occurrence repo-wide, the declaration | 3 functions |

The two dependencies are the sharp end. The app hand-rolls its SVG charts (`SankeyDiagram`, `Speedometer`, `DonutChart`) and builds YAML from template literals, so neither library does anything — yet both sit in the production dependency graph of a project that runs a supply-chain check on every build.

## The shape of the fix

A one-off cleanup rots. `recharts` was almost certainly unused for a long time, and nothing was going to surface it. So the deletions come with a gate, and the gate is the more valuable half.

**Adopt Knip** rather than hand-rolled scans. The reconnaissance for this spec used ad-hoc scripts and got two things wrong that Knip handles correctly:

- 18 files reported as "never imported" were `index.ts` barrels imported by directory path.
- Exported symbols used only inside their own file were conflated with genuinely dead ones.

Reimplementing an import graph badly is worse than taking the dependency. Knip is 1.9 MB across 13 direct dependencies, as a **devDependency** — traded against removing 9.5 MB from `dependencies`, which is the surface that actually matters here.

## The four categories, each with its own proof

Deletions are not interchangeable, and neither is the evidence for them.

**1. Unused dependencies** — `recharts`, `js-yaml`. Proof: no import anywhere in `src`, `tests`, `scripts` or the Vite config; then `npm run build`, `check:bundle-size` and `check:supply-chain` all green after removal.

**2. Dead files and functions** — `TopologyContext.tsx`, `getMinIOPS`, `formatPercent`, `formatBytesLocalized`. Proof: exactly one occurrence of each symbol repo-wide, which is its declaration. Delete, then a green suite.

**3. Superfluous exports** — roughly fifty symbols exported but used only inside their own file. Proof: remove the `export` keyword, `npm run typecheck` passes.

**Rule, decided rather than left to judgement: React `*Props` interfaces keep their `export`.** It is an established convention that serves consumers who do not exist yet, and stripping it would touch nearly every component file to produce diff rather than clarity. What is left after that exclusion is a small set of engine-internal types, which is the part worth doing.

**4. Orphan i18n keys** — 117 candidates out of 1,034 English keys.

**The raw list is wrong and must not be acted on directly.** Keys are built dynamically at 19 call sites — `` t(`formFactor.${value}`) ``, `` t(`connectivity.${value}`) ``, `` i18n.t(`validation:${key}`) ``, `` t(`tiering.${platform}.fastTier`) ``. The scan flagged `formFactor.u2`, `formFactor.e3s` and `formFactor.m2` as orphans; all three are live.

The method: enumerate every dynamic site, expand each template against the TypeScript union or array that feeds it, mark the resulting keys live, and re-run. What is still orphaned after that expansion is dead.

The care is warranted by the failure mode. A wrongly deleted key does not crash — i18next renders the key name into the UI, and no existing test asserts against that. It fails silently, in front of a user, in a language the developer may not read.

## The gate

`.githooks/pre-commit`, activated by `git config core.hooksPath .githooks` from an npm `prepare` script — which `npm install` runs, so a fresh clone is armed without a manual step.

**No husky.** The hook is nine lines of shell and one config line; a dependency to manage that is not a trade this project should make, particularly in a spec whose subject is removing dependencies.

The hook runs `npm run check:dead` only. Lint and typecheck stay where they are — widening the hook is scope creep, and a slow pre-commit hook is a hook people bypass.

`check:dead` is also wired into `prebuild`, matching how `check:supply-chain` is already enforced. That covers the case the hook cannot: `--no-verify`, and any path that reaches a build without a commit.

**i18n orphans are enforced separately**, as a test in `tests/i18n/` beside the existing parity and placeholder-preservation specs. It carries an allowlist of dynamic prefixes, each with a stated reason — the same shape as `optionFieldsConsumed.spec.ts`'s allowlist, and the same discipline: an entry names a real prefix and says why a static scan cannot see it.

## Testing

- **No number may move.** Nothing here touches a calculation. Any changed figure means something was reachable after all: stop and report rather than adjusting an expectation. This is the same guarantee the 2026-08-05 input-panel sweep ran on, and it held across eight tasks there.
- **Falsifiability for each new gate.** The `check:dead` script must fail when a dead export is reintroduced, and the i18n test must fail when a live key is added to the orphan allowlist under a false reason. Demonstrate each by breaking it, quoting the failure, and restoring — not by asserting it works.
- `npm run build` must succeed after the dependency removals, and `check:bundle-size` must stay within budget.
- The i18n parity and placeholder tests must stay green throughout.

## Out of scope, deliberately

- **#126** — `DellOptionsPanel.tsx`. It lost 130 lines to the relevance sweep and is a refactor, not dead code.
- **#127** — the duplicated sustained-write derivation. Duplication, not deadness.
- **Unused CSS.** `src/index.css` is a single Tailwind entry point; Tailwind's own build already prunes.
- **Test-only exports.** Twenty symbols are exported for tests alone. That is a legitimate pattern for pinning internal behaviour — this project's resilience worker depends on it — and treating it as deadness would push tests toward asserting less.
