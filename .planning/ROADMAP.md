# Roadmap

**Project:** Raidy - Production Readiness
**Created:** 2026-01-17
**Phases:** 6

## Overview

This roadmap takes Raidy from a functionally complete application to production-ready deployment. Phases are derived from natural delivery boundaries: establish test infrastructure, validate calculation accuracy (core value), harden security, improve code maintainability, optimize performance, and validate production deployment. Every v1 requirement maps to exactly one phase.

## Phases

### Phase 1: Test Infrastructure

**Goal:** Developers can write and run automated tests for calculation engines
**Depends on:** Nothing (first phase)
**Requirements:** TEST-13, BUG-03

**Success Criteria:**

1. Developer can run `npm test` and see test results with coverage reporting
2. Developer can add new test files that are automatically discovered by vitest
3. Developer can see code coverage reports with line-by-line coverage and threshold enforcement
4. Test configuration supports TypeScript path aliases and React component testing

**Plans:** 2 plans

Plans:

- [x] 01-01-PLAN.md — Install and configure test infrastructure
- [x] 01-02-PLAN.md — Complete test setup and verify infrastructure

---

### Phase 2: Calculation Validation

**Goal:** Storage engineers can trust calculation accuracy for real-world infrastructure decisions
**Depends on:** Phase 1
**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, TEST-10, TEST-11, TEST-12, TEST-14, TEST-15, TEST-16

**Success Criteria:**

1. RAID capacity calculations (all levels: 0/1/1E/3/4/5/5E/5EE/6/10/50/60) match WintelGuy calculator within 1% tolerance
2. ZFS overhead calculations (slop factor, ashift padding) match OpenZFS documentation specifications
3. Monte Carlo simulations produce statistically valid results with documented confidence intervals
4. All major topology types (RAID, ZFS, vSAN ESA/OSA, S2D, Ceph, Nutanix) have verified test coverage
5. URL state serialization roundtrip preserves configuration accurately with backward compatibility validation

**Plans:** 10 plans (5 initial + 5 gap closure)

Plans:

- [x] 02-01-PLAN.md — Validate standard RAID capacity calculations with WintelGuy references
- [x] 02-02-PLAN.md — Validate ZFS and advanced storage topologies with vendor documentation
- [x] 02-03-PLAN.md — Validate performance engine IOPS and write penalty calculations
- [x] 02-04-PLAN.md — Validate Monte Carlo resilience simulations with statistical accuracy
- [x] 02-05-PLAN.md — Validate URL state serialization and form validation rules
- [x] 02-06-PLAN.md — Add advanced topology performance tests (gap closure: PowerFlex, ObjectScale, PowerStore, PowerScale, Nutanix)
- [x] 02-07-PLAN.md — Add volumetry edge case and error handling tests (gap closure: zero drives, invalid configs, boundaries)
- [x] 02-08-PLAN.md — Fix flaky statistical test (gap closure: confidence interval narrowing test stability)
- [ ] 02-09-PLAN.md — Add vendor-specific topology edge case tests (gap closure: ObjectScale geo-replication, PowerFlex FG, RAID 5E/5EE, PowerVault ADAPT, vSAN ESA RAID-6)
- [ ] 02-10-PLAN.md — Add tiering and advanced ZFS tests (gap closure: S2D/Nutanix/Ceph tiering, ZFS ashift padding penalty)

---

### Phase 3: Security Hardening

**Goal:** Users are protected from malicious inputs and application vulnerabilities
**Depends on:** Phase 1
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-10

**Success Criteria:**

1. User cannot inject malicious values via URL hash manipulation (bounds checking, enum validation)
2. User sees clear error messages when providing invalid configuration values instead of silent failures
3. PDF export handles all user inputs safely without XSS vectors in text insertion points
4. Production deployment has Content Security Policy headers configured for static hosting
5. Dependency scan passes with zero high/critical vulnerabilities (Snyk or npm audit)

**Plans:** (created by /gsd:plan-phase)

---

### Phase 4: Code Quality

**Goal:** Developers can maintain and extend the codebase with confidence
**Depends on:** Phase 2
**Requirements:** QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06, QUAL-07, QUAL-08, QUAL-09, QUAL-10, QUAL-11, QUAL-12, QUAL-13, QUAL-14, QUAL-15

**Success Criteria:**

1. TopologyPanel component is split into manageable per-topology components (each under 300 lines)
2. Calculation engines have topology-specific logic extracted into separate modules with strategy pattern
3. Application shows user-friendly error recovery via React error boundaries instead of crashes
4. Codebase passes Biome lint with zero warnings/errors and all TypeScript strict mode violations resolved
5. Fragile switch statements use exhaustive type checking with no runtime fallbacks

**Plans:** (created by /gsd:plan-phase)

---

### Phase 5: Performance & Fixes

**Goal:** Users experience responsive UI and reliable functionality across devices
**Depends on:** Phase 4
**Requirements:** PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06, PERF-07, PERF-08, BUG-01, BUG-02

**Success Criteria:**

1. Configuration changes trigger only affected calculations (volumetry/performance/resilience independently memoized)
2. User can cancel long-running Monte Carlo simulations via abort functionality
3. Initial page load completes under 3 seconds on simulated 3G connection
4. Production bundle size remains under 2MB total with proper code splitting
5. Invalid URL hashes show user notification instead of silent console.warn failure

**Plans:** (created by /gsd:plan-phase)

---

### Phase 6: Production Validation

**Goal:** Application is deployed and accessible to public users with verified reliability
**Depends on:** Phase 5
**Requirements:** PROD-01, PROD-02, PROD-03, PROD-04, PROD-05

**Success Criteria:**

1. CI/CD pipeline (GitHub Actions) passes all tests, lint, and build checks on every commit
2. Production build deploys successfully to GitHub Pages with `/raidy/` base path
3. Security scan passes with zero high/critical vulnerabilities in final dependency audit
4. All calculation engines validated against industry benchmarks (WintelGuy, NetApp, OpenZFS, VMware docs)
5. Application loads and functions correctly on target browsers (Chrome, Firefox, Safari, Edge)

**Plans:** (created by /gsd:plan-phase)

---

## Progress

| Phase                      | Status                    | Completed  |
| -------------------------- | ------------------------- | ---------- |
| 1 - Test Infrastructure    | ✓ Complete                | 2026-01-17 |
| 2 - Calculation Validation | In Progress (gap closure) | —          |
| 3 - Security Hardening     | Not started               | —          |
| 4 - Code Quality           | Not started               | —          |
| 5 - Performance & Fixes    | Not started               | —          |
| 6 - Production Validation  | Not started               | —          |

---

_Roadmap for milestone: v1.0 - Production Ready_
