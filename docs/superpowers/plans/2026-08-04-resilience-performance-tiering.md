# Resilience & Performance Tiering-Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Size the simulated (resilience) and costed (performance) drive population from the capacity tier for every tiered platform, matching what volumetry already does.

**Architecture:** Two independent fixes sharing one root cause. Resilience gains four entries in the existing `SIMULATION_SCOPE_BY_TOPOLOGY` table, all pointing at one shared `tieredPlatformScope` resolver that delegates to `resolveTiering`. Performance gains one `else if` branch in `calculatePerformance` that substitutes the capacity-tier drive and count into the media layer for non-S2D tiered platforms. Neither models the fast tier's own contribution.

**Tech Stack:** TypeScript (strict), React 19 hooks, Zustand, Vitest + jsdom + @testing-library/react, Biome.

**Spec:** `docs/superpowers/specs/2026-08-04-resilience-tiering-design.md`

## Global Constraints

- Untiered configurations must produce **byte-identical** output on every platform. `tieredPlatformScope` returns `null` and the new performance branch is not entered — that is the mechanism, and the tests must prove it.
- Tiered S2D performance output must be **byte-identical**. The existing `topology.type === 's2d'` branch in `calculatePerformance` is not modified, and the new branch must sit *after* it.
- S2D's `workingSetPercent` write-back-cache blend is **not** generalised to other platforms. The new branch models no fast-tier contribution at all.
- Hot spares: resilience does **not** subtract them (unchanged, tracked as B19/#80). Performance **does** — `Math.max(0, capacityTierDriveCount - hotSpares)`, mirroring `spareAdjustedDrives` in `src/engines/volumetry/index.ts:178`.
- `xfsAlignment` keeps using the raw `usableDrives`. Do not change it. Add the code comment specified in Task 2.
- No existing test may be edited to make a new one pass. If one fails, stop and re-examine.
- Docs ship in the **same commit** as the behaviour change (project rule, `CLAUDE.md`).
- Run `npm run lint:fix` before each commit. Every commit must pass `npm run typecheck`.
- Branch: `feat/resilience-tiering-scope` (already checked out, spec already committed).

---

### Task 1: Resilience — capacity-tier simulation scope for S2D, vSAN OSA, Ceph, Nutanix

**Files:**
- Modify: `src/hooks/useResilience.ts`
- Modify: `src/components/layout/OutputDashboard.tsx`
- Modify: `docs/ARCHITECTURE.md`
- Test: `tests/hooks/useResilienceTieredScope.spec.ts` (create)

**Interfaces:**
- Consumes: `resolveTiering(topology, serverCount, options)` from `@/engines/shared/tiering` (already imported in `useResilience.ts`); `TieredCapacityResult` fields `capacityTierDrive: Drive | null`, `capacityTierDriveCount: number`.
- Produces: `UseResilienceOptions` gains `s2dOptions?: S2DOptions`, `vsanOptions?: VsanOptions`, `cephOptions?: CephOptions`, `nutanixOptions?: NutanixOptions`. Task 3 does not depend on these.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/useResilienceTieredScope.spec.ts`. This mirrors the `MockWorker` pattern of the existing `tests/hooks/useResilienceMediaDrive.spec.ts` — it asserts on the actual `SimulationInput` payload posted to the worker, not on a re-derived intermediate.

```ts
/**
 * A tiered S2D / vSAN OSA / Ceph / Nutanix configuration must simulate the CAPACITY tier —
 * its drive count, capacity, URE rate and AFR — not the Hardware panel's drive.
 *
 * Volumetry already resolves this through `resolveTiering`; resilience did not, so the two
 * panels described different clusters. Fast-tier failure semantics (a vSAN cache device taking
 * down its whole disk group, a Ceph WAL/DB NVMe taking out every OSD it serves) remain
 * deliberately unmodelled — see the design spec.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import drivesData from '@/data/drives.json'
import { useResilience } from '@/hooks/useResilience'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_TIERING_CONFIG,
  DEFAULT_VSAN_OPTIONS,
} from '@/types'
import type { Drive } from '@/types/drive'
import type { Topology } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'

const drives = drivesData as Record<string, Drive>

/** Fast tier: 960GB NVMe (ure_rate 17, afr 0.5) */
const FAST_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri'
/** Capacity tier: 18TB HDD (ure_rate 15, afr 0.44) */
const CAPACITY_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr'

const fastDrive = drives[FAST_DRIVE_ID]
const capacityDrive = drives[CAPACITY_DRIVE_ID]

/** 2 fast + 6 capacity drives per node. */
const tiering = {
  ...DEFAULT_TIERING_CONFIG,
  fastTier: { driveId: FAST_DRIVE_ID, driveCount: 2 },
  capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: 6 },
}

let posted: SimulationInput[] = []

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  postMessage(message: { type: string; payload: SimulationInput }) {
    if (message.type === 'START') posted.push(message.payload)
  }
  terminate() {}
}

beforeEach(() => {
  posted = []
  vi.stubGlobal('Worker', MockWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type PlatformCase = {
  name: string
  topology: Topology
  /** Options bag passed to useResilience with tiering ON. */
  tiered: Record<string, unknown>
  /** Same bag with the platform's tiering toggle OFF. */
  untiered: Record<string, unknown>
}

const SERVER_COUNT = 4
const DRIVE_COUNT = 8

const CASES: PlatformCase[] = [
  {
    name: 'S2D',
    topology: { type: 's2d', level: 'mirror' },
    tiered: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: true, tieringConfig: tiering } },
    untiered: {
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: false, tieringConfig: tiering },
    },
  },
  {
    name: 'vSAN OSA',
    topology: { type: 'vsan_osa', level: 'vsan_osa_raid1' },
    tiered: { vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering } },
    untiered: { vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering: undefined } },
  },
  {
    name: 'Ceph',
    topology: { type: 'ceph', level: 'ceph_replicated_3' },
    tiered: { cephOptions: { ...DEFAULT_CEPH_OPTIONS, walDbOffload: true, tiering } },
    untiered: { cephOptions: { ...DEFAULT_CEPH_OPTIONS, walDbOffload: false, tiering } },
  },
  {
    name: 'Nutanix',
    topology: { type: 'nutanix', level: 'nutanix_rf2' },
    tiered: { nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS, clusterType: 'hybrid', tiering } },
    untiered: { nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS, clusterType: 'all-flash', tiering } },
  },
]

function runWith(topology: Topology, extra: Record<string, unknown>): SimulationInput {
  const { result } = renderHook(() =>
    useResilience({
      drive: fastDrive,
      driveCount: DRIVE_COUNT,
      serverCount: SERVER_COUNT,
      hotSpares: 0,
      topology,
      simulationCount: 10,
      autoRun: false,
      ...extra,
    }),
  )
  act(() => {
    result.current.runSimulation()
  })
  const input = posted[0]
  if (!input) throw new Error('no simulation input was posted')
  return input
}

describe('useResilience tiered simulation scope', () => {
  it('premise: the fast and capacity drives differ in every simulated characteristic', () => {
    expect(fastDrive).toBeDefined()
    expect(capacityDrive).toBeDefined()
    expect(fastDrive.capacity_raw).not.toBe(capacityDrive.capacity_raw)
    expect(fastDrive.reliability.ure_rate).not.toBe(capacityDrive.reliability.ure_rate)
    expect(fastDrive.reliability.afr).not.toBe(capacityDrive.reliability.afr)
  })

  for (const platform of CASES) {
    describe(platform.name, () => {
      it('simulates the capacity tier, not the Hardware panel drive', () => {
        const input = runWith(platform.topology, platform.tiered)

        // 6 capacity drives per node x 4 nodes
        expect(input.driveCount).toBe(24)
        expect(input.driveCapacityBytes).toBe(capacityDrive.capacity_raw)
        expect(input.ureRate).toBe(capacityDrive.reliability.ure_rate)
        expect(input.afrPercent).toBe(capacityDrive.reliability.afr)

        // NOT the Hardware panel's drive
        expect(input.driveCapacityBytes).not.toBe(fastDrive.capacity_raw)
        expect(input.driveCount).not.toBe(DRIVE_COUNT * SERVER_COUNT)

        // Fault groups stay the nodes, unlike BeeGFS's storage targets
        expect(input.serverCount).toBe(SERVER_COUNT)
      })

      it('leaves an untiered configuration on the naive path, unchanged', () => {
        const input = runWith(platform.topology, platform.untiered)

        expect(input.driveCount).toBe(DRIVE_COUNT * SERVER_COUNT)
        expect(input.driveCapacityBytes).toBe(fastDrive.capacity_raw)
        expect(input.ureRate).toBe(fastDrive.reliability.ure_rate)
        expect(input.afrPercent).toBe(fastDrive.reliability.afr)
        expect(input.serverCount).toBe(SERVER_COUNT)
      })
    })
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/hooks/useResilienceTieredScope.spec.ts`

Expected: the four "simulates the capacity tier" tests FAIL (`driveCount` is 32, not 24; `driveCapacityBytes` is the NVMe's). The four "untiered" tests and the premise test PASS — they pin behaviour that already exists.

- [ ] **Step 3: Extend the resolver context and hook options**

In `src/hooks/useResilience.ts`, widen the type import:

```ts
import type {
  BeeGfsOptions,
  CephOptions,
  NutanixOptions,
  S2DOptions,
  Topology,
  VsanOptions,
} from '@/types/topology'
```

Add the four fields to `UseResilienceOptions`, after the existing `beeGfsOptions` field:

```ts
  /**
   * Per-platform tiering option bags. When the platform's own tiering toggle is on, the
   * simulated population and media come from the capacity tier — see `tieredPlatformScope`.
   */
  s2dOptions?: S2DOptions
  vsanOptions?: VsanOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
```

Add the same four optional fields to `interface SimulationScopeContext`, after `beeGfsOptions?: BeeGfsOptions`:

```ts
  s2dOptions?: S2DOptions
  vsanOptions?: VsanOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
```

- [ ] **Step 4: Add the shared resolver**

In `src/hooks/useResilience.ts`, insert this immediately above `const SIMULATION_SCOPE_BY_TOPOLOGY`:

```ts
/**
 * Population and media for the platforms that tier through `resolveTiering`: S2D storage tiers,
 * vSAN OSA disk groups, Ceph WAL/DB offload, Nutanix hybrid clusters.
 *
 * One resolver for all four rather than one each: `resolveTiering` already dispatches internally
 * by `topology.type`, and once it has resolved, turning a `TieredCapacityResult` into a scope is
 * identical everywhere. BeeGFS keeps its own resolver because it needs the storage-target concept
 * only it has.
 *
 * Returns null when the platform's tiering toggle is off, which leaves the naive
 * `driveCount * serverCount` path untouched for every currently-correct configuration.
 *
 * Not modelled: the fast tier as a shared failure domain. A vSAN OSA cache device failure takes
 * down its entire disk group, and a Ceph WAL/DB NVMe failure can take out every OSD it serves.
 * This resolver corrects WHICH drives are simulated, not WHY the fast tier failing could cascade
 * — that needs per-platform failure-domain work. The same limitation Ceph's WAL/DB tier already
 * had before this change.
 *
 * Hot spares are not subtracted here — no platform's resilience population subtracts them today
 * (issue #80). Counting a spare as data-bearing overstates risk, so this stays on the safe side
 * of the superset invariant documented on `resolveBeeGfsSimulationScope`.
 */
function tieredPlatformScope({
  topology,
  serverCount,
  s2dOptions,
  vsanOptions,
  cephOptions,
  nutanixOptions,
}: SimulationScopeContext): PlatformSimulationScope | null {
  const tiering = resolveTiering(topology, serverCount, {
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
  })
  if (!tiering) return null
  return {
    driveCount: tiering.capacityTierDriveCount,
    groupCount: serverCount,
    mediaDrive: tiering.capacityTierDrive,
  }
}
```

- [ ] **Step 5: Register the four table entries**

In `src/hooks/useResilience.ts`, replace the last paragraph of the `SIMULATION_SCOPE_BY_TOPOLOGY` doc comment:

```
 * Only BeeGFS has an entry today. The same tiering-blindness this fixes also affects S2D, vSAN,
 * Ceph and Nutanix, but fixing those moves their published numbers and needs its own review
 * (issue #59) — when it lands it should be a new entry here, not another branch below.
```

with:

```
 * BeeGFS resolves its storage-target population itself; the four tiered platforms share
 * `tieredPlatformScope`, which reads the capacity tier through `resolveTiering`.
```

Then add the four entries to the table, after the `beegfs` entry:

```ts
  s2d: tieredPlatformScope,
  vsan_osa: tieredPlatformScope,
  ceph: tieredPlatformScope,
  nutanix: tieredPlatformScope,
```

- [ ] **Step 6: Thread the options through the hook**

In `useResilience`'s destructure, add after `beeGfsOptions,`:

```ts
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
```

In `runSimulation`, extend the resolver call:

```ts
    const scope = SIMULATION_SCOPE_BY_TOPOLOGY[topology.type]?.({
      driveCount,
      serverCount: effServerCount,
      hotSpares,
      topology,
      beeGfsOptions,
      s2dOptions,
      vsanOptions,
      cephOptions,
      nutanixOptions,
    })
```

And add the same four names to `runSimulation`'s dependency array, after `beeGfsOptions,`:

```ts
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `rtk npx vitest run tests/hooks/useResilienceTieredScope.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 8: Wire the options at the call site**

In `src/components/layout/OutputDashboard.tsx`, add to the `useConfigStore()` destructure, after `s2dOptions,`:

```ts
    vsanOptions,
    cephOptions,
    nutanixOptions,
```

And in the `useResilience({...})` call, add after the existing `beeGfsOptions:` line:

```ts
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
```

These are passed unconditionally, unlike `beeGfsOptions`'s `topology.type === 'beegfs' ? … : undefined` guard: `resolveTiering` gates on `topology.type` itself, so a stale option bag for a non-selected platform can never be read.

- [ ] **Step 9: Run the full suite and the type checker**

Run: `rtk npm run typecheck && rtk npx vitest run`
Expected: PASS, with no existing test modified. If an existing test fails, stop — do not edit it.

- [ ] **Step 10: Update ARCHITECTURE.md**

In `docs/ARCHITECTURE.md`, find the `useResilience()` section describing `SIMULATION_SCOPE_BY_TOPOLOGY`. Replace the statement that BeeGFS is the only entry (and the note that #59 should land as a table entry) with:

```markdown
`SIMULATION_SCOPE_BY_TOPOLOGY` holds five entries. BeeGFS resolves its own storage-target
population; S2D, vSAN OSA, Ceph and Nutanix share `tieredPlatformScope`, which reads the capacity
tier through `resolveTiering` so resilience simulates the same drives volumetry counts. Platforms
absent from the table use the naive `driveCount × serverCount` population.

**Not modelled:** the fast tier as a shared failure domain. A vSAN OSA cache device failure takes
down its whole disk group; a Ceph WAL/DB NVMe failure can take out every OSD it serves. The table
corrects which drives are simulated, not why the fast tier failing could cascade.
```

- [ ] **Step 11: Lint and commit**

```bash
rtk npm run lint:fix
rtk git add src/hooks/useResilience.ts src/components/layout/OutputDashboard.tsx tests/hooks/useResilienceTieredScope.spec.ts docs/ARCHITECTURE.md
rtk git commit -m "fix(resilience): simulate the capacity tier for S2D, vSAN OSA, Ceph and Nutanix

A tiered configuration simulated driveCount x serverCount of the Hardware
panel's drive, while volumetry counted the capacity tier — the two panels
described different clusters. Four new SIMULATION_SCOPE_BY_TOPOLOGY entries
share one tieredPlatformScope resolver that reads the capacity tier through
resolveTiering. Untiered configurations are unchanged by construction.

Fast-tier failure cascades (vSAN disk-group loss, Ceph OSD loss via WAL/DB)
remain unmodelled; hot spares are still not subtracted (#80).

Closes #59

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Performance — capacity-tier media for non-S2D tiered platforms

**Files:**
- Modify: `src/engines/performance/index.ts`
- Modify: `docs/ARCHITECTURE.md`
- Test: `tests/engines/performance/tiered-media.spec.ts` (create)

**Interfaces:**
- Consumes: `PerformanceInput`'s existing `tiering?: TieredCapacityResult` and `hotSpares: number` fields — no signature change.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/engines/performance/tiered-media.spec.ts`. It asserts the tiered result equals a reference run built from the capacity tier explicitly, rather than re-deriving the write-penalty formula — the assertion stays falsifiable without duplicating the engine.

```ts
/**
 * For a tiered vSAN OSA / Ceph / Nutanix / BeeGFS configuration, the media layer must be sized
 * from the CAPACITY tier's drive and count — not the Hardware panel's drive.
 *
 * `calculatePerformance` consumed `tiering` only inside its S2D branch; everything else fell
 * through to an `else` that read the raw `drive` and `usableDrives`, so a hybrid cluster was
 * costed as if its bulk pool were made of cache-tier NVMe.
 *
 * The fast tier's own contribution is deliberately NOT modelled here. S2D's write-back-cache
 * blend encodes S2D-specific semantics; vSAN's cache tier, Ceph's WAL/DB offload (which
 * accelerates the commit path and serves no data at all) and Nutanix's hybrid tier each behave
 * differently, and a generic blend would be a guess presented as a number.
 */

import { describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import type { Drive } from '@/types/drive'
import type { Topology } from '@/types/topology'
import type { TieredCapacityResult } from '@/engines/shared/tiering'

const drives = drivesData as Record<string, Drive>

const fastDrive = drives['ent-nvme-pcie4-960gb-m2-ri']
const capacityDrive = drives['ent-hdd-7k2-sata-18tb-cmr']

const SERVER_COUNT = 4
const HARDWARE_DRIVE_COUNT = 32
const HOT_SPARES = 4
/** 6 capacity drives per node x 4 nodes */
const CAPACITY_TIER_COUNT = 24

const tiering: TieredCapacityResult = {
  cacheTierCapacity: fastDrive.capacity_raw * 8,
  cacheTierDrive: fastDrive,
  cacheTierDriveCount: 8,
  capacityTierCapacity: capacityDrive.capacity_raw * CAPACITY_TIER_COUNT,
  capacityTierDrive: capacityDrive,
  capacityTierDriveCount: CAPACITY_TIER_COUNT,
}

function inputFor(
  topology: Topology,
  overrides: Partial<PerformanceInput> = {},
): PerformanceInput {
  return {
    drive: fastDrive,
    driveCount: HARDWARE_DRIVE_COUNT,
    hotSpares: HOT_SPARES,
    serverCount: SERVER_COUNT,
    topology,
    controllerOptions: DEFAULT_CONTROLLER_OPTIONS,
    readPercent: 70,
    randomPercent: 100,
    blockSize: '64K',
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
    ...overrides,
  }
}

function mediaLayer(input: PerformanceInput) {
  const layer = calculatePerformance(input).layers.find((l) => l.name === 'Media (Drives)')
  if (!layer) throw new Error('no media layer in result')
  return { iops: layer.iops, throughputMBs: layer.throughputMBs }
}

const TIERED_PLATFORMS: Array<{ name: string; topology: Topology }> = [
  { name: 'vSAN OSA', topology: { type: 'vsan_osa', level: 'vsan_osa_raid1' } },
  { name: 'Ceph', topology: { type: 'ceph', level: 'ceph_replicated_3' } },
  { name: 'Nutanix', topology: { type: 'nutanix', level: 'nutanix_rf2' } },
  { name: 'BeeGFS', topology: { type: 'beegfs', level: 'beegfs_raid6' } },
]

describe('calculatePerformance tiered media layer', () => {
  it('premise: the fast and capacity drives differ in IOPS and bandwidth', () => {
    expect(fastDrive.performance.iops_read).not.toBe(capacityDrive.performance.iops_read)
    expect(fastDrive.performance.bandwidth_read_mb).not.toBe(
      capacityDrive.performance.bandwidth_read_mb,
    )
  })

  for (const { name, topology } of TIERED_PLATFORMS) {
    describe(name, () => {
      it('sizes the media layer from the capacity tier, spares subtracted', () => {
        const tiered = mediaLayer(inputFor(topology, { tiering }))

        // Reference: the same cluster described WITHOUT tiering — the capacity-tier drive as the
        // Hardware panel drive, at the capacity tier's count. Equality proves the substitution
        // touched the drive AND the population, and nothing else.
        const reference = mediaLayer(
          inputFor(topology, {
            drive: capacityDrive,
            driveCount: CAPACITY_TIER_COUNT,
            hotSpares: HOT_SPARES,
          }),
        )

        expect(tiered).toEqual(reference)
      })

      it('does not use the Hardware panel drive', () => {
        const tiered = mediaLayer(inputFor(topology, { tiering }))
        const untiered = mediaLayer(inputFor(topology))

        expect(tiered.iops).not.toBeCloseTo(untiered.iops)
        expect(tiered.throughputMBs).not.toBeCloseTo(untiered.throughputMBs)
      })

      it('leaves an untiered configuration unchanged', () => {
        // `tiering: undefined` must produce exactly the raw-drive path.
        const untiered = mediaLayer(inputFor(topology))
        const expected = mediaLayer(
          inputFor(topology, { drive: fastDrive, driveCount: HARDWARE_DRIVE_COUNT }),
        )

        expect(untiered).toEqual(expected)
      })
    })
  }

  it('leaves the tiered S2D write-back-cache branch untouched', () => {
    const s2d: Topology = { type: 's2d', level: 'mirror' }
    const tieredS2d = mediaLayer(inputFor(s2d, { tiering, workingSetPercent: 20 }))

    // S2D blends cache and capacity tiers; the new branch does not. If S2D ever equalled the
    // capacity-tier-only reference, the new branch would be swallowing it.
    const capacityOnly = mediaLayer(
      inputFor(s2d, { drive: capacityDrive, driveCount: CAPACITY_TIER_COUNT }),
    )

    expect(tieredS2d).not.toEqual(capacityOnly)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/engines/performance/tiered-media.spec.ts`

Expected: the four "sizes the media layer from the capacity tier" tests and the four "does not use the Hardware panel drive" tests FAIL — the tiered result currently equals the untiered one, because `tiering` is ignored outside the S2D branch. The premise, the four "unchanged" tests and the S2D test PASS.

- [ ] **Step 3: Add the tiering-aware branch**

In `src/engines/performance/index.ts`, the current media block reads:

```ts
  if (topology.type === 's2d' && tiering && cacheDrive && capacityDrive) {
    // ... unchanged S2D write-back-cache blend ...
    writeBW = cacheCount * c.performance.bandwidth_write_mb
  } else {
    readCapIOPS = totalDriveIOPS
    writeCapIOPS = totalDriveIOPS
    readBW = drive.performance.bandwidth_read_mb * usableDrives
    writeBW = drive.performance.bandwidth_write_mb * usableDrives
  }
```

Insert a new branch between the S2D branch and the final `else` — leave the S2D branch exactly as it is:

```ts
  } else if (tiering && capacityDrive) {
    // Every other tiered platform (vSAN OSA disk groups, Ceph WAL/DB offload, Nutanix hybrid,
    // BeeGFS metadata targets): the bulk pool is the capacity tier, so the media layer is sized
    // from that drive and that count — the same substitution volumetry makes.
    //
    // The fast tier contributes nothing here. S2D's blend above encodes S2D's write-back cache
    // semantics (writes fully absorbed by the cache, reads split by working set); vSAN's cache
    // tier, Ceph's WAL/DB (which accelerates the commit path and serves no data at all) and
    // Nutanix's hybrid tier each behave differently. Modelling them needs per-platform research
    // — a generic blend would be a guess presented as a number. Declining to model the fast tier
    // understates these platforms, which is the safe direction.
    const p = capacityDrive
    // Mirrors `spareAdjustedDrives` in src/engines/volumetry/index.ts so both engines describe
    // the same drive population.
    const capUsableDrives = Math.max(0, tiering.capacityTierDriveCount - hotSpares)
    const capDriveIOPS = Math.min(p.performance.iops_read, p.performance.iops_write)
    readCapIOPS = capDriveIOPS * capUsableDrives
    writeCapIOPS = readCapIOPS
    readBW = p.performance.bandwidth_read_mb * capUsableDrives
    writeBW = p.performance.bandwidth_write_mb * capUsableDrives
  } else {
```

- [ ] **Step 4: Annotate the xfsAlignment inconsistency**

Still in `src/engines/performance/index.ts`, find the `xfsAlignment` call (`calculateXfsAlignment(controllerOptions.stripeSize, usableDrives, topology)`) and add above it:

```ts
  // Known inconsistency: `usableDrives` here is the raw Hardware-panel population even when the
  // media layer above was sized from the capacity tier. Stripe alignment is a display value, not
  // part of the bottleneck chain, and which tier a stripe aligns to is a separate judgement call.
  // Tracked in the design spec's out-of-scope list.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `rtk npx vitest run tests/engines/performance/tiered-media.spec.ts`
Expected: PASS (17 tests).

- [ ] **Step 6: Run the full suite and the type checker**

Run: `rtk npm run typecheck && rtk npx vitest run`
Expected: PASS with no existing test modified. Existing S2D and untiered performance vectors must be green untouched — they are the byte-identical guarantee.

- [ ] **Step 7: Update ARCHITECTURE.md**

In `docs/ARCHITECTURE.md`'s performance-engine section, add after the description of the Media layer:

```markdown
For a tiered configuration the Media layer is sized from the **capacity tier** — its drive specs
and its drive count, hot spares subtracted — matching volumetry. S2D is the only platform that
also models a cache-tier contribution (a write-back blend weighted by `workingSetPercent`). vSAN
OSA, Ceph, Nutanix and BeeGFS deliberately model no fast-tier contribution: their cache semantics
differ from each other and from S2D's, so a shared blend would be a guess. This understates them,
which is the safe direction.
```

- [ ] **Step 8: Lint and commit**

```bash
rtk npm run lint:fix
rtk git add src/engines/performance/index.ts tests/engines/performance/tiered-media.spec.ts docs/ARCHITECTURE.md
rtk git commit -m "fix(performance): size the media layer from the capacity tier when tiered

calculatePerformance consumed \`tiering\` only inside its S2D branch; every
other platform fell through to an else that read the raw Hardware-panel drive
and count. A hybrid vSAN OSA, Ceph, Nutanix or BeeGFS cluster was therefore
costed as if its bulk pool were made of cache-tier NVMe.

New branch substitutes the capacity-tier drive and count, spares subtracted
the same way volumetry does. S2D's write-back-cache blend is untouched and
not generalised — the other platforms' fast tiers stay unmodelled, which
understates them rather than guessing.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: BeeGFS tiering reaches the performance engine, and backlog closure

**Files:**
- Modify: `src/hooks/usePerformanceCalc.ts`
- Modify: `docs/BACKLOG.md`
- Modify: `CHANGELOG.md`
- Test: `tests/hooks/usePerformanceTiering.spec.ts` (create)

**Interfaces:**
- Consumes: the branch added in Task 2 — without it this fix is a no-op, which is exactly why the two are separate commits and this one lands second.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/usePerformanceTiering.spec.ts`:

```ts
/**
 * A BeeGFS configuration with metadata targets must be costed against the storage targets'
 * capacity-tier drive, not the Hardware panel's.
 *
 * `usePerformanceCalc` built its `resolveTiering` options bag without `beeGfsOptions`, so BeeGFS
 * tiering never reached `calculatePerformance` at all. (Before the capacity-tier branch landed in
 * the engine, adding it here would have changed nothing — the engine ignored `tiering` outside
 * its S2D branch.)
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePerformanceCalc } from '@/hooks/usePerformanceCalc'
import { useConfigStore } from '@/store'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_TIERING_CONFIG } from '@/types'

const FAST_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri'
const CAPACITY_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr'

const tiering = {
  ...DEFAULT_TIERING_CONFIG,
  fastTier: { driveId: FAST_DRIVE_ID, driveCount: 2 },
  capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: 6 },
}

function mediaIops(): number {
  const { result } = renderHook(() => usePerformanceCalc())
  const layer = result.current.layers.find((l) => l.name === 'Media (Drives)')
  if (!layer) throw new Error('no media layer in result')
  return layer.iops
}

describe('usePerformanceCalc BeeGFS tiering', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
    const store = useConfigStore.getState()
    store.setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    store.setDriveId(FAST_DRIVE_ID)
    store.setDriveCount(8)
    store.setServerCount(4)
  })

  it('costs the storage targets against the capacity tier when metadata targets are on', () => {
    const untiered = mediaIops()

    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: true,
      tiering,
    })
    const tiered = mediaIops()

    // 6 HDDs/node x 4 nodes at HDD IOPS, versus 8 NVMe/node x 4 nodes at NVMe IOPS.
    expect(tiered).toBeLessThan(untiered)
  })

  it('leaves a BeeGFS configuration without metadata targets unchanged', () => {
    const before = mediaIops()

    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: false,
      tiering,
    })

    expect(mediaIops()).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/hooks/usePerformanceTiering.spec.ts`

Expected: the first test FAILS (`tiered` equals `untiered` — BeeGFS tiering never reaches the engine). The second test PASSES.

If `usePerformanceCalc` cannot be rendered standalone (it may require a store subscription the test does not set up), report the exact error rather than reshaping the test — the hook takes no arguments and reads the store directly, so it should render.

- [ ] **Step 3: Add the missing options bag entry**

In `src/hooks/usePerformanceCalc.ts`, the `resolveTiering` call reads:

```ts
    const tiering = resolveTiering(topology, effServerCount, {
      s2dOptions,
      vsanOptions,
      cephOptions,
      nutanixOptions,
    })
```

Add `beeGfsOptions`:

```ts
    const tiering = resolveTiering(topology, effServerCount, {
      s2dOptions,
      vsanOptions,
      cephOptions,
      nutanixOptions,
      beeGfsOptions,
    })
```

`beeGfsOptions` is already destructured from the store and already in the memo's dependency array — no other change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk npx vitest run tests/hooks/usePerformanceTiering.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Delete the closed backlog entries**

In `docs/BACKLOG.md`, delete the whole `### [B1](...)` entry and the whole `### [B2](...)` entry, including their bodies and `*To close:*` lines. Do not mark them done — git history is the record, per the file's own "How to close an item" convention. Leave every other entry's number untouched.

- [ ] **Step 6: Add the CHANGELOG entry**

In `CHANGELOG.md`, under the `## [Unreleased]` heading's `### Fixed` section (create the section if it does not exist):

```markdown
- **Tiered configurations are sized from the capacity tier in every engine.** Resilience simulated
  the Hardware panel's drive count and media for tiered S2D, vSAN OSA, Ceph and Nutanix, and the
  performance engine costed the bulk pool against the cache-tier drive for every tiered platform
  except S2D. Both now read the capacity tier through `resolveTiering`, matching volumetry.
  **Tiered vSAN OSA, Ceph, Nutanix and BeeGFS resilience and performance numbers change** —
  they were wrong before. Untiered configurations are unaffected. Fast-tier failure cascades and
  cache-tier performance contributions remain deliberately unmodelled. (#59, #60)
```

- [ ] **Step 7: Run the full suite and the type checker**

Run: `rtk npm run typecheck && rtk npx vitest run && rtk npm run lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
rtk npm run lint:fix
rtk git add src/hooks/usePerformanceCalc.ts tests/hooks/usePerformanceTiering.spec.ts docs/BACKLOG.md CHANGELOG.md
rtk git commit -m "fix(performance): resolve BeeGFS metadata tiering in usePerformanceCalc

The resolveTiering options bag omitted beeGfsOptions, so a BeeGFS cluster with
metadata targets was costed against the Hardware panel's drive rather than the
storage targets' capacity tier. Observable now that the engine's capacity-tier
branch exists.

Closes #60

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After all three tasks:

```bash
rtk npm run lint && rtk npm run typecheck && rtk npx vitest run
rtk npm run test:coverage    # 75% threshold on engines/, workers/, utils/ must hold
```

Manual check in `npm run dev`:

1. Topology → Ceph → `ceph_replicated_3`, 8 NVMe drives/node, 4 nodes. Note the resilience survival rate and the Media layer IOPS.
2. Enable WAL/DB offload and configure tiering: fast tier 2 × NVMe, capacity tier 6 × 18TB HDD.
3. Expected: the Media layer IOPS drops sharply (HDD, not NVMe), the resilience panel's simulated drive count matches the capacity card's, and the survival rate moves.
4. Turn WAL/DB offload back off → both panels return to their step-1 values exactly.
