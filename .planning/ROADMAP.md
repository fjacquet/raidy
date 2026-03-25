# Roadmap

**Project:** Raidy - Production Readiness
**Created:** 2026-01-17
**Phases:** 13

## Overview

This roadmap takes Raidy from a functionally complete application to production-ready deployment. Phases are derived from natural delivery boundaries: establish test infrastructure, validate calculation accuracy (core value), harden security, improve code maintainability, optimize performance, and validate production deployment. Every v1 requirement maps to exactly one phase.

Phase 7 covers milestone v1.1 Dependency Maintenance — keeping all npm dependencies current to maintain security posture and benefit from bug fixes.

Phases 8–13 cover milestone v1.2 Dell Calculation Accuracy — fixing Dell storage platform formulas (PowerVault ADAPT, PowerStore DRE, PowerScale OneFS, PowerFlex, ObjectScale) to match official Dell Sizer output within 1% tolerance.

## Phases

<details>
<summary>✅ v1.0 Production Ready (Phases 1–6) — shipped 2026-01-18</summary>

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
- [x] 02-09-PLAN.md — Add vendor-specific topology edge case tests (gap closure: ObjectScale geo-replication, PowerFlex FG, RAID 5E/5EE, PowerVault ADAPT, vSAN ESA RAID-6)
- [x] 02-10-PLAN.md — Add tiering and advanced ZFS tests (gap closure: S2D/Nutanix/Ceph tiering, ZFS ashift padding penalty)

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

**Plans:** 4 plans

Plans:

- [x] 03-01-PLAN.md — URL state validation with Zod schemas and bounds checking
- [x] 03-02-PLAN.md — PDF export sanitization with DOMPurify and XSS review
- [x] 03-03-PLAN.md — Validation enforcement and error boundaries for graceful failure handling
- [x] 03-04-PLAN.md — Deployment security with CSP headers and automated vulnerability scanning

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

**Plans:** 10 plans (5 initial + 5 gap closure)

Plans:

- [x] 04-01-PLAN.md — Fix Biome lint errors, audit dependencies, add exhaustive type checking
- [x] 04-02-PLAN.md — Add calculation error logging and URL hash parse failure notifications
- [x] 04-03-PLAN.md — Split TopologyPanel into per-topology option panels
- [x] 04-04-PLAN.md — Refactor volumetry engine with strategy pattern
- [x] 04-05-PLAN.md — Refactor performance engine with strategy pattern
- [x] 04-06-PLAN.md — Fix lint errors in PerformanceStrategy.ts (gap closure: replace any with unknown)
- [x] 04-07-PLAN.md — Extract remaining Dell vendor panels (gap closure: TopologyPanel size reduction)
- [x] 04-08-PLAN.md — Fix TopologyPanel component tests (gap closure: mock store initialization)
- [x] 04-09-PLAN.md — Extract volumetry tiering and overhead logic (gap closure: orchestrator size reduction)
- [x] 04-10-PLAN.md — Extract performance bottleneck chain (gap closure: orchestrator size reduction)

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

**Plans:** 4 plans

Plans:

- [ ] 05-01-PLAN.md — Split useCalculations into independent memoization hooks
- [ ] 05-02-PLAN.md — Implement Monte Carlo cooperative yielding and reduce default iterations
- [ ] 05-03-PLAN.md — Lazy-load PDF export and configure bundle analysis
- [ ] 05-04-PLAN.md — Verify BUG-01 fix (URL hash parse failures show user notifications)

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

</details>

<details>
<summary>✅ v1.1 Dependency Maintenance (Phase 7) — shipped 2026-03-05</summary>

### Phase 7: Dependency Maintenance

**Goal:** All npm dependencies are current, the security posture is maintained, and the application continues to build and test cleanly
**Depends on:** Nothing (independent maintenance milestone, can run alongside other phases)
**Requirements:** DEP-01, DEP-02, DEVDEP-01, DEVDEP-02, DEVDEP-03, VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04

**Success Criteria:**

1. Running `npm outdated` shows dompurify, react-i18next, @biomejs/biome, jsdom, and @types/node all at their target versions (no listed outdated packages for these five)
2. Running `npm test` completes with all tests green after the dependency updates
3. Running `npm run lint` exits with zero errors after the updates (including any biome rule changes in 2.4.x)
4. Running `npm run typecheck` exits with zero TypeScript errors after the @types/node major version bump
5. Running `npm run build` produces a successful production bundle with no warnings

**Plans:** 3/3 plans complete

Plans:

- [x] 07-01-PLAN.md — Update production dependencies (dompurify 3.3.2, react-i18next 16.5.5)
- [x] 07-02-PLAN.md — Update dev dependencies (@biomejs/biome 2.4.6, jsdom 28.1.0, @types/node 25.3.3)
- [x] 07-03-PLAN.md — Verify all quality gates pass and fix any compatibility issues

</details>

### v1.2 Dell Calculation Accuracy (In Progress)

**Milestone Goal:** Fix Dell storage calculation formulas to match official Dell Sizer output within 1% tolerance across PowerVault ADAPT, PowerStore DRE, PowerScale OneFS, PowerFlex, and ObjectScale.

#### Phase 8: PowerVault ADAPT Formula Fix

**Goal:** Users calculating PowerVault ME5 capacity get accurate usable capacity based on their actual drive count
**Depends on:** Nothing (independent of other v1.2 phases)
**Requirements:** DELL-01, DELL-02

**Success Criteria:**

1. User configuring a ME5224 with 12 drives sees ~27.93 TiB usable from 41.9 TiB raw (67% efficiency, within 1% of Dell Sizer)
2. User configuring a PowerVault array with 20+ drives sees 16+2 stripe efficiency (~88.9%) rather than the previous hardcoded 87%
3. User configuring a PowerVault array with 18 or fewer drives sees 8+2 stripe efficiency (~80% times (N-2)/N) rather than the previous hardcoded 85%
4. Calculated ADAPT efficiency varies with drive count (not static) — visibly different results for 12, 18, 24, and 36 drive configurations

**Plans:** 1/1 plans complete

Plans:
- [ ] 08-01-PLAN.md — Fix ADAPT formula with Dell Sizer reference vectors and TDD test protocol

---

#### Phase 9: PowerStore Data Fraction Fix

**Goal:** Users calculating PowerStore RAID-5 and RAID-6 capacity see drive-count-aware efficiency from the actual DRE geometry
**Depends on:** Nothing (independent; must precede Phase 10)
**Requirements:** DELL-03, DELL-04

**Success Criteria:**

1. User configuring PowerStore RAID-6 with fewer than 8 drives sees 4+2 stripe efficiency (66.7%) instead of the previous hardcoded 75%
2. User configuring PowerStore RAID-6 with 8–19 drives sees 8+2 stripe efficiency (80%) instead of the previous hardcoded 75%
3. User configuring PowerStore RAID-6 with 20 or more drives sees 16+2 stripe efficiency (88.9%) instead of the previous hardcoded 75%
4. User configuring PowerStore RAID-5 with fewer than 10 drives sees 4+1 stripe efficiency (80%) and with 10+ drives sees 8+1 efficiency (88.9%) instead of the previous hardcoded 80%

**Plans:** TBD

---

#### Phase 10: PowerStore System Overhead Addition

**Goal:** Users calculating PowerStore capacity see the full system overhead deduction, matching Dell Sizer end-to-end
**Depends on:** Phase 9
**Requirements:** DELL-05, DELL-06

**Success Criteria:**

1. User configuring PowerStore 5200Q with 35 NVMe drives in RAID 16+2 sees ~801.57 TiB usable from 977.89 TiB raw (within 1% of Dell Sizer)
2. User can see system overhead as a distinct line item in the capacity breakdown (separate from parity overhead)
3. User configuring any PowerStore topology sees usable capacity that is lower than the post-parity capacity by the configured system overhead percentage (default ~5%)

**Plans:** TBD

---

#### Phase 11: PowerScale serverCount Fix

**Goal:** Users calculating PowerScale capacity for multi-drive-per-node clusters get correct N+x efficiency rather than near-100% false results
**Depends on:** Nothing (independent of PowerStore phases)
**Requirements:** DELL-07, DELL-08

**Success Criteria:**

1. User configuring a 10-node PowerScale cluster with 36 drives per node and N+2 protection sees ~80% efficiency (matching OneFS formula M/(N+M) where N=10, M=2) instead of the near-100% efficiency produced by the driveCount bug
2. User configuring a 4-node PowerScale cluster with N+1 protection sees 80% efficiency (4 nodes, 1 parity = 4/5) consistent with Dell OneFS documentation
3. Calculated PowerScale efficiency changes when node count changes but drive-per-node count stays constant, demonstrating the serverCount parameter is active

**Plans:** TBD

---

#### Phase 12: PowerFlex and ObjectScale Validation

**Goal:** Users can trust PowerFlex and ObjectScale capacity calculations are accurate against Dell documentation
**Depends on:** Nothing (independent validation phase)
**Requirements:** DELL-09, DELL-10

**Success Criteria:**

1. PowerFlex 2-way mirror, 3-way mirror, 4+1, 4+2, 8+2, and 12+4 EC configurations each produce usable capacity within 1% of the Dell documentation reference values
2. ObjectScale 12+4, 10+2, 24+4, and mirror-3 EC configurations each produce usable capacity within 1% of the Dell documentation reference values
3. Any formula divergence found during validation is corrected, and the correction is verified against at least one Dell Sizer reference case

**Plans:** TBD

---

#### Phase 13: Test Suite Cleanup

**Goal:** The Dell test suite reflects correct Dell Sizer reference values with zero skipped tests and no regressions
**Depends on:** Phase 8, Phase 9, Phase 10, Phase 11, Phase 12
**Requirements:** DELL-11, DELL-12

**Success Criteria:**

1. Running `npm test` shows zero `.skip` markers in any Dell-related test block — every Dell test runs and passes
2. `tests/fixtures/dell-vectors.ts` exists and contains at minimum the ME5224 ADAPT 12-drive and PowerStore 5200Q 35-drive reference vectors with TB-to-TiB normalization documented
3. Running `npm run test:coverage` passes the 75% coverage threshold with no regressions in non-Dell topology tests
4. Every Dell test assertion is traceable to a Dell Sizer reference value (comment citing source) rather than a back-calculated engine output

**Plans:** TBD

---

## Progress

| Phase | Milestone | Status | Completed |
|-------|-----------|--------|-----------|
| 1 - Test Infrastructure | v1.0 | Complete | 2026-01-17 |
| 2 - Calculation Validation | v1.0 | Complete | 2026-01-18 |
| 3 - Security Hardening | v1.0 | Complete | 2026-01-18 |
| 4 - Code Quality | v1.0 | Complete | 2026-01-18 |
| 5 - Performance & Fixes | v1.0 | Ready for execution | — |
| 6 - Production Validation | v1.0 | Not started | — |
| 7 - Dependency Maintenance | v1.1 | Complete | 2026-03-05 |
| 8 - PowerVault ADAPT Formula Fix | 1/1 | Complete   | 2026-03-25 |
| 9 - PowerStore Data Fraction Fix | v1.2 | Not started | — |
| 10 - PowerStore System Overhead Addition | v1.2 | Not started | — |
| 11 - PowerScale serverCount Fix | v1.2 | Not started | — |
| 12 - PowerFlex and ObjectScale Validation | v1.2 | Not started | — |
| 13 - Test Suite Cleanup | v1.2 | Not started | — |

---

_Roadmap covers milestones: v1.0 - Production Ready, v1.1 - Dependency Maintenance, v1.2 - Dell Calculation Accuracy_
