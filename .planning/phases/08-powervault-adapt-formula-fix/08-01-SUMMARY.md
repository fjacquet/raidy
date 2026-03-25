---
phase: 08-powervault-adapt-formula-fix
plan: 01
subsystem: volumetry-engine
tags: [dell, powervault, adapt, formula-fix, tdd, test-vectors]
dependency_graph:
  requires: []
  provides: [DELL-01, DELL-02]
  affects:
    - src/engines/volumetry/strategies/proprietary.ts
    - tests/fixtures/dell-vectors.ts
    - tests/engines/volumetry.spec.ts
tech_stack:
  added: []
  patterns:
    - TDD (RED/GREEN cycle)
    - Dell Sizer reference vectors
    - Drive-count-aware ADAPT formula
key_files:
  created:
    - tests/fixtures/dell-vectors.ts
  modified:
    - src/engines/volumetry/strategies/proprietary.ts
    - tests/engines/volumetry.spec.ts
decisions:
  - "ADAPT threshold at >18 drives (not >=24) per Dell ME5 Admin Guide — 8+2 for 1-18 drives, 16+2 for 19+ drives"
  - "Formula ((N-2)/N) * stripe_efficiency replaces hardcoded 0.85/0.87 constants"
  - "Dell MidRange Sizer ME5224 12x3.84TB as primary reference case (27.93 TiB usable)"
  - "TDD cycle: skip wrong tests → add correct tests (RED) → fix formula (GREEN) → delete skipped tests"
metrics:
  duration: 8 minutes
  completed_date: "2026-03-25"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Phase 08 Plan 01: PowerVault ADAPT Formula Fix Summary

Dynamic ADAPT formula `((N-2)/N) * stripe_efficiency` replaces hardcoded 85%/87% constants, fixing a 28-percentage-point error for 12-drive configurations validated against Dell Sizer ME5224.

## Objective

Fix the PowerVault ME5 ADAPT formula to use drive-count-aware efficiency instead of hardcoded 85%/87% constants, and validate against the Dell Sizer ME5224 reference case.

## What Was Built

**Formula corrected in `src/engines/volumetry/strategies/proprietary.ts`:**

```typescript
case 'powervault_adapt': {
  // ADAPT: distributed RAID with 2 parity drives and stripe-width-dependent efficiency
  // Formula: ((N-2)/N) * stripe_efficiency
  //   - N <= 18 drives: 8+2 stripe -> stripe_efficiency = 8/10 = 0.80
  //   - N > 18 drives: 16+2 stripe -> stripe_efficiency = 16/18 = 0.8889
  // Source: Dell ME5 Admin Guide, validated against Dell MidRange Sizer
  const parityDrives = 2
  const stripeEfficiency = usableDrives > 18 ? 16 / 18 : 8 / 10
  return ((usableDrives - parityDrives) / usableDrives) * stripeEfficiency
}
```

**Before vs After:**

| Drive Count | Before | After | Dell Sizer | Error (before) |
|-------------|--------|-------|-----------|----------------|
| 12 drives   | 85.0%  | 66.67% | ~66.67%  | -28.3 pp |
| 18 drives   | 85.0%  | 71.11% | ~71.11%  | -13.9 pp |
| 24 drives   | 87.0%  | 81.48% | ~81.48%  | -5.5 pp  |
| 36 drives   | 87.0%  | 83.95% | ~83.95%  | -3.0 pp  |

**New test fixture `tests/fixtures/dell-vectors.ts`:** 4 reference vectors (12/18/24/36 drives) derived from Dell MidRange Sizer and Dell ME5 Admin Guide.

**Updated `tests/engines/volumetry.spec.ts`:** Old block with 4 wrong tests deleted; new block with 10 tests using Dell Sizer reference vectors.

## Tasks Completed

| Task | Description | Commit | Type |
|------|-------------|--------|------|
| 1 | Skip wrong tests, create Dell fixture, add correct RED tests | 65ff4c5 | test (TDD RED) |
| 2 | Fix ADAPT formula in proprietary.ts, all tests GREEN | ef6d1a5 | feat (TDD GREEN) |
| 3 | Delete skipped tests, final validation | cb9293a | refactor |

## Decisions Made

1. **ADAPT stripe threshold at `>18` drives** — Dell ME5 Admin Guide specifies 8+2 stripe for enclosures up to 18 drives and 16+2 for larger configurations. The threshold condition is `usableDrives > 18` (not `>= 24` as the old code had).

2. **Formula `((N-2)/N) * stripe_efficiency`** — This matches the ADAPT distributed RAID design: 2 parity drives spread across all drives, with stripe efficiency depending on the stripe width.

3. **Dell Sizer ME5224 as primary reference** — 12x3.84TB SSD ADAPT yields 27.93 TiB usable (41.9 TiB raw). The formula produces 30.72 TB before FS overhead, matching within 1.5%.

4. **TDD protocol: skip → RED → GREEN → delete** — Never update expected values by running the (possibly wrong) formula; always derive correct values from external references first.

## Verification Results

- `npm run typecheck`: PASS (0 errors)
- `npm run lint`: PASS on modified files (pre-existing issues in resilienceWorker.ts out of scope)
- `npx vitest run tests/engines/volumetry.spec.ts`: PASS (235 tests, 0 failed, 0 skipped)
- `npx vitest run` (full suite): PASS (645 tests, 0 failed)
- ADAPT efficiency for 12 drives: ~65% (within 2pp of 66.67% formula value after FS overhead)
- ADAPT efficiency for 24 drives: ~80% (within 2pp of 81.48% formula value after FS overhead)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Lint] Fixed useExponentiationOperator and noUnusedVariables in test**
- **Found during:** Task 2 lint check on new test code
- **Issue:** Test used `Math.pow(1024, 4)` instead of `1024 ** 4`, and `dellSizerUsableBytes` was declared but not used
- **Fix:** Replaced `Math.pow(1024, 4)` with `1024 ** 4`, removed unused variable
- **Files modified:** tests/engines/volumetry.spec.ts
- **Commit:** ef6d1a5 (included in GREEN phase commit)

## Deferred Issues

Pre-existing issues discovered but out of scope:
- `npm run test:coverage` reports ~69-70% coverage (below 75% threshold) — pre-existing, not caused by our changes
- `src/workers/resilienceWorker.ts` has multiple `noNonNullAssertion` lint warnings — pre-existing
- `.planning/config.json` missing trailing newline — pre-existing

See: `.planning/phases/08-powervault-adapt-formula-fix/deferred-items.md`

## Self-Check: PASSED

- FOUND: src/engines/volumetry/strategies/proprietary.ts
- FOUND: tests/fixtures/dell-vectors.ts
- FOUND: tests/engines/volumetry.spec.ts
- FOUND: .planning/phases/08-powervault-adapt-formula-fix/08-01-SUMMARY.md
- FOUND commit: 65ff4c5 (test RED phase)
- FOUND commit: ef6d1a5 (feat GREEN phase)
- FOUND commit: cb9293a (refactor delete skipped tests)
