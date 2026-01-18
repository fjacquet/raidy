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
  TieringConfig,
  Topology,
  TopologyType,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
import { FILESYSTEM_OVERHEAD } from '@/types/topology'
import { assertNever } from '@/utils/typeGuards'

// Strategy imports
import { cephStrategy } from './strategies/ceph'
import { dellStrategy } from './strategies/dell'
import { nutanixStrategy } from './strategies/nutanix'
import { proprietaryStrategy } from './strategies/proprietary'
import { raidStrategy } from './strategies/raid'
import { s2dStrategy } from './strategies/s2d'
import type { VolumetryStrategy } from './strategies/VolumetryStrategy'
import { vsanStrategy } from './strategies/vsan'
import { zfsStrategy } from './strategies/zfs'

// Tiering module
import {
  calculateTieredCapacity,
  type TieredCapacityResult,
} from './tiering/calculateTieredCapacity'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Get ObjectScale geo-overhead factor for multi-site replication.
 * Based on SME spec tables for Replication Group overhead.
 * Returns the overhead multiplier (1.0 = no overhead, 2.67 = worst case for 2 sites EC 12+4)
 */
function getObjectScaleGeoOverhead(topology: Topology, sites: number): number {
  if (topology.type !== 'objectscale' || sites <= 1) {
    return 1.0 // No geo-overhead for single site
  }

  // Geo-overhead tables from SME spec
  const geoOverhead12_4: Record<number, number> = {
    1: 1.33,
    2: 2.67,
    3: 2.0,
    4: 1.77,
    5: 1.67,
    6: 1.6,
    7: 1.55,
    8: 1.52,
  }

  const geoOverhead10_2: Record<number, number> = {
    1: 1.2,
    2: 2.4,
    3: 1.8,
    4: 1.6,
    5: 1.5,
    6: 1.44,
    7: 1.4,
    8: 1.37,
  }

  // EC 24+4 uses similar overhead to 12+4 (scaled)
  const geoOverhead24_4: Record<number, number> = {
    1: 1.17,
    2: 2.33,
    3: 1.75,
    4: 1.56,
    5: 1.47,
    6: 1.4,
    7: 1.35,
    8: 1.31,
  }

  // Triple mirror uses 3x overhead factor
  const geoOverheadMirror3: Record<number, number> = {
    1: 3.0,
    2: 6.0,
    3: 4.5,
    4: 4.0,
    5: 3.75,
    6: 3.6,
    7: 3.5,
    8: 3.43,
  }

  const sitesKey = Math.min(Math.max(sites, 1), 8)

  switch (topology.level) {
    case 'objectscale_ec_12_4':
      return geoOverhead12_4[sitesKey] ?? 1.33
    case 'objectscale_ec_10_2':
      return geoOverhead10_2[sitesKey] ?? 1.2
    case 'objectscale_ec_24_4':
      return geoOverhead24_4[sitesKey] ?? 1.17
    case 'objectscale_mirror_3':
      return geoOverheadMirror3[sitesKey] ?? 3.0
    default:
      return 1.33
  }
}

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
 * Get volumetry strategy for topology type with exhaustive type checking.
 *
 * Uses strategy pattern to delegate calculations to topology-specific modules.
 * TypeScript will error at compile time if new topology type added without case.
 */
function getStrategy(topologyType: TopologyType): VolumetryStrategy {
  switch (topologyType) {
    case 'standard':
      return raidStrategy
    case 'zfs':
      return zfsStrategy
    case 's2d':
      return s2dStrategy
    case 'ceph':
      return cephStrategy
    case 'nutanix':
      return nutanixStrategy
    case 'vsan_esa':
    case 'vsan_osa':
      return vsanStrategy
    case 'powerflex':
    case 'powerstore':
    case 'powerscale':
    case 'objectscale':
      return dellStrategy
    case 'proprietary':
    case 'powervault':
      return proprietaryStrategy
    default:
      // TypeScript error if new topology type added without case
      return assertNever(topologyType)
  }
}

/**
 * Valid topology types for runtime checking.
 * Used to gracefully handle invalid topology types from URL params or user input.
 */
const VALID_TOPOLOGY_TYPES: readonly TopologyType[] = [
  'standard',
  'zfs',
  's2d',
  'proprietary',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'powerstore',
  'powerscale',
  'objectscale',
  'nutanix',
  'powervault',
] as const

/**
 * Calculate parity overhead factor based on topology.
 * Returns the fraction of capacity used for data (0-1).
 *
 * Delegates to topology-specific strategy for calculation.
 */
function getDataFraction(
  topology: Topology,
  driveCount: number,
  s2dOptions: S2DOptions,
  _vsanOptions: VsanOptions,
  _objectscaleOptions: ObjectScaleOptions,
  _powerstoreOptions: PowerStoreOptions,
  _powerscaleOptions: PowerScaleOptions,
  cephOptions: CephOptions,
  nutanixOptions: NutanixOptions,
  serverCount: number,
): number {
  // Runtime type guard: handle invalid topology types from URL params/user input
  // TypeScript can't catch these at compile time when data comes from external sources
  if (!VALID_TOPOLOGY_TYPES.includes(topology.type as TopologyType)) {
    console.warn(`Unknown topology type: ${topology.type}, falling back to 100% efficiency`)
    return 1.0
  }

  const strategy = getStrategy(topology.type)

  // Build options object based on topology type
  let options: any = {}

  switch (topology.type) {
    case 's2d':
      options = s2dOptions
      break
    case 'ceph':
      options = cephOptions
      break
    case 'nutanix':
      options = nutanixOptions
      break
    case 'vsan_esa':
    case 'vsan_osa':
      // vSAN strategies need serverCount for adaptive stripe width
      options = { serverCount }
      break
    default:
      // Other topologies don't need special options
      options = {}
  }

  return strategy.calculateDataFraction(topology.level, driveCount, options)
}

/**
 * Calculate ZFS-specific overhead.
 * Per OpenZFS documentation:
 * - Slop space: clamp(capacity / 32, 128 MiB, 128 GiB)
 * - spa_slop_shift = 5 (default, means 1/32 = 2^5)
 * - SPA_MIN_SLOP = 128 MiB
 * - SPA_MAX_SLOP = 128 GiB
 */
function getZfsOverhead(
  capacity: number,
  zfsOptions: ZfsOptions,
  sectorSize: number,
): { slop: number; ashift: number } {
  // Use ZFS strategy for slop space calculation
  const slop = zfsStrategy.calculateOverhead?.(capacity) ?? 0

  // Ashift padding penalty when ashift > physical sector size
  let ashiftPenalty = 0
  const physicalSectorLog = Math.log2(sectorSize)
  if (zfsOptions.ashift > physicalSectorLog) {
    // Each ashift level above physical wastes (2^diff - 1) / 2^diff
    // For 512B drives with ashift=12: ~87.5% waste on small blocks
    // This is worst-case; actual impact depends on recordsize
    // Using conservative 5% estimate for typical workloads
    ashiftPenalty = capacity * 0.05 * (zfsOptions.ashift - physicalSectorLog)
  }

  return { slop, ashift: ashiftPenalty }
}

/**
 * Get filesystem overhead percentage.
 * Uses FILESYSTEM_OVERHEAD constants from specs:
 * - Btrfs: 4% (Synology spec)
 * - WAFL: 1-2% (NetApp spec)
 * - ZFS slop: 1/64 = 1.5625% (ZFS spec)
 */
function getFilesystemOverheadPercent(
  topology: Topology,
  synologyOptions?: SynologyOptions,
  netAppOptions?: NetAppOptions,
): number {
  switch (topology.type) {
    case 'zfs':
      // ZFS metadata overhead (slop handled separately)
      return 0.01

    case 'vsan_osa':
    case 'vsan_esa':
      // vSAN object overhead (~1-2% for metadata, witness components)
      return 0.015

    case 'objectscale':
      // ObjectScale S3 metadata overhead (~1-2%)
      return 0.015

    case 'powerstore':
      // PowerStore block storage minimal metadata overhead
      return 0.01

    case 'powerscale':
      // PowerScale scale-out NAS filesystem overhead
      return 0.015

    case 's2d':
      // S2D ReFS/CSV overhead
      return FILESYSTEM_OVERHEAD.refs

    case 'ceph':
      // Ceph BlueStore uses ~1-2% for metadata, OSD journals
      return 0.02

    case 'powerflex':
      // PowerFlex metadata overhead is minimal (~1%)
      return 0.01

    case 'nutanix':
      // Nutanix AOS: CVM overhead, metadata, etc. (~1-2%)
      return 0.015

    case 'powervault':
      // PowerVault ME5: minimal metadata overhead (~1%)
      return 0.01

    case 'proprietary':
      // Check for Synology or NetApp based on topology level
      if (topology.level.startsWith('synology_') && synologyOptions) {
        // Synology: Btrfs 4%, ext4 2%
        return synologyOptions.filesystem === 'btrfs'
          ? FILESYSTEM_OVERHEAD.btrfs
          : FILESYSTEM_OVERHEAD.ext4
      }
      if (topology.level.startsWith('netapp_') && netAppOptions) {
        // NetApp: WAFL overhead (1-2%)
        return netAppOptions.waflOverhead
      }
      return 0.02

    default:
      // ext4/XFS typically use 1-3% for metadata
      return 0.02
  }
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

  // Handle edge case: null/undefined topology (graceful degradation)
  if (!topology) {
    return {
      rawCapacity: drive?.capacity_raw ? drive.capacity_raw * driveCount : 0,
      parityOverhead: 0,
      hotSpareOverhead: 0,
      filesystemOverhead: 0,
      slopOverhead: 0,
      usableCapacity: 0,
      effectiveCapacity: 0,
      efficiency: 0,
      breakdown: [
        {
          label: 'Invalid Configuration',
          bytes: 0,
          percent: 0,
          color: 'var(--color-overhead)',
        },
      ],
      zfsDetails: undefined,
    }
  }

  // Check for tiered configuration (must happen before driveCount/drive validation)
  let tieredCapacity: TieredCapacityResult | null = null

  // S2D tiering
  if (
    topology.type === 's2d' &&
    s2dOptions &&
    s2dOptions.storageTiers &&
    s2dOptions.tieringConfig
  ) {
    tieredCapacity = calculateTieredCapacity(s2dOptions.tieringConfig, serverCount)
  }

  // vSAN OSA tiering (disk groups)
  if (topology.type === 'vsan_osa' && vsanOptions && vsanOptions.tiering) {
    tieredCapacity = calculateTieredCapacity(vsanOptions.tiering, serverCount)
  }

  // Ceph WAL/DB tiering
  if (topology.type === 'ceph' && cephOptions && cephOptions.walDbOffload && cephOptions.tiering) {
    tieredCapacity = calculateTieredCapacity(cephOptions.tiering, serverCount)
  }

  // Nutanix hybrid tiering (SSD cache + HDD capacity)
  if (
    topology.type === 'nutanix' &&
    nutanixOptions &&
    nutanixOptions.clusterType === 'hybrid' &&
    nutanixOptions.tiering
  ) {
    tieredCapacity = calculateTieredCapacity(nutanixOptions.tiering, serverCount)
  }

  // Handle edge case: zero drives (graceful degradation)
  // Allow driveCount=0 if tiering is configured (tiering provides drives)
  if (driveCount === 0 && !tieredCapacity) {
    return {
      rawCapacity: 0,
      parityOverhead: 0,
      hotSpareOverhead: 0,
      filesystemOverhead: 0,
      slopOverhead: 0,
      usableCapacity: 0,
      effectiveCapacity: 0,
      efficiency: 0,
      breakdown: [
        {
          label: 'No Drives',
          bytes: 0,
          percent: 0,
          color: 'var(--color-overhead)',
        },
      ],
      zfsDetails: undefined,
    }
  }

  // Handle edge case: null/undefined drive (graceful degradation)
  // Allow null drive if tiering is configured (tiering provides drives)
  if (
    (!drive || drive.capacity_raw === undefined || drive.capacity_raw === null) &&
    !tieredCapacity
  ) {
    return {
      rawCapacity: 0,
      parityOverhead: 0,
      hotSpareOverhead: 0,
      filesystemOverhead: 0,
      slopOverhead: 0,
      usableCapacity: 0,
      effectiveCapacity: 0,
      efficiency: 0,
      breakdown: [
        {
          label: 'Invalid Drive',
          bytes: 0,
          percent: 0,
          color: 'var(--color-overhead)',
        },
      ],
      zfsDetails: undefined,
    }
  }

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
    vsanOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
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
  const breakdown = [
    {
      label: 'Usable Capacity',
      bytes: usableCapacity,
      percent: (usableCapacity / rawCapacity) * 100,
      color: 'var(--color-capacity)',
    },
    {
      label: 'Parity/Redundancy',
      bytes: parityOverhead,
      percent: (parityOverhead / rawCapacity) * 100,
      color: 'var(--color-parity)',
    },
    {
      label: 'Hot Spares',
      bytes: hotSpareOverhead,
      percent: (hotSpareOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    },
  ]

  // Cache tier is overhead (not usable capacity) - shown as dedicated cache
  if (cacheTierCapacity > 0) {
    const cacheLabel =
      topology.type === 'ceph'
        ? 'WAL/DB NVMe (Cache)'
        : topology.type === 'vsan_osa'
          ? 'vSAN OSA Cache Tier'
          : 'Cache Tier (NVMe/SSD)'
    breakdown.push({
      label: cacheLabel,
      bytes: cacheTierCapacity,
      percent: (cacheTierCapacity / rawCapacity) * 100,
      color: 'var(--color-cache)',
    })
  }

  if (slopOverhead > 0) {
    breakdown.push({
      label: 'ZFS Slop Space (1/64)',
      bytes: slopOverhead,
      percent: (slopOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (s2dReserve > 0) {
    const reserveLabel =
      s2dOptions.reserveStrategy === 'node_failure'
        ? 'S2D Node Failure Reserve'
        : 'S2D Drive Failure Reserve'
    breakdown.push({
      label: reserveLabel,
      bytes: s2dReserve,
      percent: (s2dReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (synologySystemOverhead > 0) {
    breakdown.push({
      label: 'Synology System Partition',
      bytes: synologySystemOverhead,
      percent: (synologySystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerFlexFgOverhead > 0) {
    breakdown.push({
      label: 'PowerFlex FG Metadata',
      bytes: powerFlexFgOverhead,
      percent: (powerFlexFgOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (netAppSnapshotReserve > 0) {
    breakdown.push({
      label: 'NetApp Snapshot Reserve',
      bytes: netAppSnapshotReserve,
      percent: (netAppSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (nutanixSystemOverhead > 0) {
    breakdown.push({
      label: 'Nutanix System/CVM Reserve',
      bytes: nutanixSystemOverhead,
      percent: (nutanixSystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (objectscaleSystemOverhead > 0) {
    breakdown.push({
      label: 'ObjectScale System Overhead',
      bytes: objectscaleSystemOverhead,
      percent: (objectscaleSystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (objectscaleGeoOverhead > 0) {
    breakdown.push({
      label: `ObjectScale Geo-Replication (${objectscaleOptions.sites} sites)`,
      bytes: objectscaleGeoOverhead,
      percent: (objectscaleGeoOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerstoreSnapshotReserve > 0) {
    breakdown.push({
      label: 'PowerStore Snapshot Reserve',
      bytes: powerstoreSnapshotReserve,
      percent: (powerstoreSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerscaleSnapshotReserve > 0) {
    breakdown.push({
      label: 'PowerScale Snapshot Reserve',
      bytes: powerscaleSnapshotReserve,
      percent: (powerscaleSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (cephSafeCapacityReduction > 0) {
    breakdown.push({
      label: 'Ceph Safe Capacity (85%)',
      bytes: cephSafeCapacityReduction,
      percent: (cephSafeCapacityReduction / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  breakdown.push({
    label: 'Filesystem Overhead',
    bytes: filesystemOverhead,
    percent: (filesystemOverhead / rawCapacity) * 100,
    color: 'var(--color-overhead)',
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
