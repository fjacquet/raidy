---
phase: 04-code-quality
plan: 01
subsystem: testing
tags: [biome, typescript, type-guards, lint, vite, code-quality]

# Dependency graph
requires:
  - phase: 03-security-hardening
    provides: Validation infrastructure and error handling patterns
provides:
  - Clean lint status (zero Biome errors across 114 files)
  - Exhaustive type checking helper (assertNever) for discriminated unions
  - Optimized bundle configuration (html2canvas auto-chunked, not manually bundled)
affects: [04-02-component-extraction, 04-03-engine-refactoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Double-cast pattern (as unknown as T) for intentional type violations in tests"
    - "Explicit null checks instead of non-null assertions for Biome compliance"
    - "assertNever() for exhaustive switch statement checking"

key-files:
  created:
    - src/utils/typeGuards.ts
  modified:
    - src/hooks/useCalculations.ts
    - tests/utils/urlStorage.spec.ts
    - tests/hooks/useCalculations.spec.ts
    - src/utils/index.ts
    - vite.config.ts
    - src/utils/schemas.ts

key-decisions:
  - "Use 'as unknown as T' double-cast instead of 'as any' for test type violations"
  - "Export assertNever from barrel file for convenient project-wide access"
  - "Remove html2canvas from manual chunks - it's an optionalDependency that auto-chunks"
  - "Add explicit type annotations (VolumetryResult, PerformanceResult, SustainabilityResult) for let declarations"

patterns-established:
  - "Explicit type annotations on let declarations before try-catch blocks"
  - "Exhaustive type checking in switch default cases via assertNever(value)"

# Metrics
duration: 9min
completed: 2026-01-18
---

# Phase 4 Plan 1: Type Safety Enforcement Summary

**Clean lint status with zero Biome errors, exhaustive type checking via assertNever, and optimized bundle excluding unused html2canvas**

## Performance

- **Duration:** 9 min
- **Started:** 2026-01-18T20:02:53Z
- **Completed:** 2026-01-18T20:12:09Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Fixed all Biome lint errors (9 total: 1 `as any`, 5 non-null assertions, 3 implicit any types)
- Created assertNever() type guard for compile-time exhaustive checking on discriminated unions
- Audited and optimized html2canvas dependency (removed from manual chunks, verified PDF export works)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix all Biome lint errors** - `d0b89e3` (fix)
2. **Task 2: Create exhaustive type checking helper** - `5c44c05` (feat)
3. **Task 3: Audit html2canvas dependency usage** - `00f0dcb` (chore)

## Files Created/Modified
- `src/utils/typeGuards.ts` - Exhaustive type checking helper with assertNever() function
- `src/utils/index.ts` - Added assertNever export to barrel file
- `src/hooks/useCalculations.ts` - Added type annotations for volumetry, performance, sustainability
- `tests/utils/urlStorage.spec.ts` - Fixed 1 as any, 5 non-null assertions with explicit null checks
- `tests/hooks/useCalculations.spec.ts` - Changed as any to Partial<ConfigStore> cast
- `vite.config.ts` - Removed html2canvas from manual chunks, added explanatory comment
- `src/utils/schemas.ts` - Removed unused _TopologyTypeSchema (blocking build error)

## Decisions Made

**1. Double-cast pattern for test type violations**
- Use `as unknown as T` instead of `as any` for intentional type violations
- Rationale: Biome flags `as any` as unsafe. Double-cast is explicit about breaking type safety while satisfying linter

**2. Explicit null checks instead of non-null assertions**
- Pattern: `if (!result) throw new Error('Expected result'); const parsed = JSON.parse(result)`
- Rationale: Biome doesn't recognize Vitest expect() as type guard. Explicit check satisfies both Biome and TypeScript

**3. Export assertNever from barrel file**
- Added to `src/utils/index.ts` for project-wide access
- Rationale: Convenient import path (`@/utils`) for common type guard utility

**4. Remove html2canvas from manual chunks**
- Discovered it's an optionalDependency of jspdf (used for html() method)
- We only use autoTable and text methods, so it's unnecessary overhead
- Vite auto-code-splits it; won't load unless jspdf.html() is called
- Rationale: Reduces initial bundle size, lets Vite handle optional dependency chunking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed build error in schemas.ts**
- **Found during:** Task 3 (running npm run build to verify html2canvas change)
- **Issue:** Unused variable `_TopologyTypeSchema` causing TypeScript compilation error (TS6133)
- **Fix:** Removed unused enum declaration (lines 11-25 in schemas.ts)
- **Files modified:** src/utils/schemas.ts
- **Verification:** `npm run build` succeeds, TypeScript compiles without errors
- **Committed in:** 00f0dcb (Task 3 commit)

**2. [Plan Update] Fixed 3 additional implicit any errors**
- **Found during:** Task 1 (running npm run lint)
- **Issue:** Plan mentioned 8 errors, but actual count was 9 (3 implicit any in useCalculations.ts not listed)
- **Fix:** Added type annotations for `let volumetry`, `let performance`, `let sustainability` with VolumetryResult, PerformanceResult, SustainabilityResult types
- **Files modified:** src/hooks/useCalculations.ts (imports and 3 declarations)
- **Verification:** `npm run lint` passes with zero errors
- **Committed in:** d0b89e3 (Task 1 commit)

**3. [Plan Update] Fixed additional test file lint error**
- **Found during:** Task 1 (running npm run lint after initial fixes)
- **Issue:** tests/hooks/useCalculations.spec.ts had `as any` not mentioned in plan
- **Fix:** Changed to `as Partial<ConfigStore>` with proper type import
- **Files modified:** tests/hooks/useCalculations.spec.ts
- **Verification:** `npm run lint` passes with zero errors, auto-fixes applied (import org + formatting)
- **Committed in:** d0b89e3 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking build error, 2 plan updates for additional lint errors)
**Impact on plan:** All auto-fixes necessary for build success and complete lint coverage. No scope creep - all within "fix all lint errors" objective.

## Issues Encountered

**Issue: More lint errors than plan specified**
- Plan mentioned 8 errors across 3 files
- Actual: 9 errors across 4 files (3 implicit any in useCalculations.ts + 1 as any in useCalculations.spec.ts)
- Resolution: Fixed all 9 errors in Task 1, following same patterns as planned fixes

**Issue: Build error blocking Task 3 verification**
- schemas.ts had unused variable preventing build
- Resolution: Removed unused code (Rule 3: auto-fix blocking issues)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 4 Plans 2-3:**
- Clean codebase with zero lint errors establishes foundation for refactoring
- assertNever() helper ready for use in component extraction and engine refactoring
- Optimized build configuration reduces bundle size overhead

**No blockers or concerns** - all verification passed:
- ✓ `npm run lint` - zero errors across 114 files
- ✓ `npm run typecheck` - zero TypeScript errors
- ✓ `npm run build` - successful production build
- ✓ `npm test -- tests/utils/exportPdf.spec.ts` - 15/15 PDF export tests pass

---
*Phase: 04-code-quality*
*Completed: 2026-01-18*
