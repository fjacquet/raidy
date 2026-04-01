---
phase: 16-pptx-foundation
plan: "03"
subsystem: export-ui
tags: [export, pptx, i18n, ui]
dependency_graph:
  requires: [16-02]
  provides: [pptx-export-button]
  affects: [OutputDashboard, i18n-output]
tech_stack:
  added: []
  patterns: [fire-and-forget-async-handler, export-button-pattern]
key_files:
  created: []
  modified:
    - src/components/layout/OutputDashboard.tsx
    - src/i18n/locales/en/output.json
    - src/i18n/locales/fr/output.json
    - src/i18n/locales/de/output.json
    - src/i18n/locales/it/output.json
decisions:
  - "Fire-and-forget pattern for exportToPptx call, matching existing exportToPdf pattern"
  - "Orange icon color (text-orange-400) distinguishes PPTX button from PDF (red) and YAML (yellow)"
  - "PPTX button inserted between PDF and YAML buttons in Export Card grid"
metrics:
  duration: "5m"
  completed: "2026-04-01"
  tasks_completed: 2
  files_modified: 5
requirements:
  - EXPORT-01
  - EXPORT-06
  - EXPORT-10
---

# Phase 16 Plan 03: PPTX Export Button + i18n Summary

PPTX export button wired into OutputDashboard Export Card with `handleExportPptx` handler and i18n keys in all four locales (EN/FR/DE/IT).

## What Was Built

### Task 1: OutputDashboard.tsx — PPTX button and handler

**Import added** (line 31):
```typescript
import { exportToPptx } from '@/utils/exportPptx'
```

**Handler added** after `handleExportPdf` (lines 199-212):
```typescript
const handleExportPptx = () => {
  if (!selectedDrive) return
  exportToPptx({
    drive: selectedDrive,
    driveCount,
    topology,
    zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
    results: { ...results, resilience: resilienceResult },
    projectName: 'Storage Configuration',
    unitSystem,
  })
}
```

**Button inserted** in Export Card grid after the PDF button (before YAML). Uses orange icon (`text-orange-400`) with presentation/slides SVG path, renders `t('export.pptx')` label and `t('export.pptxDesc')` description. Button is disabled when `!selectedDrive`, matching the PDF guard.

### Task 2: i18n keys in all four locales

Keys added after `"pdfDesc"` in the `"export"` object of each locale:

| Locale | pptx | pptxDesc |
|--------|------|----------|
| EN | "PowerPoint" | "Slide deck" |
| FR | "PowerPoint" | "Présentation" |
| DE | "PowerPoint" | "Präsentation" |
| IT | "PowerPoint" | "Presentazione" |

Brand name "PowerPoint" kept untranslated in all locales per project convention.

## Verification Results

- `npm run typecheck` — passed (exit 0)
- `npm run build` — passed (exit 0, built in 3.07s)
- `npm test -- --run` — 881/881 tests passed
- `biome lint OutputDashboard.tsx` — 0 errors, 0 warnings on modified file

## Phase 16 Success Criteria Status

1. PPTX button visible in Export Card with orange icon, "PowerPoint" label, localised description — **satisfied**
2. Button disabled when no drive is selected — **satisfied** (`disabled={!selectedDrive}`)
3. Clicking the button triggers `exportToPptx` which downloads the file — **satisfied** (wired via handler)
4. All four locale files have `pptx` / `pptxDesc` keys with correct JSON syntax — **satisfied**
5. TypeScript strict mode passes — **satisfied**
6. Production build succeeds — **satisfied**

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 3380ea8 | feat(export): add PPTX export button to OutputDashboard |

## Self-Check: PASSED
