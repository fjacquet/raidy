---
phase: 10-powerstore-system-overhead-addition
plan: 01
subsystem: testing
tags: [powerstore, dell, volumetry, overhead, tdd, capacity]

# Dependency graph
requires:
  - phase: 09-powerstore-data-fraction-fix
    provides: PowerStore DRE drive-count-aware geometry fix enabling correct post-parity capacity
provides:
  - systemOverheadPercent field on PowerStoreOptions (configurable, default 5%)
  - powerstoreSystemOverhead computation in overheadCalculator.ts
  - "PowerStore System Overhead" distinct breakdown line item in buildBreakdown.ts
  - Dell Sizer 5200Q end-to-end reference vector (dellPowerstore5200QVector)
  - Three TDD tests verifying system overhead behavior
affects:
  - Any phase touching PowerStore capacity pipeline
  - UI panels displaying PowerStore options (systemOverheadPercent visible to users)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "System overhead as configurable percent on platform options interface (mirrors ObjectScale pattern)"
    - "TDD RED-GREEN-CLEANUP with Dell Sizer reference vector as acceptance criterion"

key-files:
  created:
    - tests/fixtures/dell-vectors.ts (DellPowerstore5200QVector interface + dellPowerstore5200QVector export)
  modified:
    - src/types/topology.ts (systemOverheadPercent field added to PowerStoreOptions, default 5 in DEFAULT_POWERSTORE_OPTIONS)
    - src/engines/volumetry/overhead/overheadCalculator.ts (powerstoreSystemOverhead in OverheadResult, computation block, capacityForFs chain, totalOverhead sum, return object)
    - src/engines/volumetry/index.ts (powerstoreSystemOverhead destructured from overheads, propagated to buildBreakdown call)
    - src/engines/volumetry/breakdown/buildBreakdown.ts (powerstoreSystemOverhead in BreakdownInput, distinct breakdown entry)
    - tests/engines/volumetry.spec.ts (three new tests in "PowerStore System Overhead" describe block)
    - src/store/configStore.ts (systemOverheadPercent: 5 added to hardcoded powerstoreOptions default state)

key-decisions:
  - "PowerStore system overhead: ~5% default back-calculated from Dell Sizer 5200Q reference (35-drive RAID(16+2))"
  - "systemOverheadPercent is user-configurable on PowerStoreOptions (like snapshotReservePercent) to support different PowerStore models"
  - "Overhead applied to capacityAfterParity (post-parity, pre-snapshot), matching ObjectScale system overhead pattern"

patterns-established:
  - "Platform system overhead pattern: add field to PlatformOptions, compute in overheadCalculator.ts, subtract in capacityForFs chain, show as distinct breakdown entry"
  - "Dell Sizer reference test: use DellPowerstoreXXXVector fixture with 2% tolerance, set snapshotReservePercent:0 to isolate overhead under test"

requirements-completed: [DELL-05, DELL-06]

# Metrics
duration: 23min
completed: 2026-03-25
---

# Phase 10 Plan 01: PowerStore System Overhead Summary

**PowerStore system overhead (5% default, configurable) added to volumetry pipeline, bringing 35-drive 5200Q RAID(16+2) capacity within 2% of Dell Sizer reference value of 801.57 TiB**

## Performance

- **Duration:** 23 min
- **Started:** 2026-03-25T19:27:00Z
- **Completed:** 2026-03-25T20:00:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `systemOverheadPercent` (default 5%) to `PowerStoreOptions` interface and defaults, completing the Dell Sizer accuracy gap identified after Phase 9
- Implemented `powerstoreSystemOverhead` computation in the overhead pipeline (overheadCalculator -> index -> buildBreakdown), following the established ObjectScale system overhead pattern
- Three new TDD tests pass: end-to-end capacity within 2% of Dell Sizer 801.57 TiB reference, breakdown line item presence, and configurable overhead reduction verification

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Add Dell Sizer 5200Q end-to-end reference vector and failing test** - `4d0fe21` (test)
2. **Task 2: GREEN — Add systemOverheadPercent to types and implement overhead in pipeline** - `d8181ff` (feat)
3. **Task 3: CLEANUP — Full CI validation and fix any lint/type issues** - `754d0a3` (chore)

**Plan metadata:** _(final docs commit follows)_

_Note: TDD tasks have two commits (test RED → feat GREEN). Task 3 included a Rule 1 auto-fix for configStore._

## Files Created/Modified

- `tests/fixtures/dell-vectors.ts` - Added `DellPowerstore5200QVector` interface and `dellPowerstore5200QVector` export with Dell Sizer 5200Q reference values
- `src/types/topology.ts` - Added `systemOverheadPercent: number` field to `PowerStoreOptions` interface, `systemOverheadPercent: 5` to `DEFAULT_POWERSTORE_OPTIONS`
- `src/engines/volumetry/overhead/overheadCalculator.ts` - Added `powerstoreSystemOverhead` to `OverheadResult` interface, computation block, `capacityForFs` chain, `totalOverhead` sum, return object
- `src/engines/volumetry/index.ts` - Destructured `powerstoreSystemOverhead` from overheads, passed to `buildBreakdown()` call
- `src/engines/volumetry/breakdown/buildBreakdown.ts` - Added `powerstoreSystemOverhead` to `BreakdownInput`, new breakdown entry for "PowerStore System Overhead" label
- `tests/engines/volumetry.spec.ts` - Three new tests in "PowerStore System Overhead (Dell Sizer 5200Q reference)" describe block
- `src/store/configStore.ts` - Added `systemOverheadPercent: 5` to hardcoded `powerstoreOptions` default state (auto-fix)

## Decisions Made

- Used 5% as the default `systemOverheadPercent`, back-calculated from Dell Sizer 5200Q 35-drive reference case
- Applied overhead to `capacityAfterParity` (same application point as ObjectScale system overhead) so it appears between parity loss and snapshot reserve in the deduction chain
- Made it configurable on `PowerStoreOptions` rather than hardcoded, consistent with other platform overhead fields

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing systemOverheadPercent in configStore default powerstoreOptions caused build failure**
- **Found during:** Task 3 (CLEANUP — Full CI validation)
- **Issue:** `src/store/configStore.ts` had a hardcoded `powerstoreOptions` object without the new `systemOverheadPercent` field, causing TypeScript error in production build: "Property 'systemOverheadPercent' is missing in type"
- **Fix:** Added `systemOverheadPercent: 5` to the hardcoded powerstoreOptions object in configStore.ts
- **Files modified:** `src/store/configStore.ts`
- **Verification:** `npm run build` exits 0 after fix
- **Committed in:** `754d0a3` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Auto-fix was necessary for production build correctness. No scope creep.

## Issues Encountered

- None beyond the auto-fixed configStore build error above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PowerStore capacity pipeline is now complete and matches Dell Sizer end-to-end reference for 5200Q
- 662 tests pass, lint/typecheck/build all green
- If a UI panel for PowerStore options exists, `systemOverheadPercent` should be surfaced as a configurable field for users who want to tune for smaller PowerStore models (1000T, 3200) where the 5% default may not apply

---
*Phase: 10-powerstore-system-overhead-addition*
*Completed: 2026-03-25*
