---
phase: "16"
plan: "01"
subsystem: export
tags: [pptx, html-to-image, chart-capture, dependencies]
dependency_graph:
  requires: []
  provides: [captureSankeyDiagram]
  affects: [src/utils/index.ts, src/components/outputs/SankeyDiagram.tsx]
tech_stack:
  added: [pptxgenjs@4.0.1, html-to-image@1.11.13]
  patterns: [DOM capture via html-to-image, id-targeted element capture]
key_files:
  created: [src/utils/captureChart.ts]
  modified: [src/components/outputs/SankeyDiagram.tsx, src/utils/index.ts, package.json, package-lock.json]
decisions:
  - Wrapped SVG in div for html-to-image compatibility (requires HTMLElement, not SVGElement)
  - pixelRatio=2 for retina-quality output in PPTX slides
  - backgroundColor=#1A1B2E matches app dark brand theme
metrics:
  duration: "~5 min"
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_changed: 5
---

# Phase 16 Plan 01: Library Setup + Chart Capture Infrastructure Summary

**One-liner:** pptxgenjs + html-to-image installed as production deps; captureSankeyDiagram() utility wraps SankeyDiagram in id-targeted div for PNG rasterization at 2x/dark-bg.

## Status

COMPLETE — 2026-04-01

## Libraries installed

- **pptxgenjs@4.0.1** (production dependency) — in-browser PPTX generation
- **html-to-image@1.11.13** (production dependency) — DOM-to-PNG capture

## Files changed

- `src/components/outputs/SankeyDiagram.tsx` — wrapped `<svg>` in `<div id="sankey-diagram">` for html-to-image DOM targeting
- `src/utils/captureChart.ts` — new file, exports `captureSankeyDiagram(): Promise<string | null>`
- `src/utils/index.ts` — added `export { captureSankeyDiagram } from './captureChart'`
- `package.json` / `package-lock.json` — new dependencies recorded

## Public API

```typescript
captureSankeyDiagram(): Promise<string | null>
// Returns PNG data URL (2x pixelRatio, dark bg #1A1B2E) or null if element not mounted
```

## Verification

- pptxgenjs + html-to-image in package.json dependencies (not devDependencies)
- `id="sankey-diagram"` on wrapper div in SankeyDiagram.tsx
- typecheck: pass
- lint (files changed): pass (pre-existing issues in units.ts/tests are out of scope)
- build: pass (✓ built in ~2.56s)
- commit: 5d5d72c

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Format] Fixed indentation and import ordering in changed files**
- **Found during:** Lint verification of Task 2 changes
- **Issue:** Adding `<div>` wrapper caused Biome to require re-indented SVG content; `captureSankeyDiagram` export needed to be alphabetically sorted before `exportConfig` exports
- **Fix:** Ran `npm run lint:fix` — Biome reformatted indentation and reordered the export in index.ts
- **Files modified:** `src/components/outputs/SankeyDiagram.tsx`, `src/utils/index.ts`
- **Commit:** 5d5d72c (included in same commit)

## Known Stubs

None — `captureSankeyDiagram()` is a functional utility that returns real PNG data when the DOM element is present. The function returning `null` when the element is absent is intentional behavior, not a stub.

## Self-Check: PASSED

- [x] `src/utils/captureChart.ts` exists
- [x] `id="sankey-diagram"` in SankeyDiagram.tsx line 166
- [x] `captureSankeyDiagram` exported from `src/utils/index.ts`
- [x] Commit 5d5d72c exists in git log
- [x] pptxgenjs and html-to-image in package.json dependencies
