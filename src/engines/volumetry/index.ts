/**
 * Volumetry & Efficiency Engine (Module A)
 * Calculates usable capacity after all overhead factors.
 */

import drivesData from '@/data/drives.json'
// Shared tiering resolver
import { isAllFlashMedia, resolveTiering } from '@/engines/shared/tiering'
import type { FsType } from '@/types/config'
import type { Drive } from '@/types/drive'
import type {
  BeeGfsCapacityDetails,
  LonghornCapacityDetails,
  VolumetryResult,
  ZfsCapacityDetails,
} from '@/types/results'
import type {
  BeeGfsOptions,
  CephOptions,
  LonghornOptions,
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
// BeeGFS storage-target derivation (shared with the UI panel)
import { calculateStorageTargets } from './strategies/beegfs'
// Validation module
import {
  validateBeeGfsRequirements,
  validateDrive,
  validateDriveCount,
  validateReplicaPlacement,
  validateTopology,
} from './validation/inputValidation'

// Type assertion for the imported JSON - preserved for potential future drive lookup
// drivesData imported but variable intentionally unused with underscore prefix
void drivesData

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
  longhornOptions: LonghornOptions
  beeGfsOptions: BeeGfsOptions
  powerFlexOptions: PowerFlexOptions
  netAppOptions: NetAppOptions
  synologyOptions: SynologyOptions
  nutanixOptions: NutanixOptions
  powervaultOptions: PowerVaultOptions
  compressionRatio: number
  dedupRatio: number
  fsType: FsType
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
    longhornOptions,
    beeGfsOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    nutanixOptions,
    compressionRatio,
    dedupRatio,
    fsType,
  } = input

  // Validate topology
  const topologyValidation = validateTopology(topology, drive, driveCount)
  if (topologyValidation) return topologyValidation

  // Longhorn requires serverCount >= replica count for replica placement
  const replicaValidation = validateReplicaPlacement(topology, drive, driveCount, serverCount)
  if (replicaValidation) return replicaValidation

  // Check for tiered configuration (must happen before driveCount/drive validation)
  const tieredCapacity = resolveTiering(topology, serverCount, {
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
    beeGfsOptions,
  })

  // BeeGFS: Buddy Mirroring needs >= 2 nodes, and drive count must form >= 1 storage target.
  // Runs after tiering resolves, since driveCount is conventionally 0 when MDT tiering is
  // configured (see validateDriveCount below).
  const beeGfsValidation = validateBeeGfsRequirements(
    topology,
    drive,
    driveCount,
    serverCount,
    hotSpares,
    beeGfsOptions,
    tieredCapacity,
  )
  if (beeGfsValidation) return beeGfsValidation

  // Validate drive count
  const driveCountValidation = validateDriveCount(driveCount, tieredCapacity)
  if (driveCountValidation) return driveCountValidation

  // Validate drive
  const driveValidation = validateDrive(drive, tieredCapacity)
  if (driveValidation) return driveValidation

  // Calculate raw capacity based on tiering or standard configuration.
  // When tiered, the capacity tier is the resiliency media; the cache tier is excluded from
  // usable capacity and counted only toward raw (so cluster efficiency reflects it).
  const effectiveDrive = tieredCapacity?.capacityTierDrive ?? drive
  const effectiveDriveCount = tieredCapacity ? tieredCapacity.capacityTierDriveCount : driveCount
  const cacheTierCapacity = tieredCapacity?.cacheTierCapacity ?? 0
  // All-flash vs hybrid selects S2D's dual-parity efficiency table
  const isAllFlash = isAllFlashMedia(tieredCapacity, drive)

  // Raw capacity (all drives including hot spares and cache tier)
  const rawCapacity = tieredCapacity
    ? tieredCapacity.capacityTierCapacity + tieredCapacity.cacheTierCapacity
    : drive.capacity_raw * driveCount

  // Hot spare overhead (applies to capacity tier only when tiered)
  const hotSpareOverhead = tieredCapacity
    ? (tieredCapacity.capacityTierDrive?.capacity_raw ?? 0) * hotSpares
    : drive.capacity_raw * hotSpares

  // Usable drives after hot spares (capacity tier only when tiered). Defensively clamped to
  // >= 0: currently inert because validateBeeGfsRequirements (and the analogous per-platform
  // guards) zero-state before this point when hot spares would exceed the drive count, but the
  // clamp keeps this line matching resolveBeeGfsUsableDrives's Math.max(0, ...) by construction
  // rather than by relying on validation running first.
  const spareAdjustedDrives = Math.max(0, effectiveDriveCount - hotSpares)

  // BeeGFS: capacity is computed on WHOLE storage targets only (design spec, §Error handling).
  // A drive that does not complete a storage target joins no local RAID group and holds no
  // data — `validators.ts` already warns the user it is stranded and the capacity card prints
  // the count, so it must not be counted as usable capacity as well.
  // `calculateStorageTargets` is the single source of truth for this arithmetic, shared with
  // `BeeGfsOptionsPanel` via `deriveBeeGfsStorageTargets`; the result is reused verbatim for
  // `beeGfsDetails` below so the two can never drift.
  const beeGfsTargets =
    topology.type === 'beegfs' && beeGfsOptions
      ? calculateStorageTargets(spareAdjustedDrives, beeGfsOptions.drivesPerTarget)
      : null

  // Data-bearing drives. Identical to `spareAdjustedDrives` for every platform except BeeGFS,
  // where the stranded remainder is excluded — no other platform's capacity can move.
  const usableDrives = beeGfsTargets
    ? beeGfsTargets.storageTargetCount * (beeGfsOptions?.drivesPerTarget ?? 0)
    : spareAdjustedDrives

  // Raw capacity of the stranded BeeGFS drives: counted in raw, never in usable or parity.
  const beeGfsStrandedCapacity = beeGfsTargets
    ? effectiveDrive.capacity_raw * beeGfsTargets.strandedDrives
    : 0

  const rawUsableCapacity = effectiveDrive.capacity_raw * usableDrives

  // Calculate parity/redundancy overhead
  const dataFraction = getDataFraction(
    topology,
    usableDrives,
    s2dOptions,
    cephOptions,
    nutanixOptions,
    beeGfsOptions,
    serverCount,
    isAllFlash,
  )

  // Synology system partition overhead must be calculated before parity
  let synologySystemOverhead = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('synology_')) {
    synologySystemOverhead = synologyOptions.systemPartitionSize * usableDrives
  }

  const capacityAfterSysPartition = rawUsableCapacity - synologySystemOverhead

  // S2D rebuild reserve is unallocated RAW pool space, so it is removed BEFORE the resiliency
  // efficiency multiplier (matching Microsoft / Azure Local). Sized in whole capacity-tier
  // drives: one per server capped at 4 (default), or a whole node's drives (opt-in).
  let s2dReserve = 0
  if (topology.type === 's2d' && s2dOptions.rebuildReserve) {
    const reserveDrives =
      s2dOptions.reserveStrategy === 'node_failure'
        ? usableDrives / s2dOptions.faultDomains
        : Math.min(s2dOptions.faultDomains, 4)
    s2dReserve = effectiveDrive.capacity_raw * Math.min(reserveDrives, usableDrives)
  }
  // Never reserve more than the available raw pool (tiny clusters)
  s2dReserve = Math.min(s2dReserve, Math.max(0, capacityAfterSysPartition))

  const capacityAfterReserve = capacityAfterSysPartition - s2dReserve
  const capacityAfterParity = capacityAfterReserve * dataFraction
  const parityOverhead = capacityAfterReserve - capacityAfterParity

  // Calculate all overhead factors (effectiveDrive = capacity-tier drive when tiered)
  const overheads = calculateOverheads({
    topology,
    drive: effectiveDrive,
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
    beeGfsOptions,
    fsType,
  })

  // Extract overhead values
  const {
    s2dInfraReserve,
    slopOverhead,
    zfsAshiftOverhead,
    powerFlexFgOverhead,
    netAppSnapshotReserve,
    nutanixSystemOverhead,
    objectscaleSystemOverhead,
    objectscaleGeoOverhead,
    powerstoreSnapshotReserve,
    powerstoreSystemOverhead,
    powerscaleSnapshotReserve,
    filesystemOverhead,
  } = overheads

  // Usable capacity (before compression/dedup and safe capacity factor).
  // The S2D rebuild reserve was already removed pre-parity; only the post-efficiency
  // infrastructure reserve is subtracted here.
  const capacityForFs =
    capacityAfterParity -
    slopOverhead -
    s2dInfraReserve -
    powerFlexFgOverhead -
    netAppSnapshotReserve -
    nutanixSystemOverhead -
    objectscaleSystemOverhead -
    objectscaleGeoOverhead -
    powerstoreSnapshotReserve -
    powerstoreSystemOverhead -
    powerscaleSnapshotReserve
  let usableCapacity = capacityForFs - filesystemOverhead

  // Ceph safe capacity factor (nearfull threshold, default 85%)
  // Per spec: C_safe = C_usable × 0.85
  let cephSafeCapacityReduction = 0
  if (topology.type === 'ceph' && cephOptions) {
    cephSafeCapacityReduction = usableCapacity * (1 - cephOptions.safeCapacityThreshold)
    usableCapacity = usableCapacity * cephOptions.safeCapacityThreshold
  }

  // Longhorn guardrails: free-space reserve (F = 1 − minimalAvailable%) then snapshot reserve (÷S).
  // Growth and over-provisioning are advisory only (see longhornDetails), never subtracted here.
  let longhornFreeSpaceReserve = 0
  let longhornSnapshotReserve = 0
  if (topology.type === 'longhorn' && longhornOptions) {
    // Clamp defensively even though LonghornOptionsSchema validates these fields: the clamp
    // guards against an out-of-range % or a zero headroom reaching the engine by any path,
    // not just a crafted URL.
    const freeSpaceFactor = Math.max(
      0,
      Math.min(1, 1 - longhornOptions.minimalAvailablePercent / 100),
    )
    const beforeFreeSpace = usableCapacity
    usableCapacity = usableCapacity * freeSpaceFactor
    longhornFreeSpaceReserve = beforeFreeSpace - usableCapacity

    const snapshotDivisor = Math.max(1, longhornOptions.snapshotHeadroom)
    const beforeSnapshot = usableCapacity
    usableCapacity = usableCapacity / snapshotDivisor
    longhornSnapshotReserve = beforeSnapshot - usableCapacity
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
      cephOptions,
      vsanOptions,
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
    beeGfsStrandedCapacity,
    slopOverhead,
    s2dReserve,
    s2dInfraReserve,
    synologySystemOverhead,
    powerFlexFgOverhead,
    netAppSnapshotReserve,
    nutanixSystemOverhead,
    objectscaleSystemOverhead,
    objectscaleGeoOverhead,
    powerstoreSnapshotReserve,
    powerstoreSystemOverhead,
    powerscaleSnapshotReserve,
    cephSafeCapacityReduction,
    filesystemOverhead,
    topology,
    s2dOptions,
    objectscaleOptions,
    longhornFreeSpaceReserve,
    longhornSnapshotReserve,
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

  // Build Longhorn-specific advisory details if Longhorn topology
  let longhornDetails: LonghornCapacityDetails | undefined
  if (topology.type === 'longhorn' && longhornOptions) {
    longhornDetails = {
      physicalUsable: usableCapacity,
      recommendedCommittedData: usableCapacity / longhornOptions.growthHeadroom,
      perNodeUsable: serverCount > 0 ? usableCapacity / serverCount : usableCapacity,
      replicaCount: topology.level === 'longhorn_r3' ? 3 : 2,
      minimalAvailablePercent: longhornOptions.minimalAvailablePercent,
      overProvisioningPercent: longhornOptions.overProvisioningPercent,
      diskMode: longhornOptions.diskMode,
    }
  }

  // Build BeeGFS-specific metadata-target (MDT) advisory if BeeGFS topology.
  // Metadata rule of thumb (ThinkParQ): 0.3-0.5% of usable data capacity, 500 GB (decimal)
  // of ext4 metadata ~ 150M files.
  let beeGfsDetails: BeeGfsCapacityDetails | undefined
  if (topology.type === 'beegfs' && beeGfsOptions) {
    const GB_500 = 500 * 1_000_000_000
    const FILES_PER_500GB = 150_000_000

    const mdtRawCapacity = cacheTierCapacity
    const mdtUsableCapacity = mdtRawCapacity * 0.5 * (beeGfsOptions.metadataBuddyMirror ? 0.5 : 1)
    const mdtRecommendedMin = usableCapacity * 0.003
    const mdtRecommendedTypical = usableCapacity * 0.005
    const estimatedFileCount = (mdtUsableCapacity / GB_500) * FILES_PER_500GB
    const status: BeeGfsCapacityDetails['status'] =
      mdtRawCapacity === 0 ? 'none' : mdtUsableCapacity < mdtRecommendedMin ? 'under' : 'ok'

    // Reuse the exact object the usable-capacity calculation was built on — never recompute.
    const { storageTargetCount, strandedDrives } = beeGfsTargets ?? {
      storageTargetCount: 0,
      strandedDrives: 0,
    }

    beeGfsDetails = {
      mdtRawCapacity,
      mdtUsableCapacity,
      mdtRecommendedMin,
      mdtRecommendedTypical,
      estimatedFileCount,
      status,
      storageTargetCount,
      strandedDrives,
      storageBuddyMirror: beeGfsOptions.storageBuddyMirror,
      metadataBuddyMirror: beeGfsOptions.metadataBuddyMirror,
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
    longhornDetails,
    beeGfsDetails,
  }
}
