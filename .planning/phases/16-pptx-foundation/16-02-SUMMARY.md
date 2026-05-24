---
phase: 16-pptx-foundation
plan: "02"
subsystem: utils/export
tags: [pptx, export, brand, pptxgenjs, in-browser]
dependency_graph:
  requires: [16-01]
  provides: [exportToPptx, BRAND]
  affects: [src/utils/index.ts]
tech_stack:
  added: []
  patterns: [pptxgenjs v4 browser API, bytes-to-TB conversion, dark brand palette]
key_files:
  created:
    - src/utils/exportPptx.ts
  modified:
    - src/utils/index.ts
decisions:
  - "Used bytes-to-TB conversion (÷1e12) matching app's decimal TB convention; plan template incorrectly referenced non-existent .TB fields"
  - "Drive display uses model field only — Drive interface has no brand field"
  - "effectiveCapacity field used directly (no null fallback needed — VolumetryResult.effectiveCapacity is always present)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-01"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 16 Plan 02: PPTX Generation Engine with Brand Styling Summary

PPTX generation engine using pptxgenjs v4 with dark brand palette, two-slide deck (title + capacity summary with embedded Sankey PNG), running fully in-browser via writeFile().

## What Was Built

### Public API

**`src/utils/exportPptx.ts`** exports:

- `ExportConfig` interface — matches the shape used by `exportToPdf` (drive, driveCount, topology, zfsOptions, results, projectName, unitSystem)
- `BRAND` const — 9-entry color palette (bg, panel, border, accent, textWhite, textMuted, capacity, overhead, parity) all as 6-char hex strings required by pptxgenjs
- `exportToPptx(config: ExportConfig): Promise<void>` — async function that captures the Sankey diagram, builds two slides, and triggers a browser download via `prs.writeFile()`

### Slide Structure

**Slide 1 — Title slide:**
- Dark background (`BRAND.bg = '1A1B2E'`)
- Thin accent bar at top (`BRAND.accent = '3D6FCC'`)
- Large title: topology type + level (e.g. "RAID 5")
- Subtitle: drive model name
- Footer: localized generation date

**Slide 2 — Capacity Summary:**
- Same dark background + accent bar
- Left column: 4 key metrics (Raw, Usable, Effective capacity in TB, Drive count × capacity)
- Right column: Sankey diagram PNG (8.7" × 6.3") captured via `captureSankeyDiagram()`
- Fallback text if chart element is not mounted

### Integration

`exportToPptx` and `BRAND` are re-exported from `src/utils/index.ts` alongside `exportToPdf`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected VolumetryResult field names**
- **Found during:** Task 1 — reading src/types/results.ts
- **Issue:** Plan template referenced `vol.rawCapacityTB`, `vol.usableCapacityTB`, `vol.effectiveCapacityTB` — none of which exist. The actual `VolumetryResult` interface stores all values in bytes: `rawCapacity`, `usableCapacity`, `effectiveCapacity`
- **Fix:** Added `bytesToTB(bytes)` helper (÷1e12) and used the correct field names with conversion
- **Files modified:** src/utils/exportPptx.ts
- **Commit:** 5b5bcaa

**2. [Rule 1 - Bug] Corrected Drive field references**
- **Found during:** Task 1 — reading src/types/drive.ts
- **Issue:** Plan template referenced `config.drive.brand` (no such field) and `config.drive.capacityTB` (no such field). Drive interface has `model` and `capacity_raw` (bytes)
- **Fix:** Used `config.drive.model` for the drive label; computed TB display from `bytesToTB(config.drive.capacity_raw)`
- **Files modified:** src/utils/exportPptx.ts
- **Commit:** 5b5bcaa

## Known Stubs

None. The PPTX engine is fully functional — capacity data is live from `CalculationResults`, chart capture is wired to the real DOM element, and file download uses `prs.writeFile()`.

## Verification

```
grep 'export async function exportToPptx' src/utils/exportPptx.ts  # matches
grep 'export const BRAND' src/utils/exportPptx.ts                  # matches
grep "from 'pptxgenjs'" src/utils/exportPptx.ts                    # matches
grep "from './captureChart'" src/utils/exportPptx.ts               # matches
npm run typecheck   # exits 0
npm run build       # exits 0 (✓ built in 2.64s)
```

## Self-Check: PASSED

- `/Users/fjacquet/Projects/raidy/src/utils/exportPptx.ts` — FOUND
- `/Users/fjacquet/Projects/raidy/src/utils/index.ts` — modified, FOUND
- Commit `5b5bcaa` — FOUND
