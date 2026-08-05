/**
 * The simulated population must exclude hot spares, on the same rule volumetry
 * (`useVolumetryCalc.ts:80`) and performance (`usePerformanceCalc.ts:77`) use. A spare holds no
 * data, so counting it as a data-bearing member inflated the failure population and reported a
 * worse survival rate than the configuration has. Issue #80.
 *
 * Platforms using distributed spares (vSAN) subtract zero — the rule is what holds their
 * population fixed, not the absence of a subtraction, which is why they are asserted here too.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveBeeGfsSimulationScope, useResilience } from '@/hooks/useResilience'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_S2D_OPTIONS, DEFAULT_VSAN_OPTIONS } from '@/types'
import type { Topology } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'
import { installMockWorker } from '../fixtures/mock-worker'
import { buildTieringConfig, capacityDrive } from '../fixtures/tiering-fixtures'

let posted: SimulationInput[] = []
let uninstall: () => void

beforeEach(() => {
  ;({ posted, uninstall } = installMockWorker())
})

afterEach(() => {
  uninstall()
})

function runWith(
  topology: Topology,
  hotSpares: number,
  tieringOptions: Record<string, unknown> = {},
  driveCount = 12,
  serverCount = 2,
): SimulationInput {
  const { result } = renderHook(() =>
    useResilience({
      drive: capacityDrive,
      driveCount,
      serverCount,
      hotSpares,
      topology,
      simulationCount: 10,
      autoRun: false,
      tieringOptions,
    }),
  )
  act(() => {
    result.current.runSimulation()
  })
  const input = posted[0]
  if (!input) throw new Error('no simulation input was posted')
  return input
}

// `standard`/`raid6` has `hasServerCount: false` (src/engines/capabilities.ts) — the
// servers/nodes slider is hidden for plain RAID levels, so `effectiveServerCount` always
// clamps it to 1 regardless of what `serverCount` is passed. RAID50/60 is the documented UI
// exception (`isRaidGroupMode`): there `serverCount` doubles as the RAID-group count and
// really does multiply the population, which is what these tests need to exercise the
// `driveCount * effServerCount` term the fix touches.
const RAID50: Topology = { type: 'standard', level: 'RAID50' }
const ZFS: Topology = { type: 'zfs', level: 'raidz2' }

describe('useResilience hot spares — naive path', () => {
  it('excludes hot spares from the simulated population (standard RAID50)', () => {
    // 12 drives x 2 RAID groups = 24, minus 1 spare per group = 22
    expect(runWith(RAID50, 1).driveCount).toBe(22)
  })

  it('applies to every non-tiered platform, not just standard RAID (ZFS)', () => {
    // ZFS has hasServerCount: false too (no RAID-group exception), so effServerCount is
    // always 1 here: 12 drives, minus 1 spare = 11. The point of this case is that the
    // subtraction fires for a second, unrelated platform — not that the numbers match RAID50.
    expect(runWith(ZFS, 1).driveCount).toBe(11)
  })

  it('leaves a spare-free configuration exactly as it was', () => {
    expect(runWith(RAID50, 0).driveCount).toBe(24)
  })

  it('does not change the fault-group count', () => {
    expect(runWith(RAID50, 1).serverCount).toBe(2)
  })

  it('clamps at zero when spares consume the whole population', () => {
    expect(runWith(RAID50, 99).driveCount).toBe(0)
  })

  it('subtracts nothing for vSAN ESA, which rebuilds from distributed slack', () => {
    const esa: Topology = { type: 'vsan_esa', level: 'vsan_esa_raid5' }
    expect(runWith(esa, 3).driveCount).toBe(24)
  })
})

/** 2 fast + 6 capacity drives per node — the shared shape used by the other tiering specs. */
const tiering = buildTieringConfig(2, 6)

describe('useResilience hot spares — tiered path', () => {
  /**
   * These two cases used S2D as their vehicle until S2D joined DISTRIBUTED_SPARE_TOPOLOGIES
   * (Microsoft documents reserve capacity taken evenly from every drive, not spare disks).
   * The behaviour under test — subtracting spares from the CAPACITY tier, and clamping at
   * zero — is unchanged; only the platform that still exercises it has moved. BeeGFS tiers
   * (metadata targets) and keeps dedicated spares, since its storage targets are local
   * hardware RAID volumes.
   */
  it('excludes hot spares from the capacity tier (BeeGFS metadata targets)', () => {
    const beegfs: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const input = runWith(beegfs, 1, {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, metadataTargets: true, tiering },
    })
    // 6 capacity drives x 2 nodes = 12, minus 1 spare per node = 10
    expect(input.driveCount).toBe(10)
  })

  it('subtracts nothing for S2D, which now rebuilds from pool reserve capacity', () => {
    const s2d: Topology = { type: 's2d', level: 'mirror' }
    const input = runWith(s2d, 1, {
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: true, tieringConfig: tiering },
    })
    // 6 capacity drives x 2 nodes = 12, and the spare is ignored.
    expect(input.driveCount).toBe(12)
  })

  it('subtracts nothing for vSAN OSA, which rebuilds from distributed slack', () => {
    const osa: Topology = { type: 'vsan_osa', level: 'vsan_osa_raid1' }
    const input = runWith(osa, 3, {
      vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering },
    })
    expect(input.driveCount).toBe(12)
  })

  it('clamps at zero when spares exceed the capacity tier', () => {
    const beegfs: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const input = runWith(beegfs, 99, {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, metadataTargets: true, tiering },
    })
    expect(input.driveCount).toBe(0)
  })

  it('does not subtract twice for BeeGFS, which applies spares in its own resolver', () => {
    const beegfs: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const input = runWith(beegfs, 1, { beeGfsOptions: DEFAULT_BEEGFS_OPTIONS })
    const expected = resolveBeeGfsSimulationScope(12, 2, 1, DEFAULT_BEEGFS_OPTIONS)
    expect(input.driveCount).toBe(expected.driveCount)
    expect(input.serverCount).toBe(expected.groupCount)
  })
})
