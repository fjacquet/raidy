/**
 * Pins BeeGfsOptionsPanel's storage-target derivation to the engine's beeGfsDetails output.
 *
 * The panel computes storageTargetCount/strandedDrives before a calculation result exists;
 * the engine (calculateVolumetry) computes the same numbers from actual results. Both must
 * use the store's *per-server* driveCount/hotSpares scaled by serverCount identically — this
 * spec constructs the same store-shaped inputs, feeds one path through
 * deriveBeeGfsStorageTargets and the other through calculateVolumetry (mimicking exactly what
 * useVolumetryCalc.ts does: driveCount*serverCount, hotSpares*serverCount), and asserts they
 * agree. See CLAUDE.md review history: this diverged twice before this test existed.
 */
import { describe, expect, it } from 'vitest'
import { deriveBeeGfsStorageTargets } from '@/components/inputs/topology-options/beegfsPanelHelpers'
import { calculateVolumetry } from '@/engines/volumetry'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import type { BeeGfsOptions, Topology } from '@/types/topology'
import { createVolumetryInput } from '../fixtures/vector-harness'

const raid6: Topology = { type: 'beegfs', level: 'beegfs_raid6' }

/** Mimics useVolumetryCalc.ts's engine-input scaling for BeeGFS (not a distributed-spare topology). */
function runEngine(
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  beeGfsOptions: BeeGfsOptions,
) {
  return calculateVolumetry(
    createVolumetryInput(driveCount * serverCount, raid6, {
      hotSpares: hotSpares * serverCount,
      serverCount,
      beeGfsOptions,
    }),
  )
}

describe('BeeGFS panel/engine storage-target parity', () => {
  it('agrees on the reviewer-reported divergence case (24 drives/server, 2 servers, 13 hot spares/server)', () => {
    const driveCount = 24
    const serverCount = 2
    const hotSpares = 13
    const beeGfsOptions: BeeGfsOptions = {
      ...DEFAULT_BEEGFS_OPTIONS,
      drivesPerTarget: 12,
    }

    const panel = deriveBeeGfsStorageTargets(driveCount, serverCount, hotSpares, beeGfsOptions)
    const engine = runEngine(driveCount, serverCount, hotSpares, beeGfsOptions)

    expect(panel.storageTargetCount).toBe(1)
    expect(engine.beeGfsDetails?.storageTargetCount).toBe(1)
    expect(panel.storageTargetCount).toBe(engine.beeGfsDetails?.storageTargetCount)
    expect(panel.strandedDrives).toBe(engine.beeGfsDetails?.strandedDrives)
  })

  it('agrees at the multi-node default (serverCount 2, default hotSpares)', () => {
    const driveCount = 24
    const serverCount = 2
    const hotSpares = 1 // store default hotSpares value
    const beeGfsOptions: BeeGfsOptions = { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 12 }

    const panel = deriveBeeGfsStorageTargets(driveCount, serverCount, hotSpares, beeGfsOptions)
    const engine = runEngine(driveCount, serverCount, hotSpares, beeGfsOptions)

    expect(panel.storageTargetCount).toBe(engine.beeGfsDetails?.storageTargetCount)
    expect(panel.strandedDrives).toBe(engine.beeGfsDetails?.strandedDrives)
  })

  it('agrees when MDT tiering is active with serverCount > 1 and hotSpares > 0', () => {
    const driveCount = 999 // Hardware panel value must be ignored once tiering is active
    const serverCount = 3
    const hotSpares = 2
    const beeGfsOptions: BeeGfsOptions = {
      ...DEFAULT_BEEGFS_OPTIONS,
      drivesPerTarget: 12,
      metadataTargets: true,
      tiering: {
        enabled: true,
        workingSetPercent: 20,
        fastTier: { driveId: 'ent-nvme-pcie4-960gb-m2-ri', driveCount: 2 },
        capacityTier: { driveId: 'ent-hdd-7k2-sata-18tb-cmr', driveCount: 15 },
      },
    }

    const panel = deriveBeeGfsStorageTargets(driveCount, serverCount, hotSpares, beeGfsOptions)
    const engine = runEngine(0, serverCount, hotSpares, beeGfsOptions)

    // 15 capacity-tier drives/server * 3 servers = 45, minus 2*3=6 hot spares = 39 usable
    // 39 / 12 = 3 targets, 3 stranded
    expect(panel.storageTargetCount).toBe(3)
    expect(panel.strandedDrives).toBe(3)
    expect(panel.storageTargetCount).toBe(engine.beeGfsDetails?.storageTargetCount)
    expect(panel.strandedDrives).toBe(engine.beeGfsDetails?.strandedDrives)
  })

  it('does not activate tiering-sourced counting when metadataTargets is off', () => {
    const driveCount = 24
    const serverCount = 2
    const hotSpares = 1
    const beeGfsOptions: BeeGfsOptions = {
      ...DEFAULT_BEEGFS_OPTIONS,
      drivesPerTarget: 12,
      metadataTargets: false,
      tiering: {
        enabled: true,
        workingSetPercent: 20,
        fastTier: { driveId: 'ent-nvme-pcie4-960gb-m2-ri', driveCount: 2 },
        capacityTier: { driveId: 'ent-hdd-7k2-sata-18tb-cmr', driveCount: 15 },
      },
    }

    const panel = deriveBeeGfsStorageTargets(driveCount, serverCount, hotSpares, beeGfsOptions)
    const engine = runEngine(driveCount, serverCount, hotSpares, beeGfsOptions)

    // Falls back to Hardware panel driveCount*serverCount = 48, minus 1*2=2 spares = 46 usable
    // 46 / 12 = 3 targets, 10 stranded
    expect(panel.storageTargetCount).toBe(3)
    expect(panel.strandedDrives).toBe(10)
    expect(panel.storageTargetCount).toBe(engine.beeGfsDetails?.storageTargetCount)
    expect(panel.strandedDrives).toBe(engine.beeGfsDetails?.strandedDrives)
  })
})
