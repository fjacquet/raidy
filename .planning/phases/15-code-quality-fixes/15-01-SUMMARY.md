---
phase: "15"
plan: "01"
subsystem: resilience-worker
tags: [code-quality, type-safety, biome, non-null-assertion]
dependency_graph:
  requires: []
  provides: [QUALITY-01]
  affects: [src/workers/resilienceWorker.ts]
tech_stack:
  added: []
  patterns: [nullish-coalescing]
key_files:
  created: []
  modified:
    - src/workers/resilienceWorker.ts
decisions:
  - "Used `arr[i] ?? 0` over optional chaining because arrays are always initialized with .fill(0) — semantically identical to `!` with no behavioral change"
metrics:
  duration: "5 minutes"
  completed: "2026-04-01"
requirements: [QUALITY-01]
---

# Phase 15 Plan 01: Fix resilienceWorker.ts noNonNullAssertion Warnings Summary

**One-liner:** Replaced 14 non-null assertions (`!`) on array index accesses in resilienceWorker.ts with `?? 0` nullish coalescing — pure mechanical type-safety fix with zero behavioral change to Monte Carlo simulation.

## Status: COMPLETE

**Date:** 2026-04-01
**Requirement:** QUALITY-01

## What was done

Replaced all non-null assertion (`!`) occurrences on array index accesses in
`src/workers/resilienceWorker.ts` with `?? 0` nullish coalescing equivalents.
No behavioral change — purely type-safe refactor.

Arrays affected (all `number[]` initialized with `.fill(0)`):
- `mirrorGroupFailures` — mirror group failure tracking
- `groupFailures` — RAID group failure tracking
- `survivingPerGroup` — surviving drives per group (intermediate array)

Total replacements: 14 non-null assertions eliminated.

## Verification

- `grep '\[.*\]!' src/workers/resilienceWorker.ts` → 0 matches
- `npm run typecheck` → 0 errors
- `node_modules/.bin/biome check src/workers/resilienceWorker.ts` → No fixes applied (0 errors)
- `npm test -- --run` → 881 tests passed (20 test files)
- `npm run lint` → 0 errors for resilienceWorker.ts (pre-existing errors in other files are out of scope)

## Commits

| Hash | Description |
|------|-------------|
| 32cf624 | fix(resilience): replace non-null assertions with nullish coalescing in resilienceWorker |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Formatting] Applied Biome formatter after mechanical edits**
- **Found during:** Task 1 verification
- **Issue:** Biome formatter required minor style adjustments (parentheses removal on standalone `?? 0`, line-length wrapping for long `if` conditions, block expansion for inline `{ const cur = ... }` statements)
- **Fix:** Ran `node_modules/.bin/biome check --write src/workers/resilienceWorker.ts`
- **Files modified:** `src/workers/resilienceWorker.ts`
- **Commit:** 32cf624 (included in same commit)

## Known Stubs

None.
