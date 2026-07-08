# Longhorn Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SUSE Longhorn (Kubernetes distributed block storage) as a first-class forward topology in Raidy, modeled on Ceph replicated pools, with replica-aware capacity, free-space + snapshot guardrails, and advisory growth/over-provisioning readouts.

**Architecture:** Longhorn is a replicated block topology (`1/R` efficiency, one replica per node). Capacity flows through the existing volumetry engine: redundancy (`1/R`) → free-space guardrail (`F = 1 − minimalAvailable%`) → snapshot reserve (`÷S`) → host filesystem overhead. Growth (`G`) and over-provisioning are surfaced as advisory readouts, never subtracted. Performance/resilience reuse Ceph's replication patterns.

**Tech Stack:** TypeScript (strict), Vitest, Zustand, React + react-i18next, Biome.

**Design doc:** `docs/superpowers/specs/2026-07-08-longhorn-support-design.md` · **Issue:** #51 · **Branch:** `feat/longhorn-support`

## Global Constraints

- **Two replica levels only:** `longhorn_r2` (`1/2`) and `longhorn_r3` (`1/3`). No `longhorn_r1` in v1.
- **`F` = `1 − minimalAvailablePercent/100`** (Longhorn "Storage Minimal Available %", default 25 root / 10 dedicated).
- **`S` (snapshotHeadroom) ≥ 1.0**, default 1.20 — subtracts from usable. **`G` (growthHeadroom) ≥ 1.0**, default 1.20 — advisory only.
- **`DEFAULT_LONGHORN_OPTIONS`** = `{ diskMode: 'dedicated', minimalAvailablePercent: 10, snapshotHeadroom: 1.2, growthHeadroom: 1.2, overProvisioningPercent: 200 }`.
- **Over-provisioning is display-only** — never a capacity multiplier.
- **No compression/dedup** for Longhorn (block storage; `applyCompressionDedup` already returns `usableCapacity` unchanged via its fallthrough — do NOT add a Longhorn branch there).
- **Host filesystem overhead is included** via `resolveFilesystemOverhead`'s existing `default` branch (`getFsTypeOverhead(fsType)`) — do NOT add a `case 'longhorn'` there.
- **`serverCount ≥ R`** is required (replica placement); otherwise a zero-state result.
- **Docs stay in sync in the same change** (per CLAUDE.md): ARCHITECTURE, CLAUDE.md platform list, CHANGELOG, README.
- **Commands:** `npm run typecheck`, `npm test`, `npm run lint:fix`. Prefix git with `rtk`.
- **`driveCount` inside `calculateVolumetry` is cluster-total** (the `useVolumetryCalc` hook passes `driveCount × serverCount`). Tests call `calculateVolumetry` directly, so pass the cluster-total count.

---

### Task 1: Recognize Longhorn across all engines (parity-level capacity)

Introduce the `longhorn` topology type, both engine strategies, store state, and input plumbing. After this task a `longhorn_r3` config computes `usable = raw × (1/R) − fsOverhead` (guardrails come in Task 2). This is the atomic compile unit: adding `'longhorn'` to `TopologyType` breaks the two exhaustive `getStrategy` switches, so both strategies + cases land together.

**Files:**
- Modify: `src/types/topology.ts` (add level union, `TopologyType` member, `Topology` member, `LonghornOptions`, `DEFAULT_LONGHORN_OPTIONS`, `HBA_REQUIRED_TOPOLOGIES`)
- Modify: `src/types/config.ts:81` area (add `longhornOptions` to `TopologyState`)
- Modify: `src/types/index.ts` (re-export `LonghornOptions`, `DEFAULT_LONGHORN_OPTIONS`)
- Create: `src/engines/volumetry/strategies/longhorn.ts`
- Modify: `src/engines/volumetry/helpers/calculationHelpers.ts` (`VALID_TOPOLOGY_TYPES` + `getStrategy`)
- Create: `src/engines/performance/strategies/longhorn.ts`
- Modify: `src/engines/performance/index.ts` (`getStrategy`)
- Modify: `src/engines/performance/utils.ts` (`calculateEstimatedLatency` case)
- Modify: `src/workers/resilienceWorker.ts` (`getParityDrives` cases)
- Modify: `src/engines/volumetry/index.ts` (`VolumetryInput` gains `longhornOptions`; destructure it — not yet consumed)
- Modify: `src/store/slices/topologySlice.ts` (state + setter + interface)
- Modify: `src/hooks/useVolumetryCalc.ts` (destructure + pass `longhornOptions`)
- Test: `tests/engines/volumetry/longhorn.spec.ts` (create) + `tests/engines/volumetry.spec.ts` (`createInput` helper)

**Interfaces:**
- Produces: `type LonghornTopology = 'longhorn_r2' | 'longhorn_r3'`
- Produces: `interface LonghornOptions { diskMode: 'dedicated' | 'root'; minimalAvailablePercent: number; snapshotHeadroom: number; growthHeadroom: number; overProvisioningPercent: number }`
- Produces: `const DEFAULT_LONGHORN_OPTIONS: LonghornOptions`
- Produces: `const longhornStrategy: VolumetryStrategy` (`calculateDataFraction(level) → 1/R`)
- Produces: `const longhornPerformanceStrategy: PerformanceStrategy`
- Produces: `VolumetryInput.longhornOptions: LonghornOptions` (required field)

- [ ] **Step 1: Write the failing test**

Create `tests/engines/volumetry/longhorn.spec.ts`. Uses `minimalAvailablePercent: 0` and `snapshotHeadroom: 1` (neutral guardrails) so the assertions stay valid after Task 2 adds guardrail math.

```ts
import { describe, expect, it } from 'vitest'
import { calculateVolumetry, type VolumetryInput } from '@/engines/volumetry'
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
  type LonghornOptions,
  type Topology,
} from '@/types'
import type { Drive } from '@/types/drive'

const testDrive: Drive = {
  id: 'test-1tb',
  model: 'Test Drive 1TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  capacity_raw: 1_000_000_000_000,
  sector_size: 512,
  performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
  reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
  power: { idle_watts: 5, load_watts: 10 },
  cost_usd: 100,
}

function createLonghornInput(
  driveCount: number,
  topology: Topology,
  serverCount: number,
  longhornOptions: LonghornOptions,
  compressionRatio = 1.0,
): VolumetryInput {
  return {
    drive: testDrive,
    driveCount,
    hotSpares: 0,
    serverCount,
    topology,
    zfsOptions: DEFAULT_ZFS_OPTIONS,
    s2dOptions: DEFAULT_S2D_OPTIONS,
    vsanOptions: DEFAULT_VSAN_OPTIONS,
    objectscaleOptions: DEFAULT_OBJECTSCALE_OPTIONS,
    powerstoreOptions: DEFAULT_POWERSTORE_OPTIONS,
    powerscaleOptions: DEFAULT_POWERSCALE_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    netAppOptions: DEFAULT_NETAPP_OPTIONS,
    synologyOptions: DEFAULT_SYNOLOGY_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    powervaultOptions: DEFAULT_POWERVAULT_OPTIONS,
    longhornOptions,
    compressionRatio,
    dedupRatio: 1.0,
    fsType: 'xfs', // xfs = 1% overhead (FILESYSTEM_OVERHEAD.xfs = 0.01)
  }
}

describe('Volumetry Engine - Longhorn (recognition)', () => {
  it('longhorn_r3 yields ~1/3 efficiency (parity only, guardrails neutral)', () => {
    const neutral: LonghornOptions = {
      ...DEFAULT_LONGHORN_OPTIONS,
      minimalAvailablePercent: 0, // F = 1
      snapshotHeadroom: 1, // S = 1
    }
    // 18 drives × 1 TB = 18 TB raw; R3 → 6 TB after parity; ×0.99 xfs = 5.94 TB
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, neutral)
    const result = calculateVolumetry(input)
    expect(result.rawCapacity).toBe(18_000_000_000_000)
    expect(result.usableCapacity / 1e12).toBeCloseTo(5.94, 4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/engines/volumetry/longhorn.spec.ts`
Expected: FAIL — `DEFAULT_LONGHORN_OPTIONS` / `LonghornOptions` not exported, and `'longhorn'` not assignable to `Topology`.

- [ ] **Step 3: Add Longhorn types to `src/types/topology.ts`**

After the `CephTopology` block (ends line ~92), add:

```ts
/** SUSE Longhorn topologies (Kubernetes distributed block storage, replicated) */
export type LonghornTopology =
  | 'longhorn_r2' // 2 replicas, 50% efficiency
  | 'longhorn_r3' // 3 replicas, 33% efficiency
```

In `TopologyType` (after `'ceph'`, line ~127) add:

```ts
  | 'longhorn'
```

In the `Topology` union (after the `ceph` member, line ~143) add:

```ts
  | { type: 'longhorn'; level: LonghornTopology }
```

After the `CephOptions` interface (ends line ~427) add:

```ts
/** SUSE Longhorn configuration options */
export interface LonghornOptions {
  /** Disk deployment model — presets the fields below */
  diskMode: 'dedicated' | 'root'
  /** Longhorn "Storage Minimal Available %" (0–100) → free-space factor F = 1 − pct/100 */
  minimalAvailablePercent: number
  /** Snapshot headroom S ≥ 1.0 — reserves physical snapshot-chain space */
  snapshotHeadroom: number
  /** Growth headroom G ≥ 1.0 — advisory only, never subtracted from usable */
  growthHeadroom: number
  /** Storage Over-Provisioning % — advisory display only (thin-provisioning scheduling) */
  overProvisioningPercent: number
}
```

After `DEFAULT_CEPH_OPTIONS` (ends line ~614) add:

```ts
/** Default Longhorn options (dedicated-disk production preference) */
export const DEFAULT_LONGHORN_OPTIONS: LonghornOptions = {
  diskMode: 'dedicated',
  minimalAvailablePercent: 10,
  snapshotHeadroom: 1.2,
  growthHeadroom: 1.2,
  overProvisioningPercent: 200,
}
```

In `HBA_REQUIRED_TOPOLOGIES` (line ~239) add `'longhorn',` to the array (software-defined storage needs direct disk access).

- [ ] **Step 4: Add `longhornOptions` to `TopologyState`**

In `src/types/config.ts`, after `cephOptions: CephOptions` (line ~81) add:

```ts
  longhornOptions: LonghornOptions
```

Ensure `LonghornOptions` is imported in `config.ts` (add it to the existing `import type { … } from './topology'` group alongside `CephOptions`).

- [ ] **Step 5: Re-export the new types**

In `src/types/index.ts`, add `LonghornOptions,` next to `CephOptions,` (line ~50, the type re-export group) and `DEFAULT_LONGHORN_OPTIONS,` next to `DEFAULT_CEPH_OPTIONS,` (line ~87, the value re-export group).

- [ ] **Step 6: Create the volumetry strategy**

Create `src/engines/volumetry/strategies/longhorn.ts`:

```ts
/**
 * Longhorn volumetry strategy.
 *
 * Longhorn replicates each volume to R full copies (one per node), so raw
 * efficiency is 1/R — identical in shape to Ceph replicated pools. Free-space
 * and snapshot guardrails are applied as post-calculation reductions in the
 * main volumetry engine (see index.ts), mirroring Ceph's safe-capacity factor.
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

export const longhornStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string): number {
    switch (level) {
      case 'longhorn_r2':
        return 1 / 2 // 2 replicas: 50% efficiency
      case 'longhorn_r3':
        return 1 / 3 // 3 replicas: 33% efficiency
      default:
        return 1 / 3 // Safe default: 3-way replication
    }
  },
}
```

- [ ] **Step 7: Register the volumetry strategy**

In `src/engines/volumetry/helpers/calculationHelpers.ts`:
- Add the import after the `cephStrategy` import (line ~19): `import { longhornStrategy } from '../strategies/longhorn'`
- Add `'longhorn',` to `VALID_TOPOLOGY_TYPES` (after `'ceph',`, line ~40).
- Add to the `getStrategy` switch, after the `case 'ceph':` block (line ~67):

```ts
    case 'longhorn':
      return longhornStrategy
```

- [ ] **Step 8: Create the performance strategy**

Create `src/engines/performance/strategies/longhorn.ts`:

```ts
import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Longhorn performance strategy.
 *
 * Synchronous replication: each write is mirrored to R replicas across nodes,
 * so the write penalty equals the replica count (like Ceph replicated pools).
 * Reads scale with the number of drives (OSD-equivalent).
 */
export const longhornPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'longhorn_r2':
        return 2.0 // 2-way replication
      case 'longhorn_r3':
        return 3.0 // 3-way replication
      default:
        return 3.0
    }
  },

  calculateIOPS(
    level: string,
    driveCount: number,
    driveIOPS: number,
    readPercent: number,
  ): number {
    const writePenalty = this.getWritePenalty(level)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction
    const readIOPS = driveCount * driveIOPS * readFraction
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty
    return readIOPS + writeIOPS
  },
}
```

- [ ] **Step 9: Register the performance strategy**

In `src/engines/performance/index.ts`:
- Add the import after `cephPerformanceStrategy` (line ~26): `import { longhornPerformanceStrategy } from './strategies/longhorn'`
- Add to the `getStrategy` switch, after `case 'ceph':` (line ~95):

```ts
    case 'longhorn':
      return longhornPerformanceStrategy
```

- [ ] **Step 10: Add Longhorn latency case**

In `src/engines/performance/utils.ts`, in `calculateEstimatedLatency`'s switch, after the `case 'ceph':` block (line ~172) add:

```ts
    case 'longhorn':
      // Longhorn synchronous replication: replica writes cross the network,
      // like Ceph replicated pools (2× media + network + replication CPU).
      return mediaLatency * 2 + networkLatency + CPU_OVERHEAD_US.replication
```

- [ ] **Step 11: Add Longhorn resilience mapping**

In `src/workers/resilienceWorker.ts`, in `getParityDrives`, after the NetApp lines (line ~64) add:

```ts
  // Longhorn (replicated block storage): tolerates R-1 replica failures
  if (level === 'longhorn_r2') return 1
  if (level === 'longhorn_r3') return 2
```

- [ ] **Step 12: Add `longhornOptions` to `VolumetryInput`**

In `src/engines/volumetry/index.ts`:
- Add `LonghornOptions,` to the `import type { … } from '@/types/topology'` group (near `CephOptions`).
- Add to the `VolumetryInput` interface, after `cephOptions: CephOptions` (line ~53): `longhornOptions: LonghornOptions`
- Add `longhornOptions,` to the destructuring block inside `calculateVolumetry` (after `cephOptions,`, line ~84). It is not consumed yet (Task 2 consumes it); this keeps the type complete.

- [ ] **Step 13: Wire the store slice**

In `src/store/slices/topologySlice.ts`:
- Add `LonghornOptions,` to the `import type { … } from '@/types'` group (near `CephOptions`).
- Add `DEFAULT_LONGHORN_OPTIONS,` to the `import { … } from '@/types'` value group (near `DEFAULT_CEPH_OPTIONS`).
- Add to the `TopologySlice` interface, after `setCephOptions` (line ~51): `setLonghornOptions: (options: Partial<LonghornOptions>) => void`
- Add initial state after `cephOptions: { ...DEFAULT_CEPH_OPTIONS },` (line ~70): `longhornOptions: { ...DEFAULT_LONGHORN_OPTIONS },`
- Add the setter after `setCephOptions` (line ~125):

```ts
  setLonghornOptions: (options) =>
    set((state) => ({ longhornOptions: { ...state.longhornOptions, ...options } })),
```

- [ ] **Step 14: Plumb through `useVolumetryCalc`**

In `src/hooks/useVolumetryCalc.ts`:
- Add `longhornOptions,` to the `useConfigStore()` destructuring (after `cephOptions,`, line ~36).
- Add `longhornOptions,` to the `calculateVolumetry({ … })` call (after `cephOptions,`, line ~87).

- [ ] **Step 15: Update the shared test helper**

In `tests/engines/volumetry.spec.ts`, add `DEFAULT_LONGHORN_OPTIONS,` to the `@/types` import group, and add `longhornOptions: DEFAULT_LONGHORN_OPTIONS,` to the object returned by `createInput` (after `cephOptions: DEFAULT_CEPH_OPTIONS,`, line ~92).

- [ ] **Step 16: Run typecheck, tests, and commit**

Run: `npm run typecheck` — Expected: no errors.
Run: `npm test -- tests/engines/volumetry/longhorn.spec.ts` — Expected: PASS.
Run: `npm test` — Expected: all existing suites still PASS.
Run: `npm run lint:fix`

```bash
rtk git add -A
rtk git commit -m "feat(longhorn): recognize Longhorn topology across engines (#51)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Longhorn capacity guardrails + advisory readouts

Consume `longhornOptions` in the engine: apply the free-space factor `F` and snapshot reserve `S`, populate `LonghornCapacityDetails` (physical usable, recommended committed data, per-node allocation, guardrails), add breakdown slices, and enforce `serverCount ≥ R`.

**Files:**
- Modify: `src/types/results.ts` (`LonghornCapacityDetails` + `VolumetryResult.longhornDetails`)
- Modify: `src/engines/volumetry/index.ts` (guardrail reductions, details, breakdown wiring, validation call)
- Modify: `src/engines/volumetry/breakdown/buildBreakdown.ts` (two new slices)
- Modify: `src/engines/volumetry/validation/inputValidation.ts` (`validateReplicaPlacement`)
- Test: `tests/engines/volumetry/longhorn.spec.ts` (extend)

**Interfaces:**
- Consumes: `VolumetryInput.longhornOptions`, `longhornStrategy` (Task 1).
- Produces: `interface LonghornCapacityDetails { physicalUsable: number; recommendedCommittedData: number; perNodeUsable: number; replicaCount: number; minimalAvailablePercent: number; overProvisioningPercent: number; diskMode: 'dedicated' | 'root' }`
- Produces: `VolumetryResult.longhornDetails?: LonghornCapacityDetails`
- Produces: `function validateReplicaPlacement(topology, drive, driveCount, serverCount): VolumetryResult | null`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engines/volumetry/longhorn.spec.ts`:

```ts
describe('Volumetry Engine - Longhorn (capacity guardrails)', () => {
  // 18 TB raw, R3, F=0.75 (minAvail 25), S=1.2, G=1.2, xfs 1%
  //   afterParity = 6.0 ; afterFs = 5.94 ; ×0.75 = 4.455 ; ÷1.2 = 3.7125 usable
  //   committed = 3.7125 / 1.2 = 3.09375 ; perNode = 3.7125 / 3 = 1.2375
  const opts = {
    diskMode: 'root' as const,
    minimalAvailablePercent: 25,
    snapshotHeadroom: 1.2,
    growthHeadroom: 1.2,
    overProvisioningPercent: 100,
  }

  it('applies free-space + snapshot reserves to physical usable', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts)
    const result = calculateVolumetry(input)
    expect(result.usableCapacity / 1e12).toBeCloseTo(3.7125, 4)
    expect(result.longhornDetails?.physicalUsable ?? 0).toBeCloseTo(3.7125e12, -8)
  })

  it('reports recommended committed data (÷ growth) and per-node allocation', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts)
    const d = calculateVolumetry(input).longhornDetails
    expect((d?.recommendedCommittedData ?? 0) / 1e12).toBeCloseTo(3.09375, 4)
    expect((d?.perNodeUsable ?? 0) / 1e12).toBeCloseTo(1.2375, 4)
    expect(d?.replicaCount).toBe(3)
    expect(d?.overProvisioningPercent).toBe(100)
  })

  it('R2 usable is exactly 1.5× R3 usable (same inputs)', () => {
    const r2 = calculateVolumetry(
      createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r2' }, 3, opts),
    ).usableCapacity
    const r3 = calculateVolumetry(
      createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts),
    ).usableCapacity
    expect(r2 / r3).toBeCloseTo(1.5, 5)
  })

  it('applies no compression/dedup (effective === usable)', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts, 2.0)
    const result = calculateVolumetry(input)
    expect(result.effectiveCapacity).toBe(result.usableCapacity)
  })

  it('returns zero-state when serverCount < replica count', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 2, opts)
    const result = calculateVolumetry(input)
    expect(result.usableCapacity).toBe(0)
    expect(result.rawCapacity).toBe(18_000_000_000_000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/engines/volumetry/longhorn.spec.ts`
Expected: FAIL — `longhornDetails` undefined, guardrails not applied, no zero-state on `serverCount < R`.

- [ ] **Step 3: Add the result type**

In `src/types/results.ts`, add after the `ZfsCapacityDetails` interface (line ~64):

```ts
/** Longhorn-specific capacity breakdown and advisory sizing readouts */
export interface LonghornCapacityDetails {
  /** Physical usable app-data ceiling incl. snapshots, in bytes */
  physicalUsable: number
  /** Recommended committed data today (physicalUsable ÷ growthHeadroom), in bytes */
  recommendedCommittedData: number
  /** Per-node usable allocation (physicalUsable ÷ serverCount), in bytes */
  perNodeUsable: number
  /** Replica count (2 or 3) */
  replicaCount: number
  /** Storage Minimal Available % guardrail */
  minimalAvailablePercent: number
  /** Storage Over-Provisioning % (advisory display) */
  overProvisioningPercent: number
  /** Disk deployment model */
  diskMode: 'dedicated' | 'root'
}
```

Add to `VolumetryResult`, after `zfsDetails?: ZfsCapacityDetails` (line ~31):

```ts
  /** Longhorn-specific detailed capacity breakdown (only present when topology is Longhorn) */
  longhornDetails?: LonghornCapacityDetails
```

- [ ] **Step 4: Add the replica-placement validator**

In `src/engines/volumetry/validation/inputValidation.ts`, add after `validateTopology` (line ~66):

```ts
/**
 * Validate Longhorn replica placement: a cluster needs at least R storage nodes
 * to place R replicas. Returns a zero-state result (with raw capacity preserved)
 * when serverCount < replica count, else null.
 */
export function validateReplicaPlacement(
  topology: Topology | null | undefined,
  drive: Drive | null | undefined,
  driveCount: number,
  serverCount: number,
): VolumetryResult | null {
  if (topology?.type !== 'longhorn') return null
  const replicas = topology.level === 'longhorn_r3' ? 3 : 2
  if (serverCount < replicas) {
    const rawCapacity = drive?.capacity_raw ? drive.capacity_raw * driveCount : 0
    return createZeroStateResult(`Need ≥ ${replicas} nodes for ${replicas} replicas`, rawCapacity)
  }
  return null
}
```

- [ ] **Step 5: Call the validator in the engine**

In `src/engines/volumetry/index.ts`:
- Add `validateReplicaPlacement` to the import from `./validation/inputValidation` (line ~35).
- After the existing `validateTopology` guard (line ~98) add:

```ts
  // Longhorn requires serverCount >= replica count for replica placement
  const replicaValidation = validateReplicaPlacement(topology, drive, driveCount, serverCount)
  if (replicaValidation) return replicaValidation
```

- [ ] **Step 6: Apply guardrail reductions**

In `src/engines/volumetry/index.ts`, immediately after the Ceph safe-capacity block (ends line ~236, `usableCapacity = usableCapacity * cephOptions.safeCapacityThreshold`), add:

```ts
  // Longhorn guardrails: free-space reserve (F = 1 − minimalAvailable%) then snapshot reserve (÷S).
  // Growth and over-provisioning are advisory only (see longhornDetails), never subtracted here.
  let longhornFreeSpaceReserve = 0
  let longhornSnapshotReserve = 0
  if (topology.type === 'longhorn' && longhornOptions) {
    const freeSpaceFactor = 1 - longhornOptions.minimalAvailablePercent / 100
    const beforeFreeSpace = usableCapacity
    usableCapacity = usableCapacity * freeSpaceFactor
    longhornFreeSpaceReserve = beforeFreeSpace - usableCapacity

    const beforeSnapshot = usableCapacity
    usableCapacity = usableCapacity / longhornOptions.snapshotHeadroom
    longhornSnapshotReserve = beforeSnapshot - usableCapacity
  }
```

- [ ] **Step 7: Build the details object**

In `src/engines/volumetry/index.ts`:
- Add `LonghornCapacityDetails,` to the `import type { … } from '@/types/results'` group (line ~10, alongside `ZfsCapacityDetails`).
- After the `buildZfsDetails` block (ends line ~305), add:

```ts
  // Build Longhorn-specific advisory details if Longhorn topology
  let longhornDetails: LonghornCapacityDetails | undefined
  if (topology.type === 'longhorn' && longhornOptions) {
    longhornDetails = {
      physicalUsable: usableCapacity,
      recommendedCommittedData: usableCapacity / longhornOptions.growthHeadroom,
      perNodeUsable: serverCount > 0 ? usableCapacity / serverCount : usableCapacity,
      replicaCount: topology.level === 'longhorn_r3' ? 3 : 2,
      minimalAvailablePercent: longhornOptions.minimalAvailablePercent,
      overProvisioningPercent: longhornOptions.overProvisioningPercent,
      diskMode: longhornOptions.diskMode,
    }
  }
```

- Add `longhornDetails,` to the returned object (after `zfsDetails,`, line ~317).

- [ ] **Step 8: Add breakdown slices**

In `src/engines/volumetry/breakdown/buildBreakdown.ts`:
- Add to `BreakdownInput` (after `cephSafeCapacityReduction: number`, line ~40):

```ts
  longhornFreeSpaceReserve: number
  longhornSnapshotReserve: number
```

- Add both to the destructuring block (after `cephSafeCapacityReduction,`, line ~88):

```ts
    longhornFreeSpaceReserve,
    longhornSnapshotReserve,
```

- After the `cephSafeCapacityReduction` push block (ends line ~251), add:

```ts
  if (longhornFreeSpaceReserve > 0) {
    breakdown.push({
      label: 'Longhorn Free-Space Reserve',
      bytes: longhornFreeSpaceReserve,
      percent: (longhornFreeSpaceReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (longhornSnapshotReserve > 0) {
    breakdown.push({
      label: 'Longhorn Snapshot Reserve',
      bytes: longhornSnapshotReserve,
      percent: (longhornSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }
```

- In `src/engines/volumetry/index.ts`, pass both into the `buildBreakdown({ … })` call (after `cephSafeCapacityReduction,`, line ~283):

```ts
    longhornFreeSpaceReserve,
    longhornSnapshotReserve,
```

- [ ] **Step 9: Run tests and commit**

Run: `npm test -- tests/engines/volumetry/longhorn.spec.ts` — Expected: PASS (all 6 tests).
Run: `npm run typecheck` — Expected: no errors.
Run: `npm test` — Expected: all suites PASS.
Run: `npm run lint:fix`

```bash
rtk git add -A
rtk git commit -m "feat(longhorn): capacity guardrails, advisory readouts, replica validation (#51)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: UI panel, topology selectors, and i18n

Expose Longhorn in the topology selector, add its levels, render an options panel, and add translations for all four languages.

**Files:**
- Modify: `src/components/inputs/topology-options/topologyConstants.ts` (`TOPOLOGY_TYPES`, `TOPOLOGY_LEVELS.longhorn`)
- Create: `src/components/inputs/topology-options/LonghornOptionsPanel.tsx`
- Modify: `src/components/inputs/TopologyPanel.tsx` (import + render)
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json` (type label + `longhorn` options block)
- Test: `tests/components/longhornConstants.spec.ts` (create)

**Interfaces:**
- Consumes: `useConfigStore().longhornOptions`, `setLonghornOptions` (Task 1); `DEFAULT_LONGHORN_OPTIONS`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/longhornConstants.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TOPOLOGY_LEVELS, TOPOLOGY_TYPES } from '@/components/inputs/topology-options/topologyConstants'

describe('Longhorn topology constants', () => {
  it('exposes Longhorn in the type selector', () => {
    expect(TOPOLOGY_TYPES.some((t) => t.value === 'longhorn')).toBe(true)
  })

  it('defines exactly the two replica levels', () => {
    const values = TOPOLOGY_LEVELS.longhorn.map((l) => l.value)
    expect(values).toEqual(['longhorn_r2', 'longhorn_r3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/longhornConstants.spec.ts`
Expected: FAIL — `TOPOLOGY_LEVELS.longhorn` is undefined.

- [ ] **Step 3: Add topology type and levels**

In `src/components/inputs/topology-options/topologyConstants.ts`:
- Add to `TOPOLOGY_TYPES`, after the Ceph entry (line ~11): `{ value: 'longhorn', label: 'Longhorn' },`
- Add a `longhorn` key to `TOPOLOGY_LEVELS`, after the `ceph` block (line ~252):

```ts
  longhorn: [
    {
      value: 'longhorn_r2',
      label: 'Replica 2',
      description: '2 replicas, 50% efficiency (efficiency-oriented)',
    },
    {
      value: 'longhorn_r3',
      label: 'Replica 3',
      description: '3 replicas, 33% efficiency (default, needs ≥3 nodes)',
    },
  ],
```

- [ ] **Step 4: Create the options panel**

Create `src/components/inputs/topology-options/LonghornOptionsPanel.tsx`:

```tsx
/**
 * Longhorn topology options panel.
 *
 * Controls: disk mode (presets guardrails), minimal-available %, snapshot &
 * growth headroom, and over-provisioning % (advisory).
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'

export function LonghornOptionsPanel() {
  const { t } = useTranslation('topology')
  const { longhornOptions, setLonghornOptions } = useConfigStore()

  const setDiskMode = (mode: 'dedicated' | 'root') => {
    // Presets follow Longhorn best practice: dedicated → 10% + 200%, root → 25% + 100%.
    setLonghornOptions(
      mode === 'dedicated'
        ? { diskMode: mode, minimalAvailablePercent: 10, overProvisioningPercent: 200 }
        : { diskMode: mode, minimalAvailablePercent: 25, overProvisioningPercent: 100 },
    )
  }

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('longhorn.title')}
      </h4>

      <div className="space-y-2">
        <Label>{t('longhorn.diskMode')}</Label>
        <SegmentedControl
          value={longhornOptions.diskMode}
          options={[
            { value: 'dedicated', label: t('longhorn.dedicated') },
            { value: 'root', label: t('longhorn.root') },
          ]}
          onChange={(v) => setDiskMode(v as 'dedicated' | 'root')}
        />
        <p className="text-xs text-slate-500">
          {longhornOptions.diskMode === 'dedicated'
            ? t('longhorn.dedicatedHint')
            : t('longhorn.rootHint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-min-avail">{t('longhorn.minimalAvailable')}</Label>
        <Slider
          id="longhorn-min-avail"
          value={longhornOptions.minimalAvailablePercent}
          min={0}
          max={30}
          onChange={(v) => setLonghornOptions({ minimalAvailablePercent: v })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.minimalAvailableValue', { pct: longhornOptions.minimalAvailablePercent })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-snapshot">{t('longhorn.snapshotHeadroom')}</Label>
        <Slider
          id="longhorn-snapshot"
          value={Math.round(longhornOptions.snapshotHeadroom * 100)}
          min={100}
          max={200}
          onChange={(v) => setLonghornOptions({ snapshotHeadroom: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.snapshotHeadroomValue', {
            pct: Math.round((longhornOptions.snapshotHeadroom - 1) * 100),
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-growth">{t('longhorn.growthHeadroom')}</Label>
        <Slider
          id="longhorn-growth"
          value={Math.round(longhornOptions.growthHeadroom * 100)}
          min={100}
          max={200}
          onChange={(v) => setLonghornOptions({ growthHeadroom: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.growthHeadroomValue', {
            pct: Math.round((longhornOptions.growthHeadroom - 1) * 100),
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-overprov">{t('longhorn.overProvisioning')}</Label>
        <Slider
          id="longhorn-overprov"
          value={longhornOptions.overProvisioningPercent}
          min={100}
          max={500}
          onChange={(v) => setLonghornOptions({ overProvisioningPercent: v })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.overProvisioningValue', { pct: longhornOptions.overProvisioningPercent })}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Render the panel**

In `src/components/inputs/TopologyPanel.tsx`:
- Add the import after `CephOptionsPanel` (line ~7): `import { LonghornOptionsPanel } from '@/components/inputs/topology-options/LonghornOptionsPanel'`
- Add the render after the Ceph line (line ~112):

```tsx
      {/* Longhorn Options */}
      {topology.type === 'longhorn' && <LonghornOptionsPanel />}
```

- [ ] **Step 6: Add English translations**

In `src/i18n/locales/en/topology.json`:
- Add `"longhorn": "Longhorn",` to the type-label map (near line 9, after `"ceph": "Ceph",`).
- Add a `longhorn` options block after the `ceph` options block (after line ~460 — locate the closing `}` of the `"ceph": { … }` block that contains `"title": "Ceph Options"`):

```json
    "longhorn": {
      "title": "Longhorn Options",
      "diskMode": "Disk Deployment Model",
      "dedicated": "Dedicated Disk",
      "root": "Root Disk",
      "dedicatedHint": "Recommended for production. Lower free-space floor (10%).",
      "rootHint": "Conservative: 25% free-space floor, 100% over-provisioning.",
      "minimalAvailable": "Storage Minimal Available",
      "minimalAvailableValue": "{{pct}}% reserved (free-space guardrail, F = {{pct}}% off)",
      "snapshotHeadroom": "Snapshot Headroom",
      "snapshotHeadroomValue": "+{{pct}}% reserved for snapshot chains",
      "growthHeadroom": "Growth Headroom (advisory)",
      "growthHeadroomValue": "+{{pct}}% growth allowance (not subtracted from usable)",
      "overProvisioning": "Over-Provisioning (advisory)",
      "overProvisioningValue": "{{pct}}% thin-provisioning limit"
    },
```

- [ ] **Step 7: Add FR/DE/IT translations**

Replicate the Step-6 edits in `src/i18n/locales/fr/topology.json`, `de/topology.json`, `it/topology.json`. Add `"longhorn": "Longhorn",` to each type-label map, and add the `longhorn` block translated per language. Keep technical terms (Longhorn, over-provisioning, snapshot) untranslated per project i18n convention. Suggested translations:

FR block values: `"title": "Options Longhorn"`, `"diskMode": "Modèle de déploiement disque"`, `"dedicated": "Disque dédié"`, `"root": "Disque racine"`, `"dedicatedHint": "Recommandé en production. Seuil d'espace libre plus bas (10%)."`, `"rootHint": "Conservateur : 25% d'espace libre, 100% de surprovisionnement."`, `"minimalAvailable": "Espace minimal disponible"`, `"minimalAvailableValue": "{{pct}}% réservé (garde-fou d'espace libre)"`, `"snapshotHeadroom": "Marge snapshots"`, `"snapshotHeadroomValue": "+{{pct}}% réservé pour les chaînes de snapshots"`, `"growthHeadroom": "Marge de croissance (indicatif)"`, `"growthHeadroomValue": "+{{pct}}% de croissance (non déduit de l'utilisable)"`, `"overProvisioning": "Surprovisionnement (indicatif)"`, `"overProvisioningValue": "limite de provisionnement fin {{pct}}%"`.

DE block values: `"title": "Longhorn-Optionen"`, `"diskMode": "Datenträger-Bereitstellungsmodell"`, `"dedicated": "Dedizierter Datenträger"`, `"root": "Root-Datenträger"`, `"dedicatedHint": "Für Produktion empfohlen. Niedrigere Freispeichergrenze (10%)."`, `"rootHint": "Konservativ: 25% Freispeicher, 100% Overprovisioning."`, `"minimalAvailable": "Minimal verfügbarer Speicher"`, `"minimalAvailableValue": "{{pct}}% reserviert (Freispeicher-Schutz)"`, `"snapshotHeadroom": "Snapshot-Reserve"`, `"snapshotHeadroomValue": "+{{pct}}% für Snapshot-Ketten reserviert"`, `"growthHeadroom": "Wachstumsreserve (Hinweis)"`, `"growthHeadroomValue": "+{{pct}}% Wachstum (nicht vom Nutzbaren abgezogen)"`, `"overProvisioning": "Overprovisioning (Hinweis)"`, `"overProvisioningValue": "Thin-Provisioning-Grenze {{pct}}%"`.

IT block values: `"title": "Opzioni Longhorn"`, `"diskMode": "Modello di distribuzione disco"`, `"dedicated": "Disco dedicato"`, `"root": "Disco root"`, `"dedicatedHint": "Consigliato in produzione. Soglia di spazio libero più bassa (10%)."`, `"rootHint": "Conservativo: 25% di spazio libero, 100% di over-provisioning."`, `"minimalAvailable": "Spazio minimo disponibile"`, `"minimalAvailableValue": "{{pct}}% riservato (protezione spazio libero)"`, `"snapshotHeadroom": "Margine snapshot"`, `"snapshotHeadroomValue": "+{{pct}}% riservato per le catene di snapshot"`, `"growthHeadroom": "Margine di crescita (indicativo)"`, `"growthHeadroomValue": "+{{pct}}% di crescita (non sottratto dall'utilizzabile)"`, `"overProvisioning": "Over-provisioning (indicativo)"`, `"overProvisioningValue": "limite di thin-provisioning {{pct}}%"`.

- [ ] **Step 8: Verify and commit**

Run: `npm test -- tests/components/longhornConstants.spec.ts` — Expected: PASS.
Run: `npm run typecheck` — Expected: no errors.
Run: `npm run build` — Expected: build succeeds (validates i18n JSON is well-formed and the panel compiles).
Run: `npm run lint:fix`

Manually confirm each `topology.json` is valid JSON (no trailing-comma break): `npm run build` will fail loudly if not.

```bash
rtk git add -A
rtk git commit -m "feat(longhorn): topology selector, options panel, i18n (en/fr/de/it) (#51)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Documentation

Bring docs in sync in the same branch (CLAUDE.md rule).

**Files:**
- Modify: `docs/ARCHITECTURE.md` (platform list / topology coverage)
- Modify: `CLAUDE.md` (Project Overview platform list)
- Modify: `CHANGELOG.md`
- Modify: `README.md` (supported-platforms list)

- [ ] **Step 1: Update ARCHITECTURE.md**

Find where the supported platforms / topology strategies are listed (search for "Ceph" and "vSAN") and add Longhorn alongside them, noting: replicated block storage, `1/R` efficiency, free-space + snapshot guardrails, growth/over-provisioning advisory. If there's a strategy/engine table, add a `longhorn.ts` row.

- [ ] **Step 2: Update CLAUDE.md**

In the Project Overview sentence listing platforms (`RAID, ZFS, vSAN, S2D, Nutanix, Dell, NetApp, Ceph, Synology`), add `Longhorn`.

- [ ] **Step 3: Update CHANGELOG.md**

Add an entry under the next/unreleased version following the existing format, e.g.:

```markdown
### Added
- **Longhorn topology** (#51): SUSE Longhorn distributed block storage with replica-aware
  capacity (R2/R3), free-space and snapshot guardrails, and advisory growth /
  over-provisioning readouts. Modeled on Ceph replicated pools.
```

- [ ] **Step 4: Update README.md**

Add Longhorn to the supported-platforms list (search for "Ceph"/"Synology" to find it), matching the surrounding style.

- [ ] **Step 5: Verify and commit**

Run: `npm run build` — Expected: succeeds.
Run: `npm run lint` — Expected: passes.

```bash
rtk git add -A
rtk git commit -m "docs(longhorn): add Longhorn to platform lists and changelog (#51)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (design doc §→task):
- Forward topology modeled on Ceph → Task 1 (strategy `1/R`) + Task 2 (guardrails). ✅
- Levels `r2`/`r3`, no `r1` → Task 1 types + Task 3 constants. ✅
- `serverCount ≥ R` validation → Task 2 Step 4–5. ✅
- `LonghornOptions` (diskMode, minimalAvailable, snapshot, growth, overProvisioning) → Task 1 types + Task 3 panel. ✅
- Capacity pipeline (`1/R` → `F` → `÷S` → host FS) → Task 1 (`1/R`, FS via default branch) + Task 2 (`F`, `÷S`). ✅
- No compression/dedup → relies on `applyCompressionDedup` fallthrough; asserted in Task 2 Step 1. ✅
- Advisory readouts (`recommendedCommittedData`, `perNodeUsable`, over-provisioning) → Task 2 `LonghornCapacityDetails`. ✅
- Breakdown slices → Task 2 Step 8. ✅
- Validation vector (57.6→10 example, decomposed) → Task 2 Step 1 (18 TB variant, exact). ✅
- Performance (write penalty `R`, latency) → Task 1 Steps 8–10. ✅
- Resilience (`R−1` tolerance) → Task 1 Step 11. ✅
- i18n en/fr/de/it → Task 3 Steps 6–7. ✅
- Docs in sync → Task 4. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. FR/DE/IT strings are provided verbatim.

**Type consistency:** `LonghornOptions`, `DEFAULT_LONGHORN_OPTIONS`, `longhornStrategy`, `longhornPerformanceStrategy`, `LonghornCapacityDetails`, `validateReplicaPlacement`, `longhornFreeSpaceReserve`/`longhornSnapshotReserve`, `longhornDetails` — names used identically across defining and consuming tasks. `calculateIOPS`/`getWritePenalty` match the `PerformanceStrategy` interface. `setLonghornOptions`/`longhornOptions` match between slice and panel.
