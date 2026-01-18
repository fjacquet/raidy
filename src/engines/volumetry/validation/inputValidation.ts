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

import type { Drive } from '@/types/drive'
import type { VolumetryResult } from '@/types/results'
import type {
  CephOptions,
  NutanixOptions,
  S2DOptions,
  Topology,
  VsanOptions,
} from '@/types/topology'
import {
  calculateTieredCapacity,
  type TieredCapacityResult,
} from '../tiering/calculateTieredCapacity'

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
 * Check if tiering is configured for the topology.
 */
export function checkTieringConfiguration(
  topology: Topology,
  serverCount: number,
  s2dOptions: S2DOptions,
  vsanOptions: VsanOptions,
  cephOptions: CephOptions,
  nutanixOptions: NutanixOptions,
): TieredCapacityResult | null {
  // S2D tiering
  if (
    topology.type === 's2d' &&
    s2dOptions &&
    s2dOptions.storageTiers &&
    s2dOptions.tieringConfig
  ) {
    return calculateTieredCapacity(s2dOptions.tieringConfig, serverCount)
  }

  // vSAN OSA tiering (disk groups)
  if (topology.type === 'vsan_osa' && vsanOptions && vsanOptions.tiering) {
    return calculateTieredCapacity(vsanOptions.tiering, serverCount)
  }

  // Ceph WAL/DB tiering
  if (topology.type === 'ceph' && cephOptions && cephOptions.walDbOffload && cephOptions.tiering) {
    return calculateTieredCapacity(cephOptions.tiering, serverCount)
  }

  // Nutanix hybrid tiering (SSD cache + HDD capacity)
  if (
    topology.type === 'nutanix' &&
    nutanixOptions &&
    nutanixOptions.clusterType === 'hybrid' &&
    nutanixOptions.tiering
  ) {
    return calculateTieredCapacity(nutanixOptions.tiering, serverCount)
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
