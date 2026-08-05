/**
 * #91 — Tiered BeeGFS: volumetry and performance deliberately see different drive populations.
 *
 * Volumetry rounds the capacity tier down to whole storage targets, dropping the "stranded"
 * remainder that completes no target and holds no data (see the comment beside
 * `beeGfsTargets` in src/engines/volumetry/index.ts). Performance does NOT apply that rounding
 * (see the comment beside `capUsableDrives` in src/engines/performance/index.ts): a stranded
 * drive still exists on the bus and still draws from the controller/PCIe budget, so pricing it
 * is correct for a bottleneck model even though excluding it is correct for a capacity model.
 *
 * This test pins that divergence as intentional. If a future change makes the two engines agree
 * again, it must fail here — forcing a deliberate decision rather than silent drift.
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import { calculateVolumetry } from '@/engines/volumetry'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_CONTROLLER_OPTIONS } from '@/types'
import type { BeeGfsOptions, Topology } from '@/types/topology'
import {
  CAPACITY_DRIVE_ID,
  capacityDrive,
  FAST_DRIVE_ID,
  fastDrive,
} from '../../fixtures/tiering-fixtures'
import { createVolumetryInput } from '../../fixtures/vector-harness'

const topology: Topology = { type: 'beegfs', level: 'beegfs_raid6' }

// 20 drives per drivesPerTarget=6 is deliberately not a multiple of the target width:
// floor(20 / 6) = 3 whole targets (18 drives), 2 drives stranded.
const CAPACITY_TIER_DRIVE_COUNT = 20
const DRIVES_PER_TARGET = 6
const HOT_SPARES = 0
const EXPECTED_WHOLE_TARGET_DRIVES = 18
const EXPECTED_STRANDED_DRIVES = 2

function beeGfsOptions(): BeeGfsOptions {
  return {
    ...DEFAULT_BEEGFS_OPTIONS,
    drivesPerTarget: DRIVES_PER_TARGET,
    storageBuddyMirror: false,
    metadataBuddyMirror: false,
    metadataTargets: true,
    tiering: {
      enabled: true,
      workingSetPercent: 20,
      fastTier: { driveId: FAST_DRIVE_ID, driveCount: 2 },
      capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: CAPACITY_TIER_DRIVE_COUNT },
    },
  }
}

describe('BeeGFS tiered stranded-drive divergence (#91)', () => {
  it('volumetry drops the stranded drives; performance prices them', () => {
    const volumetry = calculateVolumetry(
      createVolumetryInput(0, topology, { hotSpares: HOT_SPARES, beeGfsOptions: beeGfsOptions() }),
    )

    const performanceInput: PerformanceInput = {
      drive: fastDrive,
      driveCount: 0,
      hotSpares: HOT_SPARES,
      serverCount: 1,
      topology,
      controllerOptions: DEFAULT_CONTROLLER_OPTIONS,
      readPercent: 70,
      randomPercent: 100,
      blockSize: '64K',
      networkSpeed: '400GbE',
      pcieGen: 'gen5',
      pcieLanes: 'x16',
      beeGfsOptions: beeGfsOptions(),
      tiering: {
        cacheTierCapacity: fastDrive.capacity_raw * 2,
        cacheTierDrive: fastDrive,
        cacheTierDriveCount: 2,
        capacityTierCapacity: capacityDrive.capacity_raw * CAPACITY_TIER_DRIVE_COUNT,
        capacityTierDrive: capacityDrive,
        capacityTierDriveCount: CAPACITY_TIER_DRIVE_COUNT,
      },
    }
    const performance = calculatePerformance(performanceInput)

    // Volumetry: whole storage targets only.
    expect(volumetry.beeGfsDetails?.strandedDrives).toBe(EXPECTED_STRANDED_DRIVES)
    const volumetryDataBearingDrives =
      (volumetry.beeGfsDetails?.storageTargetCount ?? 0) * DRIVES_PER_TARGET
    expect(volumetryDataBearingDrives).toBe(EXPECTED_WHOLE_TARGET_DRIVES)

    // Performance: spare-adjusted capacity tier count, stranding NOT applied. `xfsAlignment`
    // (fixed by #90 to track the same population as the media layer) is linear in that count,
    // so `swidth / sunit` recovers exactly the drive count the media layer priced.
    expect(performance.xfsAlignment).toBeDefined()
    const performanceDataBearingDrives =
      (performance.xfsAlignment?.swidth ?? 0) / (performance.xfsAlignment?.sunit ?? 1)
    expect(performanceDataBearingDrives).toBe(CAPACITY_TIER_DRIVE_COUNT)

    // The two engines must therefore disagree by exactly the stranded-drive count.
    expect(CAPACITY_TIER_DRIVE_COUNT - volumetryDataBearingDrives).toBe(EXPECTED_STRANDED_DRIVES)
  })
})
