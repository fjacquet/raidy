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
  TopologyType,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
import { assertNever } from '@/utils/typeGuards'
import { getFilesystemOverheadPercent } from './overhead/filesystem-overhead'
// Overhead modules
import { getObjectScaleGeoOverhead } from './overhead/objectscale-geo'
// Breakdown builder
import { buildBreakdown } from './breakdown/buildBreakdown'
// Validation module
import {
  checkTieringConfiguration,
  validateDrive,
  validateDriveCount,
  validateTopology,
} from './validation/inputValidation'
// Helper functions
import { getDataFraction, getZfsOverhead } from './helpers/calculationHelpers'

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

  // Synology system partition overhead (20-30GB per disk)
  let synologySystemOverhead = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('synology_')) {
    synologySystemOverhead = synologyOptions.systemPartitionSize * usableDrives
  }

  // Calculate parity/redundancy overhead
  const dataFraction = getDataFraction(
    topology,
    usableDrives,
    s2dOptions,
    cephOptions,
    nutanixOptions,
    serverCount,
  )
  const capacityAfterSysPartition = rawUsableCapacity - synologySystemOverhead
  const capacityAfterParity = capacityAfterSysPartition * dataFraction
  const parityOverhead = capacityAfterSysPartition - capacityAfterParity

  // S2D rebuild reserve (per-drive or per-node based on reserveStrategy)
  let s2dReserve = 0
  if (topology.type === 's2d' && s2dOptions.rebuildReserve) {
    if (s2dOptions.reserveStrategy === 'node_failure') {
      // Reserve one node's worth of capacity
      s2dReserve = drive.capacity_raw * (usableDrives / s2dOptions.faultDomains)
    } else {
      // Reserve one drive equivalent per fault domain
      s2dReserve = drive.capacity_raw * s2dOptions.faultDomains
    }
  }

  // ZFS-specific overhead (slop space = 1/32)
  let slopOverhead = 0
  let zfsAshiftOverhead = 0
  if (topology.type === 'zfs' && zfsOptions) {
    const zfsOverhead = getZfsOverhead(capacityAfterParity, zfsOptions, drive.sector_size)
    slopOverhead = zfsOverhead.slop
    zfsAshiftOverhead = zfsOverhead.ashift
  }

  // PowerFlex Fine Granularity metadata overhead (12-15%)
  let powerFlexFgOverhead = 0
  if (topology.type === 'powerflex' && powerFlexOptions.granularity === 'fine') {
    powerFlexFgOverhead = capacityAfterParity * powerFlexOptions.fgOverhead
  }

  // NetApp snapshot reserve
  let netAppSnapshotReserve = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('netapp_')) {
    netAppSnapshotReserve = capacityAfterParity * netAppOptions.snapshotReserve
  }

  // Nutanix system overhead (5-10% for snapshots, metadata, CVM, rebuild)
  // Per spec: C_formatted = C_raw × 0.90 (10% overhead)
  let nutanixSystemOverhead = 0
  if (topology.type === 'nutanix') {
    nutanixSystemOverhead = capacityAfterParity * nutanixOptions.systemOverhead
  }

  // ObjectScale system overhead (10-20% for metadata, indexes, S3 protocol overhead)
  // Plus geo-overhead for multi-site replication (per SME spec)
  let objectscaleSystemOverhead = 0
  let objectscaleGeoOverhead = 0
  if (topology.type === 'objectscale') {
    objectscaleSystemOverhead =
      capacityAfterParity * (objectscaleOptions.systemOverheadPercent / 100)
    // Apply geo-overhead factor for multi-site replication
    const geoFactor = getObjectScaleGeoOverhead(topology, objectscaleOptions.sites)
    if (geoFactor > 1.0) {
      // Geo-overhead reduces usable capacity by the inverse of the factor
      objectscaleGeoOverhead = capacityAfterParity * (1 - 1 / geoFactor)
    }
  }

  // PowerStore snapshot reserve
  let powerstoreSnapshotReserve = 0
  if (topology.type === 'powerstore') {
    powerstoreSnapshotReserve =
      capacityAfterParity * (powerstoreOptions.snapshotReservePercent / 100)
  }

  // PowerScale snapshot reserve
  let powerscaleSnapshotReserve = 0
  if (topology.type === 'powerscale') {
    powerscaleSnapshotReserve =
      capacityAfterParity * (powerscaleOptions.snapshotReservePercent / 100)
  }

  // Filesystem overhead
  const fsOverheadPercent = getFilesystemOverheadPercent(topology, synologyOptions, netAppOptions)
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
  const filesystemOverhead = capacityForFs * fsOverheadPercent

  // Usable capacity (before compression/dedup and safe capacity factor)
  let usableCapacity = capacityForFs - filesystemOverhead

  // Ceph safe capacity factor (nearfull threshold, default 85%)
  // Per spec: C_safe = C_usable × 0.85
  let cephSafeCapacityReduction = 0
  if (topology.type === 'ceph' && cephOptions) {
    cephSafeCapacityReduction = usableCapacity * (1 - cephOptions.safeCapacityThreshold)
    usableCapacity = usableCapacity * cephOptions.safeCapacityThreshold
  }

  // Effective capacity (after compression and dedup)
  // Only apply compression/dedup for topologies that support it
  let effectiveCapacity = usableCapacity

  // Standard RAID has no compression/deduplication - effectiveCapacity = usableCapacity
  // S2D has no inline compression/dedup at storage layer
  // ZFS supports compression and dedup via filesystem
  if (topology.type === 'zfs') {
    effectiveCapacity = usableCapacity * compressionRatio * dedupRatio
  }

  // NetApp DRR (Data Reduction Ratio) - applies on top of standard compression/dedup
  // Includes zero-detection + inline dedup + inline compression + compaction
  if (topology.type === 'proprietary' && topology.level.startsWith('netapp_')) {
    effectiveCapacity = usableCapacity * netAppOptions.dataReductionRatio
  }

  // PowerFlex compression ratio (only for modes with compression enabled)
  if (topology.type === 'powerflex' && powerFlexOptions.compression) {
    effectiveCapacity = usableCapacity * powerFlexOptions.compressionRatio
  }

  // Nutanix compression and deduplication
  // Per spec: C_effective = C_usable × (Ratio_comp × Ratio_dedup)
  if (topology.type === 'nutanix') {
    const nutanixCompRatio = nutanixOptions.compression ? nutanixOptions.compressionRatio : 1.0
    const nutanixDedupRatio = nutanixOptions.dedup ? nutanixOptions.dedupRatio : 1.0
    effectiveCapacity = usableCapacity * nutanixCompRatio * nutanixDedupRatio
  }

  // ObjectScale compression (for S3 object storage)
  if (topology.type === 'objectscale' && objectscaleOptions.compression) {
    effectiveCapacity = usableCapacity * objectscaleOptions.compressionRatio
  }

  // PowerStore compression and deduplication
  if (topology.type === 'powerstore') {
    const psCompRatio = powerstoreOptions.compression ? powerstoreOptions.compressionRatio : 1.0
    const psDedupRatio = powerstoreOptions.dedup ? powerstoreOptions.dedupRatio : 1.0
    effectiveCapacity = usableCapacity * psCompRatio * psDedupRatio
  }

  // PowerScale compression and deduplication
  if (topology.type === 'powerscale') {
    const pscCompRatio = powerscaleOptions.compression ? powerscaleOptions.compressionRatio : 1.0
    const pscDedupRatio = powerscaleOptions.dedup ? powerscaleOptions.dedupRatio : 1.0
    effectiveCapacity = usableCapacity * pscCompRatio * pscDedupRatio
  }

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
    const zpoolUsable = rawUsableCapacity - parityOverhead - zfsAshiftOverhead
    const zfsUsable = zpoolUsable - slopOverhead - filesystemOverhead
    const recommendedMinFree = zfsUsable * 0.2 // 20% headroom recommendation
    const practicalUsable = zfsUsable - recommendedMinFree

    zfsDetails = {
      totalRawCapacity: rawCapacity,
      zpoolCapacity: rawUsableCapacity, // After hot spares
      parityOverhead: parityOverhead,
      ashiftPaddingOverhead: zfsAshiftOverhead,
      zpoolUsableCapacity: zpoolUsable,
      slopSpaceReservation: slopOverhead,
      zfsUsableCapacity: zfsUsable,
      recommendedMinFreeSpace: recommendedMinFree,
      practicalUsableCapacity: practicalUsable,
      effectiveCapacity: effectiveCapacity,
      compressionRatio,
      dedupRatio,
      ashift: zfsOptions.ashift,
      recordSize: zfsOptions.recordsize,
    }
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
