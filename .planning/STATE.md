---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Dell Calculation Accuracy
status: Roadmap defined, ready for plan-phase
stopped_at: Milestone v1.2 initialized — requirements defined, roadmap pending
last_updated: "2026-03-25T00:00:00.000Z"
last_activity: 2026-03-25 — Milestone v1.2 started
progress:
  total_phases: 0
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

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-25 — Milestone v1.2 started

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
| v1.2  | PowerVault ADAPT formula: `(N - 2×protection) / N` | Dell Sizer confirms: 12 drives + ADAPT(8+2) → 27.93/41.9 TiB = 66.67% = (12-4)/12 |
| v1.2  | PowerStore has ~7.8% system overhead on top of RAID parity | Dell Sizer confirms: 35 drives + RAID(16+2) → 801.57/977.89 TiB = 82%, vs pure RAID 88.89% |

### Reference Documents

- `/Users/fjacquet/Library/CloudStorage/OneDrive-Home/PowerStore/powerstore NAS.pptx` — PowerStore 5200Q, 35×30.72TB NVMe, RAID(16+2), Raw=977.89TiB, Usable=801.57TiB, DRR=2:1
- `/Users/fjacquet/Library/CloudStorage/OneDrive-Home/PowerStore/powervault test.pptx` — ME5224, 12×3.84TB SSD, ADAPT(8+2), Raw=41.9TiB, Usable=27.93TiB

### Pending Todos

(None yet)

### Blockers/Concerns

- PowerScale, PowerFlex, ObjectScale formulas need research before we can determine if fixes are needed
- Phases 5 (Performance & Fixes) and 6 (Production Validation) from v1.0 are still pending — can be addressed in v1.3

## Session Continuity

Last session: 2026-03-25
Stopped at: Milestone v1.2 initialized
Resume file: None
