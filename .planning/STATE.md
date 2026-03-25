---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Dell Calculation Accuracy
status: Roadmap defined, ready for plan-phase
stopped_at: Phases 8–13 defined — ready to plan Phase 8
last_updated: "2026-03-25T00:00:00.000Z"
last_activity: 2026-03-25 — Roadmap phases 8-13 created for v1.2
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

**Current focus:** Milestone v1.2 — Dell Calculation Accuracy

## Current Position

Phase: 8 (PowerVault ADAPT Formula Fix) — Not started
Plan: —
Status: Roadmap defined, ready for plan-phase
Last activity: 2026-03-25 — Phases 8–13 defined

Progress bar: [----------] 0/6 phases complete

## Performance Metrics

**Velocity (from v1.0/v1.1):**

- Total plans completed: 30
- Average duration: 6.7 min

**By Phase (prior milestones):**

| Phase                      | Plans | Total | Avg/Plan |
| -------------------------- | ----- | ----- | -------- |
| 1 - Test Infrastructure    | 2/2   | 3min  | 1.5min   |
| 2 - Calculation Validation | 10/10 | 69min | 6.9min   |
| 3 - Security Hardening     | 4/4   | 18min | 4.5min   |
| 4 - Code Quality           | 10/10 | 80min | 8.0min   |
| 7 - Dependency Maintenance | 3/3   | —     | —        |

## Accumulated Context

### Decisions

| Phase | Decision | Rationale |
| ----- | --------- | --------- |
| v1.2  | Dell Sizer as primary reference | Official Dell capacity planning tool — output is ground truth for ADAPT/PowerStore/PowerScale |
| v1.2  | Fix formula, then update tests | Tests currently encode wrong expected values — fix engine first, then update test vectors |
| v1.2  | PowerVault ADAPT formula: `((N-2)/N) × stripe_efficiency` | Dynamic per drive count: ≤18 drives uses 8+2 (×0.80), >18 drives uses 16+2 (×16/18) |
| v1.2  | PowerStore RAID geometry: DRE drive-count thresholds | RAID-6: <8→4+2, 8-19→8+2, ≥20→16+2; RAID-5: <10→4+1, ≥10→8+1 (from Dell KB 000188491) |
| v1.2  | PowerStore system overhead: ~5% default | Back-calculated from Dell Sizer reference (35-drive 5200Q); configurable via systemOverheadPercent |
| v1.2  | PowerScale fix: use serverCount not driveCount | driveCount bug produces near-100% efficiency for multi-drive-per-node configs |
| v1.2  | Test protocol: skip→add correct→delete skipped | Never update test expected values by running the (possibly wrong) formula |

### Reference Documents

- `/Users/fjacquet/Library/CloudStorage/OneDrive-Home/PowerStore/powerstore NAS.pptx` — PowerStore 5200Q, 35×30.72TB NVMe, RAID(16+2), Raw=977.89TiB, Usable=801.57TiB, DRR=2:1
- `/Users/fjacquet/Library/CloudStorage/OneDrive-Home/PowerStore/powervault test.pptx` — ME5224, 12×3.84TB SSD, ADAPT(8+2), Raw=41.9TiB, Usable=27.93TiB

### Pending Todos

- Clarify ADAPT 8+2 vs 16+2 threshold: research says >18 drives in one place, >20 in another — resolve from ME5 Admin Guide before Phase 8 implementation
- Validate PowerStore system overhead for smaller models (1000T, 3200) — 5% may be large-model only
- Confirm PowerScale minimum stripe width fallback for small clusters (3–4 nodes with N+2)
- Dell Sizer access required for Phase 12 validation of PowerFlex and ObjectScale

### Blockers/Concerns

- Phases 5 (Performance & Fixes) and 6 (Production Validation) from v1.0 are still pending — can be addressed in v1.3
- Dell Sizer requires authenticated Dell partner/customer login — if access unavailable, contact Dell SE
- Phase 10 (PowerStore system overhead) is the most invasive change: touches types, overhead pipeline, breakdown builder, and OverheadResult interface

## Session Continuity

Last session: 2026-03-25
Stopped at: Roadmap phases 8–13 created — ready to run /gsd:plan-phase 8
Resume file: None
