# Raidy - Production Readiness

## What This Is

Raidy is a browser-based simulator for modern storage infrastructure including RAID, ZFS, VMware vSAN, Microsoft S2D, Nutanix, Ceph, Dell (PowerStore, PowerVault, PowerScale, PowerFlex, ObjectScale), NetApp, and Synology arrays. It's a Progressive Web App that runs entirely client-side, helping storage engineers and IT professionals make informed infrastructure decisions through accurate capacity, performance, resilience, and sustainability calculations.

## Core Value

Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

## Requirements

### Validated

<!-- Shipped capabilities from existing codebase and milestones -->

- ✓ **Multi-topology support** — Simulates 13+ storage topologies: RAID (0/1/1E/3/4/5/5E/5EE/6/10/50/60), ZFS (Stripe/Mirror/RAID-Z1/Z2/Z3/dRAID), vSAN (OSA/ESA), S2D, Ceph, Nutanix, enterprise arrays — existing
- ✓ **Four calculation engines** — Volumetry (capacity/efficiency), Performance (IOPS/bottlenecks), Resilience (Monte Carlo failure simulation), Sustainability (power/CO2/TCO) — existing
- ✓ **URL-based state sharing** — Serialize configuration to shareable compressed URL hash — existing
- ✓ **Multi-language support** — Full i18n for Swiss languages (EN/FR/DE/IT) with 8 namespaces — existing
- ✓ **Configuration export** — PDF reports, YAML/Ansible/Terraform snippets for deployment — existing
- ✓ **Drive database** — 50+ real-world drive specifications with performance/reliability/power metrics — existing
- ✓ **Interactive dashboard** — Real-time recalculation, capacity waterfall (Sankey), performance gauges, resilience probability — existing
- ✓ **Dark mode UI** — Tailwind-based responsive design with custom storage-themed color palette — existing
- ✓ **Web Worker simulations** — Background Monte Carlo with progress updates (10,000 iterations) — existing
- ✓ **Comprehensive test coverage** — 881 tests, 84.13% coverage, validated against WintelGuy, OpenZFS, Dell Sizer — v1.0/v1.2
- ✓ **Security hardening** — Zod validation, DOMPurify, CSP headers, input sanitization — v1.0
- ✓ **Code quality** — Strategy pattern refactoring, error boundaries, exhaustive type checking — v1.0
- ✓ **Dell calculation accuracy** — PowerVault ADAPT, PowerStore DRE/overhead, PowerScale N+x, PowerFlex EC, ObjectScale EC all match Dell Sizer within 1% — v1.2

### Active

<!-- Next milestone work -->

- [ ] **PPTX export** — Client-side PowerPoint generation: executive summary, per-engine detail slides, embedded Sankey/charts, BOM slide; styled to match app dark/storage-themed design
- [ ] **PDF revamp** — Redesign existing PDF export to match PPTX visual quality and consistent brand style
- [ ] **resilienceWorker TS fix** — Resolve noNonNullAssertion warnings in resilienceWorker.ts
- [ ] **PowerStore model-class overhead** — Per-model overhead rates (5200T vs 5200Q etc.) instead of flat 5%
- [ ] **Dependency maintenance** — Keep npm packages current

### Out of Scope

- Backend services or APIs — Raidy must remain a static client-side SPA
- Mobile native apps — PWA/responsive web is the delivery mechanism
- Real-time collaboration or multi-user features — Single-user calculation tool
- Historical calculation storage — No user accounts or saved configurations (URL sharing suffices)
- Custom drive database editing — Users work with provided drive specs
- Breaking changes to existing calculations — Only validate/test, don't change proven logic
- Architectural rewrites — Fix concerns incrementally, preserve working patterns

## Context

**Current state:** v1.5.0 shipped (v1.2 Dell Calculation Accuracy milestone). React 19 + TypeScript SPA with 881 automated tests at 84.13% coverage. All Dell platform calculations (PowerVault, PowerStore, PowerScale, PowerFlex, ObjectScale) validated against Dell Sizer within 1% tolerance. Security hardened with Zod validation, DOMPurify, CSP headers. Code quality improved with strategy pattern across all engines.

**Tech stack:** React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, Zustand, Vitest, Biome, Web Workers.

**Known issues:** Phases 5-6 (Performance & Fixes, Production Validation) deferred from v1.0. resilienceWorker.ts has noNonNullAssertion warnings (to be fixed in v1.3). PowerStore system overhead may vary by model class — currently flat 5% (to be refined in v1.3).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vitest for testing | Already configured, Vite-native, fast | ✓ Good — 881 tests in 8.5s |
| Fix-in-place vs rewrite | Existing code works, users depend on it | ✓ Good — surgical fixes preserved all functionality |
| Industry benchmarks for validation | WintelGuy, NetApp, OpenZFS are gold standards | ✓ Good — all calculations within 1% |
| Dell Sizer as reference for Dell products | Official Dell capacity planning tool, ground truth | ✓ Good — all 5 Dell platforms validated |
| TDD protocol: skip→RED→GREEN→delete | Prevents testing wrong formulas | ✓ Good — caught all issues cleanly |
| Static-only architecture | Original constraint, enables simple deployment | ✓ Good |
| React 19 + Tailwind 4 | Modern stack, already in use | ✓ Good — no stability issues |

## Constraints

- **Architecture**: Static client-side SPA only — no backend, no server-side processing, no user accounts
- **URL compatibility**: Shared links must remain valid — cannot break existing URL hash schema
- **Calculation preservation**: Cannot change proven calculation logic without explicit validation
- **Browser requirements**: Must support ES2022, Web Workers API, modern browser features
- **Bundle size**: Static hosting — keep total bundle under reasonable limits (~2MB with chunking)
- **Deployment target**: GitHub Pages at `/raidy/` base path

---

## Current Milestone: v1.3 Rich Export & Polish

**Goal:** Add fully offline, visually rich PPTX export and revamp PDF export to match the app's dark storage-themed identity, while fixing known TypeScript and calculation accuracy issues.

**Target features:**
- PPTX export (executive summary, per-engine slides, embedded charts, BOM slide)
- PDF revamp (consistent brand style matching PPTX quality)
- Fix resilienceWorker.ts noNonNullAssertion TS warnings
- PowerStore per-model-class overhead rates
- Dependency maintenance

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-04-01 — Milestone v1.3 started_
