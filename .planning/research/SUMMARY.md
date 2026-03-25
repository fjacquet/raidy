# Project Research Summary

**Project:** Raidy — Dell Storage Capacity Formula Fixes (v1.2)
**Domain:** TypeScript calculation engine corrections for Dell enterprise storage (PowerVault ADAPT, PowerStore DRE, PowerScale OneFS, PowerFlex SDS, ObjectScale)
**Researched:** 2026-03-25
**Confidence:** MEDIUM — official Dell documentation confirms architecture; specific formula values derived from whitepapers, KB articles, and community forums. Dell PowerSizer (requires authenticated login) is the ground-truth validation target.

---

## Executive Summary

Raidy currently contains three families of incorrect Dell storage capacity formulas. The most severe is PowerVault ME5 ADAPT, which returns hardcoded 85–87% efficiency regardless of drive count. The actual formula is `((N-2) * driveSize) * 0.80` for the default 8+2 stripe, yielding 67% for a 12-drive array — a 28-percentage-point error that causes storage engineers to under-provision by more than a third. PowerStore RAID-5 and RAID-6 use similarly hardcoded constants (0.80 and 0.75) that ignore the Dynamic Resiliency Engine's drive-count-aware stripe selection and system overhead, producing errors of 5–15 percentage points. PowerScale and ObjectScale formulas are structurally correct but have an architectural defect: PowerScale receives `driveCount` where it should receive `nodeCount`, producing near-100% efficiency for high drive-count configurations.

All fixes are surgical edits within the existing strategy pattern — no new libraries, no new npm packages, and no new architectural components. The affected files are `src/engines/volumetry/strategies/proprietary.ts` (ADAPT), `src/engines/volumetry/strategies/dell.ts` (PowerStore), and `src/engines/volumetry/helpers/calculationHelpers.ts` (PowerScale server count threading). A new `PowerStoreOptions.systemOverheadPercent` field and a new overhead block in `overheadCalculator.ts` complete the PowerStore correction. Research has validated the ADAPT formula against a Dell Sizer reference case (error 0.04%) and the PowerStore formula at 5% system overhead (error 0.1% against the reference case).

The primary risk is test regression management: the existing 3848-line test file encodes the wrong behavior as expected values. Any formula fix will cause an all-red Dell test run. The mitigation is a three-step protocol: mark incorrect tests with `it.skip` citing the Dell Sizer reference, add correct reference vector tests, then delete the skipped tests after the formula is confirmed. Never update test expected values by running the formula — always derive them from Dell Sizer first.

---

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md` for full detail.

No new dependencies are needed. All formula corrections are pure TypeScript arithmetic changes within existing files. The existing stack (TypeScript 5.x, Vitest 2.x, fast-check 3.x) is correct and complete for this work. Dell PowerSizer and Dell MidRange Sizer are the required external reference tools for generating test vectors, but both require authenticated Dell partner/customer access and cannot be called programmatically.

**Core technologies:**
- TypeScript (existing, ~5.x): Pure function arithmetic corrections — no runtime overhead
- Vitest (existing, ~2.x): Test vectors for all corrected formulas, already configured
- fast-check (existing, ~3.x): Property-based validation of formula boundary conditions at drive count limits

**Reference tools (external, for test vector generation):**
- Dell PowerSizer (powersizer.dell.com): Authoritative output; requires login
- Dell MidRange Sizer (midrangesizer.dell.com): ME4/ME5 reference; legacy tool

### Expected Features

See `.planning/research/FEATURES.md` for full detail.

**Must have (table stakes):**
- ADAPT formula `((N-2)/N) * (8/10)` for ≤18 drives; `((N-2)/N) * (16/18)` for >18 drives — validated at 0.04% error against 27.93 TiB reference
- PowerStore RAID-6 geometry-aware calculation: DRE DP selects 4+2, 8+2, or 16+2 stripe by drive count, plus ~5% system overhead
- PowerStore RAID-5 geometry-aware calculation: DRE SP selects 4+1 or 8+1 stripe by drive count
- Dell Sizer reference test vectors (minimum: ME5 12-drive ADAPT and PowerStore 35-drive DRE DP cases)

**Should have (competitive):**
- ADAPT 8+2 vs 16+2 auto-selection threshold: >18 drives triggers 16+2 (88.89% vs 80% stripe efficiency)
- PowerStore DRE geometry auto-selection matching exact Dell Sizer drive-count thresholds
- PowerScale serverCount threaded to strategy (replaces incorrect driveCount proxy)

**Defer (v2+):**
- PowerStore system overhead per appliance model class (1000T vs 5200Q have different overhead percentages)
- ObjectScale two-site geo-replication factor (doubles overhead; niche but architecturally straightforward)
- PowerScale small-file overhead modeling (requires workload file-size distribution as input)
- PowerFlex FG metadata overhead per pool (varies with snapshot density)

### Architecture Approach

See `.planning/research/ARCHITECTURE.md` for full detail.

All changes are within the existing strategy pattern. No new components or interfaces are required beyond adding `systemOverheadPercent` to `PowerStoreOptions`. The build order is strictly sequential — each step must be validated before the next begins — because PowerStore RAID fraction changes affect the same test assertions as the system overhead addition.

**Major components affected:**
1. `src/engines/volumetry/strategies/proprietary.ts` — Replace hardcoded ADAPT constants with dynamic formula
2. `src/engines/volumetry/strategies/dell.ts` — Replace hardcoded PowerStore constants with DRE geometry selection
3. `src/engines/volumetry/overhead/overheadCalculator.ts` — Add PowerStore system overhead block (new)
4. `src/engines/volumetry/helpers/calculationHelpers.ts` — Thread `serverCount` to PowerScale strategy (one-line addition)
5. `tests/fixtures/dell-vectors.ts` — New Dell Sizer reference fixture file

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full detail.

1. **ADAPT hardcoded constants (0.85/0.87)** — Replace with `(N - 2 * ADAPT_PROTECTION_DRIVES) / N * stripeEfficiency`. For 12 drives the correct result is ~67%, not 85%. Verify against Dell Sizer before updating tests.

2. **PowerStore hardcoded constants (0.80/0.75)** — Replace with DRE geometry selection. At 5% system overhead the 35-drive reference case is within 0.1% of Dell Sizer. At 7.5% the error is 1.2% — outside tolerance. Use 5% as the default `systemOverheadPercent`.

3. **PowerScale using driveCount as nodeCount** — A 10-node × 36-drive cluster would return ~99.4% efficiency for N+2 instead of the correct 80%. Add `case 'powerscale':` to the `getDataFraction` switch and pass `{ serverCount }`.

4. **Test expected values encode wrong behavior** — The existing test file expects >82% efficiency for ADAPT 12-drive. Never update test values by running the fixed formula; always derive from Dell Sizer. Protocol: `it.skip` → add correct tests → delete skipped.

5. **Dell Sizer base-10 vs Raidy base-2 unit mismatch** — Dell Sizer outputs in TB (1e12 bytes); Raidy uses bytes internally. Normalize all reference vectors before adding to test fixtures.

---

## Implications for Roadmap

Based on combined research, the correct implementation sequence is strictly ordered by test isolation and dependency. Each phase must be self-contained enough that only its own tests change.

### Phase 1: ADAPT Formula Fix
**Rationale:** Isolated change to a single `case` in `proprietary.ts`. No new types, no overhead changes, no interface additions. Provides the first verified Dell Sizer test vector. Lowest risk entry point.
**Delivers:** Correct ADAPT efficiency for all drive counts 12–128; reference fixture `tests/fixtures/dell-vectors.ts` initialized
**Addresses:** Must-have feature "ADAPT formula replacement"; 0.04% error tolerance confirmed
**Avoids:** Pitfall 1 (hardcoded constants), Pitfall 4 (test regression — skip-then-replace protocol)

### Phase 2: PowerStore Data Fraction Fix
**Rationale:** Isolated to `dell.ts` only; changes the base RAID efficiency without touching the overhead pipeline. Must precede Phase 3 because system overhead is calculated as a percentage of the post-parity capacity — getting the parity fraction right first avoids compounding errors.
**Delivers:** Drive-count-aware DRE stripe selection for RAID-5 and RAID-6
**Addresses:** Must-have features DELL-03 and DELL-04
**Avoids:** Pitfall 2 (hardcoded PowerStore constants); pitfall that system overhead compounds onto wrong base

### Phase 3: PowerStore System Overhead Addition
**Rationale:** Requires Phase 2 to be stable. Needs type changes (`PowerStoreOptions`), overhead pipeline changes, breakdown builder changes, and `OverheadResult` interface changes. The most invasive phase — must be last in the PowerStore sequence.
**Delivers:** End-to-end PowerStore accuracy within Dell Sizer tolerance; `systemOverheadPercent` field visible in test fixtures
**Uses:** Existing overhead block pattern from `overheadCalculator.ts`; mirrors `ObjectScaleOptions.systemOverheadPercent`
**Avoids:** Pitfall 2 (incomplete fix leaves 5–15 pp error); URL hash backward-compatibility (new field with default is migration-safe)

### Phase 4: PowerScale serverCount Fix
**Rationale:** Independent of PowerStore changes; can proceed in parallel with Phases 2–3 in practice but is lower priority because the current approximation happens to be numerically reasonable for same-node-count-as-drive-count inputs used in existing tests. Requires threading `serverCount` through two files.
**Delivers:** Correct PowerScale efficiency for multi-drive-per-node configurations (the common enterprise case)
**Addresses:** Should-have feature — PowerScale serverCount threading (DELL-06)
**Avoids:** Pitfall 3 (driveCount used as nodeCount) and Pitfall 5 (serverCount not passed to strategy)

### Phase 5: PowerScale, PowerFlex, ObjectScale Validation
**Rationale:** Existing formulas are mathematically correct; this phase is validation-only. Run Dell Sizer reference cases and confirm all are within 1% tolerance. Only implement corrections if divergence is found.
**Delivers:** Complete Dell Sizer validation suite covering all five Dell products; `dell-vectors.ts` fixture complete
**Addresses:** DELL-07 (PowerFlex FG overhead verification), DELL-08 (ObjectScale EC verification)
**Avoids:** Pitfall 5 (ObjectScale geo-overhead factors unverified), unit mismatch trap

### Phase 6: Test Suite Cleanup
**Rationale:** Must follow all formula fixes. Removes all `.skip` markers, validates no `it.skip` remains in Dell test sections, and ensures all Dell assertions are traceable to Dell Sizer reference values.
**Delivers:** Clean test suite with zero skipped Dell tests; full coverage threshold maintained at 75%
**Addresses:** DELL-10 (test vector updates)
**Avoids:** Pitfall 4 (tests encoding wrong behavior permanently)

### Phase Ordering Rationale

- Phases 1–3 are strictly ordered because ADAPT is independent, while PowerStore parity fraction must precede system overhead
- Phase 4 (PowerScale) is logically independent and could be delivered with Phases 2–3 if resourcing allows
- Phase 5 is validation-only and must follow Phase 4 to ensure PowerScale test vectors are correct
- Phase 6 cannot begin until all formula phases (1–5) are complete and Dell Sizer validated
- Do not merge any phase until `npm run typecheck`, `npm run lint`, and `npm run test:coverage` all pass

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (PowerStore system overhead):** The exact system overhead percentage varies by PowerStore model (1000T vs 3200 vs 5200Q). The 5% figure is derived from a single reference case (35-drive large model). Smaller models likely have higher overhead as a percentage. Validate with Dell Sizer for at least two model sizes before treating 5% as universal.
- **Phase 5 (PowerScale validation):** PowerScale is node-level striping; the existing `driveCount` proxy may produce numerically coincidental matches in existing tests. Require at least one multi-drive-per-node reference case from Dell Sizer (e.g., 10 nodes × 36 drives).

Phases with standard patterns (skip research-phase):
- **Phase 1 (ADAPT):** Formula confirmed against Dell Sizer at 0.04% error. Reference validation is complete. Implementation is a one-line change.
- **Phase 2 (PowerStore data fraction):** DRE geometry table is confirmed from Dell KB 000188491 (official). Stripe thresholds are HIGH confidence.
- **Phase 6 (Test cleanup):** Standard brownfield test remediation pattern; no domain research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; pure arithmetic in existing TypeScript files |
| Features | MEDIUM | ADAPT and PowerStore formulas validated against one Dell Sizer reference each; PowerScale/PowerFlex/ObjectScale formulas are mathematically correct but unvalidated against Sizer |
| Architecture | HIGH | Existing strategy pattern is the correct integration point; overhead calculator pattern is well-established in the codebase |
| Pitfalls | HIGH | All five critical pitfalls identified from direct code inspection and cross-referenced with Dell documentation; recovery strategies are concrete |

**Overall confidence:** MEDIUM — formula derivation is solid, but PowerSizer access is required to validate the PowerStore system overhead constant and confirm PowerScale node-based formulas before shipping.

### Gaps to Address

- **PowerStore system overhead per model class:** The 5% figure derives from a single large-model reference case. Medium and small PowerStore models may have 7–10% overhead. Resolve during Phase 3 planning by obtaining Dell Sizer outputs for PowerStore 1000T and 3200 configurations.
- **ADAPT 8+2 vs 16+2 threshold:** Research identified >18 drives triggers 16+2 (FEATURES.md) vs. >20 drives (STACK.md). Discrepancy of 2 drives. Resolve from ME5 Admin Guide or PowerSizer before Phase 1 implementation.
- **PowerScale minimum stripe width fallback:** Small clusters (3–4 nodes with N+2) fall back to 2× mirroring. Validate the exact node-count thresholds for each protection level against Dell OneFS documentation during Phase 4.
- **Dell Sizer access:** All validation targets require authenticated Dell partner/customer login. If access is unavailable, contact Dell SE as the fallback per STACK.md recommendations.

---

## Sources

### Primary (HIGH confidence)
- Dell PowerStore KB 000188491: DRE geometry 4+1, 8+1, 4+2, 8+2, 16+2 and distributed spare = 1 drive per RRS
- Dell ObjectScale Admin Guide 1.0.0: EC overhead multipliers 1.33x (12+4 single-site), 2.67x (two-site geo)
- Dell PowerFlex 4.5.x / 5.0 Install Guide: FG requires NVDIMMs; 8+2 requires 11 nodes
- Dell Info Hub — OneFS protection overhead formula M/(N+M)
- Dell PowerVault ME5 Admin Guide: stripe = 8 data + 2 parity chunks; 16+2 when >18 drives
- Direct codebase inspection: `proprietary.ts`, `dell.ts`, `calculationHelpers.ts`, `overheadCalculator.ts`, `volumetry.spec.ts`

### Secondary (MEDIUM confidence)
- Dell Community Forum — ME4 ADAPT Usable Space Formula: community reconstruction of `((N-2)*size) - 20%`
- Dell ME5 ADAPT Whitepaper (binary PDF, extracted via search snippets)
- Blog post (rickgouin.com): confirms 4+1 stripe for <10 SSDs on PowerStore
- WWT blog — PowerFlex 5.0: 8+2 EC and FG pool overhead comparison
- Open-source Isilon capacity calculator (github.com/adamgweeks): empirical node-based formula

### Tertiary (LOW confidence)
- PowerStore system overhead exact percentage by model: not disclosed in public docs; back-calculated from one reference case as ~5% for large models
- PowerFlex FG metadata overhead 12–15%: mentioned in existing code comments as prior decision; not confirmed from current Dell public docs

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
