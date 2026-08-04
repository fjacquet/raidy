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
import type { TieredCapacityResult } from '@/engines/shared/tiering'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import type { Drive } from '@/types/drive'
import type { Topology } from '@/types/topology'

const drives = drivesData as Record<string, Drive>

function getDriveById(id: string): Drive {
  const drive = drives[id]
  if (!drive) throw new Error(`fixture drive not found: ${id}`)
  return drive
}

const fastDrive = getDriveById('ent-nvme-pcie4-960gb-m2-ri')
const capacityDrive = getDriveById('ent-hdd-7k2-sata-18tb-cmr')

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

function inputFor(topology: Topology, overrides: Partial<PerformanceInput> = {}): PerformanceInput {
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
