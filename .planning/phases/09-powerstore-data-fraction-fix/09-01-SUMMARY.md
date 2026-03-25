---
phase: 09-powerstore-data-fraction-fix
plan: 01
subsystem: testing
tags: [dell, powerstore, volumetry, dre, raid5, raid6, tdd, capacity]

requires:
  - phase: 08-powervault-adapt-formula-fix
    provides: TDD protocol (skip/add-correct/fix/delete) and dell-vectors.ts fixture pattern

provides:
  - Drive-count-aware DRE geometry in dell.ts for PowerStore RAID-5 and RAID-6
  - dellPowerstoreVectors fixture array with 7 Dell KB 000188491 reference vectors
  - Full PowerStore DRE test coverage in volumetry.spec.ts (14 tests)

affects: [10-powerstore-system-overhead, any future Dell storage engine work]

tech-stack:
  added: []
  patterns:
    - "TDD RED/GREEN/CLEANUP: skip wrong tests, add correct reference vectors (RED), fix formula (GREEN), restore tests with updated comments (CLEANUP)"
    - "DRE geometry selection by drive count using conditional returns (not switch)"
    - "Usable capacity tests with snapshotReservePercent:0 to isolate data fraction from overhead"

key-files:
  created:
    - tests/fixtures/dell-vectors.ts (DellPowerstoreVector interface + dellPowerstoreVectors array appended)
  modified:
    - src/engines/volumetry/strategies/dell.ts (PowerStore RAID-5/6 cases replaced with DRE thresholds)
    - tests/engines/volumetry.spec.ts (PowerStore DRE test block added, snapshot reserve tests restored)

key-decisions:
  - "PowerStore RAID-6 uses three DRE thresholds: <8 drives=4/6 (66.67%), 8-19=8/10 (80%), >=20=16/18 (88.89%)"
  - "PowerStore RAID-5 uses two DRE thresholds: <10 drives=4/5 (80%), >=10=8/9 (88.89%)"
  - "Usable capacity tests override snapshotReservePercent:0 to isolate DRE data fraction from snapshot overhead"

patterns-established:
  - "Pattern 1: Dell DRE geometry — use conditional returns in strategy calculateDataFraction; each case block uses usableDrives thresholds"

requirements-completed: [DELL-03, DELL-04]

duration: 8min
completed: 2026-03-25
---

# Phase 09 Plan 01: PowerStore Data Fraction Fix Summary

**PowerStore RAID-5/6 capacity calculations replaced hardcoded 0.75/0.80 constants with drive-count-aware DRE geometry from Dell KB 000188491, fixing 5-22 percentage point capacity errors**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-25T18:36:10Z
- **Completed:** 2026-03-25T18:43:52Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- PowerStore RAID-6 now returns 66.67% (<8 drives), 80% (8-19 drives), or 88.89% (>=20 drives) based on drive count
- PowerStore RAID-5 now returns 80% (<10 drives) or 88.89% (>=10 drives) based on drive count
- Added DellPowerstoreVector interface and 7 reference vectors to dell-vectors.ts (alongside Phase 8 ADAPT vectors)
- 14 new PowerStore DRE tests pass in volumetry.spec.ts, full suite 659 tests with 0 failures/skips

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Skip wrong tests, add PowerStore DRE reference vectors and failing tests** - `29b76a6` (test)
2. **Task 2: GREEN — Fix PowerStore DRE formula in dell.ts** - `22a226c` (feat)
3. **Task 3: CLEANUP — Restore snapshot reserve tests with correct DRE comments** - `469a6ed` (chore)

_Note: TDD tasks have three commits (test → feat → chore/cleanup)_

## Files Created/Modified

- `tests/fixtures/dell-vectors.ts` - Added DellPowerstoreVector interface and dellPowerstoreVectors array (7 vectors from Dell KB 000188491)
- `src/engines/volumetry/strategies/dell.ts` - Replaced hardcoded 0.75/0.80 PowerStore RAID-5/6 returns with drive-count-aware DRE geometry
- `tests/engines/volumetry.spec.ts` - Added PowerStore DRE test block (14 tests), imported dellStrategy and dellPowerstoreVectors, restored snapshot reserve tests with updated DRE comments

## Decisions Made

- Usable capacity tests in the DRE block set `snapshotReservePercent: 0` to isolate the data fraction measurement from the default 20% snapshot reserve, ensuring tests validate precisely what they claim (DRE efficiency)
- Two wrong snapshot reserve tests were skipped (RED), not deleted, then restored with corrected DRE comments (CLEANUP) — preserving snapshot reserve test coverage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed usable capacity test assertions in PowerStore DRE test block**
- **Found during:** Task 2 (GREEN phase) — tests still failing after dell.ts fix
- **Issue:** The plan's test template used `createInput(driveCount, ...)` which defaults to `DEFAULT_POWERSTORE_OPTIONS` with `snapshotReservePercent: 20`. The 20% snapshot reserve reduced usable capacity far below the "90% of expectedUsableBeforeFs" lower bound, causing false failures.
- **Fix:** Changed usable capacity tests to override `powerstoreOptions` with `snapshotReservePercent: 0`, no compression/dedup, tightened bounds to 95%-101% of expected
- **Files modified:** tests/engines/volumetry.spec.ts
- **Verification:** All 247 volumetry tests pass after fix
- **Committed in:** `22a226c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test assertions)
**Impact on plan:** Fix was necessary for tests to correctly validate DRE data fraction without conflating snapshot reserve overhead. No scope creep.

## Issues Encountered

- Default PowerStore options include 20% snapshot reserve, which was not accounted for in the plan's test template. Resolved by overriding snapshot reserve to 0 in DRE-specific tests.

## Next Phase Readiness

- Phase 10 (PowerStore system overhead) can proceed: DRE data fraction is now correct, providing accurate `capacityAfterParity` as input to the overhead pipeline
- Pre-existing `resilienceWorker.ts` Biome `noNonNullAssertion` warnings are unrelated and deferred

---
*Phase: 09-powerstore-data-fraction-fix*
*Completed: 2026-03-25*
