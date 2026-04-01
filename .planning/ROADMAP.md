# Roadmap

**Project:** Raidy - Production Readiness
**Created:** 2026-01-17
**Phases:** 18

## Overview

This roadmap takes Raidy from a functionally complete application to production-ready deployment. Phases are derived from natural delivery boundaries: establish test infrastructure, validate calculation accuracy (core value), harden security, improve code maintainability, optimize performance, and validate production deployment.

## Milestones

- ✅ **v1.0 Production Ready** — Phases 1-6 (shipped 2026-01-18)
- ✅ **v1.1 Dependency Maintenance** — Phase 7 (shipped 2026-03-05)
- ✅ **v1.2 Dell Calculation Accuracy** — Phases 8-13 (shipped 2026-03-25)
- **v1.3 Rich Export & Polish** — Phases 14-18 (active)

## Phases

<details>
<summary>✅ v1.0 Production Ready (Phases 1–6) — SHIPPED 2026-01-18</summary>

- [x] Phase 1: Test Infrastructure (2/2 plans) — completed 2026-01-17
- [x] Phase 2: Calculation Validation (10/10 plans) — completed 2026-01-18
- [x] Phase 3: Security Hardening (4/4 plans) — completed 2026-01-18
- [x] Phase 4: Code Quality (10/10 plans) — completed 2026-01-18
- [ ] Phase 5: Performance & Fixes (0/4 plans) — deferred
- [ ] Phase 6: Production Validation (0/0 plans) — deferred

</details>

<details>
<summary>✅ v1.1 Dependency Maintenance (Phase 7) — SHIPPED 2026-03-05</summary>

- [x] Phase 7: Dependency Maintenance (3/3 plans) — completed 2026-03-05

</details>

<details>
<summary>✅ v1.2 Dell Calculation Accuracy (Phases 8–13) — SHIPPED 2026-03-25</summary>

- [x] Phase 8: PowerVault ADAPT Formula Fix (1/1 plans) — completed 2026-03-25
- [x] Phase 9: PowerStore Data Fraction Fix (1/1 plans) — completed 2026-03-25
- [x] Phase 10: PowerStore System Overhead Addition (1/1 plans) — completed 2026-03-25
- [x] Phase 11: PowerScale serverCount Fix (1/1 plans) — completed 2026-03-25
- [x] Phase 12: PowerFlex and ObjectScale Validation (1/1 plans) — completed 2026-03-25
- [x] Phase 13: Test Suite Cleanup (2/2 plans) — completed 2026-03-25

</details>

### v1.3 Rich Export & Polish (Phases 14–18)

- [ ] **Phase 14: Dependency Maintenance** — Update all npm packages to latest compatible versions
- [ ] **Phase 15: Code Quality Fixes** — Fix resilienceWorker TS warnings and PowerStore per-model overhead
- [x] **Phase 16: PPTX Foundation** — Library integration, chart capture infrastructure, brand system, in-browser constraint (completed 2026-04-01)
- [ ] **Phase 17: PPTX Content** — Executive summary, per-engine detail slides, embedded charts, BOM slide
- [ ] **Phase 18: PDF Revamp** — Redesign PDF export to match PPTX brand and content parity

## Phase Details

### Phase 14: Dependency Maintenance
**Goal**: All npm dependencies are current and CI passes cleanly
**Depends on**: Nothing (standalone maintenance)
**Requirements**: DEPS-01
**Success Criteria** (what must be TRUE):
  1. Running `npm outdated` shows no packages with available updates beyond current semver constraints
  2. All CI checks (tests, typecheck, lint) pass after the update
  3. No runtime regressions in the browser after updating
**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md — Patch low-risk packages (dompurify, recharts, zustand, fast-check, snyk, @types/node, tailwindcss)
- [x] 14-02-PLAN.md — Update tool chain (biome 2.4.10, vitest suite 4.1.2)
- [ ] 14-03-PLAN.md — Update i18n stack and build plugin (@vitejs/plugin-react 5.2.0, i18next 25.10.10, react-i18next 16.6.6) + browser verify

### Phase 15: Code Quality Fixes
**Goal**: TypeScript compiles without noNonNullAssertion warnings and PowerStore uses accurate per-model overhead
**Depends on**: Nothing (independent surgical fixes)
**Requirements**: QUALITY-01, QUALITY-02
**Success Criteria** (what must be TRUE):
  1. `npm run typecheck` produces zero noNonNullAssertion warnings in resilienceWorker.ts
  2. PowerStore 5200T, 5200Q, and 3200 model classes each apply their own distinct overhead rate instead of a flat 5%
  3. Existing PowerStore tests continue to pass after the per-model overhead change
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md — Fix resilienceWorker.ts noNonNullAssertion warnings (QUALITY-01)
- [ ] 15-02-PLAN.md — Add PowerStore per-model overhead rates and model selector UI (QUALITY-02)

### Phase 16: PPTX Foundation
**Goal**: A working PPTX generation pipeline exists in-browser with brand styling and chart capture capability
**Depends on**: Nothing (new feature foundation)
**Requirements**: EXPORT-01, EXPORT-06, EXPORT-10
**Success Criteria** (what must be TRUE):
  1. User clicks an export button and a .pptx file downloads to their machine — no server request is made
  2. Generated PPTX slides use the app's dark storage-themed background, color palette, and typography
  3. Chart capture produces a rasterized image of the Sankey diagram suitable for embedding in a slide
  4. No external service URL appears in network requests during generation
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 16-01-PLAN.md — Install pptxgenjs + html-to-image, add Sankey id, create captureChart.ts
- [x] 16-02-PLAN.md — Create exportPptx.ts with brand constants, title slide, and capacity slide
- [x] 16-03-PLAN.md — Add PPTX button to OutputDashboard export card + i18n in all 4 locales

### Phase 17: PPTX Content
**Goal**: The generated PPTX contains all required slides with accurate data from the current simulation
**Depends on**: Phase 16
**Requirements**: EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05
**Success Criteria** (what must be TRUE):
  1. The first slide displays topology name, usable capacity, and headline IOPS, resilience probability, and sustainability metrics
  2. The deck contains four detail slides — one each for Volumetry, Performance, Resilience, and Sustainability — with the key metrics for that engine
  3. The Sankey waterfall, performance gauge, and resilience donut chart appear as embedded images in the appropriate slides
  4. A BOM slide lists drive model, specs, drive count, server count, and topology settings
**Plans**: 2 plans
**UI hint**: yes

Plans:
- [x] 17-01-PLAN.md — Add DOM ids to Speedometer and DonutChart; add captureSpeedometer() and captureDonutChart() to captureChart.ts
- [ ] 17-02-PLAN.md — Expand exportPptx.ts to 7-slide deck (exec summary, 4 engine detail slides, BOM) with embedded charts; add pptx i18n keys to all 4 locales

### Phase 18: PDF Revamp
**Goal**: The PDF export matches the PPTX visual quality and covers the same content sections
**Depends on**: Phase 16
**Requirements**: EXPORT-07, EXPORT-08, EXPORT-09
**Success Criteria** (what must be TRUE):
  1. User clicks a PDF export button and a redesigned .pdf file downloads — no server request is made
  2. The PDF layout uses the same dark theme, color palette, and typography established in the PPTX
  3. The PDF contains an executive summary section, per-engine detail sections, embedded charts, and a hardware BOM section — matching PPTX content scope
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1 - Test Infrastructure | v1.0 | 2/2 | Complete | 2026-01-17 |
| 2 - Calculation Validation | v1.0 | 10/10 | Complete | 2026-01-18 |
| 3 - Security Hardening | v1.0 | 4/4 | Complete | 2026-01-18 |
| 4 - Code Quality | v1.0 | 10/10 | Complete | 2026-01-18 |
| 5 - Performance & Fixes | v1.0 | 0/4 | Deferred | — |
| 6 - Production Validation | v1.0 | 0/0 | Deferred | — |
| 7 - Dependency Maintenance | v1.1 | 3/3 | Complete | 2026-03-05 |
| 8 - PowerVault ADAPT Formula Fix | v1.2 | 1/1 | Complete | 2026-03-25 |
| 9 - PowerStore Data Fraction Fix | v1.2 | 1/1 | Complete | 2026-03-25 |
| 10 - PowerStore System Overhead Addition | v1.2 | 1/1 | Complete | 2026-03-25 |
| 11 - PowerScale serverCount Fix | v1.2 | 1/1 | Complete | 2026-03-25 |
| 12 - PowerFlex and ObjectScale Validation | v1.2 | 1/1 | Complete | 2026-03-25 |
| 13 - Test Suite Cleanup | v1.2 | 2/2 | Complete | 2026-03-25 |
| 14 - Dependency Maintenance | v1.3 | 2/3 | In Progress|  |
| 15 - Code Quality Fixes | v1.3 | 1/2 | In Progress|  |
| 16 - PPTX Foundation | v1.3 | 3/3 | Complete   | 2026-04-01 |
| 17 - PPTX Content | v1.3 | 1/2 | In Progress|  |
| 18 - PDF Revamp | v1.3 | 0/? | Not started | — |

---

_Roadmap covers milestones: v1.0 Production Ready, v1.1 Dependency Maintenance, v1.2 Dell Calculation Accuracy, v1.3 Rich Export & Polish_
