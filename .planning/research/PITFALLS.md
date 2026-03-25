# Pitfalls Research

**Domain:** Dell storage capacity formula implementation (ADAPT, PowerStore, PowerScale, PowerFlex, ObjectScale)
**Researched:** 2026-03-25
**Confidence:** MEDIUM — Dell official docs confirm architecture; specific formula values derived from community discussions, white papers, and Dell KB articles. Dell Sizer output is the ground-truth verification target.

---

## Critical Pitfalls

### Pitfall 1: ADAPT Hardcoded Percentage Instead of Dynamic Formula

**What goes wrong:**
The current implementation returns `0.85` (12–23 drives) or `0.87` (24+ drives) as fixed constants. The actual ADAPT formula accounts for two drives worth of distributed spare capacity spread across N drives: `(N - 2×protection_level) / N`. For 12 drives with the default protection level of 2, this gives `(12-4)/12 = 67%`, not 85%. The existing test comments explicitly encode the wrong value ("ADAPT with <24 drives: 85% efficiency").

**Why it happens:**
ADAPT documentation describes efficiency in terms of typical large arrays (60–128 drives) where the two-drive spare is a small fraction of total capacity, making the ~85–87% figure seem plausible. Implementors read marketing copy ("up to 87% efficiency") and hardcode that ceiling rather than deriving it dynamically from drive count.

**How to avoid:**
Implement the dynamic formula: `usable = (N - spare_drives) / N` where `spare_drives = 2 × protection_level` (default protection level 2 means 4 drives equivalent reserved). Verify against Dell Sizer outputs for 12, 24, 36, and 60-drive configurations before finalizing. Dell community posts confirm the formula as `((N - 2*protection) * disk_size) * 0.8` (the 0.8 factor represents the RAID-6 stripe efficiency within each ADAPT stripe of 8+2 or 16+2).

**Warning signs:**
- Test expects `efficiency > 82` for 12 drives — this will pass with the wrong 85% constant
- Efficiency is reported above 80% for small ADAPT arrays (fewer than 24 drives)
- Results do not degrade gracefully as drive count decreases toward the 12-drive minimum

**Phase to address:** Formula fix phase (DELL-01). Update test vectors in DELL-09/DELL-10 only after formula is confirmed against Dell Sizer.

---

### Pitfall 2: PowerStore Hardcoded RAID-5 (80%) and RAID-6 (75%) Constants

**What goes wrong:**
The current code returns `0.8` for `powerstore_raid5` and `0.75` for `powerstore_raid6` regardless of stripe width or system overhead. PowerStore's Dynamic Resiliency Engine (DRE) actually uses selectable stripe widths: RAID-5 supports 4+1 (80%) or 8+1 (88.9%), RAID-6 supports 4+2 (66.7%) or 8+2 (80%). Additionally, DRE allocates ~1 drive's worth of spare capacity per Resiliency Set plus system/metadata overhead of approximately 20% of raw capacity. The existing test comment ("RAID-6: 75% efficiency base") will break when corrected.

**Why it happens:**
Documents describe RAID-5 and RAID-6 without emphasizing that stripe width is user-selectable and that effective efficiency at the array level is significantly lower than raw RAID efficiency due to DRE distributed sparing and system data overhead.

**How to avoid:**
Add `stripeWidth: '4+1' | '8+1' | '4+2' | '8+2'` to `PowerStoreOptions`. Compute base efficiency from stripe width: `data_chunks / (data_chunks + parity_chunks)`. Then subtract system overhead (~20% of raw for internal reserved capacity including sparing and metadata). Validate the combined result against Dell Sizer for a known configuration (e.g., 10-drive PowerStore 1000T with RAID-5 4+1).

**Warning signs:**
- `powerstore_raid6` returning ~75% before system overhead — too high by ~5–15 percentage points
- `powerstore_raid5` constant at 80% regardless of `stripeWidth` option
- `PowerStoreOptions` type has no `stripeWidth` field

**Phase to address:** DELL-03/DELL-04. Do not update existing tests until the corrected formula is validated against Dell Sizer.

---

### Pitfall 3: PowerScale Efficiency Ignores Stripe Width (File-Level EC, Not Array-Level RAID)

**What goes wrong:**
The current formula `(N-x)/N` treats PowerScale like a simple RAID group. OneFS is file-level erasure coding: each file's stripe width depends on cluster node count (not drive count). The efficiency formula is `M / (M+P)` where M = data stripe units and P = protection (failure) count. On a 3-node cluster with N+2, OneFS falls back to 2× mirroring, not N+2 EC. On a 5-node cluster with N+2 using a 3+2 stripe layout, efficiency is only 60%, not `(5-2)/5 = 60%` — which happens to match for 5 nodes but diverges for other counts because real stripe widths are bounded by node count.

**Why it happens:**
The formula `(usableDrives - x) / usableDrives` works by coincidence on certain node counts but uses `driveCount` instead of `nodeCount` as the denominator. PowerScale protection overhead is measured per node, not per drive. Passing total drives as `usableDrives` produces nonsensical results for typical multi-drive-per-node configurations (e.g., 10 nodes × 36 drives = 360 drives — the formula returns `(360-2)/360 ≈ 99.4%` for N+2, which is wildly incorrect).

**How to avoid:**
Use `serverCount` (node count) as the variable, not `driveCount`. The formula becomes `(nodeCount - protectionLevel) / nodeCount` for large files, but requires a minimum-stripe-width adjustment for small clusters. Minimum stripe widths per protection level: N+1 requires 3 nodes, N+2 requires 5 nodes, N+2:1 requires 3 nodes, N+3 requires 7 nodes, N+4 requires 9 nodes. Below minimum, OneFS falls back to mirroring. Verify against the Dell Sizer or the open-source Isilon capacity calculator.

**Warning signs:**
- The `getDataFraction` function passes `usableDrives` to `dellStrategy` for PowerScale — this is the drive count, not node count
- Tests that pass `driveCount=10` with `serverCount=1` produce nonsensical but numerically "reasonable" results
- Efficiency near 100% when drive count is high and protection level is small

**Phase to address:** DELL-06. Requires `serverCount` to be threaded through to the PowerScale strategy (currently the `getDataFraction` switch-case does not pass `serverCount` for PowerScale).

---

### Pitfall 4: Test Expected Values Encoding the Wrong Formula

**What goes wrong:**
The existing 3848-line test file contains PowerVault ADAPT assertions like `expect(result.efficiency).toBeGreaterThan(82)` with comments "ADAPT with <24 drives: 85% efficiency". When the formula is corrected (12 drives at ~67% efficiency), these tests fail with no obvious indication of whether the failure is expected (formula improved) or unexpected (regression introduced). Fixing formula without updating tests first creates a confusing all-red test run that looks like a catastrophic regression.

**Why it happens:**
Tests were written to document the current (incorrect) behavior rather than the intended behavior. This is common in brownfield projects where tests are added after the fact to prevent regressions, not to specify correctness.

**How to avoid:**
Follow a three-step protocol:
1. Mark the incorrect tests with `it.skip` and a comment citing the Dell Sizer reference value expected after fix.
2. Add new tests with correct reference vectors derived from Dell Sizer outputs.
3. After the formula is corrected and new tests pass, delete the skipped (incorrect) tests.

Never delete incorrect tests before the replacement tests pass. Never update test assertions by running the formula and copying its output — always derive expected values from Dell Sizer first.

**Warning signs:**
- Tests passing immediately after a formula change without any test updates
- All Dell-related tests suddenly failing after a formula change
- Test expected values are round numbers (80%, 75%, 85%) rather than Dell Sizer decimals

**Phase to address:** DELL-10. Must follow formula fix, not precede it.

---

### Pitfall 5: PowerScale Node Count Not Passed to Strategy

**What goes wrong:**
In `calculationHelpers.ts`, the `getDataFraction` switch-case passes `{ serverCount }` only for `vsan_esa`, `vsan_osa`, and `standard` topologies. For `powerscale`, `options = {}` is passed (the default case). The PowerScale strategy receives `driveCount` as a proxy for node count, producing incorrect results for any multi-drive-per-node configuration.

**Why it happens:**
PowerScale was initially implemented using the same pattern as PowerFlex (drive-count-based RAID), before it was recognized that OneFS uses node-level striping.

**How to avoid:**
Add `case 'powerscale': options = { serverCount }; break;` to the switch in `getDataFraction`. Update the PowerScale strategy to accept and use `serverCount` from options rather than the raw `driveCount` parameter.

**Warning signs:**
- `powerscale` not listed in the `getDataFraction` switch-case options
- Passing a `VolumetryInput` with `serverCount: 5, driveCount: 60` to a PowerScale topology produces the same result as `serverCount: 1, driveCount: 60`

**Phase to address:** DELL-06 (same phase as PowerScale formula fix — these are coupled).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded 85% for ADAPT | Simple code, passes rough sanity checks | Wrong answers for every configuration with <60 drives | Never — must be dynamic |
| Hardcoded 75% for PowerStore RAID-6 | Simple, no stripe-width option needed | Errors of 5–15 percentage points vs. Dell Sizer | Never — 66.7% vs. 80% is a 13pp difference |
| Using driveCount as nodeCount for PowerScale | Avoids adding serverCount to strategy options | Off by 10× for typical 36-drive-per-node configurations | Never |
| Keeping test expected values that encode wrong behavior | Tests "pass" with old code | New correct formula causes all-red test run with no guidance | Never — skip and replace |
| Treating PowerStore overhead as a fixed 20% | Avoids model-specific lookup | Errors grow for larger models with more system data overhead | Acceptable for MVP if documented as approximation |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Dell Sizer reference values | Using GUI-level "usable capacity" values which already include compression/dedup savings | Use "raw usable" before efficiency savings — Raidy applies compression/dedup separately |
| Dell Sizer base-10 vs base-2 | Dell Sizer outputs in TB (base-10), Raidy uses bytes internally | Normalize before comparing: 1 TB = 1e12 bytes, not 1.099e12 |
| PowerStore stripe width selection | Assuming 8+1 is always used — Dell defaults to 4+1 for new arrays | Confirm the default stripe width from Dell documentation or Sizer configuration |
| PowerScale protection on small clusters | Assuming N+2 protection formula applies at 3–4 nodes | OneFS falls back to 2× mirroring below minimum node count for N+2 |
| ObjectScale geo-replication | Treating 2-site replication as 2× overhead | 3+ sites use XOR mechanism, reducing overhead nonlinearly |
| PowerFlex FG metadata overhead | Treating FG overhead as fixed 12% | Dell docs indicate FG overhead of 12–15% varies by drive count and pool size |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-running all 3848 test lines after each formula change | Test suite takes minutes per iteration | Use `it.only` or Vitest `--reporter=verbose` with targeted describe blocks during formula development | Immediately with each change |
| Calling Dell Sizer manually for each test vector | Tedious, error-prone, inconsistent | Create a test fixture file `tests/fixtures/dell-vectors.ts` with batched reference values from one Sizer session | Every test vector addition |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting driveCount from URL params for PowerScale efficiency | User-crafted URL could produce anomalous efficiency values shown in UI | Validate driveCount and serverCount ranges before calculation — already in validateDriveCount but verify PowerScale minimum node limits (3 nodes) are enforced |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing 85% efficiency for 12-drive ADAPT when correct value is ~55% | Storage engineers who rely on Raidy over-provision by 35%+ for small ADAPT configs | Fix formula; add tooltip citing Dell ADAPT white paper formula |
| Not distinguishing PowerStore 4+1 vs 8+1 in UI | User cannot replicate their actual PowerStore configuration | Add `stripeWidth` dropdown to PowerStore options panel (post-formula-fix) |
| PowerScale efficiency near 100% for high drive counts | Implausible numbers erode user trust | Fix to use node-based formula; display as "N+x" not capacity percentage |

---

## "Looks Done But Isn't" Checklist

- [ ] **ADAPT formula**: Check result for 12 drives — should be ~55–67%, NOT 85%
- [ ] **PowerStore RAID-6**: Check result for default stripe width — should be ~55–65% after system overhead, NOT 75%
- [ ] **PowerScale N+2 with 5 nodes, 10 drives each**: Result should be ~60% (3-data + 2-parity per file), NOT ~99%
- [ ] **PowerScale small cluster fallback**: Verify 3-node cluster with N+2 falls back to 2× mirroring (~50%)
- [ ] **ObjectScale 2-site geo**: Verify 2-site is worse than 3-site (2.67× vs 2.0× overhead factor for EC 12+4)
- [ ] **Dell Sizer baseline test vectors**: Verify all new test assertions came from Sizer output, not formula self-validation
- [ ] **Skipped tests cleaned up**: After DELL-10, no `.skip` tests remain in the Dell sections
- [ ] **`serverCount` threaded to PowerScale strategy**: Confirm `getDataFraction` switch passes `{ serverCount }` for `powerscale` case

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| All Dell tests red after formula fix | MEDIUM | Run `npx vitest --reporter=verbose tests/engines/volumetry.spec.ts` to isolate; mark old tests `.skip`; add correct vector tests; delete skipped once passing |
| ADAPT formula produces negative efficiency for small drive counts | LOW | Add guard: `Math.max(0, (N - spareDrives) / N)` and minimum drive count validation in `validateDriveCount` |
| PowerScale strategy crashes with undefined serverCount | LOW | Add `options?.serverCount ?? driveCount` fallback with console.warn; fix the switch-case |
| PowerStore stripe width option missing from store/UI | MEDIUM | Add to `PowerStoreOptions` type → add to store slice → add UI dropdown → update test fixtures |
| Test expected values updated by running the wrong formula | HIGH — silent wrong tests | Reset with `git checkout` on test files; re-derive all vectors from Dell Sizer before re-adding |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ADAPT hardcoded 85%/87% | DELL-01: Fix ADAPT formula | `expect(result.efficiency).toBeCloseTo(67, 1)` for 12 drives vs. Dell Sizer |
| PowerStore hardcoded 80%/75% | DELL-03/DELL-04: Fix PowerStore formulas | Dell Sizer reference output for known configuration within 1% |
| PowerScale driveCount used as nodeCount | DELL-06: Fix PowerScale formulas | Result for `serverCount:5, driveCount:50` must differ from `serverCount:1, driveCount:50` |
| PowerScale serverCount not passed to strategy | DELL-06 (coupled) | `getDataFraction` switch-case code review + test demonstrating serverCount sensitivity |
| Test expected values encode wrong formula | DELL-10: Update all tests | Zero `.skip` tests remaining; all Dell assertions traceable to Dell Sizer reference |
| ObjectScale geo-overhead factors unverified | DELL-08: Validate ObjectScale | 2-site overhead > 3-site overhead per ObjectScale formula |
| PowerFlex FG metadata overhead unverified | DELL-07: Validate PowerFlex | Confirm 12–15% FG overhead range from Dell documentation |

---

## Sources

- Dell PowerVault ME5 Series Administrator's Guide — ADAPT section: https://www.dell.com/support/manuals/en-us/powervault-me5012/me5_series_ag/adapt
- Dell community thread confirming ADAPT formula `((N-2*protection)*size) - 20%`: https://www.dell.com/community/PowerVault/ME4-ADAPT-Usable-Space-Formula/td-p/7251008
- Dell community thread on ME5 ADAPT RAID: https://www.dell.com/community/en/conversations/powervault/me5-adapt-raid/647fa06af4ccf8a8de56d80e
- Dell KB000188491 — PowerStore physical capacity calculation: https://www.dell.com/support/kbdoc/en-us/000188491/powerstore-how-powerstore-physical-capacity-is-calculated
- PowerStore DRE architecture: 4+1 = 80%, 8+1 = 88.9%, 4+2 = 66.7%, 8+2 = 80% base RAID efficiency; ~20% total system overhead confirmed in KB
- Dell PowerScale OneFS Technical Overview (December 2025): https://www.delltechnologies.com/asset/sv-se/products/storage/industry-market/h10719-wp-powerscale-onefs-technical-overview.pdf
- PowerScale efficiency formula M/(N+M) confirmed in search results from OneFS technical overview infohub page
- Open-source Isilon capacity calculator (file-level protection model): https://github.com/adamgweeks/Isilon-PowerScale-capacity-calculator
- Dell ObjectScale 1.3 Administration Guide — EC schemes: https://www.dell.com/support/manuals/en-us/objectscale/objectscale_p_1_3_admin_guide/data-protection-with-objectscale-erasure-coding-schemes
- ECS geo-replication overhead (2-site 2.67×, 3-site 2.0×, XOR for 3+): https://www.dell.com/support/manuals/en-us/ecs-appliance-/ecs_p_adminguide_3_5_0_1/ecs-data-protection
- PowerFlex 5.0 specification sheet (EC 2+2 and 8+2 schemes, 80% max efficiency): https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/powerflex-5-0-specification-sheet.pdf
- Existing project code: `/Users/fjacquet/Projects/raidy/src/engines/volumetry/strategies/dell.ts`
- Existing project code: `/Users/fjacquet/Projects/raidy/src/engines/volumetry/strategies/proprietary.ts` (contains ADAPT hardcoded constants)
- Existing project code: `/Users/fjacquet/Projects/raidy/src/engines/volumetry/helpers/calculationHelpers.ts` (confirms serverCount is not passed for powerscale)
- Existing tests: `/Users/fjacquet/Projects/raidy/tests/engines/volumetry.spec.ts` lines 3727–3766 (ADAPT wrong expected values)

---
*Pitfalls research for: Dell storage capacity formula implementation in Raidy v1.2*
*Researched: 2026-03-25*
