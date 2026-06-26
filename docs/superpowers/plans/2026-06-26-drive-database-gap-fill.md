# Drive Database Gap-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~15 anonymized, spec-accurate drive entries to `src/data/drives.json`, backfill `nandType` on the 27 untagged existing SSDs, and prune the orphaned `AIC` form factor — filling capacity / form-factor / cell-type holes without changing the `DriveType` taxonomy.

**Architecture:** Pure data change plus one tiny type edit. New entries follow the existing `Drive` interface (`src/types/drive.ts`) and `drives.json` conventions exactly. A new test file (`tests/data/drives-db.spec.ts`) provides TDD anchors: global invariants over all drives plus per-task presence/coverage assertions. No engine, hook, or component logic changes.

**Tech Stack:** TypeScript (strict), Vitest, Biome, JSON data file loaded via `as Record<string, Drive>` cast.

## Global Constraints

- **No `DriveType` change** (`HDD | SSD_SATA | SSD_SAS | SSD_NVMe`) and no change to engines/hooks/components. Data + the `FormFactor` union edit only.
- **Anonymized model names** — no vendor/brand names (e.g. `Enterprise HDD 7.2K SATA 3.5" 30TB HAMR`). Match existing naming style.
- **`URERate` ∈ {14, 15, 16, 17}** (`src/types/drive.ts`) — never 18. HDD = 15, enterprise SSD = 17.
- **`sector_size` = 4096** for every new entry. **`capacity_raw` in decimal bytes** (e.g. 20 TB = `20000000000000`).
- **Per-entry key order** (match existing): `id, model, type, tier, formFactor, interface, [rpm, recording | nandType], capacity_raw, sector_size, performance{iops_read, iops_write, bandwidth_read_mb, bandwidth_write_mb}, reliability{ure_rate, afr, dwpd, mtbf_hours}, power{idle_watts, load_watts}, cost_usd`.
- **AFR/MTBF mapping** (DB convention): `afr 0.35 ↔ mtbf 2_500_000`, `afr 0.44 ↔ mtbf 2_000_000`.
- No existing test asserts a drive count, so additions are safe.
- Specs below are Perplexity-validated against real 2025-26 drives (Seagate Exos/Exos M, WD Ultrastar, Solidigm D5-P5336, Samsung PM9D3a/PM893, Kioxia PM7/LC9, Micron 5400/6600) then de-branded; SMR/HAMR IOPS match the DB's existing SMR (`80/40`) and HAMR (`~180/180`) conventions.

---

### Task 1: Drive-DB invariant test + prune `AIC` form factor

**Files:**
- Create: `tests/data/drives-db.spec.ts`
- Modify: `src/types/drive.ts` (remove `'AIC'` from the `FormFactor` union and from `FORM_FACTOR_TO_TYPES.all`)

**Interfaces:**
- Consumes: `Drive`, `FormFactor` from `@/types/drive`; `drives.json` via `@/data/drives.json`.
- Produces: `tests/data/drives-db.spec.ts` — the shared test file later tasks extend.

- [ ] **Step 1: Write the invariant + AIC test**

Create `tests/data/drives-db.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import { FORM_FACTOR_TO_TYPES } from '@/types/drive'
import type { Drive } from '@/types/drive'

const drives = drivesData as Record<string, Drive>
const all = Object.values(drives)

const VALID_TYPES = new Set(['HDD', 'SSD_SATA', 'SSD_SAS', 'SSD_NVMe'])
const VALID_FF = new Set(['2.5"', '3.5"', 'M.2', 'U.2', 'U.3', 'E1.S', 'E1.L', 'E3.S', 'E3.L'])
const VALID_IFACE = new Set(['SATA', 'SAS', 'PCIe3', 'PCIe4', 'PCIe5'])
const VALID_URE = new Set([14, 15, 16, 17])

describe('drive database invariants', () => {
  it('every drive has a valid type, form factor, interface and sane numbers', () => {
    for (const d of all) {
      expect(VALID_TYPES.has(d.type), `${d.id} type`).toBe(true)
      if (d.formFactor) expect(VALID_FF.has(d.formFactor), `${d.id} ff`).toBe(true)
      if (d.interface) expect(VALID_IFACE.has(d.interface), `${d.id} iface`).toBe(true)
      expect(VALID_URE.has(d.reliability.ure_rate), `${d.id} ure`).toBe(true)
      expect(d.capacity_raw, `${d.id} cap`).toBeGreaterThan(0)
      expect(d.sector_size === 512 || d.sector_size === 4096, `${d.id} sector`).toBe(true)
      expect(d.performance.iops_read, `${d.id} iops_read`).toBeGreaterThan(0)
      expect(d.performance.bandwidth_read_mb, `${d.id} bw`).toBeGreaterThan(0)
      expect(d.cost_usd, `${d.id} cost`).toBeGreaterThan(0)
    }
  })

  it('id matches the map key', () => {
    for (const [key, d] of Object.entries(drives)) expect(d.id).toBe(key)
  })

  it('AIC form factor is pruned (not in any filter)', () => {
    expect(FORM_FACTOR_TO_TYPES.all).not.toContain('AIC')
    for (const ffs of Object.values(FORM_FACTOR_TO_TYPES)) {
      expect(ffs).not.toContain('AIC')
    }
  })
})
```

- [ ] **Step 2: Run it — invariants pass, AIC test fails**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts`
Expected: the AIC test FAILS (`FORM_FACTOR_TO_TYPES.all` still contains `'AIC'`); the two invariant tests PASS.

- [ ] **Step 3: Prune `AIC` from `src/types/drive.ts`**

In the `FormFactor` union, delete the `| 'AIC'` line:

```ts
export type FormFactor =
  | '2.5"'
  | '3.5"'
  | 'M.2'
  | 'U.2'
  | 'U.3'
  | 'E1.S'
  | 'E1.L'
  | 'E3.S'
  | 'E3.L'
```

In `FORM_FACTOR_TO_TYPES`, remove `'AIC'` from the `all` array (leave every other entry unchanged):

```ts
  all: ['2.5"', '3.5"', 'M.2', 'U.2', 'U.3', 'E1.S', 'E1.L', 'E3.S', 'E3.L'],
```

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts && rtk tsc`
Expected: all three tests PASS; `TypeScript: No errors found` (no drive used `AIC`, so the cast still resolves).

- [ ] **Step 5: Commit**

```bash
rtk git add tests/data/drives-db.spec.ts src/types/drive.ts
rtk proxy git commit -m "test(drives): add DB invariant test; prune orphaned AIC form factor"
```

---

### Task 2: Add 5 HDD entries (CMR / SMR / HAMR, 20–30 TB)

**Files:**
- Modify: `src/data/drives.json` (append 5 entries inside the HDD group, after the last `HDD`-type entry)
- Modify: `tests/data/drives-db.spec.ts` (add an HDD presence/coverage describe block)

**Interfaces:**
- Consumes: the `Drive` shape; `drives` map from Task 1's test.
- Produces: drive IDs `ent-hdd-7k2-sata-20tb-cmr`, `ent-hdd-7k2-sas-22tb-cmr`, `ent-hdd-7k2-sata-26tb-smr`, `ent-hdd-7k2-sata-28tb-hamr`, `ent-hdd-7k2-sata-30tb-hamr`.

> **Note:** the spec listed the 28 TB HAMR as SAS; no SAS HAMR product exists (Mozaic 3+ is SATA-only), so it is **SATA**. SAS high-capacity coverage is provided by the 22 TB CMR SAS entry.

- [ ] **Step 1: Write the failing HDD test**

Append to `tests/data/drives-db.spec.ts`:

```ts
describe('new HDD entries', () => {
  it('adds 20/22/26/28/30 TB drives with correct recording', () => {
    const cases: Array<[string, number, string]> = [
      ['ent-hdd-7k2-sata-20tb-cmr', 20_000_000_000_000, 'CMR'],
      ['ent-hdd-7k2-sas-22tb-cmr', 22_000_000_000_000, 'CMR'],
      ['ent-hdd-7k2-sata-26tb-smr', 26_000_000_000_000, 'SMR'],
      ['ent-hdd-7k2-sata-28tb-hamr', 28_000_000_000_000, 'HAMR'],
      ['ent-hdd-7k2-sata-30tb-hamr', 30_000_000_000_000, 'HAMR'],
    ]
    for (const [id, cap, rec] of cases) {
      const d = drives[id]
      expect(d, id).toBeDefined()
      expect(d.type).toBe('HDD')
      expect(d.capacity_raw).toBe(cap)
      expect(d.recording).toBe(rec)
      expect(d.rpm).toBe(7200)
    }
  })

  it('represents SMR and HAMR by at least two drives each', () => {
    const rec = (r: string) => Object.values(drives).filter((d) => d.recording === r).length
    expect(rec('SMR')).toBeGreaterThanOrEqual(2)
    expect(rec('HAMR')).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run it — fails (drives absent)**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "new HDD entries"`
Expected: FAIL — `ent-hdd-7k2-sata-20tb-cmr` is undefined.

- [ ] **Step 3: Append the 5 HDD entries to `src/data/drives.json`**

Insert these inside the top-level object, after the last existing `"type": "HDD"` entry (keep the trailing comma chain valid):

```json
  "ent-hdd-7k2-sata-20tb-cmr": {
    "id": "ent-hdd-7k2-sata-20tb-cmr",
    "model": "Enterprise HDD 7.2K SATA 3.5\" 20TB CMR",
    "type": "HDD",
    "tier": "enterprise",
    "formFactor": "3.5\"",
    "interface": "SATA",
    "rpm": 7200,
    "recording": "CMR",
    "capacity_raw": 20000000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 168, "iops_write": 168, "bandwidth_read_mb": 285, "bandwidth_write_mb": 285 },
    "reliability": { "ure_rate": 15, "afr": 0.35, "dwpd": 0, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5.4, "load_watts": 9.4 },
    "cost_usd": 299
  },
  "ent-hdd-7k2-sas-22tb-cmr": {
    "id": "ent-hdd-7k2-sas-22tb-cmr",
    "model": "Enterprise HDD 7.2K SAS 3.5\" 22TB CMR",
    "type": "HDD",
    "tier": "enterprise",
    "formFactor": "3.5\"",
    "interface": "SAS",
    "rpm": 7200,
    "recording": "CMR",
    "capacity_raw": 22000000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 168, "iops_write": 168, "bandwidth_read_mb": 285, "bandwidth_write_mb": 285 },
    "reliability": { "ure_rate": 15, "afr": 0.35, "dwpd": 0, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5.5, "load_watts": 9.8 },
    "cost_usd": 499
  },
  "ent-hdd-7k2-sata-26tb-smr": {
    "id": "ent-hdd-7k2-sata-26tb-smr",
    "model": "Enterprise HDD 7.2K SATA 3.5\" 26TB SMR",
    "type": "HDD",
    "tier": "enterprise",
    "formFactor": "3.5\"",
    "interface": "SATA",
    "rpm": 7200,
    "recording": "SMR",
    "capacity_raw": 26000000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 80, "iops_write": 40, "bandwidth_read_mb": 270, "bandwidth_write_mb": 270 },
    "reliability": { "ure_rate": 15, "afr": 0.35, "dwpd": 0, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5.5, "load_watts": 9.4 },
    "cost_usd": 549
  },
  "ent-hdd-7k2-sata-28tb-hamr": {
    "id": "ent-hdd-7k2-sata-28tb-hamr",
    "model": "Enterprise HDD 7.2K SATA 3.5\" 28TB HAMR",
    "type": "HDD",
    "tier": "enterprise",
    "formFactor": "3.5\"",
    "interface": "SATA",
    "rpm": 7200,
    "recording": "HAMR",
    "capacity_raw": 28000000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 175, "iops_write": 175, "bandwidth_read_mb": 288, "bandwidth_write_mb": 288 },
    "reliability": { "ure_rate": 15, "afr": 0.35, "dwpd": 0, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 6.9, "load_watts": 9.5 },
    "cost_usd": 560
  },
  "ent-hdd-7k2-sata-30tb-hamr": {
    "id": "ent-hdd-7k2-sata-30tb-hamr",
    "model": "Enterprise HDD 7.2K SATA 3.5\" 30TB HAMR",
    "type": "HDD",
    "tier": "enterprise",
    "formFactor": "3.5\"",
    "interface": "SATA",
    "rpm": 7200,
    "recording": "HAMR",
    "capacity_raw": 30000000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 178, "iops_write": 178, "bandwidth_read_mb": 295, "bandwidth_write_mb": 295 },
    "reliability": { "ure_rate": 15, "afr": 0.35, "dwpd": 0, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 6.9, "load_watts": 9.5 },
    "cost_usd": 589
  },
```

> The repo formats `drives.json` with each nested object expanded over multiple lines; after pasting, run the formatter (Step 4) to normalize. Ensure the entry immediately before the first inserted line ends with `},` and the last inserted entry ends with `},` (another entry follows) or `}` (if it becomes the final entry — it will not here since SSD entries follow).

- [ ] **Step 4: Format, then run tests**

Run: `rtk proxy npx biome format --write src/data/drives.json && rtk proxy npx vitest run tests/data/drives-db.spec.ts`
Expected: all tests PASS (HDD presence + SMR/HAMR coverage ≥ 2).

- [ ] **Step 5: Commit**

```bash
rtk git add src/data/drives.json tests/data/drives-db.spec.ts
rtk proxy git commit -m "feat(drives): add 20-30TB nearline HDDs (CMR/SMR/HAMR)"
```

---

### Task 3: Add 6 NVMe SSD entries (E1.L / E3.L rulers + PCIe5 TLC)

**Files:**
- Modify: `src/data/drives.json` (append 6 entries inside the `SSD_NVMe` group)
- Modify: `tests/data/drives-db.spec.ts` (add NVMe presence + form-factor coverage)

**Interfaces:**
- Produces IDs: `dc-nvme-pcie4-30720gb-qlc-e1l-ri`, `dc-nvme-pcie4-122880gb-qlc-e1l-ri`, `dc-nvme-pcie5-61440gb-qlc-e3l-ri`, `dc-nvme-pcie5-3840gb-tlc-e3s-mu`, `ent-nvme-pcie5-7680gb-tlc-u3-ri`, `ent-nvme-pcie5-1920gb-tlc-m2-ri`.

> **Note:** the two E1.L rulers are **PCIe4** — the only real ≥30 TB QLC E1.L rulers (Solidigm D5-P5336 family) are PCIe4; PCIe5 coverage is provided by the E3.L + the PCIe5 TLC entries. This is intentional and accurate.

- [ ] **Step 1: Write the failing NVMe test**

Append to `tests/data/drives-db.spec.ts`:

```ts
describe('new NVMe entries', () => {
  it('adds the ruler QLC and PCIe5 TLC drives', () => {
    const ids = [
      'dc-nvme-pcie4-30720gb-qlc-e1l-ri',
      'dc-nvme-pcie4-122880gb-qlc-e1l-ri',
      'dc-nvme-pcie5-61440gb-qlc-e3l-ri',
      'dc-nvme-pcie5-3840gb-tlc-e3s-mu',
      'ent-nvme-pcie5-7680gb-tlc-u3-ri',
      'ent-nvme-pcie5-1920gb-tlc-m2-ri',
    ]
    for (const id of ids) {
      const d = drives[id]
      expect(d, id).toBeDefined()
      expect(d.type).toBe('SSD_NVMe')
      expect(d.nandType === 'QLC' || d.nandType === 'TLC').toBe(true)
    }
  })

  it('represents E1.L and E3.L form factors', () => {
    const ff = (f: string) => Object.values(drives).some((d) => d.formFactor === f)
    expect(ff('E1.L')).toBe(true)
    expect(ff('E3.L')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it — fails**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "new NVMe entries"`
Expected: FAIL — ids undefined; E1.L/E3.L absent.

- [ ] **Step 3: Append the 6 NVMe entries to `src/data/drives.json`** (inside the `SSD_NVMe` group)

```json
  "dc-nvme-pcie4-30720gb-qlc-e1l-ri": {
    "id": "dc-nvme-pcie4-30720gb-qlc-e1l-ri",
    "model": "Datacenter NVMe PCIe4 E1.L 30.72TB QLC Read-Intensive",
    "type": "SSD_NVMe",
    "tier": "datacenter",
    "formFactor": "E1.L",
    "interface": "PCIe4",
    "nandType": "QLC",
    "capacity_raw": 30720000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 600000, "iops_write": 40000, "bandwidth_read_mb": 7000, "bandwidth_write_mb": 3000 },
    "reliability": { "ure_rate": 17, "afr": 0.44, "dwpd": 0.5, "mtbf_hours": 2000000 },
    "power": { "idle_watts": 5, "load_watts": 20 },
    "cost_usd": 2500
  },
  "dc-nvme-pcie4-122880gb-qlc-e1l-ri": {
    "id": "dc-nvme-pcie4-122880gb-qlc-e1l-ri",
    "model": "Datacenter NVMe PCIe4 E1.L 122.88TB QLC Read-Intensive",
    "type": "SSD_NVMe",
    "tier": "datacenter",
    "formFactor": "E1.L",
    "interface": "PCIe4",
    "nandType": "QLC",
    "capacity_raw": 122880000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 1000000, "iops_write": 38000, "bandwidth_read_mb": 7000, "bandwidth_write_mb": 2900 },
    "reliability": { "ure_rate": 17, "afr": 0.44, "dwpd": 0.55, "mtbf_hours": 2000000 },
    "power": { "idle_watts": 5, "load_watts": 25 },
    "cost_usd": 8000
  },
  "dc-nvme-pcie5-61440gb-qlc-e3l-ri": {
    "id": "dc-nvme-pcie5-61440gb-qlc-e3l-ri",
    "model": "Datacenter NVMe PCIe5 E3.L 61.44TB QLC Read-Intensive",
    "type": "SSD_NVMe",
    "tier": "datacenter",
    "formFactor": "E3.L",
    "interface": "PCIe5",
    "nandType": "QLC",
    "capacity_raw": 61440000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 800000, "iops_write": 40000, "bandwidth_read_mb": 12000, "bandwidth_write_mb": 3500 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 0.5, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5, "load_watts": 25 },
    "cost_usd": 4500
  },
  "dc-nvme-pcie5-3840gb-tlc-e3s-mu": {
    "id": "dc-nvme-pcie5-3840gb-tlc-e3s-mu",
    "model": "Datacenter NVMe PCIe5 E3.S 3.84TB TLC Mixed-Use",
    "type": "SSD_NVMe",
    "tier": "datacenter",
    "formFactor": "E3.S",
    "interface": "PCIe5",
    "nandType": "TLC",
    "capacity_raw": 3840000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 2000000, "iops_write": 350000, "bandwidth_read_mb": 12000, "bandwidth_write_mb": 6000 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 3, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 4, "load_watts": 14 },
    "cost_usd": 1000
  },
  "ent-nvme-pcie5-7680gb-tlc-u3-ri": {
    "id": "ent-nvme-pcie5-7680gb-tlc-u3-ri",
    "model": "Enterprise NVMe PCIe5 U.3 7.68TB TLC Read-Intensive",
    "type": "SSD_NVMe",
    "tier": "enterprise",
    "formFactor": "U.3",
    "interface": "PCIe5",
    "nandType": "TLC",
    "capacity_raw": 7680000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 2000000, "iops_write": 300000, "bandwidth_read_mb": 12000, "bandwidth_write_mb": 6000 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 1, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5, "load_watts": 15 },
    "cost_usd": 1800
  },
  "ent-nvme-pcie5-1920gb-tlc-m2-ri": {
    "id": "ent-nvme-pcie5-1920gb-tlc-m2-ri",
    "model": "Enterprise NVMe PCIe5 M.2 1.92TB TLC Read-Intensive",
    "type": "SSD_NVMe",
    "tier": "enterprise",
    "formFactor": "M.2",
    "interface": "PCIe5",
    "nandType": "TLC",
    "capacity_raw": 1920000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 800000, "iops_write": 65000, "bandwidth_read_mb": 6500, "bandwidth_write_mb": 3000 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 1, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 2, "load_watts": 8 },
    "cost_usd": 450
  },
```

- [ ] **Step 4: Format + test**

Run: `rtk proxy npx biome format --write src/data/drives.json && rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "new NVMe entries"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/data/drives.json tests/data/drives-db.spec.ts
rtk proxy git commit -m "feat(drives): add E1.L/E3.L QLC rulers and PCIe5 TLC NVMe"
```

---

### Task 4: Add 4 SAS/SATA SSD entries

**Files:**
- Modify: `src/data/drives.json` (2 entries in the `SSD_SAS` group, 2 in the `SSD_SATA` group)
- Modify: `tests/data/drives-db.spec.ts` (presence test)

**Interfaces:**
- Produces IDs: `ent-ssd-sas-7680gb-mu`, `ent-ssd-sas-15360gb-ri`, `ent-ssd-sata-960gb-mu`, `ent-ssd-sata-480gb-ri`.

- [ ] **Step 1: Write the failing test**

Append to `tests/data/drives-db.spec.ts`:

```ts
describe('new SAS/SATA SSD entries', () => {
  it('adds the mid-range SAS and small SATA SSDs', () => {
    const cases: Array<[string, string, number]> = [
      ['ent-ssd-sas-7680gb-mu', 'SSD_SAS', 7_680_000_000_000],
      ['ent-ssd-sas-15360gb-ri', 'SSD_SAS', 15_360_000_000_000],
      ['ent-ssd-sata-960gb-mu', 'SSD_SATA', 960_000_000_000],
      ['ent-ssd-sata-480gb-ri', 'SSD_SATA', 480_000_000_000],
    ]
    for (const [id, type, cap] of cases) {
      const d = drives[id]
      expect(d, id).toBeDefined()
      expect(d.type).toBe(type)
      expect(d.capacity_raw).toBe(cap)
      expect(d.nandType).toBe('TLC')
    }
  })
})
```

- [ ] **Step 2: Run it — fails**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "new SAS/SATA"`
Expected: FAIL — ids undefined.

- [ ] **Step 3: Append entries to `src/data/drives.json`** (SAS pair in the `SSD_SAS` group, SATA pair in the `SSD_SATA` group)

```json
  "ent-ssd-sas-7680gb-mu": {
    "id": "ent-ssd-sas-7680gb-mu",
    "model": "Enterprise SSD SAS 2.5\" 7.68TB Mixed-Use",
    "type": "SSD_SAS",
    "tier": "enterprise",
    "formFactor": "2.5\"",
    "interface": "SAS",
    "nandType": "TLC",
    "capacity_raw": 7680000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 720000, "iops_write": 200000, "bandwidth_read_mb": 4200, "bandwidth_write_mb": 3500 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 3, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 5, "load_watts": 18 },
    "cost_usd": 3200
  },
  "ent-ssd-sas-15360gb-ri": {
    "id": "ent-ssd-sas-15360gb-ri",
    "model": "Enterprise SSD SAS 2.5\" 15.36TB Read-Intensive",
    "type": "SSD_SAS",
    "tier": "enterprise",
    "formFactor": "2.5\"",
    "interface": "SAS",
    "nandType": "TLC",
    "capacity_raw": 15360000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 260000, "iops_write": 50000, "bandwidth_read_mb": 2100, "bandwidth_write_mb": 1400 },
    "reliability": { "ure_rate": 17, "afr": 0.35, "dwpd": 1, "mtbf_hours": 2500000 },
    "power": { "idle_watts": 3, "load_watts": 14 },
    "cost_usd": 4500
  },
  "ent-ssd-sata-960gb-mu": {
    "id": "ent-ssd-sata-960gb-mu",
    "model": "Enterprise SSD SATA 2.5\" 960GB Mixed-Use",
    "type": "SSD_SATA",
    "tier": "enterprise",
    "formFactor": "2.5\"",
    "interface": "SATA",
    "nandType": "TLC",
    "capacity_raw": 960000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 95000, "iops_write": 45000, "bandwidth_read_mb": 540, "bandwidth_write_mb": 420 },
    "reliability": { "ure_rate": 17, "afr": 0.29, "dwpd": 3, "mtbf_hours": 3000000 },
    "power": { "idle_watts": 2.5, "load_watts": 3.1 },
    "cost_usd": 160
  },
  "ent-ssd-sata-480gb-ri": {
    "id": "ent-ssd-sata-480gb-ri",
    "model": "Enterprise SSD SATA 2.5\" 480GB Read-Intensive",
    "type": "SSD_SATA",
    "tier": "enterprise",
    "formFactor": "2.5\"",
    "interface": "SATA",
    "nandType": "TLC",
    "capacity_raw": 480000000000,
    "sector_size": 4096,
    "performance": { "iops_read": 98000, "iops_write": 30000, "bandwidth_read_mb": 550, "bandwidth_write_mb": 520 },
    "reliability": { "ure_rate": 17, "afr": 0.44, "dwpd": 1, "mtbf_hours": 2000000 },
    "power": { "idle_watts": 1.3, "load_watts": 3.2 },
    "cost_usd": 90
  },
```

- [ ] **Step 4: Format + test**

Run: `rtk proxy npx biome format --write src/data/drives.json && rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "new SAS/SATA"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/data/drives.json tests/data/drives-db.spec.ts
rtk proxy git commit -m "feat(drives): add 24G-SAS TLC SSDs and small SATA TLC SSDs"
```

---

### Task 5: Backfill `nandType` on the 27 untagged existing SSDs

**Files:**
- Modify: `src/data/drives.json` (add a `nandType` field to 27 existing SSD entries — additive, no other field changes)
- Modify: `tests/data/drives-db.spec.ts` (assert every SSD now has `nandType`)

**Classification (explicit):**
- **QLC (4):** `ent-nvme-pcie4-30720gb-u3-ri`, `dc-nvme-pcie5-30720gb-e3s-ri`, `ent-ssd-sas-30720gb-ri` (all ≥30 TB read-intensive), and `con-ssd-sata-4tb-ri` (consumer, 0.3 DWPD).
- **TLC (23):** every other untagged SSD: `ent-nvme-pcie4-960gb-m2-ri`, `ent-nvme-pcie4-1600gb-u3-mu`, `ent-nvme-pcie4-1920gb-u2-ri`, `ent-nvme-pcie4-1920gb-u3-ri`, `dc-nvme-pcie5-1920gb-e1s-ri`, `ent-nvme-pcie4-3840gb-m2-ri`, `ent-nvme-pcie4-6400gb-u3-mu`, `ent-nvme-pcie4-6400gb-u2-mu`, `dc-nvme-pcie4-6400gb-e3s-mu`, `dc-nvme-pcie5-7680gb-e1s-ri`, `dc-nvme-pcie5-7680gb-e3s-ri`, `dc-nvme-pcie4-7680gb-e3s-ri`, `dc-nvme-pcie5-12800gb-u3-mu`, `ent-nvme-pcie4-15360gb-u2-ri`, `ent-ssd-sas-1600gb-wi`, `ent-ssd-sas-1920gb-ri`, `ent-ssd-sas-3200gb-mu`, `ent-ssd-sas-3200gb-wi`, `ent-ssd-sas-12800gb-mu`, `ent-ssd-sata-960gb-ri`, `ent-ssd-sata-1920gb-mu`, `ent-ssd-sata-3840gb-mu`, `ent-ssd-sata-7680gb-ri`.

- [ ] **Step 1: Write the failing test**

Append to `tests/data/drives-db.spec.ts`:

```ts
describe('SSD nandType coverage', () => {
  it('every SSD has a nandType', () => {
    for (const d of Object.values(drives)) {
      if (d.type.startsWith('SSD')) expect(d.nandType, `${d.id} nandType`).toBeDefined()
    }
  })

  it('TLC is well represented and the 30TB+ read-intensive drives are QLC', () => {
    const tlc = Object.values(drives).filter((d) => d.nandType === 'TLC').length
    expect(tlc).toBeGreaterThanOrEqual(20)
    for (const id of [
      'ent-nvme-pcie4-30720gb-u3-ri',
      'dc-nvme-pcie5-30720gb-e3s-ri',
      'ent-ssd-sas-30720gb-ri',
      'con-ssd-sata-4tb-ri',
    ]) {
      expect(drives[id].nandType, id).toBe('QLC')
    }
  })
})
```

- [ ] **Step 2: Run it — fails**

Run: `rtk proxy npx vitest run tests/data/drives-db.spec.ts -t "nandType"`
Expected: FAIL — untagged SSDs have no `nandType`.

- [ ] **Step 3: Add the `nandType` field to each of the 27 entries**

For each id in the **QLC** list, add `"nandType": "QLC",` and for each in the **TLC** list add `"nandType": "TLC",`. Place the field on its own line immediately **after the entry's `"interface": ...,` line** (matching where existing tagged SSDs carry it, e.g. `dc-nvme-pcie4-61440gb-qlc-u2-ri`). Change no other field. Example (for `ent-ssd-sata-7680gb-ri`):

```json
    "interface": "SATA",
    "nandType": "TLC",
    "capacity_raw": 7680000000000,
```

Helper to locate each entry's line: `rtk proxy grep -n '"ent-ssd-sata-7680gb-ri"' src/data/drives.json`. Apply to all 27 ids (4 QLC + 23 TLC).

- [ ] **Step 4: Format + test + typecheck**

Run: `rtk proxy npx biome format --write src/data/drives.json && rtk proxy npx vitest run tests/data/drives-db.spec.ts && rtk tsc`
Expected: all PASS; `TypeScript: No errors found`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/data/drives.json tests/data/drives-db.spec.ts
rtk proxy git commit -m "feat(drives): backfill nandType (TLC/QLC) on existing SSDs"
```

---

### Task 6: Full quality gate + docs sync + manual smoke

**Files:**
- Modify: `CHANGELOG.md` (new `### Added` bullet under a new patch section), `package.json` (version bump), `docs/ARCHITECTURE.md` (drive-DB note if one exists; otherwise skip)

**Interfaces:** none (verification + release-notes only).

- [ ] **Step 1: Run the full gate**

Run: `rtk tsc && rtk proxy npx biome check && rtk proxy npx vitest run && rtk proxy npm run build`
Expected: typecheck clean, lint clean, **all tests pass** (engines consume the new drives with no NaN/zero-state regressions — the existing engine suites exercise the DB), build succeeds.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `rtk proxy npm run dev`, then in the app: the drive picker lists the new entries; the **EDSFF** form-factor filter now returns E1.L / E3.L drives; the capacity sort shows the new 20–30 TB HDD and 122.88 TB NVMe points; a tiered S2D/vSAN config can pick the new ruler QLC as a capacity tier. Confirm no console errors.

- [ ] **Step 3: Update CHANGELOG + version**

Bump `package.json` `version` (patch, e.g. `1.10.1`). Add to `CHANGELOG.md` under a new dated section:

```markdown
## [1.10.1] - <date>

### Added
- Expanded the drive database: 20–30 TB nearline HDDs (CMR/SMR/HAMR), 24G-SAS TLC SSDs, small SATA TLC SSDs, and E1.L/E3.L QLC NVMe rulers up to 122.88 TB. Backfilled NAND cell type (TLC/QLC) on all SSDs and removed the unused AIC form factor.
```

- [ ] **Step 4: Commit**

```bash
rtk git add CHANGELOG.md package.json
rtk proxy git commit -m "chore(release): drive database expansion (1.10.1)"
```

- [ ] **Step 5: Release (standard flow, no squash)**

Push the branch, open a PR to `main`, enable auto-merge with a **merge commit** (`gh pr merge --auto --merge` — never `--squash`), then after merge tag `vX.Y.Z` and push the tag (triggers `web-release`).

---

## Self-Review

**Spec coverage:** ✅ ~15 new entries (Tasks 2–4: 5 HDD + 6 NVMe + 4 SSD = 15); ✅ TLC backfill on existing SSDs (Task 5, 27 entries — corrects the spec's "44", which counted HDDs); ✅ AIC prune (Task 1); ✅ no `DriveType` change; ✅ deferred 14 TB / 6.4 TB holes (not added). Spec's "28 TB SAS HAMR" corrected to SATA (no SAS HAMR product exists) — noted in Task 2.

**Placeholder scan:** No TBD/TODO; every JSON entry and test is complete with concrete values.

**Type consistency:** All `ure_rate` ∈ {15,17}; all new `formFactor`/`interface`/`type`/`nandType` values are members of their unions (post-AIC-prune `FormFactor` still contains every form factor used). Test helper names (`drives`, `all`) are defined once in Task 1 and reused. IDs referenced in tests exactly match the IDs in the JSON entries.
