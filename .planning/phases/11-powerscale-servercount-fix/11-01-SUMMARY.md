---
phase: 11-powerscale-servercount-fix
plan: "01"
subsystem: volumetry-engine
tags: [tdd, bugfix, dell, powerscale, onefs, calculation-accuracy]
dependency_graph:
  requires: []
  provides: [DELL-07, DELL-08]
  affects: [src/engines/volumetry/strategies/dell.ts, src/engines/volumetry/helpers/calculationHelpers.ts]
tech_stack:
  added: []
  patterns: [strategy-pattern, tdd-red-green, options-threading]
key_files:
  created:
    - tests/fixtures/dell-vectors.ts (extended with DellPowerscaleVector and dellPowerscaleVectors)
  modified:
    - src/engines/volumetry/strategies/dell.ts
    - src/engines/volumetry/helpers/calculationHelpers.ts
    - tests/engines/volumetry.spec.ts
decisions:
  - "Use serverCount (nodeCount) not driveCount in PowerScale N+x formula: OneFS protection is node-level"
  - "Fallback to usableDrives (driveCount) when no serverCount provided for backward compatibility"
  - "Mirror cases (2x, 3x) remain fixed ratios independent of node count"
metrics:
  duration: "7 minutes"
  completed: "2026-03-25"
  tasks_completed: 3
  files_modified: 4
---

# Phase 11 Plan 01: PowerScale ServerCount Fix Summary

Fixed PowerScale N+x capacity calculations to use serverCount (node count) instead of driveCount as the denominator in the OneFS protection formula — correcting a 19-percentage-point error that caused massive over-provisioning estimates for multi-drive-per-node clusters.

## What Was Done

### The Bug

PowerScale (OneFS) protection overhead is node-level, not drive-level. The formula is `N/(N+M)` where N = data nodes and M = protection nodes. The buggy code used `usableDrives` (total drive count) as the denominator, causing:

- 10-node x 36-drive N+2 cluster: computed `(360-2)/360 = 99.4%` instead of correct `(10-2)/10 = 80.0%`
- A 19.4-percentage-point error in capacity estimates

### The Fix

**`src/engines/volumetry/strategies/dell.ts`:**
- Added `DellPowerscaleOptions` interface for typed `serverCount` extraction from options
- Changed `calculateDataFraction` signature to accept `options?: unknown` parameter
- Replaced `usableDrives` with `nodeCount` (extracted from `opts?.serverCount`) in all PowerScale N+x cases
- Added fallback: `opts?.serverCount ?? usableDrives` for backward compatibility when no serverCount provided
- Mirror cases (2x=50%, 3x=33.3%) remain fixed ratios independent of node count

**`src/engines/volumetry/helpers/calculationHelpers.ts`:**
- Added `case 'powerscale':` to the switch statement, passing `{ serverCount }` in options
- This threads the store's serverCount (node count) to the Dell strategy, mirroring the existing vSAN pattern

### TDD Process

**RED (Task 1):** Added 8 Dell OneFS reference vectors in `tests/fixtures/dell-vectors.ts` and a test block in `volumetry.spec.ts`. Tests confirmed to fail (0.9944 returned instead of 0.80 for 10-node N+2). Also updated existing Snapshot Reserve tests to pass `serverCount=driveCount` for single-drive-per-node clusters.

**GREEN (Task 2):** Implemented the fix. All 269 volumetry tests pass.

**CLEANUP (Task 3):** Full suite (679 tests), typecheck, lint, and production build all clean.

## Verification Results

| Check | Result |
|-------|--------|
| `calculateDataFraction('powerscale_n2', 360, { serverCount: 10 })` | 0.80 (was 0.9944) |
| `calculateDataFraction('powerscale_n1', 144, { serverCount: 4 })` | 0.75 |
| 4-node vs 10-node N+2 (120 drives each): different efficiency | PASS |
| `npx vitest run` | 679 PASS, 0 FAIL |
| `npm run typecheck` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Success |
| Zero `it.skip` in volumetry.spec.ts | Confirmed |

## Decisions Made

1. **Use serverCount (nodeCount) not driveCount**: OneFS protection formula is node-level per Dell Info Hub documentation
2. **Fallback to usableDrives**: When serverCount not provided (e.g., legacy/test code), fall back to driveCount to preserve backward compatibility
3. **Mirror cases unchanged**: 2x and 3x mirror ratios are fixed (50%/33.3%) regardless of node count

## Deviations from Plan

**None** — plan executed exactly as written. The snapshot reserve tests were updated in Task 1 (as planned in Task 3) since they would remain passing during the RED phase either way (serverCount=10 with 10 drives produces identical result whether using the new or old code path).

## Self-Check

- [x] `tests/fixtures/dell-vectors.ts` contains `dellPowerscaleVectors` — FOUND
- [x] `src/engines/volumetry/strategies/dell.ts` contains `nodeCount` and `DellPowerscaleOptions` — FOUND
- [x] `src/engines/volumetry/helpers/calculationHelpers.ts` contains `case 'powerscale'` — FOUND
- [x] Commits 208c68a, 7353870, 54f9381 — FOUND

## Self-Check: PASSED
