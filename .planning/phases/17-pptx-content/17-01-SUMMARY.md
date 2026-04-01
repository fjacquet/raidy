---
phase: 17-pptx-content
plan: 01
subsystem: ui
tags: [react, typescript, html-to-image, pptx, chart-capture]

# Dependency graph
requires: []
provides:
  - id="speedometer-chart" stable DOM id on Speedometer wrapper div
  - id="donut-chart" stable DOM id on DonutChart root div (both render branches)
  - captureSpeedometer() exported from src/utils/captureChart.ts
  - captureDonutChart() exported from src/utils/captureChart.ts
affects:
  - 17-02  # slide-building tasks that embed chart images via capture functions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stable hardcoded DOM ids on chart wrapper divs enable html-to-image capture without selector fragility"
    - "All chart capture functions follow same toPng pattern: backgroundColor '#1A1B2E', pixelRatio 2"

key-files:
  created: []
  modified:
    - src/components/outputs/Speedometer.tsx
    - src/components/outputs/DonutChart.tsx
    - src/utils/captureChart.ts

key-decisions:
  - "id on outermost wrapper div (not SVG) because html-to-image requires HTMLElement not SVGElement"
  - "id present in both DonutChart render branches (empty state and normal) to guarantee consistent capture target"

patterns-established:
  - "Chart capture: getElementById -> toPng with dark background and 2x pixelRatio"

requirements-completed:
  - EXPORT-04

# Metrics
duration: 8min
completed: 2026-04-01
---

# Phase 17 Plan 01: PPTX Content — Chart DOM Ids and Capture Functions Summary

**DOM ids added to Speedometer and DonutChart wrapper divs plus captureSpeedometer/captureDonutChart exported from captureChart.ts using html-to-image toPng**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-01T10:00:00Z
- **Completed:** 2026-04-01T10:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `id="speedometer-chart"` to the outermost wrapper div in Speedometer.tsx, providing a stable DOM target
- Added `id="donut-chart"` to the root div in DonutChart.tsx in both the empty-state fallback branch and the normal render branch
- Exported `captureSpeedometer()` and `captureDonutChart()` from captureChart.ts, consistent with the existing `captureSankeyDiagram()` pattern
- TypeScript compiles without errors; no lint violations in modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DOM ids to Speedometer and DonutChart** - `383f7ed` (feat)
2. **Task 2: Add captureSpeedometer and captureDonutChart to captureChart.ts** - `7903fc0` (feat)

## Files Created/Modified
- `src/components/outputs/Speedometer.tsx` - Added `id="speedometer-chart"` to wrapper div
- `src/components/outputs/DonutChart.tsx` - Added `id="donut-chart"` to root div in both render branches
- `src/utils/captureChart.ts` - Added `captureSpeedometer()` and `captureDonutChart()` exports

## Decisions Made
- `id` is placed on the outermost HTML wrapper div (not the inner SVG element) because html-to-image requires an `HTMLElement`, and wrapping was already in place from Phase 16 Sankey work.
- Both DonutChart render branches receive the same id so the capture function always resolves regardless of whether segments are populated.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 17-02 (slide building) can now call `captureSpeedometer()` and `captureDonutChart()` to embed chart images in PPTX slides
- All three capture functions (`captureSankeyDiagram`, `captureSpeedometer`, `captureDonutChart`) follow identical patterns and are ready to use

---
*Phase: 17-pptx-content*
*Completed: 2026-04-01*
