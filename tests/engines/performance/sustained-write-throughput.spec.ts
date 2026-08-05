/**
 * Sustained (steady-state) vs. burst write throughput (#112).
 *
 * `maxWriteThroughputMBs`/`maxWriteIOPS` model the BURST figure: what a fast tier's write-back
 * cache absorbs before it saturates. Nothing bounded that by a destage/drain rate, so the burst
 * number was reported as if it were steady-state — wrong for sustained load, where throughput
 * converges on the capacity tier's own write capacity (every byte eventually has to land there,
 * and no platform publishes a numeric drain rate to model a tighter ceiling against).
 *
 * `sustainedWriteThroughputMBs`/`sustainedWriteIOPS` report that capacity-tier-bounded figure
 * alongside the unchanged burst figure. This spec pins:
 *  - Tiered S2D and tiered vSAN OSA: burst and sustained side by side, burst unchanged from
 *    before this change.
 *  - An untiered configuration: burst and sustained are exactly equal.
 *  - Nutanix: the sustained figure responds to `randomPercent` (via the shared
 *    `effectiveWritePenalty` term every platform's write IOPS already runs through).
 *  - Ceph/BeeGFS (no fast-tier model): burst and sustained are exactly equal, confirming they
 *    get one number, not two.
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import type { TieredCapacityResult } from '@/engines/shared/tiering'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
} from '@/types'
import type { Topology } from '@/types/topology'
import { capacityDrive, fastDrive } from '../../fixtures/tiering-fixtures'

const SERVER_COUNT = 4
const HARDWARE_DRIVE_COUNT = 32
const HOT_SPARES = 4
const CAPACITY_TIER_COUNT = 24

const tiering: TieredCapacityResult = {
  cacheTierCapacity: fastDrive.capacity_raw * 8,
  cacheTierDrive: fastDrive,
  cacheTierDriveCount: 8,
  capacityTierCapacity: capacityDrive.capacity_raw * CAPACITY_TIER_COUNT,
  capacityTierDrive: capacityDrive,
  capacityTierDriveCount: CAPACITY_TIER_COUNT,
}

function inputFor(topology: Topology, overrides: Partial<PerformanceInput> = {}): PerformanceInput {
  return {
    drive: fastDrive,
    driveCount: HARDWARE_DRIVE_COUNT,
    hotSpares: HOT_SPARES,
    serverCount: SERVER_COUNT,
    topology,
    controllerOptions: DEFAULT_CONTROLLER_OPTIONS,
    readPercent: 0, // write-only: isolates the write side, same trick tiered-media.spec.ts uses
    randomPercent: 100,
    blockSize: '64K',
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    vsanOptions: DEFAULT_VSAN_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
    ...overrides,
  }
}

describe('sustained vs. burst write throughput (#112)', () => {
  it('tiered S2D: burst and sustained differ, and burst is unchanged from before this change', () => {
    const s2d: Topology = { type: 's2d', level: 'mirror' }
    const result = calculatePerformance(inputFor(s2d, { tiering, workingSetPercent: 20 }))

    // Reference: the same cluster described directly as the capacity tier only (no tiering) —
    // what sustained SHOULD converge to, since every byte eventually lands there.
    const capacityOnly = calculatePerformance(
      inputFor(s2d, {
        drive: capacityDrive,
        driveCount: CAPACITY_TIER_COUNT,
        hotSpares: HOT_SPARES,
      }),
    )

    // Burst pin: writeCapIOPS = cacheCount * cacheDrive.performance.iops_write — the exact
    // pre-#112 formula, still strictly above the capacity-only reference (S2D always had this
    // property; #112 doesn't touch it).
    expect(result.maxWriteIOPS).toBeGreaterThan(capacityOnly.maxWriteIOPS)
    expect(result.maxWriteThroughputMBs).toBeGreaterThan(capacityOnly.maxWriteThroughputMBs)

    // Sustained: bounded by the capacity tier, so it matches the capacity-only reference exactly
    // rather than staying at the inflated cache figure.
    expect(result.sustainedWriteIOPS).toBeLessThan(result.maxWriteIOPS)
    expect(result.sustainedWriteThroughputMBs).toBeLessThan(result.maxWriteThroughputMBs)
    expect(result.sustainedWriteIOPS).toBeCloseTo(capacityOnly.maxWriteIOPS, 6)
    expect(result.sustainedWriteThroughputMBs).toBeCloseTo(capacityOnly.maxWriteThroughputMBs, 6)
  })

  it('tiered vSAN OSA (hybrid): burst and sustained differ, and burst is unchanged from before this change', () => {
    const vsan: Topology = { type: 'vsan_osa', level: 'vsan_osa_raid1' }
    const result = calculatePerformance(
      inputFor(vsan, {
        tiering,
        vsanOptions: { ...DEFAULT_VSAN_OPTIONS, diskGroupMode: 'hybrid' },
      }),
    )

    const capacityOnly = calculatePerformance(
      inputFor(vsan, {
        drive: capacityDrive,
        driveCount: CAPACITY_TIER_COUNT,
        hotSpares: HOT_SPARES,
      }),
    )

    // Burst side unchanged: still the cache write-back figure, strictly above the capacity-only
    // reference (same assertion tiered-media.spec.ts already pins for this branch).
    expect(result.maxWriteIOPS).toBeGreaterThan(capacityOnly.maxWriteIOPS)
    expect(result.maxWriteThroughputMBs).toBeGreaterThan(capacityOnly.maxWriteThroughputMBs)

    // Sustained side: bounded by the capacity tier, so it drops back to (or below) the
    // capacity-only reference rather than staying at the inflated cache figure.
    expect(result.sustainedWriteIOPS).toBeLessThan(result.maxWriteIOPS)
    expect(result.sustainedWriteThroughputMBs).toBeLessThan(result.maxWriteThroughputMBs)
    expect(result.sustainedWriteIOPS).toBeCloseTo(capacityOnly.maxWriteIOPS, 6)
    expect(result.sustainedWriteThroughputMBs).toBeCloseTo(capacityOnly.maxWriteThroughputMBs, 6)
  })

  it('untiered configuration: burst and sustained are exactly equal', () => {
    const raid: Topology = { type: 'standard', level: 'RAID5' }
    const result = calculatePerformance(inputFor(raid))

    expect(result.sustainedWriteIOPS).toBe(result.maxWriteIOPS)
    expect(result.sustainedWriteThroughputMBs).toBe(result.maxWriteThroughputMBs)
  })

  it('Nutanix: the sustained figure responds to randomPercent', () => {
    const nutanix: Topology = { type: 'nutanix', level: 'nutanix_rf2' }
    const highRandom = calculatePerformance(inputFor(nutanix, { tiering, randomPercent: 100 }))
    const lowRandom = calculatePerformance(inputFor(nutanix, { tiering, randomPercent: 5 }))

    expect(highRandom.sustainedWriteIOPS).not.toBeCloseTo(lowRandom.sustainedWriteIOPS)
    expect(highRandom.sustainedWriteThroughputMBs).not.toBeCloseTo(
      lowRandom.sustainedWriteThroughputMBs,
    )
  })

  it('Nutanix: burst still diverges from sustained when a cache drive is selected', () => {
    const nutanix: Topology = { type: 'nutanix', level: 'nutanix_rf2' }
    const result = calculatePerformance(inputFor(nutanix, { tiering, randomPercent: 100 }))

    expect(result.sustainedWriteIOPS).toBeLessThan(result.maxWriteIOPS)
  })

  it('Ceph: no fast-tier model, so burst and sustained are exactly equal', () => {
    const ceph: Topology = { type: 'ceph', level: 'ceph_replicated_3' }
    const result = calculatePerformance(inputFor(ceph, { tiering }))

    expect(result.sustainedWriteIOPS).toBe(result.maxWriteIOPS)
    expect(result.sustainedWriteThroughputMBs).toBe(result.maxWriteThroughputMBs)
  })

  it('BeeGFS: no fast-tier model, so burst and sustained are exactly equal', () => {
    const beegfs: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const result = calculatePerformance(inputFor(beegfs, { tiering }))

    expect(result.sustainedWriteIOPS).toBe(result.maxWriteIOPS)
    expect(result.sustainedWriteThroughputMBs).toBe(result.maxWriteThroughputMBs)
  })
})
