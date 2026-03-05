# Raidy - Production Readiness

## What This Is

Raidy is a browser-based simulator for modern storage infrastructure including RAID, ZFS, VMware vSAN, Microsoft S2D, Nutanix, Ceph, and enterprise storage arrays. It's a Progressive Web App that runs entirely client-side, helping storage engineers and IT professionals make informed infrastructure decisions through accurate capacity, performance, resilience, and sustainability calculations.

## Core Value

Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

## Requirements

### Validated

<!-- Shipped capabilities from existing codebase -->

- ✓ **Multi-topology support** — Simulates 13+ storage topologies: RAID (0/1/1E/3/4/5/5E/5EE/6/10/50/60), ZFS (Stripe/Mirror/RAID-Z1/Z2/Z3/dRAID), vSAN (OSA/ESA), S2D, Ceph, Nutanix, enterprise arrays — existing
- ✓ **Four calculation engines** — Volumetry (capacity/efficiency), Performance (IOPS/bottlenecks), Resilience (Monte Carlo failure simulation), Sustainability (power/CO2/TCO) — existing
- ✓ **URL-based state sharing** — Serialize configuration to shareable compressed URL hash — existing
- ✓ **Multi-language support** — Full i18n for Swiss languages (EN/FR/DE/IT) with 8 namespaces — existing
- ✓ **Configuration export** — PDF reports, YAML/Ansible/Terraform snippets for deployment — existing
- ✓ **Drive database** — 50+ real-world drive specifications with performance/reliability/power metrics — existing
- ✓ **Interactive dashboard** — Real-time recalculation, capacity waterfall (Sankey), performance gauges, resilience probability — existing
- ✓ **Dark mode UI** — Tailwind-based responsive design with custom storage-themed color palette — existing
- ✓ **Web Worker simulations** — Background Monte Carlo with progress updates (10,000 iterations) — existing

### Active

<!-- Production readiness fixes for public launch -->

- [ ] **Comprehensive test coverage** — Unit tests for all calculation engines validated against industry formulas
- [ ] **Calculation accuracy validation** — Verify RAID math against WintelGuy, ZFS overhead against OpenZFS docs, vSAN efficiency benchmarks
- [ ] **Security hardening** — Fix URL state injection risk, validate PDF generation, add input sanitization, implement CSP
- [ ] **Input validation layer** — Prevent invalid configurations from reaching calculation engines
- [ ] **Error boundaries** — Graceful degradation when calculations fail instead of app crash
- [ ] **Code quality improvements** — Refactor monolithic 1647-line TopologyPanel, extract topology-specific logic from 1044-line volumetry engine
- [ ] **Performance optimization** — Add memoization boundaries, implement cancellable Monte Carlo simulations, reduce unnecessary recalculations
- [ ] **Fix known bugs** — URL hash parsing failures, missing worker abort functionality
- [ ] **Dependency audit** — Verify React 19/Tailwind 4 stability, remove unused dependencies (html2canvas)
- [ ] **Production build validation** — Clean lint, passing tests, optimized bundle sizes, security scan

### Out of Scope

- Backend services or APIs — Raidy must remain a static client-side SPA
- Mobile native apps — PWA/responsive web is the delivery mechanism
- Real-time collaboration or multi-user features — Single-user calculation tool
- Historical calculation storage — No user accounts or saved configurations (URL sharing suffices)
- Custom drive database editing — Users work with provided drive specs
- Breaking changes to existing calculations — Only validate/test, don't change proven logic
- Architectural rewrites — Fix concerns incrementally, preserve working patterns

## Context

**Brownfield project:** Existing React 19 + TypeScript SPA with comprehensive codebase mapping completed (January 2026). Architecture is sound: component-based SPA with reactive state management (Zustand), isolated calculation engines, Web Workers for CPU-intensive tasks.

**Current state:** Application is functionally complete with all core features implemented. Users can simulate storage configurations, export reports, and share URLs. However, zero automated tests exist despite vitest being configured. Code quality issues documented in `.planning/codebase/CONCERNS.md` include large monolithic components, fragile switch-statement logic for topology types, and missing input validation.

**Launch goal:** Public deployment for storage engineers, IT professionals, and infrastructure architects making real-world storage decisions. Users will rely on calculation accuracy for capacity planning, resilience analysis, and TCO modeling.

**Prior work:** CLAUDE.md requirements specify validation targets (WintelGuy calculator, NetApp Storage Efficiency Calculator, OpenZFS documentation). Codebase already implements complex storage math but lacks verification.

**Known issues:** Documented in CONCERNS.md - critical gaps include no test coverage (highest priority), security concerns (URL state injection, PDF generation), performance bottlenecks (recalculation on every change, non-cancellable simulations), and code quality (1647-line component, 1044-line calculation engine).

## Constraints

- **Architecture**: Static client-side SPA only — no backend, no server-side processing, no user accounts. All intelligence must remain in TypeScript calculation engines and JSON drive database.
- **URL compatibility**: Shared links must remain valid — cannot break existing URL hash schema. Requires versioned state migration if changes needed.
- **Calculation preservation**: Cannot change proven calculation logic without explicit validation. Only add tests and verification, don't "improve" working math.
- **Browser requirements**: Must support ES2022, Web Workers API, modern browser features. No IE11 or legacy browser support needed.
- **Bundle size**: Static hosting with limited bandwidth — keep total bundle under reasonable limits (currently ~2MB with chunking).
- **Deployment target**: GitHub Pages at `/raidy/` base path — build must work with this configuration.

## Current Milestone: v1.1 Dependency Maintenance

**Goal:** Keep all npm dependencies current to maintain security posture and benefit from bug fixes.

**Target features:**
- Update @biomejs/biome 2.3.11 → 2.4.6 (linter improvements)
- Update @types/node 24.11.0 → 25.3.3 (Node.js type definitions)
- Update dompurify 3.3.1 → 3.3.2 (security library patch)
- Update jsdom 27.4.0 → 28.1.0 (test environment update)
- Update react-i18next 16.5.4 → 16.5.5 (i18n library patch)

### Active

<!-- Current scope for v1.1 — Dependency Maintenance -->

- [ ] Update all outdated npm packages to latest compatible versions
- [ ] Verify all tests pass after updates
- [ ] Verify lint and typecheck pass after updates

## Key Decisions

| Decision                           | Rationale                                      | Outcome                        |
| ---------------------------------- | ---------------------------------------------- | ------------------------------ |
| Vitest for testing                 | Already configured, Vite-native, fast          | — Pending                      |
| Fix-in-place vs rewrite            | Existing code works, users depend on it        | — Pending                      |
| Industry benchmarks for validation | WintelGuy, NetApp, OpenZFS are gold standards  | — Pending                      |
| Static-only architecture           | Original constraint, enables simple deployment | ✓ Good                         |
| React 19 + Tailwind 4              | Modern stack, already in use                   | ⚠️ Revisit if stability issues |

---

_Last updated: 2026-03-05 after milestone v1.1 started_
