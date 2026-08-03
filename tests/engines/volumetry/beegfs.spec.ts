import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import type { BeeGfsOptions, Topology } from '@/types/topology'
import { createVolumetryInput, TB, testDrive1TB } from '../../fixtures/vector-harness'

function beegfs(overrides: Partial<BeeGfsOptions> = {}): BeeGfsOptions {
  return { ...DEFAULT_BEEGFS_OPTIONS, ...overrides }
}

const raid6: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
const raid10: Topology = { type: 'beegfs', level: 'beegfs_raid10' }
const raidz2: Topology = { type: 'beegfs', level: 'beegfs_raidz2' }
const single: Topology = { type: 'beegfs', level: 'beegfs_single' }

// Real drive IDs from src/data/drives.json (see S2D/Ceph tiering tests for the same pattern):
// MDT (fast tier) = enterprise NVMe M.2, 960 GB; storage targets (capacity tier) = enterprise
// HDD, 18 TB.
const MDT_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri' // 960 GB
const MDT_DRIVE_BYTES = 960_000_000_000
const ST_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr' // 18 TB
const ST_DRIVE_BYTES = 18 * TB

describe('BeeGFS volumetry — drivesPerTarget sensitivity', () => {
  it('12 drives at drivesPerTarget 10 vs 12 give 8/10 vs 10/12 data fraction', () => {
    const at10 = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 10, storageBuddyMirror: false }),
      }),
    )
    const at12 = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    // 12 TB raw x 8/10 x 0.98 = 9.408 TB ; 12 TB raw x 10/12 x 0.98 = 9.8 TB
    expect(at10.usableCapacity / TB).toBeCloseTo(9.408, 4)
    expect(at12.usableCapacity / TB).toBeCloseTo(9.8, 4)
  })
})

describe('BeeGFS volumetry — storageBuddyMirror', () => {
  it('halves usable capacity exactly', () => {
    const noBuddy = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    const buddy = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: true }),
      }),
    )
    expect(buddy.usableCapacity / noBuddy.usableCapacity).toBeCloseTo(0.5, 6)
  })
})

describe('BeeGFS volumetry — MDT via tiering', () => {
  const tieredOptions = (metadataBuddyMirror: boolean): BeeGfsOptions =>
    beegfs({
      drivesPerTarget: 12,
      storageBuddyMirror: false,
      metadataBuddyMirror,
      tiering: {
        enabled: true,
        cacheMode: 'write-back',
        workingSetPercent: 20,
        fastTier: { driveId: MDT_DRIVE_ID, driveCount: 2 },
        capacityTier: { driveId: ST_DRIVE_ID, driveCount: 12 },
      },
    })

  it('fast-tier (MDT) drives raise rawCapacity but leave usableCapacity untouched', () => {
    const untiered = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        drive: { ...testDrive1TB, capacity_raw: ST_DRIVE_BYTES },
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    const tiered = calculateVolumetry(
      createVolumetryInput(0, raid6, {
        beeGfsOptions: tieredOptions(false),
      }),
    )

    expect(tiered.rawCapacity).toBeGreaterThan(untiered.rawCapacity)
    expect(tiered.rawCapacity - untiered.rawCapacity).toBeCloseTo(2 * MDT_DRIVE_BYTES, -2)
    expect(tiered.usableCapacity).toBeCloseTo(untiered.usableCapacity, -2)
  })

  it('metadataBuddyMirror does NOT change usableCapacity, only halves mdtUsableCapacity', () => {
    const noMirror = calculateVolumetry(
      createVolumetryInput(0, raid6, { beeGfsOptions: tieredOptions(false) }),
    )
    const mirrored = calculateVolumetry(
      createVolumetryInput(0, raid6, { beeGfsOptions: tieredOptions(true) }),
    )

    expect(mirrored.usableCapacity).toBeCloseTo(noMirror.usableCapacity, -2)
    expect(mirrored.beeGfsDetails?.mdtUsableCapacity ?? 0).toBeCloseTo(
      (noMirror.beeGfsDetails?.mdtUsableCapacity ?? 0) / 2,
      -2,
    )
  })

  it('estimated file count matches the 500 GB / 150M ext4 density', () => {
    const result = calculateVolumetry(
      createVolumetryInput(0, raid6, { beeGfsOptions: tieredOptions(false) }),
    )
    const details = result.beeGfsDetails
    expect(details).toBeDefined()
    const expectedFileCount = ((details?.mdtUsableCapacity ?? 0) / 500_000_000_000) * 150_000_000
    expect(details?.estimatedFileCount).toBeCloseTo(expectedFileCount, 4)
  })

  it('advisory status transitions none -> under -> ok', () => {
    const none = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(none.beeGfsDetails?.status).toBe('none')
    expect(none.beeGfsDetails?.mdtRawCapacity).toBe(0)

    const under = calculateVolumetry(
      createVolumetryInput(0, raid6, {
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          metadataBuddyMirror: false,
          tiering: {
            enabled: true,
            cacheMode: 'write-back',
            workingSetPercent: 20,
            fastTier: { driveId: MDT_DRIVE_ID, driveCount: 1 }, // too small
            capacityTier: { driveId: ST_DRIVE_ID, driveCount: 12 },
          },
        }),
      }),
    )
    expect(under.beeGfsDetails?.status).toBe('under')

    const ok = calculateVolumetry(
      createVolumetryInput(0, raid6, { beeGfsOptions: tieredOptions(false) }),
    )
    expect(ok.beeGfsDetails?.status).toBe('ok')
  })
})

describe('BeeGFS volumetry — storage target count', () => {
  it('storageTargetCount / strandedDrives on a non-multiple drive count', () => {
    const result = calculateVolumetry(
      createVolumetryInput(15, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(result.beeGfsDetails?.storageTargetCount).toBe(1)
    expect(result.beeGfsDetails?.strandedDrives).toBe(3)
  })
})

describe('BeeGFS volumetry — validation guards', () => {
  it('returns zero-state when storageBuddyMirror is on with < 2 nodes', () => {
    const result = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 1,
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: true }),
      }),
    )
    expect(result.usableCapacity).toBe(0)
    expect(result.breakdown[0]?.label).toBe('Buddy mirroring needs >= 2 nodes')
  })

  it('returns zero-state when drives cannot form one whole storage target', () => {
    const result = calculateVolumetry(
      createVolumetryInput(5, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(result.usableCapacity).toBe(0)
    expect(result.breakdown[0]?.label).toBe('Need >= 12 drives for one storage target')
  })

  // drivesPerTarget below the level's physical RAID minimum must be rejected, not silently
  // clamped: a "beegfs_raid6" target with fewer than 4 drives is not a valid dual-parity RAID6,
  // so the dataFraction the engine would otherwise compute (via the internal clamp in
  // getLocalRaidFraction, kept as defence-in-depth) would not correspond to the configuration
  // the user actually entered.
  it.each([
    { level: 'beegfs_raid6' as const, topology: raid6, min: 4 },
    { level: 'beegfs_raidz2' as const, topology: raidz2, min: 4 },
    { level: 'beegfs_raid10' as const, topology: raid10, min: 2 },
    { level: 'beegfs_single' as const, topology: single, min: 1 },
  ])('returns zero-state for $level with drivesPerTarget one below its minimum ($min)', ({
    level,
    topology,
    min,
  }) => {
    const result = calculateVolumetry(
      createVolumetryInput(24, topology, {
        beeGfsOptions: beegfs({ drivesPerTarget: min - 1, storageBuddyMirror: false }),
      }),
    )
    expect(result.usableCapacity).toBe(0)
    expect(result.breakdown[0]?.label).toBe(`${level} needs >= ${min} drives per target`)
  })
})
