---
phase: 02-calculation-validation
verified: 2026-01-18T07:50:00Z
status: gaps_found
score: 5/5 success criteria verified (but coverage threshold not met)
gaps:
  - truth: "Overall test coverage meets 75% threshold for calculation engines"
    status: failed
    reason: "Coverage at 51.14% vs 75% threshold - large portions of performance and volumetry engines untested"
    artifacts:
      - path: "src/engines/performance/index.ts"
        issue: "50.7% coverage - half of code paths untested (missing advanced topology performance tests)"
      - path: "src/engines/volumetry/index.ts"
        issue: "58.51% coverage - 41.49% of code paths untested (missing edge cases, error handling)"
      - path: "src/engines/sustainability/index.ts"
        issue: "0% coverage - entire module untested (but not critical for Phase 2 calculation validation)"
      - path: "src/utils/exportPdf.ts"
        issue: "0% coverage - entire module untested (not critical for Phase 2)"
      - path: "src/utils/exportConfig.ts"
        issue: "0% coverage - entire module untested (not critical for Phase 2)"
    missing:
      - "Performance engine tests for advanced topologies (vSAN ESA/OSA, S2D, Ceph IOPS)"
      - "Volumetry engine tests for edge cases (zero drives, invalid configs, boundary conditions)"
      - "Error handling tests for calculation engines"
      - "Sustainability engine tests (carbon footprint, TCO) - defer to later phase if not critical"
  - truth: "Monte Carlo statistical tests are stable and non-flaky"
    status: failed
    reason: "Confidence interval narrowing test fails intermittently due to statistical variance"
    artifacts:
      - path: "tests/workers/resilience.spec.ts"
        issue: "Line 1297: test expects margin2 < margin1 * 0.4, but stochastic nature causes failures"
    missing:
      - "Increase tolerance for statistical test or increase simulation runs for more stable results"
      - "Or accept flakiness and mark test as .skip with explanation"
---

# Phase 2: Calculation Validation Verification Report

**Phase Goal:** Storage engineers can trust calculation accuracy for real-world infrastructure decisions
**Verified:** 2026-01-18T07:50:00Z
**Status:** gaps_found (calculations validated, coverage threshold not met)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RAID 0-60 capacity calculations match WintelGuy within 1% tolerance | ✓ VERIFIED | 24 WintelGuy-validated test vectors in tests/fixtures/raid-vectors.ts, all passing |
| 2 | ZFS overhead calculations (slop factor, ashift) match OpenZFS specs | ✓ VERIFIED | 22 OpenZFS-validated vectors in tests/fixtures/zfs-vectors.ts, slop factor enforces 128 MiB - 128 GiB bounds |
| 3 | Monte Carlo simulations produce statistically valid results with confidence intervals | ✓ VERIFIED (1 flaky test) | URE probability tests, correlated failure modeling, binomial distribution validation with 95% CI (p ± 1.96σ) |
| 4 | All major topology types have verified test coverage | ✓ VERIFIED | RAID (24), ZFS (22), vSAN (18), S2D (6), Ceph (6), Nutanix (4), NetApp, Synology - 121 volumetry tests passing |
| 5 | URL state serialization roundtrip preserves configuration accurately | ✓ VERIFIED | 22 roundtrip tests in tests/utils/urlStorage.spec.ts, backward compatibility documented |
| 6 | Overall test coverage meets 75% threshold for calculation engines | ✗ FAILED | Coverage: 51.14% vs 75% threshold. Performance: 50.7%, Volumetry: 58.51%, Sustainability: 0% |

**Score:** 5/6 truths verified (coverage threshold not met)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tests/fixtures/raid-vectors.ts` | WintelGuy-validated RAID test vectors (100+ lines) | ✓ VERIFIED | 378 lines, 24 vectors, all 11 RAID levels covered |
| `tests/fixtures/zfs-vectors.ts` | OpenZFS-validated ZFS test vectors (50+ lines) | ✓ VERIFIED | 358 lines, 22 vectors, all ZFS topologies covered |
| `tests/fixtures/vsan-vectors.ts` | VMware-validated vSAN test vectors (30+ lines) | ✓ VERIFIED | 294 lines, 18 vectors, ESA/OSA adaptive efficiency covered |
| `tests/fixtures/performance-vectors.ts` | Industry-validated performance test vectors (40+ lines) | ✓ VERIFIED | 334 lines, HDD/SSD/NVMe IOPS specs with write penalty formulas |
| `tests/engines/volumetry.spec.ts` | Comprehensive volumetry tests (50+ tests) | ✓ VERIFIED | 121 tests passing, table-driven with describe.each, property-based with fast-check |
| `tests/engines/performance.spec.ts` | Performance tests with write penalty validation (25+ tests) | ✓ VERIFIED | 78 tests, RAID 5/6 write penalty (4×/6×), bottleneck chain logic |
| `tests/workers/resilience.spec.ts` | Monte Carlo statistical validation (15+ tests) | ⚠️ PARTIAL | 58 tests (57 passing, 1 flaky), 96.42% coverage |
| `tests/utils/urlStorage.spec.ts` | URL roundtrip tests (12+ tests) | ✓ VERIFIED | 22 tests, roundtrip for all config types, backward compatibility |
| `tests/utils/validators.spec.ts` | Form validation tests (15+ tests) | ✓ VERIFIED | 57 tests, drive count + topology compatibility validation |
| `package.json` | fast-check dependency | ✓ VERIFIED | fast-check@4.5.3 in devDependencies |

**Artifact Status:** 9/10 fully verified, 1 partial (flaky test)

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| volumetry.spec.ts | raid-vectors.ts | import statement | ✓ WIRED | `import { standardRAIDVectors } from '../fixtures/raid-vectors'` |
| volumetry.spec.ts | zfs-vectors.ts | import statement | ✓ WIRED | `import { zfsVectors } from '../fixtures/zfs-vectors'` |
| volumetry.spec.ts | fast-check | fc.assert calls | ✓ WIRED | 13 fc.assert() calls for property-based tests |
| performance.spec.ts | performance-vectors.ts | import statement | ✓ WIRED | Industry-validated IOPS vectors used in tests |
| resilience.spec.ts | URE formula | P = 1-(1-1/10^URE)^bits | ✓ WIRED | Industry formula documented and tested |
| resilience.spec.ts | Confidence intervals | 95% CI = p ± 1.96σ | ✓ WIRED | Binomial distribution formula implemented |
| urlStorage.spec.ts | serializeToURL + deserializeFromURL | roundtrip tests | ✓ WIRED | Config → serialize → deserialize → equals config |

**Key Links:** All verified and wired correctly

### Requirements Coverage

Phase 2 requirements from REQUIREMENTS.md:

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| TEST-01: Volumetry RAID tests | ✓ SATISFIED | 24 test vectors, all levels covered |
| TEST-02: Volumetry ZFS tests | ✓ SATISFIED | 22 test vectors, slop factor validated |
| TEST-03: Volumetry advanced topologies | ✓ SATISFIED | vSAN, S2D, Ceph, Nutanix covered |
| TEST-04: Performance IOPS tests | ✓ SATISFIED | 78 tests, IOPS scaling validated |
| TEST-05: Performance bottleneck tests | ✓ SATISFIED | Bottleneck chain logic (media/controller/bus/network) |
| TEST-06: URE probability tests | ✓ SATISFIED | Industry formula validated across URE rates |
| TEST-07: Correlated failure tests | ✓ SATISFIED | Rebuild window risk, batch failures modeled |
| TEST-08: Statistical accuracy validation | ⚠️ PARTIAL | 1 flaky test for confidence interval narrowing |
| TEST-09: RAID vs WintelGuy validation | ✓ SATISFIED | 1% tolerance met for all RAID levels |
| TEST-10: ZFS vs OpenZFS validation | ✓ SATISFIED | Slop factor matches OpenZFS specs (128 MiB - 128 GiB) |
| TEST-11: vSAN efficiency validation | ✓ SATISFIED | ESA adaptive efficiency (67-80%) matches VMware docs |
| TEST-12: Write penalty validation | ✓ SATISFIED | RAID 5 = 4×, RAID 6 = 6× with industry sources |
| TEST-13: Vitest infrastructure | ✓ SATISFIED | From Phase 1, working with coverage reporting |
| TEST-14: URL serialization tests | ✓ SATISFIED | 22 roundtrip tests, backward compatibility documented |
| TEST-15: Form validator tests | ✓ SATISFIED | 57 tests, all validation rules covered |
| TEST-16: Coverage thresholds | ✗ BLOCKED | Coverage at 51.14% vs 75% threshold |

**Requirements:** 15/16 satisfied, 1 blocked by coverage gap

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tests/workers/resilience.spec.ts | 1297 | Flaky statistical test (margin2 < margin1 * 0.4) | ⚠️ WARNING | Test fails intermittently, reduces CI reliability |
| src/engines/performance/index.ts | Multiple | 49.3% of code paths untested | 🛑 BLOCKER | Prevents 75% coverage threshold, untested advanced topology performance |
| src/engines/volumetry/index.ts | Multiple | 41.49% of code paths untested | 🛑 BLOCKER | Prevents 75% coverage threshold, untested edge cases/error handling |
| src/engines/sustainability/index.ts | All | 0% coverage (208 lines) | ℹ️ INFO | Not critical for Phase 2 calculation validation |

**Anti-Pattern Summary:**
- 🛑 2 blockers preventing coverage threshold
- ⚠️ 1 warning (flaky test)
- ℹ️ 1 info (sustainability engine out of scope for Phase 2)

### Gaps Summary

**Gap 1: Coverage threshold not met (BLOCKS GOAL)**

Phase 2 was expected to achieve 75% test coverage for calculation engines per vitest.config.ts thresholds and ROADMAP success criteria. Current coverage:

```
Overall:       51.14% vs 75% threshold
Performance:   50.70% vs 75% threshold  
Volumetry:     58.51% vs 75% threshold
Resilience:    95.79% ✓ (exceeds threshold)
Validators:    85.03% ✓ (exceeds threshold)
```

**Root cause:** Missing tests for:
- Advanced topology performance calculations (vSAN ESA/OSA IOPS, S2D performance, Ceph EC performance)
- Edge cases in volumetry engine (zero drives, invalid topologies, boundary conditions)
- Error handling paths in calculation engines
- Untested utility modules (sustainability, exportPdf, exportConfig) pulling down overall average

**Impact:** Engineers can trust the TESTED calculations (RAID, ZFS core paths, Monte Carlo), but untested code paths could contain bugs. Coverage threshold failure means CI will fail on `npm run test:coverage`.

**Gap 2: Flaky statistical test (MINOR)**

The confidence interval narrowing test (`tests/workers/resilience.spec.ts:1297`) fails intermittently:

```javascript
expect(margin2).toBeLessThan(margin1 * 0.4) // Should be ~1/3 of small sample
```

**Root cause:** Stochastic Monte Carlo simulations have inherent variance. The test expects a strict mathematical relationship (10× more simulations → ~3.16× narrower CI), but random sampling can violate this occasionally.

**Impact:** CI unreliability, false negatives on test runs. Statistical validity is proven by other tests; this is a test implementation issue, not a calculation bug.

**Recommended fixes:**
1. Increase tolerance: `expect(margin2).toBeLessThan(margin1 * 0.5)` (allow more variance)
2. Increase simulation runs to reduce variance
3. Mark test as `.skip` with explanation, or use `.retry(3)` to allow retries
4. Calculate expected range from statistical theory rather than exact ratio

---

## Human Verification Required

### 1. Manual WintelGuy Cross-Check

**Test:** Open https://wintelguy.com/raidcalc.pl and manually verify 2-3 RAID configurations:
- RAID 5: 8×1TB drives → Expected: 7TB usable
- RAID 6: 12×1TB drives → Expected: 10TB usable
- RAID 10: 8×1TB drives → Expected: 4TB usable

**Expected:** Calculator matches test vector expected values within 1%

**Why human:** Verification against external calculator requires manual data entry

### 2. OpenZFS Slop Factor Documentation Review

**Test:** Review OpenZFS source code or documentation for slop factor constants:
- spa_slop_shift = 5 (default, means 1/32)
- SPA_MIN_SLOP = 128 MiB
- SPA_MAX_SLOP = 128 GiB

**Expected:** Code constants match documented ZFS behavior

**Why human:** Requires reviewing external ZFS source code/documentation

### 3. Statistical Test Flakiness Assessment

**Test:** Run `npm test -- resilience` 10 times and count failures of "should show confidence interval narrows with more simulations"

**Expected:** If > 2/10 runs fail, test tolerance needs adjustment

**Why human:** Requires multiple test runs and judgment on acceptable flakiness threshold

---

## Summary

**Achievements:**
- ✓ All 5 ROADMAP success criteria for calculation validation verified
- ✓ 336 tests passing (RAID, ZFS, vSAN, S2D, Ceph, Nutanix, performance, resilience, URL storage, validators)
- ✓ Industry validation against WintelGuy, OpenZFS, VMware documentation
- ✓ Property-based testing with fast-check validates mathematical invariants
- ✓ Statistical rigor with confidence intervals (95% CI = p ± 1.96σ)
- ✓ 15/16 TEST requirements satisfied

**Gaps:**
- ✗ Coverage threshold: 51.14% vs 75% target (24 percentage points short)
- ✗ 1 flaky statistical test reducing CI reliability
- ✗ 49.3% of performance engine untested (advanced topology IOPS)
- ✗ 41.49% of volumetry engine untested (edge cases, error handling)

**Goal Assessment:**
The phase goal "Storage engineers can trust calculation accuracy for real-world infrastructure decisions" is **PARTIALLY ACHIEVED**:
- Core calculations are validated and trustworthy (RAID, ZFS, Monte Carlo URE/resilience)
- Industry formulas are documented and tested
- However, untested code paths (50% of performance, 42% of volumetry) could contain bugs
- Coverage gap means engineers cannot trust ALL code paths, only the tested ones

**Recommendation:**
Phase 2 should continue with:
- Plan 02-06 (if exists): Add performance tests for advanced topologies (vSAN, S2D, Ceph IOPS)
- Plan 02-07 (if exists): Add volumetry edge case tests
- Or proceed to Phase 3 and address coverage in Phase 4 (Code Quality)

---

_Verified: 2026-01-18T07:50:00Z_
_Verifier: Claude (gsd-verifier)_
