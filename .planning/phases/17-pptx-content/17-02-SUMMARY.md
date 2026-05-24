---
phase: 17-pptx-content
plan: "02"
subsystem: export
tags: [pptx, i18n, export, charts, pptxgenjs]
dependency_graph:
  requires:
    - 17-01 (captureSpeedometer, captureDonutChart functions)
  provides:
    - exportToPptx producing 7-slide PPTX deck
    - pptx i18n keys in all four locales
  affects:
    - src/utils/exportPptx.ts
    - src/i18n/locales (all four languages)
tech_stack:
  added: []
  patterns:
    - parallel chart capture via Promise.all before slide building
    - shared helper pattern (addSlideHeading, addMetricBlock) for DRY slide composition
    - null guard on resilience result for graceful degradation
key_files:
  created: []
  modified:
    - src/utils/exportPptx.ts
    - src/i18n/locales/en/output.json
    - src/i18n/locales/fr/output.json
    - src/i18n/locales/de/output.json
    - src/i18n/locales/it/output.json
decisions:
  - Used unicode escape \u2082 for CO₂ subscript in slide text to avoid literal non-ASCII in source
  - Template literal for topLabel level concatenation to satisfy Biome useTemplate linting rule
  - Resilience slide returns early after placing "not run" message when resilience is null
  - serverCount accessed via type assertion (config.topology as { serverCount: number }) — legitimately dynamic per plan
metrics:
  duration: "~15 minutes"
  completed: "2026-04-01"
  tasks: 2
  files_modified: 5
---

# Phase 17 Plan 02: PPTX Content — Full 7-Slide Deck Summary

Expanded `exportPptx.ts` from a 2-slide stub into a complete 7-slide presentation, adding i18n keys for all four locales and implementing shared helper functions for consistent slide composition.

## Slide Order and Builder Functions

| Slide | Builder Function | Content |
|-------|-----------------|---------|
| 1 | `buildTitleSlide` | Topology type/level, drive model, date |
| 2 | `buildExecutiveSummarySlide` | 6-metric grid: usable capacity, read/write IOPS, resilience, annual energy/CO₂ |
| 3 | `buildVolumetrySlide` | Raw/usable/effective capacity, efficiency, Sankey PNG |
| 4 | `buildPerformanceSlide` | Read/write IOPS and throughput, bottleneck desc, speedometer PNG |
| 5 | `buildResilienceSlide` | Survival rate, nines, rebuild time, risk level, donut PNG; null guard |
| 6 | `buildSustainabilitySlide` | Total/drive/server power, energy, cost, CO₂; flash endurance conditional |
| 7 | `buildBomSlide` | Drive model/type/interface/capacity/power/DWPD; topology/drive count/server count |

## Shared Helpers Added

- `formatIops(iops)` — formats large IOPS values with K/M suffix
- `addSlideHeading(slide, title)` — consistent heading at x:0.4, y:0.2, fontSize:22
- `addMetricBlock(slide, label, value, color, x, y, w?)` — stacked label+value pair with brand styling

## Removed

- `buildCapacitySlide` — superseded entirely by `buildVolumetrySlide`

## Chart Capture Pattern

All three chart captures (`captureSankeyDiagram`, `captureSpeedometer`, `captureDonutChart`) are fired in parallel via `Promise.all` before any slide is built. Each slide builder receives its data URL and handles null gracefully with placeholder text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed template literal string concatenation linting error**
- **Found during:** Task 2 lint run
- **Issue:** `' ' + config.topology.level` string concatenation in topLabel triggered Biome `useTemplate` rule
- **Fix:** Changed to `` ` ${config.topology.level}` `` template literal inside the outer template
- **Files modified:** src/utils/exportPptx.ts
- **Commit:** 0792e53 (included in same commit after lint:fix)

## TypeScript Challenges

The `Topology` discriminated union required careful access for optional fields:
- `'level' in config.topology` guard used for level display in title slide and BOM
- `'serverCount' in config.topology` guard used for server count in BOM slide, with a type assertion to `{ serverCount: number }` as this is a legitimately dynamic field across platform topologies (vSAN, S2D, Nutanix, etc.)

## Known Stubs

None. All slide content is wired to real `CalculationResults` data from `config.results`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 — i18n locale pptx keys | 46b9dd4 | feat(17-02): add pptx slide title keys to all four i18n locale files |
| 2 — full 7-slide exportPptx.ts | 0792e53 | feat(17-02): rewrite exportPptx.ts with full 7-slide deck |

## Self-Check: PASSED
