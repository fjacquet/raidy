# Quality Audit, PPTX Verification & UI Relevance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate every displayed/exported value against external references (vector-first), fix the PPTX one-pager's known defects with end-to-end proof, hide UI controls that are no-ops for the selected platform via a declarative capability map, and bring specs/docs back in sync.

**Architecture:** Pure-function engines stay untouched in shape; we add fixture vectors (external references → failing test → fix), extract pure formatting helpers out of `exportPptx.ts` so slide content is unit-testable, and introduce `src/engines/capabilities.ts` — a pure data map consulted by input panels. A probe-style test suite keeps the map honest against actual engine behavior.

**Tech Stack:** TypeScript strict, Vitest + fast-check, pptxgenjs, html-to-image, react-i18next (en/fr/de/it), Zustand, Biome.

**Spec:** `docs/superpowers/specs/2026-07-11-quality-audit-ui-relevance-design.md`

## Global Constraints

- Validation tolerance: **≤ 1 %** deviation from external reference (project-wide target).
- Every external formula/number MUST be validated via Perplexity/Context7/vendor primary docs before use — never from memory (user's global rule). Record source name + URL in the fixture comment and audit doc.
- Engines (`src/engines/**`) stay pure: no `Date.now()`, no `i18n` reads, no DOM access inside calculation paths.
- Docs updated **in the same commit** as the code they describe (repo policy: stale docs are defects).
- Style: Biome — 2-space indent, 100-char lines, single quotes, semicolons as-needed. Run `npm run lint:fix` before each commit.
- Coverage threshold 75 % on `src/engines/**`, `src/workers/**`, `src/utils/**` must not regress.
- Prefix all shell commands with `rtk` (e.g. `rtk npm test -- <file>`, `rtk git commit`).
- Internal capacities are **bytes**; display units go through `@utils/units` (`formatBytes`, `UnitSystem`).
- All UI strings live in i18n namespaces (en/fr/de/it) — no hardcoded English in components/exports.
- Test drive for vectors: the 1 TB `testDrive` pattern (capacity_raw = 1_000_000_000_000) for easy math.

---

### Task 1: Audit findings document scaffold

**Files:**
- Create: `.planning/phases/18-quality-audit/18-AUDIT.md`

**Interfaces:**
- Produces: the findings ledger every later task appends to. Finding tags: `value-wrong`, `value-misleading`, `untested`. Severity: `critical` / `major` / `minor`.

- [ ] **Step 1: Create the scaffold**

```markdown
---
phase: 18-quality-audit
started: 2026-07-11
status: in-progress
spec: docs/superpowers/specs/2026-07-11-quality-audit-ui-relevance-design.md
---

# Phase 18: Value & Export Quality Audit — Findings

Extends phase 02 (`.planning/phases/02-calculation-validation/02-RESEARCH.md`).
Covered by phase 02 (regression only): RAID, ZFS, vSAN, Dell, performance.
Newly audited here: S2D, Nutanix, NetApp, Ceph, Synology, Longhorn + PPTX export.

## Findings Ledger

| # | Platform/Area | Tag | Severity | Description | Reference (source + URL) | Status |
|---|---------------|-----|----------|-------------|--------------------------|--------|

Tags: value-wrong (>1% off reference) · value-misleading (right number, wrong label/unit) · untested (no vector coverage)

## Reference Cases

One subsection per platform, added by Tasks 3–8. Each case records: config,
external source, expected value, engine value, deviation %.

## Spot-Checks (Task 9)

## PPTX E2E Evidence (Task 14)
```

- [ ] **Step 2: Commit**

```bash
rtk git add .planning/phases/18-quality-audit/18-AUDIT.md
rtk git commit -m "docs(audit): scaffold phase-18 quality audit findings ledger"
```

---

### Task 2: Shared vector harness + covered-platform regression

**Files:**
- Create: `tests/fixtures/vector-harness.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md` (regression result)

**Interfaces:**
- Produces: `testDrive1TB: Drive` and `createVolumetryInput(driveCount: number, topology: Topology, overrides?: Partial<VolumetryInput>): VolumetryInput` — used by every vector spec in Tasks 3–8.

- [ ] **Step 1: Create the harness** (extracted from the pattern in `tests/engines/volumetry.spec.ts`; do NOT modify that file)

```typescript
/**
 * Shared harness for external-reference vector specs (phase 18).
 * All vector specs build VolumetryInput through this helper so defaults
 * stay in one place.
 */
import type { VolumetryInput } from '@/engines/volumetry'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_LONGHORN_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_POWERVAULT_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
  type Topology,
} from '@/types'
import type { Drive } from '@/types/drive'

export const TB = 1_000_000_000_000

export const testDrive1TB: Drive = {
  id: 'test-1tb',
  model: 'Test Drive 1TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  capacity_raw: TB,
  sector_size: 512,
  performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
  reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
  power: { idle_watts: 5, load_watts: 10 },
  cost_usd: 100,
}

export function createVolumetryInput(
  driveCount: number,
  topology: Topology,
  overrides: Partial<VolumetryInput> = {},
): VolumetryInput {
  return {
    drive: testDrive1TB,
    driveCount,
    hotSpares: 0,
    serverCount: 1,
    topology,
    zfsOptions: DEFAULT_ZFS_OPTIONS,
    s2dOptions: DEFAULT_S2D_OPTIONS,
    vsanOptions: DEFAULT_VSAN_OPTIONS,
    objectscaleOptions: DEFAULT_OBJECTSCALE_OPTIONS,
    powerstoreOptions: DEFAULT_POWERSTORE_OPTIONS,
    powerscaleOptions: DEFAULT_POWERSCALE_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    longhornOptions: DEFAULT_LONGHORN_OPTIONS,
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    netAppOptions: DEFAULT_NETAPP_OPTIONS,
    synologyOptions: DEFAULT_SYNOLOGY_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    powervaultOptions: DEFAULT_POWERVAULT_OPTIONS,
    compressionRatio: 1,
    dedupRatio: 1,
    fsType: 'xfs',
    ...overrides,
  }
}
```

Note: if `@/types` does not re-export one of the `DEFAULT_*` constants, import it from its slice under `src/store/slices/` — check with `rtk grep "DEFAULT_S2D_OPTIONS" src/types src/store`.

- [ ] **Step 2: Run the full existing volumetry suite (regression gate for covered platforms)**

Run: `rtk npm test -- tests/engines/volumetry.spec.ts --run`
Expected: PASS (all existing RAID/ZFS/vSAN/Dell vectors green). If anything fails, that is a phase-18 finding — record it in the ledger as `value-wrong`/`critical` and STOP for review before fixing.

- [ ] **Step 3: Record the regression result in `18-AUDIT.md`** under "Reference Cases → Covered platforms (regression)": suite name, date, pass/fail counts.

- [ ] **Step 4: Commit**

```bash
rtk git add tests/fixtures/vector-harness.ts .planning/phases/18-quality-audit/18-AUDIT.md
rtk git commit -m "test(audit): shared vector harness + covered-platform regression record"
```

---

### Task 3: S2D external-reference vectors

**Files:**
- Create: `tests/fixtures/s2d-vectors.ts`
- Create: `tests/engines/volumetry/vectors/s2d.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`
- Modify (only if >1 % deviation): `src/engines/volumetry/strategies/s2d.ts`

**Interfaces:**
- Consumes: `createVolumetryInput`, `testDrive1TB`, `TB` from `tests/fixtures/vector-harness.ts` (Task 2).
- Produces: `s2dVectors: PlatformVector[]` — the `PlatformVector` shape defined here is reused verbatim by Tasks 4–8.

- [ ] **Step 1: Research (external validation — do NOT skip)**

Query Perplexity (`mcp__perplexity__search` / `reason`) for, at minimum:
1. "Microsoft Storage Spaces Direct capacity efficiency two-way mirror three-way mirror dual parity site:learn.microsoft.com"
2. "S2D dual parity efficiency table number of servers Azure Local capacity calculator"
3. "S2D mirror-accelerated parity capacity efficiency"

Record in `18-AUDIT.md → Reference Cases → S2D`: for each of `mirror` (3-way ⇒ 33.3 %), `parity`, `dual_parity` (efficiency varies with fault domains — capture the Microsoft table), `map` — config (drives, servers), source URL, expected usable fraction. Use Microsoft Learn primary docs as the source of truth; Perplexity only to locate them.

- [ ] **Step 2: Write the fixture with the researched values**

```typescript
/**
 * S2D Test Vectors — validated against Microsoft Learn / Azure Local docs.
 * Source URLs recorded per vector and in .planning/phases/18-quality-audit/18-AUDIT.md.
 * expectedUsable is BEFORE compression/dedup, AFTER parity + reserves + fs overhead —
 * i.e. compared against VolumetryResult.usableCapacity.
 */
import type { S2DTopology, Topology } from '@/types/topology'

export interface PlatformVector {
  name: string
  topology: Topology
  drives: number
  serverCount: number
  driveSize: number
  /** Expected VolumetryResult.usableCapacity in bytes (external reference minus engine overheads). */
  expectedUsable: number
  tolerance: number // 0.01 = 1%
  source: string
  url: string
}

const TB = 1_000_000_000_000

function s2d(level: S2DTopology): Topology {
  return { type: 's2d', level }
}

export const s2dVectors: PlatformVector[] = [
  // FILL FROM RESEARCH (Step 1). One vector per level minimum. Example shape —
  // replace expectedUsable with the value derived from the Microsoft table and
  // the engine's documented reserves (rebuild reserve, infra reserve, fs 2%):
  {
    name: 'S2D 3-way mirror, 12 drives, 4 servers',
    topology: s2d('mirror'),
    drives: 12,
    serverCount: 4,
    driveSize: TB,
    expectedUsable: 0, // ← researched value in bytes, NOT zero — plan executor fills this
    tolerance: 0.01,
    source: 'Microsoft Learn — Storage Spaces Direct volume capacity',
    url: '', // ← researched URL
  },
]
```

Fill at least 4 vectors (mirror, parity, dual_parity at a documented server count, map). A vector left with `expectedUsable: 0` is a task failure.

- [ ] **Step 3: Write the spec**

```typescript
import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { s2dVectors } from '../../../fixtures/s2d-vectors'
import { createVolumetryInput } from '../../../fixtures/vector-harness'

describe('S2D external-reference vectors', () => {
  for (const v of s2dVectors) {
    it(v.name, () => {
      const result = calculateVolumetry(
        createVolumetryInput(v.drives, v.topology, { serverCount: v.serverCount }),
      )
      const deviation = Math.abs(result.usableCapacity - v.expectedUsable) / v.expectedUsable
      expect(deviation, `${v.name}: got ${result.usableCapacity}, ref ${v.expectedUsable} (${v.source})`)
        .toBeLessThanOrEqual(v.tolerance)
    })
  }
})
```

- [ ] **Step 4: Run**

Run: `rtk npm test -- tests/engines/volumetry/vectors/s2d.spec.ts --run`

- If PASS: record `untested → now covered` in the ledger; go to Step 6.
- If FAIL: this is the failing test of a TDD cycle — record a `value-wrong` finding (severity by deviation size), then Step 5.

- [ ] **Step 5 (conditional): Fix the strategy**

Adjust `src/engines/volumetry/strategies/s2d.ts` (or the relevant helper in `src/engines/volumetry/helpers/` / `overhead/`) so the engine matches the reference. Re-run Step 4 until green **and** re-run `rtk npm test -- tests/engines/volumetry.spec.ts --run` to prove no covered-platform regression. If the evidence shows the *reference case interpretation* was wrong instead (e.g. reserve accounted twice), fix the vector and say so in the ledger — never tune both at once.

- [ ] **Step 6: Commit**

```bash
rtk npm run lint:fix
rtk git add tests/fixtures/s2d-vectors.ts tests/engines/volumetry/vectors/s2d.spec.ts .planning/phases/18-quality-audit/18-AUDIT.md src/engines/volumetry
rtk git commit -m "test(s2d): external-reference capacity vectors (Microsoft Learn)"
```

---

### Task 4: Nutanix external-reference vectors

**Files:**
- Create: `tests/fixtures/nutanix-vectors.ts`
- Create: `tests/engines/volumetry/vectors/nutanix.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`
- Modify (only if >1 % deviation): `src/engines/volumetry/strategies/nutanix.ts` (or equivalent helper)

**Interfaces:**
- Consumes: `createVolumetryInput` (Task 2); `PlatformVector` interface — import it from `../fixtures/s2d-vectors` (Task 3) instead of redeclaring.

- [ ] **Step 1: Research** — Perplexity queries: "Nutanix capacity calculator RF2 RF3 usable capacity formula", "Nutanix EC-X erasure coding 4:1 6:2 efficiency portal.nutanix.com", "Nutanix CVM overhead reserved capacity per node". Prefer the Nutanix Bible / Nutanix support portal as sources. Nutanix sizing has proprietary elements — where the public docs give ranges instead of formulas, record the range and tag any residual uncertainty `value-misleading` candidate ("present as estimate"), per spec §9.

Record reference cases for all four levels: `nutanix_rf2`, `nutanix_rf3`, `nutanix_ec_rf2`, `nutanix_ec_rf3`.

- [ ] **Step 2: Fixture** — same shape as Task 3, importing the interface:

```typescript
/** Nutanix vectors — sources recorded per vector and in 18-AUDIT.md. */
import type { NutanixTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './s2d-vectors'

const TB = 1_000_000_000_000
const nutanix = (level: NutanixTopology): Topology => ({ type: 'nutanix', level })

export const nutanixVectors: PlatformVector[] = [
  // ≥ 4 vectors (rf2, rf3, ec_rf2, ec_rf3) with researched expectedUsable + source + url
]
```

- [ ] **Step 3: Spec** — identical structure to Task 3 Step 3 with these substitutions: import `{ nutanixVectors } from '../../../fixtures/nutanix-vectors'`, describe block `'Nutanix external-reference vectors'`, iterate `nutanixVectors`. Multi-node platforms: pass the vector's `serverCount` through `createVolumetryInput` overrides exactly as Task 3 does.

- [ ] **Step 4: Run** `rtk npm test -- tests/engines/volumetry/vectors/nutanix.spec.ts --run`; PASS → ledger + Step 6, FAIL → finding + Step 5.

- [ ] **Step 5 (conditional): Fix strategy, re-run vector spec + full `tests/engines/volumetry.spec.ts`** (same rule as Task 3 Step 5).

- [ ] **Step 6: Commit** — `rtk git add` the three files (+ engine if touched), message `test(nutanix): external-reference capacity vectors`.

---

### Task 5: NetApp external-reference vectors

**Files:**
- Create: `tests/fixtures/netapp-vectors.ts`
- Create: `tests/engines/volumetry/vectors/netapp.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`; conditionally the NetApp strategy/overhead files under `src/engines/volumetry/`

**Interfaces:**
- Consumes: `createVolumetryInput` (Task 2), `PlatformVector` (Task 3).

- [ ] **Step 1: Research** — validate the engine's documented formula `C_eff = (C_raw − RAID_overhead) × (1 − snap%) × DRR × (1 − WAFL%)` (comment in `src/engines/volumetry/index.ts:75`) against the NetApp Storage Efficiency Calculator and NetApp docs: "NetApp RAID-DP usable capacity formula WAFL reserve 10%", "NetApp RAID-TEC parity drives usable capacity", "NetApp aggregate snapshot reserve default". NetApp topologies are `type: 'proprietary'`, levels `netapp_raid_dp` and `netapp_raid_tec`. Record cases for both, with `DEFAULT_NETAPP_OPTIONS` defaults noted (check actual defaults with `rtk grep "DEFAULT_NETAPP_OPTIONS" src -A 10`).

- [ ] **Step 2: Fixture** — same pattern:

```typescript
import type { ProprietaryRaid, Topology } from '@/types/topology'
import type { PlatformVector } from './s2d-vectors'

const TB = 1_000_000_000_000
const netapp = (level: Extract<ProprietaryRaid, `netapp_${string}`>): Topology => ({
  type: 'proprietary',
  level,
})

export const netappVectors: PlatformVector[] = [
  // ≥ 3 vectors: raid_dp small (e.g. 8 drives), raid_dp large (24), raid_tec (24)
]
```

- [ ] **Step 3: Spec** — Task 3 Step 3 structure; import `netappVectors`, describe `'NetApp external-reference vectors'`.
- [ ] **Step 4: Run** the spec; PASS → ledger, FAIL → finding + Step 5.
- [ ] **Step 5 (conditional): Fix + regression run** (Task 3 Step 5 rule).
- [ ] **Step 6: Commit** — `test(netapp): external-reference capacity vectors (NetApp efficiency calculator)`.

---

### Task 6: Ceph external-reference vectors

**Files:**
- Create: `tests/fixtures/ceph-vectors.ts`
- Create: `tests/engines/volumetry/vectors/ceph.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`; conditionally the Ceph strategy files

**Interfaces:**
- Consumes: `createVolumetryInput` (Task 2), `PlatformVector` (Task 3).

- [ ] **Step 1: Research** — queries: "Ceph usable capacity replicated size 3 erasure coded k m formula docs.ceph.com", "Ceph nearfull ratio 0.85 mon_osd_nearfull_ratio default", "Ceph erasure coding overhead k/(k+m)". Engine already applies `safeCapacityThreshold` (default 0.85, `src/engines/volumetry/index.ts:244-248`) — the reference case must state whether the external source includes nearfull or not, so the comparison is apples-to-apples. Cover: `ceph_replicated_2`, `ceph_replicated_3`, `ceph_ec_4_2`, `ceph_ec_8_3`.

- [ ] **Step 2: Fixture**

```typescript
import type { CephTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './s2d-vectors'

const TB = 1_000_000_000_000
const ceph = (level: CephTopology): Topology => ({ type: 'ceph', level })

export const cephVectors: PlatformVector[] = [
  // ≥ 4 vectors with researched expectedUsable (post-nearfull) + docs.ceph.com URLs
]
```

- [ ] **Step 3: Spec** — Task 3 Step 3 structure; import `cephVectors`, describe `'Ceph external-reference vectors'`.
- [ ] **Step 4: Run**; PASS → ledger, FAIL → finding + Step 5.
- [ ] **Step 5 (conditional): Fix + regression run.**
- [ ] **Step 6: Commit** — `test(ceph): external-reference capacity vectors (docs.ceph.com)`.

---

### Task 7: Synology external-reference vectors

**Files:**
- Create: `tests/fixtures/synology-vectors.ts`
- Create: `tests/engines/volumetry/vectors/synology.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`; conditionally the Synology strategy files

**Interfaces:**
- Consumes: `createVolumetryInput` (Task 2), `PlatformVector` (Task 3).

- [ ] **Step 1: Research** — use the **Synology RAID Calculator** (https://www.synology.com/en-global/support/RAID_calculator) as primary reference: "Synology SHR usable capacity mixed drives calculator", "Synology SHR-2 fault tolerance capacity", "Synology RAID F1 usable capacity SSD". Note: engine subtracts a system partition (`systemPartitionSize × usableDrives`, `src/engines/volumetry/index.ts:163-166`) — verify the calculator's assumption (DSM reserves ~20-30 GB/disk) and record which value `DEFAULT_SYNOLOGY_OPTIONS` uses. Cover `synology_shr`, `synology_shr2`, `synology_raid_f1` (uniform drives — mixed-size SHR is out of scope, note that in the ledger).

- [ ] **Step 2: Fixture**

```typescript
import type { ProprietaryRaid, Topology } from '@/types/topology'
import type { PlatformVector } from './s2d-vectors'

const TB = 1_000_000_000_000
const synology = (level: Extract<ProprietaryRaid, `synology_${string}`>): Topology => ({
  type: 'proprietary',
  level,
})

export const synologyVectors: PlatformVector[] = [
  // ≥ 3 vectors (shr 4 drives, shr2 6 drives, raid_f1 6 drives) + calculator URL
]
```

- [ ] **Step 3: Spec** — Task 3 Step 3 structure; import `synologyVectors`, describe `'Synology external-reference vectors'`.
- [ ] **Step 4: Run**; PASS → ledger, FAIL → finding + Step 5.
- [ ] **Step 5 (conditional): Fix + regression run.**
- [ ] **Step 6: Commit** — `test(synology): external-reference capacity vectors (Synology RAID calculator)`.

---

### Task 8: Longhorn external-reference vectors

**Files:**
- Create: `tests/fixtures/longhorn-vectors.ts`
- Create: `tests/engines/volumetry/vectors/longhorn.spec.ts`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`; conditionally the Longhorn strategy files

**Interfaces:**
- Consumes: `createVolumetryInput` (Task 2), `PlatformVector` (Task 3).

- [ ] **Step 1: Research** — queries: "Longhorn storage reserved percentage default 25 minimal available longhorn.io docs", "Longhorn replica count usable capacity calculation", "Longhorn over-provisioning percentage snapshot space". The engine applies replica division, then free-space reserve (`1 − minimalAvailablePercent/100`), then snapshot headroom divisor (`src/engines/volumetry/index.ts:252-269`). Note `tests/engines/volumetry/longhorn.spec.ts` already exists (unit-level, from #51) — this task adds *external-reference* vectors, it does not duplicate those unit tests. Cover `longhorn_r2` and `longhorn_r3` at ≥ 2 node counts (serverCount must be ≥ replicas — engine validates placement).

- [ ] **Step 2: Fixture**

```typescript
import type { LonghornTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './s2d-vectors'

const TB = 1_000_000_000_000
const longhorn = (level: LonghornTopology): Topology => ({ type: 'longhorn', level })

export const longhornVectors: PlatformVector[] = [
  // ≥ 4 vectors: r2@3 nodes, r2@6 nodes, r3@3 nodes, r3@6 nodes + longhorn.io URLs
]
```

- [ ] **Step 3: Spec** — Task 3 Step 3 structure; import `longhornVectors`, describe `'Longhorn external-reference vectors'`; remember `serverCount` from the vector.
- [ ] **Step 4: Run**; PASS → ledger, FAIL → finding + Step 5.
- [ ] **Step 5 (conditional): Fix + regression run.**
- [ ] **Step 6: Commit** — `test(longhorn): external-reference capacity vectors (longhorn.io docs)`.

---

### Task 9: Cross-engine spot-checks (performance, resilience, sustainability)

**Files:**
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md` (Spot-Checks section)
- Create: `tests/engines/resilience-analytic.spec.ts`
- Conditionally modify: engine files where a spot-check fails

**Interfaces:**
- Consumes: `testDrive1TB` (Task 2); the resilience worker's exported simulation entry — find it with `rtk grep "export" src/workers/resilienceWorker.ts` and check how `tests/workers/resilience.spec.ts` invokes it; reuse that invocation pattern.

- [ ] **Step 1: Performance spot-check (manual, recorded).** Pick one all-flash config (any NVMe drive from `src/data/drives.json`, RAID-5, 8 drives) and one hybrid. Compute expected bottleneck chain by hand from the drive's `bandwidth_read_mb`/`iops_read` and the layer specs in `src/engines/performance/`, compare with `calculatePerformance` output via a scratch Vitest run or node REPL. Validate PCIe/network layer ceilings against vendor numbers via Perplexity ("PCIe 4.0 x4 NVMe throughput", "25GbE usable throughput"). Record both cases + deviation in the audit doc. >1 % → finding + fix with a regression test in `tests/engines/performance.spec.ts`.

- [ ] **Step 2: Resilience analytic cross-check (automated).** Write `tests/engines/resilience-analytic.spec.ts`: run the Monte Carlo simulation (same invocation as `tests/workers/resilience.spec.ts`, ≥ 100k iterations, fixed seed if supported) for RAID-5 8×1TB and RAID-6 8×1TB, and compare annual data-loss probability against the analytic MTTDL approximation:

```typescript
// RAID-5: MTTDL ≈ MTBF² / (N × (N−1) × MTTR)
// RAID-6: MTTDL ≈ MTBF³ / (N × (N−1) × (N−2) × MTTR²)
// P(loss within 1yr) ≈ 1 − exp(−8760 / MTTDL_hours)
```

Assert agreement within an order of magnitude (Monte Carlo vs closed-form differ by URE modeling — tight tolerance would be flaky; the check catches sign/exponent bugs, not noise). Use a generous but meaningful bound: `expect(ratio).toBeGreaterThan(0.1); expect(ratio).toBeLessThan(10)`.

- [ ] **Step 3: Sustainability spot-check (manual, recorded).** Recompute by hand for `testDrive1TB` × 12: drives watts = 12 × load_watts; verify `annualEnergyKwh = totalW × 8760 / 1000 × PUE` and `annualCO2Kg = kWh × regionFactor`. Validate one region factor (e.g. Switzerland ~0.012–0.03 kgCO₂/kWh) against a published source via Perplexity and compare with the value in `src/engines/sustainability/`. Record in the audit doc; deviation → finding + fix.

- [ ] **Step 4: Run** `rtk npm test -- tests/engines/resilience-analytic.spec.ts --run` → PASS.

- [ ] **Step 5: Commit** — `test(audit): resilience analytic cross-check + perf/sustainability spot-check records`.

---

### Task 10: Engine purity audit

**Files:**
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md`
- Conditionally modify: any impure engine file found

- [ ] **Step 1: Sweep for impurity**

```bash
rtk grep -rn "Date.now\|new Date\|Math.random\|document\.\|window\.\|i18n\|localStorage\|navigator\." src/engines src/workers
```

Expected: `Math.random` legitimately appears in the Monte Carlo worker (`src/workers/resilienceWorker.ts`) — random-by-design, not a finding. Anything else (locale reads, DOM, wall-clock in `src/engines/**`) is a finding.

- [ ] **Step 2: Fix each hit** by moving the impurity to the call boundary (hook or component passes the value in as a parameter). Each fix gets a test proving the engine result is a pure function of its inputs (call twice with same input, `expect(a).toEqual(b)`).

- [ ] **Step 3: Record** results (including "clean — no findings" if so) in the audit doc.

- [ ] **Step 4: Run full suite** `rtk npm test -- --run` → PASS. **Commit:** `refactor(engines): purity audit fixes (phase 18)` (or `docs(audit): engine purity sweep clean`).

---

### Task 11: PPTX — extract pure content builder + i18n all labels

**Files:**
- Create: `src/utils/pptxContent.ts`
- Create: `tests/utils/pptxContent.spec.ts`
- Modify: `src/utils/exportPptx.ts`
- Modify: `src/i18n/locales/en/output.json`, `src/i18n/locales/fr/output.json`, `src/i18n/locales/de/output.json`, `src/i18n/locales/it/output.json`

**Interfaces:**
- Consumes: `ExportConfig` from `exportPptx.ts`; `formatBytes`, `UnitSystem` from `@utils/units`; `i18n.t` passed in as parameter (purity).
- Produces: `buildPptxContent(config: ExportConfig, t: (key: string) => string, dateLabel?: string): PptxContent` where

```typescript
export interface PptxStat { label: string; value: string; role: 'plain' | 'accent' | 'capacity' | 'overhead' | 'parity' | 'muted' }
export interface PptxContent {
  title: string
  subtitle: string
  volumetryLines: PptxStat[][]   // 2 rows under the Sankey
  performanceLines: PptxStat[][] // 2 rows under the gauges
  energyLine: PptxStat[]
  bottleneckLine: PptxStat[]
  resilienceLine: PptxStat[] | null
}
```

Task 13 consumes `PptxContent` + `role` (maps roles to palette colors). Task 12's unit-system behavior lives inside this builder.

- [ ] **Step 1: Add the i18n label blocks.** Extend the existing `pptx` object in each locale's `output.json` with a `labels` sub-object. English:

```json
"labels": {
  "drives": "drives",
  "servers": "servers",
  "raw": "Raw",
  "usable": "Usable",
  "effective": "Effective",
  "efficiency": "Efficiency",
  "parity": "Parity",
  "spares": "Spares",
  "fs": "FS",
  "maxRead": "Max Read",
  "maxWrite": "Max Write",
  "total": "Total",
  "powerDrives": "Drives",
  "powerServers": "Servers",
  "cooling": "Cooling",
  "energy": "Energy",
  "co2": "CO₂",
  "endurance": "Endurance",
  "survival": "Survival",
  "durability": "Durability",
  "rebuild": "Rebuild",
  "risk": "Risk",
  "chartUnavailable": "Capacity chart unavailable"
}
```

French: `"drives": "disques", "servers": "serveurs", "raw": "Brut", "usable": "Utile", "effective": "Effectif", "efficiency": "Efficacité", "parity": "Parité", "spares": "Réserve", "fs": "FS", "maxRead": "Lecture max", "maxWrite": "Écriture max", "total": "Total", "powerDrives": "Disques", "powerServers": "Serveurs", "cooling": "Refroidissement", "energy": "Énergie", "co2": "CO₂", "endurance": "Endurance", "survival": "Survie", "durability": "Durabilité", "rebuild": "Reconstruction", "risk": "Risque", "chartUnavailable": "Graphique de capacité indisponible"`.
German: `"drives": "Laufwerke", "servers": "Server", "raw": "Brutto", "usable": "Nutzbar", "effective": "Effektiv", "efficiency": "Effizienz", "parity": "Parität", "spares": "Reserve", "fs": "FS", "maxRead": "Max. Lesen", "maxWrite": "Max. Schreiben", "total": "Gesamt", "powerDrives": "Laufwerke", "powerServers": "Server", "cooling": "Kühlung", "energy": "Energie", "co2": "CO₂", "endurance": "Lebensdauer", "survival": "Überleben", "durability": "Haltbarkeit", "rebuild": "Wiederaufbau", "risk": "Risiko", "chartUnavailable": "Kapazitätsdiagramm nicht verfügbar"`.
Italian: `"drives": "dischi", "servers": "server", "raw": "Grezzo", "usable": "Utilizzabile", "effective": "Effettivo", "efficiency": "Efficienza", "parity": "Parità", "spares": "Riserva", "fs": "FS", "maxRead": "Lettura max", "maxWrite": "Scrittura max", "total": "Totale", "powerDrives": "Dischi", "powerServers": "Server", "cooling": "Raffreddamento", "energy": "Energia", "co2": "CO₂", "endurance": "Durata", "survival": "Sopravvivenza", "durability": "Durabilità", "rebuild": "Ricostruzione", "risk": "Rischio", "chartUnavailable": "Grafico capacità non disponibile"`.

- [ ] **Step 2: Write the failing test** (`tests/utils/pptxContent.spec.ts`)

```typescript
import { describe, expect, it } from 'vitest'
import type { ExportConfig } from '@/utils/exportPptx'
import { buildPptxContent } from '@/utils/pptxContent'
import en from '@/i18n/locales/en/output.json'

const t = (key: string) => {
  const labels = (en.pptx as Record<string, unknown>).labels as Record<string, string>
  const short = key.replace('output:pptx.labels.', '')
  return labels[short] ?? key
}

// Minimal fixture — fill CalculationResults with round numbers (bytes)
const config: ExportConfig = {
  drive: { model: 'Test 1TB' } as ExportConfig['drive'],
  driveCount: 8,
  topology: { type: 'standard', level: 'RAID5' },
  unitSystem: 'binary',
  results: {
    volumetry: {
      rawCapacity: 8e12, usableCapacity: 7e12, effectiveCapacity: 7e12, efficiency: 87.5,
      parityOverhead: 1e12, hotSpareOverhead: 0, filesystemOverhead: 0.14e12, slopOverhead: 0,
      breakdown: [],
    },
    performance: {
      maxReadIOPS: 1200, maxWriteIOPS: 800, maxReadThroughputMBs: 1600, maxWriteThroughputMBs: 1000,
      layers: [],
    },
    sustainability: {
      powerBreakdown: { total: 120, drives: 80, servers: 30, cooling: 10 },
      annualEnergyKwh: 1051, annualCO2Kg: 13,
    },
    resilience: null,
  } as unknown as ExportConfig['results'],
}

describe('buildPptxContent', () => {
  it('uses binary units (TiB) when unitSystem is binary', () => {
    const content = buildPptxContent(config, t)
    const raw = content.volumetryLines[0]?.find((s) => s.label === 'Raw')
    expect(raw?.value).toContain('TiB')
  })
  it('uses decimal units (TB) when unitSystem is decimal', () => {
    const content = buildPptxContent({ ...config, unitSystem: 'decimal' }, t)
    const raw = content.volumetryLines[0]?.find((s) => s.label === 'Raw')
    expect(raw?.value).toContain('TB')
    expect(raw?.value).not.toContain('TiB')
  })
  it('omits the resilience line when the simulation has not run', () => {
    expect(buildPptxContent(config, t).resilienceLine).toBeNull()
  })
  it('resolves every label through t() — no hardcoded English fallbacks', () => {
    const content = buildPptxContent(config, t)
    const allStats = [
      ...content.volumetryLines.flat(),
      ...content.performanceLines.flat(),
      ...content.energyLine,
      ...content.bottleneckLine,
    ]
    for (const s of allStats) expect(s.label).not.toMatch(/^output:pptx/)
  })
})
```

Adjust the `results` fixture shape to the real `CalculationResults` type as you implement — the cast is a starting point, replace with a complete literal if the type demands it.

- [ ] **Step 3: Run to verify it fails** — `rtk npm test -- tests/utils/pptxContent.spec.ts --run` → FAIL ("Cannot find module '@/utils/pptxContent'").

- [ ] **Step 4: Implement `src/utils/pptxContent.ts`** — a pure module: move `formatIops` and the stat-line assembly logic out of `exportPptx.ts`; every label is `t('output:pptx.labels.<key>')`; capacities go through `formatBytes(bytes, unitSystem)` from `@utils/units` (default `'binary'` if `config.unitSystem` is undefined). `subtitle` joins model, `${driveCount} ${t('…labels.drives')}`, optional `${serverCount} ${t('…labels.servers')}`, and the optional `dateLabel` third parameter (omitted from the subtitle when undefined) — keeps `new Date()` out of the pure module; `exportToPptx` supplies the locale-formatted date.

- [ ] **Step 5: Run to verify pass** — same command → PASS.

- [ ] **Step 6: Rewire `exportPptx.ts`** to consume `buildPptxContent(config, i18n.t, dateLabel)` — `buildSummarySlide` renders `PptxStat[][]` rows instead of assembling strings itself; delete the now-dead local literals (`'Raw'`, `'drives'`, …). Run `rtk npm run typecheck` and the full test suite → PASS.

- [ ] **Step 7: Commit** — includes locale files, per docs-in-sync policy:

```bash
rtk npm run lint:fix
rtk git add src/utils/pptxContent.ts src/utils/exportPptx.ts tests/utils/pptxContent.spec.ts src/i18n/locales/*/output.json
rtk git commit -m "feat(pptx): pure content builder, full i18n (en/fr/de/it), unit-system support"
```

---

### Task 12: PPTX — honor unitSystem end to end

**Files:**
- Modify: `src/utils/pptxContent.ts`, `tests/utils/pptxContent.spec.ts` (only if Task 11 left gaps)

**Interfaces:**
- Consumes: Task 11's `buildPptxContent`. `OutputDashboard.tsx:215` already passes `unitSystem` — no dashboard change needed.

- [ ] **Step 1: Verify coverage.** Task 11's tests already assert TiB/TB switching for the volumetry line. Extend the spec with one more assertion: parity/spares/fs stats also switch units (same test pattern, `content.volumetryLines[1]`). Run → if it already passes, this task collapses to the assertion commit; if it fails, fix `buildPptxContent` so **every** byte-valued stat uses `formatBytes(bytes, unitSystem)`.

- [ ] **Step 2: Run** `rtk npm test -- tests/utils/pptxContent.spec.ts --run` → PASS. **Commit:** `test(pptx): assert unit-system applies to all byte stats`.

---

### Task 13: PPTX — remove module-level mutable palette + export error toast

**Files:**
- Modify: `src/utils/exportPptx.ts`
- Modify: `src/components/layout/OutputDashboard.tsx` (lines ~203-217, the `handleExportPptx` handler)
- Test: `tests/utils/pptxContent.spec.ts` stays green; palette change is type-checked refactor

**Interfaces:**
- Consumes: `PptxContent.role` from Task 11.
- Produces: `buildSummarySlide(prs, config, charts, content, palette)` — `palette: Brand` parameter replaces the module-level `let brand`.

- [ ] **Step 1: Refactor the palette.** In `exportPptx.ts`: delete `let brand: Brand = BRAND` (line 59); `exportToPptx` computes `const palette = document.documentElement.classList.contains('dark') ? BRAND : BRAND_LIGHT` and passes it down; every helper (`addAccentBar`, `addSectionLabel`, `addChartOrFallback`, `addStatLine`, `buildSummarySlide`) takes `palette: Brand` as a parameter. Map `PptxStat.role → color`: `plain→textWhite, accent→accent, capacity→capacity, overhead→overhead, parity→parity, muted→textMuted`.

- [ ] **Step 2: Typecheck + tests** — `rtk npm run typecheck && rtk npm test -- --run` → PASS.

- [ ] **Step 3: Error toast.** In `OutputDashboard.tsx`, `handleExportPptx` currently ignores the returned promise. Find how the app already surfaces notifications (`rtk grep -rn "toast\|notification\|Snackbar" src/components | head`). If a toast system exists, use it; if none exists, add a minimal inline error state near the export buttons (a small red text line, i18n key `output:export.error` added to all 4 locales: EN "Export failed — please try again", FR "Échec de l'export — veuillez réessayer", DE "Export fehlgeschlagen — bitte erneut versuchen", IT "Esportazione non riuscita — riprovare"):

```typescript
const handleExportPptx = () => {
  if (!selectedDrive) return
  exportToPptx({ /* unchanged args */ }).catch(() => setExportError(true))
}
```

Apply the same `.catch` to `handleExportPdf` (same defect class, same fix — silent-failure policy).

- [ ] **Step 4: Run full suite + lint** → PASS. **Commit:** `refactor(pptx): palette as parameter (purity); surface export failures in UI`.

---

### Task 14: PPTX end-to-end verification (both themes)

**Files:**
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md` (PPTX E2E Evidence section)
- Conditionally modify: `src/utils/exportPptx.ts` / `pptxContent.ts` for any defect found

**Interfaces:**
- Consumes: everything from Tasks 11-13 (this task gates them).

- [ ] **Step 1: Start the app** — `rtk npm run dev` (background). Note the port (default 5173, base path `/raidy/`).

- [ ] **Step 2: Export in dark theme.** Via browser automation (claude-in-chrome or Playwright MCP — load tools via ToolSearch first): open `http://localhost:5173/raidy/`, configure RAID-5 with 10 × 1 TB-class drives (a config with a phase-02 vector), ensure dark theme, run the resilience simulation, click the PowerPoint export, capture the downloaded file path.

- [ ] **Step 3: Inspect the file.**

```bash
cd <scratchpad> && unzip -o ~/Downloads/raidy-standard.pptx -d pptx-dark
grep -o '<a:t>[^<]*</a:t>' pptx-dark/ppt/slides/slide1.xml | head -60
ls pptx-dark/ppt/media/
```

Assert, recording each in the audit doc: (a) every numeric value in the slide XML equals the dashboard value on screen (screenshot the dashboard for comparison); (b) ≥ 5 media images (1 Sankey + 4 gauges); (c) labels are in the active UI language; (d) background color = `1A1B2E`.

- [ ] **Step 4: Export in light theme + French.** Switch theme to light and language to `?lang=fr`, re-export, re-inspect: background `FFFFFF`, ink text `0F172A`, French labels ("Utile", "Parité"…). Record.

- [ ] **Step 5: Degraded modes.** (a) Collapse/hide the performance panel if the UI allows, re-export → gauge slots show fallback or are absent, no crash. (b) Fresh page load without running resilience → no resilience row, no crash. Record both.

- [ ] **Step 6: Unit system.** Switch the unit setting to decimal, re-export → slide shows TB not TiB. Record.

- [ ] **Step 7:** Any deviation found = finding in the ledger + fix + re-run the relevant step. When all pass, mark the E2E Evidence section complete. **Commit:** `docs(audit): PPTX e2e verification evidence (dark/light, fr, degraded, units)`.

---

### Task 15: Platform capability map + honesty probe tests

**Files:**
- Create: `src/engines/capabilities.ts`
- Create: `tests/engines/capabilities.spec.ts`

**Interfaces:**
- Consumes: `calculateVolumetry`, `createVolumetryInput` (Task 2).
- Produces: `PlatformCapabilities`, `PLATFORM_CAPABILITIES: Record<TopologyType, PlatformCapabilities>`, `getCapabilities(type: TopologyType): PlatformCapabilities` — consumed by Task 16's UI wiring.

- [ ] **Step 1: Write the probe test FIRST** — it derives the truth from the engine, so the map can never lie:

```typescript
import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { getCapabilities } from '@/engines/capabilities'
import type { Topology } from '@/types/topology'
import { createVolumetryInput } from '../fixtures/vector-harness'

/** One representative valid config per topology type. */
const REPRESENTATIVE: { topology: Topology; drives: number; servers: number }[] = [
  { topology: { type: 'standard', level: 'RAID5' }, drives: 8, servers: 1 },
  { topology: { type: 'zfs', level: 'raidz2' }, drives: 8, servers: 1 },
  { topology: { type: 's2d', level: 'mirror' }, drives: 12, servers: 4 },
  { topology: { type: 'proprietary', level: 'synology_shr' }, drives: 6, servers: 1 },
  { topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'vsan_osa', level: 'vsan_osa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'ceph', level: 'ceph_replicated_3' }, drives: 12, servers: 4 },
  { topology: { type: 'powerflex', level: 'powerflex_medium_2way' }, drives: 12, servers: 4 },
  { topology: { type: 'powerstore', level: 'powerstore_drr' }, drives: 12, servers: 2 },
  { topology: { type: 'powerscale', level: 'powerscale_n2_1' }, drives: 12, servers: 4 },
  { topology: { type: 'objectscale', level: 'objectscale_ec_12_4' }, drives: 16, servers: 4 },
  { topology: { type: 'nutanix', level: 'nutanix_rf2' }, drives: 12, servers: 4 },
  { topology: { type: 'powervault', level: 'powervault_raid6' }, drives: 12, servers: 1 },
  { topology: { type: 'longhorn', level: 'longhorn_r3' }, drives: 12, servers: 4 },
]
// NOTE: verify each level literal against src/types/topology.ts before running —
// powerstore/powerscale/objectscale level names above must be replaced by real
// union members (rtk grep "PowerStoreTopology =" -A 8 src/types/topology.ts).

describe('capability map matches engine behavior', () => {
  for (const { topology, drives, servers } of REPRESENTATIVE) {
    const caps = getCapabilities(topology.type)

    it(`${topology.type}: supportsCompression=${caps.supportsCompression}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, compressionRatio: 1 }),
      )
      const compressed = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, compressionRatio: 2 }),
      )
      if (caps.supportsCompression) {
        expect(compressed.effectiveCapacity).toBeGreaterThan(base.effectiveCapacity)
      } else {
        expect(compressed.effectiveCapacity).toBe(base.effectiveCapacity)
      }
    })

    it(`${topology.type}: supportsDedup=${caps.supportsDedup}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, dedupRatio: 1 }),
      )
      const deduped = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, dedupRatio: 2 }),
      )
      if (caps.supportsDedup) {
        expect(deduped.effectiveCapacity).toBeGreaterThan(base.effectiveCapacity)
      } else {
        expect(deduped.effectiveCapacity).toBe(base.effectiveCapacity)
      }
    })

    it(`${topology.type}: supportsHotSpares=${caps.supportsHotSpares}`, () => {
      const base = calculateVolumetry(createVolumetryInput(drives, topology, { serverCount: servers }))
      const spared = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, hotSpares: 1 }),
      )
      if (caps.supportsHotSpares) {
        expect(spared.usableCapacity).toBeLessThan(base.usableCapacity)
      } else {
        expect(spared.usableCapacity).toBe(base.usableCapacity)
      }
    })
  }
})
```

- [ ] **Step 2: Run to verify it fails** — `rtk npm test -- tests/engines/capabilities.spec.ts --run` → FAIL ("Cannot find module '@/engines/capabilities'").

- [ ] **Step 3: Implement the map.** Determine each flag empirically: temporarily set all flags `true`, run the probe, and flip each flag the probe refutes (the probe output names them). This bootstraps an honest map from actual engine behavior.

```typescript
/**
 * Platform capability map — the single source of truth for which inputs are
 * meaningful per topology type. UI panels consult this to hide no-op controls.
 * The probe suite (tests/engines/capabilities.spec.ts) asserts every flag
 * against actual engine behavior, so this map cannot silently drift.
 */
import type { TopologyType } from '@/types/topology'

export interface PlatformCapabilities {
  supportsCompression: boolean
  supportsDedup: boolean
  supportsHotSpares: boolean
  hasServerCount: boolean
}

export const PLATFORM_CAPABILITIES: Record<TopologyType, PlatformCapabilities> = {
  standard: { supportsCompression: true, supportsDedup: true, supportsHotSpares: true, hasServerCount: false },
  // …one entry per TopologyType, values set from the probe run (Step 3 procedure)
} as const

export function getCapabilities(type: TopologyType): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[type]
}
```

`hasServerCount` is structural, not probed: `true` exactly for the multi-node types (`s2d`, `vsan_osa`, `vsan_esa`, `ceph`, `powerflex`, `powerstore`, `powerscale`, `objectscale`, `nutanix`, `longhorn`), `false` for `standard`, `zfs`, `proprietary`, `powervault`. Add a plain unit assertion for it (no probe).

- [ ] **Step 4: Run to verify pass** — same command → PASS. Also run the full suite.

- [ ] **Step 5: Commit** — `feat(engines): platform capability map with behavior-probe tests`.

---

### Task 16: Hide no-op controls in the UI

**Files:**
- Modify: `src/components/inputs/AdvancedPanel.tsx` (compression/dedup sliders)
- Modify: `src/components/inputs/HardwarePanel.tsx` (hot spares, server count)
- Test: `tests/components/inputRelevance.spec.tsx` (create)

**Interfaces:**
- Consumes: `getCapabilities` (Task 15); the topology slice's current topology from the Zustand store (same selector the panels already use).

- [ ] **Step 1: Write the failing component test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
// If @testing-library/react is not installed, check tests/components/* for the
// existing component-test pattern and follow it instead.
```

Follow the existing pattern in `tests/components/` (see `longhornConstants.spec.ts` neighborhood — if no component render tests exist yet, test the visibility *logic* instead: extract `shouldShowControl(control: 'compression'|'dedup'|'hotSpares'|'serverCount', type: TopologyType): boolean` into `src/engines/capabilities.ts` and unit-test that):

```typescript
import { describe, expect, it } from 'vitest'
import { shouldShowControl } from '@/engines/capabilities'

describe('input relevance', () => {
  it('hides compression for platforms whose engine ignores it', () => {
    // exact expectations come from the Task 15 map — assert a couple of known pairs
    expect(shouldShowControl('serverCount', 'standard')).toBe(false)
    expect(shouldShowControl('serverCount', 'ceph')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**, then implement `shouldShowControl` (a thin lookup over `getCapabilities`).

- [ ] **Step 3: Wire the panels.** In `AdvancedPanel.tsx`, wrap the compression and dedup sliders: `{shouldShowControl('compression', topology.type) && (…existing slider JSX…)}`. Same for dedup. In `HardwarePanel.tsx`, same treatment for hot spares and server count. **Hidden, not disabled** (spec §5 / Longhorn precedent). Keep the store values untouched when hidden — the engine already ignores them (that's what the flag proves).

- [ ] **Step 4: Manual smoke** — `rtk npm run dev`, switch across 4-5 platforms, confirm the panels show only meaningful controls and nothing else moved. Full test suite + typecheck + lint → PASS.

- [ ] **Step 5: Commit** — `feat(ui): hide no-op inputs per platform capability map`. Update `docs/ARCHITECTURE.md` (add the capability-map paragraph to the engine section) **in this same commit**.

---

### Task 17: Docs & spec sync

**Files:**
- Create: `.planning/phases/17-pptx-content/17-SUPERSEDED.md`
- Modify: `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`
- Modify: `.planning/phases/18-quality-audit/18-AUDIT.md` (status: complete)

- [ ] **Step 1: Supersede the stale PPTX verification.** Create `17-SUPERSEDED.md`:

```markdown
# Phase 17 verification — superseded

`17-VERIFICATION.md` verified a 7-slide deck. Commits d7e574a..0172790 collapsed
the export to a single theme-following one-pager (Sankey + 2×2 gauges + stat
lines). Current behavior is specified in
`docs/superpowers/specs/2026-07-11-quality-audit-ui-relevance-design.md` and
verified end-to-end in `.planning/phases/18-quality-audit/18-AUDIT.md`.
```

Also `rtk git add .planning/phases/17-pptx-content/17-VERIFICATION.md` (it is still untracked — commit it alongside so history shows what was superseded).

- [ ] **Step 2: Sweep the docs.** `rtk grep -rn "7-slide\|seven slide\|slide deck\|BOM slide" docs README.md CHANGELOG.md` — update every hit to describe the one-pager. Verify `docs/ARCHITECTURE.md` mentions: pptxContent pure builder, capability map, the new vector files.

- [ ] **Step 3: CHANGELOG entry** under Unreleased: vector coverage for 6 platforms, PPTX i18n/unit/purity fixes, export error surfacing, capability-driven input hiding.

- [ ] **Step 4: Mark `18-AUDIT.md` status: complete;** final ledger counts (findings by tag/severity, fixed vs open).

- [ ] **Step 5: Full gate** — `rtk npm test -- --run && rtk npm run typecheck && rtk npm run lint && rtk npm run build` → all PASS.

- [ ] **Step 6: Commit** — `docs: sync specs/docs with shipped one-pager, close phase-18 audit`.

---

## Execution Notes

- Tasks 3–8 are independent of each other (parallelizable) but all depend on Tasks 1–2. Tasks 11→12→13→14 are strictly sequential. Task 15 → 16 sequential. Task 17 last.
- Research steps (Perplexity/Context7) are part of the task, not optional: a vector without a recorded source URL fails review.
- If any strategy fix in Tasks 3–8 changes a value shown in the UI, re-run Task 14's relevant e2e step afterwards.
