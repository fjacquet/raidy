/**
 * Input validation and edge case handling for volumetry calculations.
 *
 * Provides graceful degradation for invalid inputs:
 * - Null/undefined topology
 * - Zero drives
 * - Null/undefined drive
 *
 * Returns zero-state results instead of throwing errors.
 */

import type { TieredCapacityResult } from '@/engines/shared/tiering'
import type { Drive } from '@/types/drive'
import type { VolumetryResult } from '@/types/results'
import type { BeeGfsOptions, Topology } from '@/types/topology'

/**
 * Zero-state result for invalid configurations.
 */
const ZERO_STATE_RESULT: VolumetryResult = {
  rawCapacity: 0,
  parityOverhead: 0,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 0,
  effectiveCapacity: 0,
  efficiency: 0,
  breakdown: [],
  zfsDetails: undefined,
}

/**
 * Create zero-state result with custom error label.
 */
function createZeroStateResult(label: string, rawCapacity = 0): VolumetryResult {
  return {
    ...ZERO_STATE_RESULT,
    rawCapacity,
    breakdown: [
      {
        label,
        bytes: 0,
        percent: 0,
        color: 'var(--color-overhead)',
      },
    ],
  }
}

/**
 * Validate topology input.
 *
 * @returns Null if invalid, undefined if valid
 */
export function validateTopology(
  topology: Topology | null | undefined,
  drive: Drive | null | undefined,
  driveCount: number,
): VolumetryResult | null {
  if (!topology) {
    const rawCapacity = drive?.capacity_raw ? drive.capacity_raw * driveCount : 0
    return createZeroStateResult('Invalid Configuration', rawCapacity)
  }
  return null
}

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

/**
 * Validate BeeGFS-specific requirements: Buddy Mirroring needs at least 2 nodes
 * (buddy groups must span fault domains), and the effective drive count must
 * form at least one whole storage target. Returns a zero-state result (with
 * raw capacity preserved) when either guard fails, else null.
 *
 * Must run AFTER tiering is resolved (like {@link validateDriveCount}): when MDT
 * tiering is configured, the top-level `driveCount` is conventionally 0 ("not
 * used when tiering enabled" — see S2D/Ceph tests), and the storage-target
 * drive count comes from the capacity tier instead.
 */
export function validateBeeGfsRequirements(
  topology: Topology | null | undefined,
  drive: Drive | null | undefined,
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  beeGfsOptions: BeeGfsOptions | null | undefined,
  tieredCapacity: TieredCapacityResult | null,
): VolumetryResult | null {
  if (topology?.type !== 'beegfs' || !beeGfsOptions) return null

  const rawCapacity = drive?.capacity_raw ? drive.capacity_raw * driveCount : 0

  if (beeGfsOptions.storageBuddyMirror === true && serverCount < 2) {
    return createZeroStateResult('Buddy mirroring needs >= 2 nodes', rawCapacity)
  }

  const drivesPerTarget = beeGfsOptions.drivesPerTarget
  const effectiveDriveCount = tieredCapacity ? tieredCapacity.capacityTierDriveCount : driveCount
  const effectiveDrives = effectiveDriveCount - hotSpares
  if (drivesPerTarget > 0 && effectiveDrives < drivesPerTarget) {
    return createZeroStateResult(
      `Need >= ${drivesPerTarget} drives for one storage target`,
      rawCapacity,
    )
  }

  return null
}

/**
 * Validate drive count.
 *
 * @returns Null if valid, error result if invalid
 */
export function validateDriveCount(
  driveCount: number,
  tieredCapacity: TieredCapacityResult | null,
): VolumetryResult | null {
  // Handle edge case: zero drives (graceful degradation)
  // Allow driveCount=0 if tiering is configured (tiering provides drives)
  if (driveCount === 0 && !tieredCapacity) {
    return createZeroStateResult('No Drives')
  }
  return null
}

/**
 * Validate drive.
 *
 * @returns Null if valid, error result if invalid
 */
export function validateDrive(
  drive: Drive | null | undefined,
  tieredCapacity: TieredCapacityResult | null,
): VolumetryResult | null {
  // Handle edge case: null/undefined drive (graceful degradation)
  // Allow null drive if tiering is configured (tiering provides drives)
  if (
    (!drive || drive.capacity_raw === undefined || drive.capacity_raw === null) &&
    !tieredCapacity
  ) {
    return createZeroStateResult('Invalid Drive')
  }
  return null
}
