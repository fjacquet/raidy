/**
 * Volumetry & Efficiency Engine (Module A)
 * Calculates usable capacity after all overhead factors.
 */

import drivesData from '@/data/drives.json'
import type { Drive } from '@/types/drive'
import type { VolumetryResult, ZfsCapacityDetails } from '@/types/results'
import type {
  CephOptions,
  NetAppOptions,
  NutanixOptions,
  ObjectScaleOptions,
  PowerFlexOptions,
  PowerScaleOptions,
  PowerStoreOptions,
  PowerVaultOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
// Breakdown builder
import { buildBreakdown } from './breakdown/buildBreakdown'
// Helper functions
import { getDataFraction } from './helpers/calculationHelpers'
// Overhead modules
import { calculateOverheads } from './overhead/overheadCalculator'
// Post-processing (compression, dedup, ZFS details)
import { applyCompressionDedup, buildZfsDetails } from './postProcessing/capacityEnhancements'
// Validation module
import {
  checkTieringConfiguration,
  validateDrive,
  validateDriveCount,
  validateTopology,
} from './validation/inputValidation'

// Type assertion for the imported JSON
const _drives = drivesData as Record<string, Drive>

export interface VolumetryInput {
  drive: Drive
  driveCount: number
  hotSpares: number
  serverCount: number
  topology: Topology
  zfsOptions: ZfsOptions
  s2dOptions: S2DOptions
  vsanOptions: VsanOptions
  objectscaleOptions: ObjectScaleOptions
  powerstoreOptions: PowerStoreOptions
  powerscaleOptions: PowerScaleOptions
  cephOptions: CephOptions
  powerFlexOptions: PowerFlexOptions
  netAppOptions: NetAppOptions
  synologyOptions: SynologyOptions
  nutanixOptions: NutanixOptions
  powervaultOptions: PowerVaultOptions
  compressionRatio: number
  dedupRatio: number
}

/**
 * Calculate complete volumetry results.
 * Implements spec formulas:
 * - Ceph: C_safe = C_usable × safeCapacityThreshold (default 0.85)
 * - NetApp: C_eff = (C_raw - RAID_overhead) × (1 - snap%) × DRR × (1 - WAFL%)
 * - Synology: System partition 20-30GB per disk
 * - PowerFlex FG: 12-15% metadata overhead
 * - ZFS: Slop space 1/64 = 1.5625%
 */
export function calculateVolumetry(input: VolumetryInput): VolumetryResult {
  const {
    drive,
    driveCount,
    hotSpares,
    serverCount,
    topology,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    nutanixOptions,
    compressionRatio,
    dedupRatio,
  } = input

  // Validate topology
  const topologyValidation = validateTopology(topology, drive, driveCount)
  if (topologyValidation) return topologyValidation

  // Check for tiered configuration (must happen before driveCount/drive validation)
  const tieredCapacity = checkTieringConfiguration(
    topology,
    serverCount,
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
  )

  // Validate drive count
  const driveCountValidation = validateDriveCount(driveCount, tieredCapacity)
  if (driveCountValidation) return driveCountValidation

  // Validate drive
  const driveValidation = validateDrive(drive, tieredCapacity)
  if (driveValidation) return driveValidation

  // Calculate raw capacity based on tiering or standard configuration
  const effectiveDrive = tieredCapacity?.capacityTierDrive ?? drive
  const effectiveDriveCount = tieredCapacity ? tieredCapacity.capacityTierDriveCount : driveCount
  const cacheTierCapacity = tieredCapacity?.cacheTierCapacity ?? 0

  // Raw capacity (all drives including hot spares and cache tier)
  const rawCapacity = tieredCapacity
    ? tieredCapacity.capacityTierCapacity + tieredCapacity.cacheTierCapacity
    : drive.capacity_raw * driveCount

  // Hot spare overhead (applies to capacity tier only when tiered)
  const hotSpareOverhead = tieredCapacity
    ? (tieredCapacity.capacityTierDrive?.capacity_raw ?? 0) * hotSpares
    : drive.capacity_raw * hotSpares

  // Usable drives after hot spares (capacity tier only when tiered)
  const usableDrives = effectiveDriveCount - hotSpares
  const rawUsableCapacity = effectiveDrive.capacity_raw * usableDrives

  // Calculate parity/redundancy overhead
  const dataFraction = getDataFraction(
    topology,
    usableDrives,
    s2dOptions,
    cephOptions,
    nutanixOptions,
    serverCount,
  )

  // Synology system partition overhead must be calculated before parity
  let synologySystemOverhead = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('synology_')) {
    synologySystemOverhead = synologyOptions.systemPartitionSize * usableDrives
  }

  const capacityAfterSysPartition = rawUsableCapacity - synologySystemOverhead
  const capacityAfterParity = capacityAfterSysPartition * dataFraction
  const parityOverhead = capacityAfterSysPartition - capacityAfterParity

  // Calculate all overhead factors
  const overheads = calculateOverheads({
    topology,
    drive,
    usableDrives,
    rawUsableCapacity,
    capacityAfterParity,
    usableCapacity: 0, // Will be calculated below
    synologyOptions,
    s2dOptions,
    zfsOptions,
    powerFlexOptions,
    netAppOptions,
    nutanixOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
  })

  // Extract overhead values
  const {
    s2dReserve,
    slopOverhead,
    zfsAshiftOverhead,
    powerFlexFgOverhead,
    netAppSnapshotReserve,
    nutanixSystemOverhead,
    objectscaleSystemOverhead,
    objectscaleGeoOverhead,
    powerstoreSnapshotReserve,
    powerscaleSnapshotReserve,
    filesystemOverhead,
  } = overheads

  // Usable capacity (before compression/dedup and safe capacity factor)
  const capacityForFs =
    capacityAfterParity -
    slopOverhead -
    s2dReserve -
    powerFlexFgOverhead -
    netAppSnapshotReserve -
    nutanixSystemOverhead -
    objectscaleSystemOverhead -
    objectscaleGeoOverhead -
    powerstoreSnapshotReserve -
    powerscaleSnapshotReserve
  let usableCapacity = capacityForFs - filesystemOverhead

  // Ceph safe capacity factor (nearfull threshold, default 85%)
  // Per spec: C_safe = C_usable × 0.85
  let cephSafeCapacityReduction = 0
  if (topology.type === 'ceph' && cephOptions) {
    cephSafeCapacityReduction = usableCapacity * (1 - cephOptions.safeCapacityThreshold)
    usableCapacity = usableCapacity * cephOptions.safeCapacityThreshold
  }

  // Apply compression and deduplication
  const effectiveCapacity = applyCompressionDedup(
    topology,
    usableCapacity,
    compressionRatio,
    dedupRatio,
    {
      netAppOptions,
      powerFlexOptions,
      nutanixOptions,
      objectscaleOptions,
      powerstoreOptions,
      powerscaleOptions,
    },
  )

  // Overall efficiency
  // Handle division by zero or invalid calculations
  let efficiency = rawCapacity > 0 ? (usableCapacity / rawCapacity) * 100 : 0
  // Clamp to 0 if NaN or Infinity
  if (!Number.isFinite(efficiency)) {
    efficiency = 0
  }

  // Build breakdown for visualization
  const breakdown = buildBreakdown({
    rawCapacity,
    usableCapacity,
    parityOverhead,
    hotSpareOverhead,
    cacheTierCapacity,
    slopOverhead,
    s2dReserve,
    synologySystemOverhead,
    powerFlexFgOverhead,
    netAppSnapshotReserve,
    nutanixSystemOverhead,
    objectscaleSystemOverhead,
    objectscaleGeoOverhead,
    powerstoreSnapshotReserve,
    powerscaleSnapshotReserve,
    cephSafeCapacityReduction,
    filesystemOverhead,
    topology,
    s2dOptions,
    objectscaleOptions,
  })

  // Build ZFS-specific details if ZFS topology
  let zfsDetails: ZfsCapacityDetails | undefined
  if (topology.type === 'zfs' && zfsOptions) {
    zfsDetails = buildZfsDetails(
      rawCapacity,
      rawUsableCapacity,
      parityOverhead,
      zfsAshiftOverhead,
      slopOverhead,
      filesystemOverhead,
      effectiveCapacity,
      compressionRatio,
      dedupRatio,
      zfsOptions,
    )
  }

  return {
    rawCapacity,
    parityOverhead,
    hotSpareOverhead,
    filesystemOverhead,
    slopOverhead,
    usableCapacity,
    effectiveCapacity,
    efficiency,
    breakdown,
    zfsDetails,
  }
}
