/**
 * End-to-end scope wiring for PowerScale across the three engines that used to derive their
 * populations from the (now-hidden) Hardware panel's `driveCount * effServerCount`.
 *
 * `powerScaleDriveTotals` itself is pinned in `tests/hooks/powerscaleScopes.spec.ts`; these tests
 * pin the CONSUMERS — `useResilience`'s `powerscale` scope resolver, `usePerformanceCalc`, and
 * `useSustainabilityCalc` — against a real two-tier cluster, so a future refactor that reads the
 * wrong tier (or forgets to thread `powerscaleOptions` through a call site) fails here rather
 * than shipping as a dashboard number nobody configured.
 *
 * Deliberate scope split under test: performance and resilience read tiers[0] ONLY (per-pool
 * physical phenomena); sustainability sums every tier (power/cooling/TCO are additive).
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import { usePerformanceCalc } from '@/hooks/usePerformanceCalc'
import { useResilience } from '@/hooks/useResilience'
import { useSustainabilityCalc } from '@/hooks/useSustainabilityCalc'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types/drive'
import type { PowerScaleOptions, PowerScaleTier, Topology } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'
import { installMockWorker } from '../fixtures/mock-worker'

const drives = drivesData as Record<string, Drive>

function getDriveById(id: string): Drive {
  const drive = drives[id]
  if (!drive) throw new Error(`fixture drive not found: ${id}`)
  return drive
}

const hardwarePanelDrive = getDriveById('ent-nvme-pcie4-960gb-m2-ri')

const topology: Topology = { type: 'powerscale', level: 'powerscale_onefs' }

// F200: 4 drives/node. A200: 15 drives/node. Distinct so a test that reads the wrong tier is
// falsifiable on drive count alone.
const flashTier: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 6,
  protection: '+2d:1n',
  vhsDriveCount: 2,
  vhsPercent: 0,
}
const archiveTier: PowerScaleTier = {
  nodeModel: 'A200',
  driveSizeTb: 8,
  nodeCount: 12,
  protection: '+2n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}
const twoTier: PowerScaleOptions = { tiers: [flashTier, archiveTier] }

describe('useResilience PowerScale scope', () => {
  let posted: SimulationInput[]
  let uninstall: () => void

  beforeEach(() => {
    ;({ posted, uninstall } = installMockWorker())
  })

  afterEach(() => {
    uninstall()
  })

  function runWith(powerscaleOptions: PowerScaleOptions, hotSpares = 0): SimulationInput {
    // Reset before each call, not just once per test: a test that calls `runWith` more than
    // once (e.g. to compare two configurations) must read each call's OWN posted input, not
    // `posted[0]` left over from an earlier call in the same test.
    posted.length = 0
    const { result } = renderHook(() =>
      useResilience({
        drive: hardwarePanelDrive,
        driveCount: 999, // Hardware-panel value the scope resolver must ignore entirely.
        serverCount: 999,
        hotSpares,
        topology,
        simulationCount: 10,
        autoRun: false,
        powerscaleOptions,
      }),
    )
    act(() => {
      result.current.runSimulation()
    })
    const input = posted[0]
    if (!input) throw new Error('no simulation input was posted')
    return input
  }

  it('simulates the FIRST tier only: 6 F200 nodes x 4 drives, minus its 2 VHS drives', () => {
    const input = runWith(twoTier)
    expect(input.driveCount).toBe(22) // 6 x 4 - 2
    expect(input.serverCount).toBe(6) // first tier's node count, not 18 (cluster) or the stale 999
  })

  it('keeps the Hardware panel drive for reliability — the catalog has no AFR/URE/MTBF', () => {
    const input = runWith(twoTier)
    expect(input.driveCapacityBytes).toBe(hardwarePanelDrive.capacity_raw)
    expect(input.ureRate).toBe(hardwarePanelDrive.reliability.ure_rate)
    expect(input.afrPercent).toBe(hardwarePanelDrive.reliability.afr)
  })

  it('degrades to the vacuous zero-drive case for an empty tier list, rather than throwing', () => {
    const input = runWith({ tiers: [] })
    expect(input.driveCount).toBe(0)
    expect(input.serverCount).toBe(1)
    expect(input.hasHotSpare).toBe(false)
  })

  it("threads the first tier's protection to the worker (fix round 1, item 1)", () => {
    // Pre-fix, `SimulationInput.powerScaleProtection` did not exist at all: the resilience
    // panel simulated every PowerScale pool tolerating exactly one drive failure regardless of
    // its real protection.
    const input = runWith(twoTier)
    expect(input.powerScaleProtection).toBe(flashTier.protection) // '+2d:1n' — the FIRST tier's
  })

  it("hasHotSpare comes from the tier's own VHS count, not the generic hot-spares slider (fix round 1, item 5)", () => {
    // flashTier.vhsDriveCount = 2 -> credit, regardless of what the generic slider says.
    const withVhs = runWith(twoTier, /* hotSpares */ 0)
    expect(withVhs.hasHotSpare).toBe(true)

    // A first tier with NO VHS configured must get NO credit, even when a leftover non-zero
    // hotSpares value from a previously selected platform is still sitting in the store — the
    // generic slider is meaningless for PowerScale (the Hardware panel is hidden) and must be
    // ignored entirely, not merely deprioritized.
    const noVhsTier: PowerScaleTier = { ...flashTier, vhsDriveCount: 0 }
    const withoutVhs = runWith({ tiers: [noVhsTier, archiveTier] }, /* hotSpares */ 5)
    expect(withoutVhs.hasHotSpare).toBe(false)
  })
})

describe('usePerformanceCalc PowerScale scope', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
    const store = useConfigStore.getState()
    store.setTopology(topology)
    store.setDriveId(hardwarePanelDrive.id)
    // Hardware-panel values the hook must ignore for PowerScale (hasServerCount: false).
    store.setDriveCount(999)
    store.setServerCount(999)
  })

  function mediaLayer() {
    const { result } = renderHook(() => usePerformanceCalc())
    const layer = result.current.layers.find((l) => l.name === 'Media (Drives)')
    if (!layer) throw new Error('no media layer in result')
    return layer
  }

  it('sizes the media layer from the FIRST tier only (24 F200 drives, not the 204-drive cluster)', () => {
    useConfigStore.setState({ powerscaleOptions: twoTier })
    const layer = mediaLayer()
    // usableDrives = firstTierDrives - firstTierSpareDrives = 24 - 2 = 22
    const expectedDriveIOPS = Math.min(
      hardwarePanelDrive.performance.iops_read,
      hardwarePanelDrive.performance.iops_write,
    )
    expect(layer.iops).toBeGreaterThan(0)
    expect(layer.iops).toBeLessThanOrEqual(22 * expectedDriveIOPS)
  })

  it('returns a defined zero-ish result for an empty tier list rather than throwing', () => {
    useConfigStore.setState({ powerscaleOptions: { tiers: [] } })
    const { result } = renderHook(() => usePerformanceCalc())
    expect(result.current.maxReadIOPS).toBe(0)
    expect(result.current.maxWriteIOPS).toBe(0)
    expect(result.current.bottleneck.kind).not.toBe('error')
  })
})

describe('useSustainabilityCalc PowerScale scope', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
    const store = useConfigStore.getState()
    store.setTopology(topology)
    store.setDriveId(hardwarePanelDrive.id)
    store.setDriveCount(999)
    store.setServerCount(999)
  })

  function drivePowerWatts(): number {
    const { result } = renderHook(() => useSustainabilityCalc(0))
    return result.current.powerBreakdown.drives
  }

  it('sums EVERY tier (204 cluster drives), unlike performance/resilience', () => {
    useConfigStore.setState({ powerscaleOptions: twoTier })
    const avgWatts =
      hardwarePanelDrive.power.idle_watts * 0.3 + hardwarePanelDrive.power.load_watts * 0.7
    // 6x4 (F200) + 12x15 (A200) = 24 + 180 = 204 drives, cluster-wide.
    expect(drivePowerWatts()).toBeCloseTo(avgWatts * 204, 6)
  })

  it('returns zero drive power for an empty tier list rather than throwing', () => {
    useConfigStore.setState({ powerscaleOptions: { tiers: [] } })
    expect(drivePowerWatts()).toBe(0)
  })
})
