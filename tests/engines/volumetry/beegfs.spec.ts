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
    // Capacity is computed on whole storage targets only, so drivesPerTarget sets BOTH the
    // parity fraction AND how many of the 12 drives are in a target at all:
    //   dPT 10 -> 1 whole target (10 drives), 2 stranded: 10 TB x 8/10 x 0.98 = 7.84 TB
    //   dPT 12 -> 1 whole target (12 drives), 0 stranded: 12 TB x 10/12 x 0.98 = 9.8 TB
    // The wider target wins here despite its worse parity ratio, purely because it strands
    // nothing — exactly the trade-off the panel's derived target/stranded counts surface.
    expect(at10.usableCapacity / TB).toBeCloseTo(7.84, 4)
    expect(at12.usableCapacity / TB).toBeCloseTo(9.8, 4)
    expect(at10.beeGfsDetails?.storageTargetCount).toBe(1)
    expect(at10.beeGfsDetails?.strandedDrives).toBe(2)
    expect(at12.beeGfsDetails?.strandedDrives).toBe(0)
    // Raw still counts every drive, stranded ones included.
    expect(at10.rawCapacity / TB).toBeCloseTo(12, 4)
  })

  it('excludes stranded drives from usable capacity and books them in the breakdown', () => {
    // 23 drives at drivesPerTarget 12 is the near-worst case: 1 whole target, 11 stranded.
    const result = calculateVolumetry(
      createVolumetryInput(23, raid6, {
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(result.beeGfsDetails?.storageTargetCount).toBe(1)
    expect(result.beeGfsDetails?.strandedDrives).toBe(11)
    // 12 TB x 10/12 x 0.98 = 9.8 TB — NOT 23 TB x 10/12 x 0.98 = 18.78 TB (a 92% overstatement).
    expect(result.usableCapacity / TB).toBeCloseTo(9.8, 4)
    expect(result.rawCapacity / TB).toBeCloseTo(23, 4)
    const stranded = result.breakdown.find((b) => b.label === 'BeeGFS Stranded Drives')
    expect(stranded?.bytes).toBeCloseTo(11 * TB, 4)
  })

  it('books no stranded-drive breakdown entry when every drive fills a target', () => {
    const result = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(result.beeGfsDetails?.strandedDrives).toBe(0)
    expect(result.breakdown.some((b) => b.label === 'BeeGFS Stranded Drives')).toBe(false)
  })

  it('excludes hot spares before deriving whole targets', () => {
    // 26 drives - 2 hot spares = 24 -> 2 whole targets, 0 stranded.
    const result = calculateVolumetry(
      createVolumetryInput(26, raid6, {
        serverCount: 2,
        hotSpares: 2,
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    expect(result.beeGfsDetails?.storageTargetCount).toBe(2)
    expect(result.beeGfsDetails?.strandedDrives).toBe(0)
    // 24 TB x 10/12 x 0.98 = 19.6 TB
    expect(result.usableCapacity / TB).toBeCloseTo(19.6, 4)
  })
})

describe('BeeGFS volumetry — fsOverheadPercent', () => {
  it('a higher ext4/xfs filesystem overhead reduces usable capacity', () => {
    const lowOverhead = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          fsOverheadPercent: 1,
        }),
      }),
    )
    const highOverhead = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          fsOverheadPercent: 5,
        }),
      }),
    )
    // 24 TB x 10/12 x (1 - 0.01) = 19.8 TB vs 24 TB x 10/12 x (1 - 0.05) = 19 TB — the panel's
    // fsOverheadPercent control is the only thing that moves this number for BeeGFS, so a
    // regression that silently ignores it (e.g. always falling back to the 2% default) shows up
    // as these two no longer differing.
    expect(lowOverhead.usableCapacity / TB).toBeCloseTo(19.8, 4)
    expect(highOverhead.usableCapacity / TB).toBeCloseTo(19, 4)
    expect(highOverhead.usableCapacity).toBeLessThan(lowOverhead.usableCapacity)
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
      metadataTargets: true,
      tiering: {
        enabled: true,
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
    // Absolute values, not a ratio against the engine's own output: 2 x 960 GB MDT drives ->
    // 1.92 TB raw, x 0.5 for the RAID1/RAID10 metadata volume -> 960 GB, halved again by
    // metadata buddy mirroring -> 480 GB. Pinning the ratio alone left the 0.5 factor free.
    expect(noMirror.beeGfsDetails?.mdtRawCapacity).toBeCloseTo(1_920_000_000_000, -3)
    expect(noMirror.beeGfsDetails?.mdtUsableCapacity).toBeCloseTo(960_000_000_000, -3)
    expect(mirrored.beeGfsDetails?.mdtUsableCapacity).toBeCloseTo(480_000_000_000, -3)
  })

  it('estimated file count matches the 500 GB / 150M ext4 density', () => {
    const result = calculateVolumetry(
      createVolumetryInput(0, raid6, { beeGfsOptions: tieredOptions(false) }),
    )
    // Absolute expectation, NOT a recomputation of the engine's formula from the engine's own
    // mdtUsableCapacity — that earlier form stayed green when the 0.5 MDT factor was mutated
    // to 0.45, because both sides moved together.
    // 960 GB usable MDT / 500 GB x 150M files = 288M files.
    expect(result.beeGfsDetails?.estimatedFileCount).toBeCloseTo(288_000_000, 0)
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
          metadataTargets: true,
          tiering: {
            enabled: true,
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

describe('BeeGFS volumetry — metadataTargets gate', () => {
  it('does not activate tiering when metadataTargets is false, even with both drive pickers filled', () => {
    const untiered = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        drive: { ...testDrive1TB, capacity_raw: ST_DRIVE_BYTES },
        beeGfsOptions: beegfs({ drivesPerTarget: 12, storageBuddyMirror: false }),
      }),
    )
    const gateOff = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        drive: { ...testDrive1TB, capacity_raw: ST_DRIVE_BYTES },
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          metadataTargets: false, // both tier drives filled below, but the gate is off
          tiering: {
            enabled: true,
            workingSetPercent: 20,
            fastTier: { driveId: MDT_DRIVE_ID, driveCount: 2 },
            capacityTier: { driveId: ST_DRIVE_ID, driveCount: 12 },
          },
        }),
      }),
    )

    // Tiering never resolves, so rawCapacity/usableCapacity come from the Hardware panel's
    // drive/count exactly as in the untiered case, not from the tiering capacity tier.
    expect(gateOff.rawCapacity).toBeCloseTo(untiered.rawCapacity, -2)
    expect(gateOff.usableCapacity).toBeCloseTo(untiered.usableCapacity, -2)
  })

  it('MDT advisory status is "none" when metadataTargets is off', () => {
    const gateOff = calculateVolumetry(
      createVolumetryInput(12, raid6, {
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          metadataTargets: false,
          tiering: {
            enabled: true,
            workingSetPercent: 20,
            fastTier: { driveId: MDT_DRIVE_ID, driveCount: 2 },
            capacityTier: { driveId: ST_DRIVE_ID, driveCount: 12 },
          },
        }),
      }),
    )
    expect(gateOff.beeGfsDetails?.status).toBe('none')
    expect(gateOff.beeGfsDetails?.mdtRawCapacity).toBe(0)
  })

  it('activates tiering once metadataTargets is turned on with the same config', () => {
    const gateOn = calculateVolumetry(
      createVolumetryInput(0, raid6, {
        beeGfsOptions: beegfs({
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          metadataTargets: true,
          tiering: {
            enabled: true,
            workingSetPercent: 20,
            fastTier: { driveId: MDT_DRIVE_ID, driveCount: 2 },
            capacityTier: { driveId: ST_DRIVE_ID, driveCount: 12 },
          },
        }),
      }),
    )
    expect(gateOn.beeGfsDetails?.status).not.toBe('none')
    expect(gateOn.beeGfsDetails?.mdtRawCapacity).toBeGreaterThan(0)
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
