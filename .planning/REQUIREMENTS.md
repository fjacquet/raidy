# Requirements — v1.3 Rich Export & Polish

**Milestone:** v1.3
**Created:** 2026-04-01
**Status:** Active

---

## Milestone v1.3 Requirements

### Export (PPTX + PDF)

- [x] **EXPORT-01**: User can generate and download a PPTX file from the current simulation configuration
- [ ] **EXPORT-02**: PPTX executive summary slide displays topology name, usable capacity, and key IOPS/resilience/sustainability metrics
- [ ] **EXPORT-03**: PPTX includes dedicated detail slides for each calculation engine (Volumetry, Performance, Resilience, Sustainability)
- [ ] **EXPORT-04**: PPTX embeds rendered Sankey waterfall diagram, performance gauge, and resilience donut chart as slide images
- [ ] **EXPORT-05**: PPTX includes a hardware BOM slide listing drive model/specs, drive count, server count, and topology settings
- [ ] **EXPORT-06**: PPTX slides use the app's dark storage-themed color palette, typography, and visual style
- [ ] **EXPORT-07**: User can generate and download a redesigned PDF from the current simulation configuration
- [ ] **EXPORT-08**: PDF visual design matches the PPTX style (dark theme, consistent typography, branded layout)
- [ ] **EXPORT-09**: PDF includes the same content sections as PPTX (executive summary, per-engine details, charts, BOM)
- [x] **EXPORT-10**: Both PPTX and PDF generation run fully in-browser — no server upload, no external service call

### Code Quality

- [x] **QUALITY-01**: resilienceWorker.ts compiles with zero noNonNullAssertion TypeScript warnings
- [ ] **QUALITY-02**: PowerStore capacity calculation applies per-model overhead rates (5200T, 5200Q, 3200, etc.) instead of a flat 5% for all models

### Dependencies

- [ ] **DEPS-01**: All npm dependencies are updated to latest compatible versions with all CI tests passing

---

## Future Requirements

<!-- Deferred from this milestone — valid ideas for later -->

- Performance optimization (memoization boundaries, cancellable Monte Carlo) — deferred from v1.0
- Production validation (CI/CD pipeline, browser compatibility matrix) — deferred from v1.0
- Custom drive database editing — out of scope (users work with provided specs)

---

## Out of Scope

- Backend PDF/PPTX rendering services — must remain 100% client-side
- Cloud storage of exports — no accounts, no upload
- PPTX editing or template customization by end users
- New storage topology implementations (focus is export quality)

---

## Traceability

| REQ-ID | Requirement | Phase |
|--------|-------------|-------|
| EXPORT-01 | User can generate and download PPTX | Phase 16 |
| EXPORT-02 | PPTX executive summary slide | Phase 17 |
| EXPORT-03 | PPTX per-engine detail slides | Phase 17 |
| EXPORT-04 | PPTX embedded charts as images | Phase 17 |
| EXPORT-05 | PPTX hardware BOM slide | Phase 17 |
| EXPORT-06 | PPTX dark storage-themed styling | Phase 16 |
| EXPORT-07 | User can generate and download redesigned PDF | Phase 18 |
| EXPORT-08 | PDF matches PPTX visual style | Phase 18 |
| EXPORT-09 | PDF same content sections as PPTX | Phase 18 |
| EXPORT-10 | Both generate fully in-browser | Phase 16 |
| QUALITY-01 | resilienceWorker zero TS warnings | Phase 15 |
| QUALITY-02 | PowerStore per-model overhead rates | Phase 15 |
| DEPS-01 | npm dependencies up to date | Phase 14 |
