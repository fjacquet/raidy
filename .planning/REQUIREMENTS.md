# Requirements: Raidy

**Defined:** 2026-03-25
**Core Value:** Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

## v1.2 Requirements

Requirements for milestone v1.2 — Dell Calculation Accuracy. Each maps to roadmap phases 8–13.

### PowerVault ADAPT

- [x] **DELL-01**: PowerVault ADAPT usable capacity uses dynamic formula `((N-2)/N) × (8/10)` for ≤18 drives, `((N-2)/N) × (16/18)` for >18 drives — replacing hardcoded 85%/87% constants
- [x] **DELL-02**: PowerVault ADAPT results match Dell Sizer within 1% for the ME5224 reference configuration (12 × 3.84TB SSD, ADAPT 8+2: expected 27.93 TiB usable from 41.9 TiB raw)

### PowerStore

- [x] **DELL-03**: PowerStore RAID-6 efficiency computed from DRE geometry selection (4+2 for <8 drives, 8+2 for 8–19 drives, 16+2 for ≥20 drives) — replacing hardcoded 0.75 constant
- [x] **DELL-04**: PowerStore RAID-5 efficiency computed from DRE geometry selection (4+1 for <10 drives, 8+1 for ≥10 drives) — replacing hardcoded 0.80 constant
- [x] **DELL-05**: PowerStore applies system overhead (~5% default, configurable via `systemOverheadPercent`) on top of RAID parity efficiency
- [x] **DELL-06**: PowerStore results match Dell Sizer within 1% for the 5200Q reference configuration (35 × 30.72TB NVMe QLC, RAID 16+2: expected 801.57 TiB usable from 977.89 TiB raw)

### PowerScale

- [x] **DELL-07**: PowerScale N+x calculations use `serverCount` (node count) as the denominator instead of `driveCount`, fixing near-100% efficiency bug on multi-drive-per-node configurations
- [x] **DELL-08**: PowerScale N+x efficiency formulas validated against Dell OneFS documentation and confirmed within 1% tolerance

### PowerFlex

- [x] **DELL-09**: PowerFlex EC formulas (2-way mirror, 3-way mirror, 4+1, 4+2, 8+2, 12+4) validated against Dell documentation; fixes applied only if divergence found

### ObjectScale

- [x] **DELL-10**: ObjectScale EC formulas (12+4, 10+2, 24+4, mirror-3) validated against Dell documentation; fixes applied only if divergence found

### Test Suite

- [x] **DELL-11**: Dell Sizer reference test vectors added to `tests/fixtures/dell-vectors.ts` covering all corrected formulas (minimum: ME5224 ADAPT 12-drive and PowerStore 5200Q 35-drive reference cases)
- [x] **DELL-12**: All existing Dell topology tests updated with correct reference values derived from Dell Sizer; zero `.skip` markers remain; all tests pass; no regressions in other topology tests

## v1.1 Requirements (complete)

### Dependency Maintenance

- [x] **DEP-01**: Update dompurify from 3.3.1 to 3.3.2
- [x] **DEP-02**: Update react-i18next from 16.5.4 to 16.5.5
- [x] **DEVDEP-01**: Update @biomejs/biome from 2.3.11 to 2.4.6
- [x] **DEVDEP-02**: Update jsdom from 27.4.0 to 28.1.0
- [x] **DEVDEP-03**: Update @types/node from 24.11.0 to 25.3.3
- [x] **VERIFY-01–04**: All tests, lint, typecheck, and build pass

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Dell Advanced Features

- PowerStore system overhead per appliance model class (1000T vs 3200 vs 5200Q differ)
- ObjectScale two-site geo-replication factor (2.67× overhead for two-site XOR protection)
- PowerScale small-file overhead modeling (requires workload file-size distribution as input)
- PowerFlex FG metadata overhead per pool (varies with snapshot density)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend services or APIs | Raidy must remain a static client-side SPA |
| Breaking changes to URL hash schema | Existing shared links must remain valid |
| New storage topologies | v1.2 scope is fixing existing Dell calculations, not adding new platforms |
| Architectural rewrites | Fix surgically within existing strategy pattern |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DELL-01 | Phase 8 | Complete |
| DELL-02 | Phase 8 | Complete |
| DELL-03 | Phase 9 | Complete |
| DELL-04 | Phase 9 | Complete |
| DELL-05 | Phase 10 | Complete |
| DELL-06 | Phase 10 | Complete |
| DELL-07 | Phase 11 | Complete |
| DELL-08 | Phase 11 | Complete |
| DELL-09 | Phase 12 | Complete |
| DELL-10 | Phase 12 | Complete |
| DELL-11 | Phase 13 | Complete |
| DELL-12 | Phase 13 | Complete |

**Coverage:**

- v1.2 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after v1.2 initial definition*
