# ADR 0010 — A dead-code gate, in a git hook, without husky

- **Status:** Accepted
- **Date:** 2026-08-05

## Context

TypeScript's `noUnusedLocals` and Biome's `noUnusedVariables` are both **file-scoped**. Neither
builds an import graph, so neither can see an exported symbol nobody imports, a file nobody
reaches, or a dependency nobody uses.

That gap is not theoretical: **8.5 MB of unused `recharts` sat in production dependencies** until
the 2026-08-05 sweep found it, alongside `js-yaml` and two other packages, plus 133 orphaned
translation keys.

## Decision

`npm run check:dead` runs **knip** (`knip.json`), at two points:

- **`.githooks/pre-commit`**, armed by `npm install` through a `prepare` script that sets
  `core.hooksPath`. No husky — a hook is nine lines of shell and one config line.
- **`prebuild`**, alongside the supply-chain check, so `git commit --no-verify` *defers* the
  failure to build time rather than avoiding it.

## Consequences

**Most findings are config faults, not dead symbols.** Three of the first four were: `tailwindcss`
looked unused because `.css` was outside `project`; everything exported for a test looked unused
because `tests/**` was; `*Props` interfaces were reported until `ignoreExportsUsedInFile` recorded
the decision to keep them. Suppressing the first would have deleted a live dependency. **Fix the
config, do not suppress the finding.**

**Entry points knip cannot follow must be declared** — `new Worker(new URL(...))` is the reason
`resilienceWorker.ts` is in `entry`.

**It fails spuriously inside git worktrees** whose `node_modules` is near-empty (agent worktrees
under `.claude/worktrees/`), reporting unlisted binaries and unused devDependencies. Run the gate
on the main checkout.

**No husky** means no extra dependency, no `postinstall` script, and a hook that is readable shell.
It also means the hook is not installed until someone runs `npm install`, which `prebuild` covers.

## Alternatives rejected

- **CI-only.** Finds it after the push, when the offending code is already in a PR.
- **husky.** A dependency and a lifecycle script to do what one `git config` line does.
- **`ts-prune`.** Reports unused exports but not unimported files or unused dependencies — it
  would have missed the `recharts` case entirely.
