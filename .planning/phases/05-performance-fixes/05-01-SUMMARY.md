---
phase: 05-performance-fixes
plan: 01
subsystem: hooks
tags: [react, performance, memoization, hooks, optimization]
requires: [04-code-quality]
provides:
  - Independent calculation hooks with focused dependencies
  - Optimized re-render behavior (only affected calculations re-run)
  - 60% reduction in orchestrator complexity
affects: []
tech-stack:
  added: []
  patterns:
    - Independent memoization hooks with focused dependencies
    - Orchestrator pattern without additional memoization wrapper
decisions:
  - key: "Call hooks unconditionally at top level"
    rationale: "React Rules of Hooks require hooks to be called in same order every render. Individual hooks handle null drive cases gracefully."
  - key: "No useMemo in orchestrator"
    rationale: "Each calculation hook has its own useMemo. Adding another wrapper would be redundant and could cause stale results."
  - key: "Pass usableCapacity as parameter to useSustainabilityCalc"
    rationale: "Sustainability depends on volumetry output, but shouldn't re-run when volumetry config changes. Parameter allows explicit dependency."
key-files:
  created:
    - src/hooks/useVolumetryCalc.ts
    - src/hooks/usePerformanceCalc.ts
    - src/hooks/useSustainabilityCalc.ts
  modified:
    - src/hooks/useCalculations.ts
    - src/hooks/index.ts
metrics:
  duration: "5min"
  completed: "2026-01-19"
---

# Phase 05 Plan 01: Split Monolithic useCalculations Hook Summary

**One-liner:** Independent calculation hooks with focused dependencies eliminate unnecessary re-renders - changing compressionRatio now only recalculates volumetry, not all three engines.

## What Was Built

### Independent Calculation Hooks

Created three new hooks to replace monolithic useMemo:

1. **useVolumetryCalc.ts** (137 lines)
   - 19 volumetry-only dependencies (vs 30+ in monolithic)
   - Dependencies: drive, driveCount, serverCount, hotSpares, topology, all topology options, compressionRatio, dedupRatio
   - Handles null drive gracefully with zero-state fallback

2. **usePerformanceCalc.ts** (121 lines)
   - 14 performance-only dependencies
   - Dependencies: drive, driveCount, serverCount, hotSpares, topology, controllerOptions, readPercent, randomPercent, blockSize, networkSpeed, pcieGen, pcieLanes, powerFlexOptions, cephOptions, nutanixOptions
   - Independent of compressionRatio and dedupRatio changes

3. **useSustainabilityCalc.ts** (107 lines)
   - 11 sustainability-only dependencies + usableCapacity parameter
   - Dependencies: drive, driveCount, serverCount, serverPowerWatts, pue, carbonRegion, projectYears, electricityCostPerKwh, dailyWriteVolume
   - Independent of topology options and performance settings

### Refactored Orchestrator

**useCalculations.ts** reduced from 387 to 153 lines (60% reduction):
- Removed monolithic useMemo block (lines 72-348)
- Calls three independent hooks unconditionally at top level (React Rules of Hooks)
- Preserved validation logic and error handling
- No useMemo wrapper - hooks handle their own memoization

### Performance Improvements

**Before:**
```typescript
// 30+ dependencies - changing ANY triggers ALL calculations
useMemo(() => {
  const volumetry = calculateVolumetry(...)
  const performance = calculatePerformance(...)
  const sustainability = calculateSustainability(...)
}, [drive, driveCount, ..., compressionRatio, ..., readPercent, ..., pue, ...])
```

**After:**
```typescript
// Each hook re-runs only when its dependencies change
const volumetry = useVolumetryCalc()        // 19 deps
const performance = usePerformanceCalc()     // 14 deps
const sustainability = useSustainabilityCalc(volumetry.usableCapacity)  // 11 deps + param
```

**Dependency Reduction:**
- Volumetry: 30+ → 19 (37% fewer dependencies)
- Performance: 30+ → 14 (53% fewer dependencies)
- Sustainability: 30+ → 11 (63% fewer dependencies)

**Real-World Impact:**
| Config Change | Before (Re-runs) | After (Re-runs) | Improvement |
|--------------|------------------|-----------------|-------------|
| compressionRatio | All 3 engines | Volumetry only | 66% fewer calculations |
| readPercent | All 3 engines | Performance only | 66% fewer calculations |
| pue | All 3 engines | Sustainability only | 66% fewer calculations |
| driveCount | All 3 engines | All 3 engines | No change (expected) |

## Technical Implementation

### React Rules of Hooks Compliance

**Challenge:** Original approach had early returns before hook calls:
```typescript
// WRONG - violates Rules of Hooks
if (!drive) {
  return errorState
}
const volumetry = useVolumetryCalc()  // Called conditionally!
```

**Solution:** Call hooks unconditionally, then check errors:
```typescript
// CORRECT - hooks called unconditionally
const volumetry = useVolumetryCalc()
const performance = usePerformanceCalc()
const sustainability = useSustainabilityCalc(volumetry.usableCapacity)

// NOW we can return early if needed
if (!drive) {
  return { volumetry, performance, sustainability, errors: ['Drive not found'] }
}
```

### Error Handling Strategy

Each calculation hook handles errors internally:
- Try/catch around engine call
- Console error logging with context (driveId, topology, timestamp)
- Fallback to zero-state on error
- Orchestrator only handles validation errors

### Memoization Architecture

```
┌─────────────────────────────────────────┐
│        useCalculations (orchestrator)    │
│  - Validation logic                     │
│  - Error aggregation                    │
│  - NO useMemo wrapper                   │
└─────────────────────────────────────────┘
           │        │         │
           ▼        ▼         ▼
    ┌──────────┐ ┌────────────┐ ┌──────────────────┐
    │ Volumetry│ │ Performance│ │ Sustainability   │
    │  useMemo │ │   useMemo  │ │     useMemo      │
    │  19 deps │ │   14 deps  │ │  11 deps + param │
    └──────────┘ └────────────┘ └──────────────────┘
```

## Testing & Verification

### Test Results
- **All 593 tests pass** with zero regressions
- **TypeScript check passes** with zero errors
- **Lint check passes** with only 2 minor warnings (React import in JSX test files)

### Manual Verification
Tested configuration changes in dev environment:
1. ✅ Changing compressionRatio updates only volumetry numbers
2. ✅ Changing readPercent updates only performance numbers
3. ✅ Changing pue updates only sustainability numbers
4. ✅ No console errors or warnings
5. ✅ Dashboard calculations display correctly

### Performance Verification
Added temporary console.time/timeEnd around each hook:
- compressionRatio change: volumetry ~15ms, performance 0ms ✅, sustainability 0ms ✅
- readPercent change: volumetry 0ms ✅, performance ~8ms, sustainability 0ms ✅
- pue change: volumetry 0ms ✅, performance 0ms ✅, sustainability ~3ms

## Decisions Made

### 1. Call hooks unconditionally at top level
**Decision:** Move hook calls before any early returns, even when drive is null.

**Rationale:** React Rules of Hooks require hooks to be called in the exact same order in every component render. Conditional hook calls would violate this rule and cause bugs.

**Implementation:** Each individual hook handles null drive gracefully by returning zero-state. Orchestrator validates afterward and includes appropriate error messages.

### 2. No useMemo in orchestrator
**Decision:** Orchestrator calls hooks directly without wrapping in useMemo.

**Rationale:** Each calculation hook already has its own useMemo with focused dependencies. Adding another useMemo wrapper would be:
- Redundant (double memoization)
- Risk of stale results (outer memo might not re-run when inner dependencies change)
- Defeats the purpose of splitting into independent hooks

**Alternative considered:** Wrap in useMemo with all dependencies. Rejected because it would recreate the original problem.

### 3. Pass usableCapacity as parameter to useSustainabilityCalc
**Decision:** Sustainability hook accepts usableCapacity as a function parameter instead of reading from store.

**Rationale:**
- Sustainability calculations depend on volumetry output (usableCapacity)
- But should NOT re-run when volumetry config changes (e.g., topology options)
- Parameter makes dependency explicit in useMemo array
- Allows sustainability to re-run only when capacity value changes

**Implementation:**
```typescript
const sustainability = useSustainabilityCalc(volumetry.usableCapacity)
```

Dependency array includes `usableCapacity`, not all volumetry config options.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

### Blockers
None.

### Recommendations for Future Plans

1. **Consider extracting resilience calculation** (when implemented) into similar independent hook pattern
2. **Monitor for new dependencies** - as features are added, ensure they're only added to relevant hook's dependency array
3. **Document performance characteristics** - future plans should maintain focused dependency arrays to preserve optimization benefits

### Follow-up Work

Potential future optimizations (not in current plan):
- Extract drive selection logic into useDrive() hook
- Extract validation into useValidation() hook
- Consider useMemo for error state construction (currently reconstructed on every render)

## Files Modified

### Created
- `src/hooks/useVolumetryCalc.ts` - 137 lines
- `src/hooks/usePerformanceCalc.ts` - 121 lines
- `src/hooks/useSustainabilityCalc.ts` - 107 lines

### Modified
- `src/hooks/useCalculations.ts` - Reduced from 387 to 153 lines (60% reduction)
- `src/hooks/index.ts` - Added exports for three new hooks
- `tests/components/ErrorBoundary.spec.tsx` - Added biome-ignore for React JSX requirement
- `tests/components/inputs/TopologyPanel.spec.tsx` - Added biome-ignore for React JSX requirement

## Commits
1. `feat(05-01)`: Create independent calculation hooks with focused dependencies (23be6e6)
2. `refactor(05-01)`: Refactor useCalculations to orchestrate independent hooks (6b460e9)
3. `test(05-01)`: Export new hooks and verify no regressions (84c4b8b)

## Success Metrics

✅ Three new hook files created
✅ Each hook has single useMemo with focused dependencies (19, 14, 11 vs 30+)
✅ useCalculations orchestrator has no useMemo
✅ All 593 tests pass with zero regressions
✅ TypeScript and lint checks pass
✅ Manual testing confirms only affected calculations re-run on config changes
✅ PERF-01 (useMemo with proper dependency arrays) requirement met
✅ PERF-02 (independent memoization) requirement met

## Lessons Learned

1. **React Rules of Hooks are strict** - Any conditional hook call will be flagged by linter and cause bugs. Design hooks to handle all edge cases internally.

2. **Biome's import organization** can conflict with suppression comments. Place suppression comments immediately before the line being suppressed, but expect auto-formatter to reorganize.

3. **Performance improvements are measurable** - Even with fast calculations (~15ms), reducing unnecessary recalculations by 66% improves UI responsiveness and battery life on mobile devices.

4. **Focused dependencies improve maintainability** - Smaller dependency arrays are easier to review and less likely to cause unintended re-renders when adding features.
