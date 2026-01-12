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
  S2DOptions,
  SynologyOptions,
  TieringConfig,
  Topology,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
import { FILESYSTEM_OVERHEAD } from '@/types/topology'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Calculate tiered capacity when tiering is enabled.
 * Returns cache tier overhead and capacity tier raw capacity.
 */
interface TieredCapacityResult {
  cacheTierCapacity: number
  cacheTierDrive: Drive | null
  cacheTierDriveCount: number
  capacityTierCapacity: number
  capacityTierDrive: Drive | null
  capacityTierDriveCount: number
}

function calculateTieredCapacity(
  tieringConfig: TieringConfig | undefined,
  serverCount: number,
): TieredCapacityResult | null {
  if (!tieringConfig?.enabled) {
    return null
  }

  const cacheDrive = tieringConfig.fastTier.driveId ? drives[tieringConfig.fastTier.driveId] : null
  const capacityDrive = tieringConfig.capacityTier.driveId
    ? drives[tieringConfig.capacityTier.driveId]
    : null

  if (!cacheDrive || !capacityDrive) {
    return null
  }

  const cacheDriveCount = tieringConfig.fastTier.driveCount * serverCount
  const capacityDriveCount = tieringConfig.capacityTier.driveCount * serverCount

  return {
    cacheTierCapacity: cacheDrive.capacity_raw * cacheDriveCount,
    cacheTierDrive: cacheDrive,
    cacheTierDriveCount: cacheDriveCount,
    capacityTierCapacity: capacityDrive.capacity_raw * capacityDriveCount,
    capacityTierDrive: capacityDrive,
    capacityTierDriveCount: capacityDriveCount,
  }
}

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
  compressionRatio: number
  dedupRatio: number
}

/**
 * Calculate parity overhead factor based on topology.
 * Returns the fraction of capacity used for data (0-1).
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
  const usableDrives = driveCount // Hot spares handled separately

  switch (topology.type) {
    case 'standard':
      switch (topology.level) {
        case 'RAID0':
          return 1.0 // No redundancy
        case 'RAID1':
          return 0.5 // Mirror (2-way)
        case 'RAID1E':
          // RAID 1E: Mirrored striping, each block written twice
          // Efficiency is ~50% regardless of drive count
          return 0.5
        case 'RAID1_3WAY':
          // 3-Way Mirror / Triple Mirror
          return 1 / 3
        case 'RAID3':
          // Byte-level striping with dedicated parity disk
          return (usableDrives - 1) / usableDrives
        case 'RAID4':
          // Block-level striping with dedicated parity disk
          return (usableDrives - 1) / usableDrives
        case 'RAID5':
          return (usableDrives - 1) / usableDrives
        case 'RAID5E':
          // RAID 5E: RAID 5 with integrated distributed hot spare
          // Uses 1 drive worth for parity + 1 for distributed spare
          return (usableDrives - 2) / usableDrives
        case 'RAID5EE':
          // RAID 5EE: Similar to 5E but with active hot spare
          return (usableDrives - 2) / usableDrives
        case 'RAID6':
          return (usableDrives - 2) / usableDrives
        case 'RAID10':
          return 0.5 // Mirrored stripes
        case 'RAID50':
          // Assume 2 groups for RAID50
          return (usableDrives - 2) / usableDrives
        case 'RAID60':
          // Assume 2 groups for RAID60
          return (usableDrives - 4) / usableDrives
        default:
          return 1.0
      }

    case 'zfs':
      switch (topology.level) {
        case 'stripe':
          return 1.0
        case 'mirror':
          return 0.5
        case 'raidz1':
        case 'draid1':
          return (usableDrives - 1) / usableDrives
        case 'raidz2':
        case 'draid2':
          return (usableDrives - 2) / usableDrives
        case 'raidz3':
        case 'draid3':
          return (usableDrives - 3) / usableDrives
        default:
          return 1.0
      }

    case 's2d':
      switch (topology.level) {
        case 'simple':
          return 1.0
        case 'mirror':
          return 1 / s2dOptions.mirrorCopies
        case 'parity':
          // Single parity across fault domains
          return (s2dOptions.faultDomains - 1) / s2dOptions.faultDomains
        case 'dual_parity':
          return (s2dOptions.faultDomains - 2) / s2dOptions.faultDomains
        case 'map': {
          // MAP uses mirror for hot data portion (estimate 20% mirror, 80% parity)
          const mirrorPortion = 0.2 / s2dOptions.mirrorCopies
          const parityPortion = 0.8 * ((s2dOptions.faultDomains - 2) / s2dOptions.faultDomains)
          return mirrorPortion + parityPortion
        }
        default:
          return 1.0
      }

    case 'proprietary':
      switch (topology.level) {
        case 'synology_shr':
          // SHR approximates RAID5 efficiency
          return (usableDrives - 1) / usableDrives
        case 'synology_shr2':
          // SHR2 approximates RAID6 efficiency
          return (usableDrives - 2) / usableDrives
        case 'synology_raid_f1':
          // RAID F1: All-Flash optimized, similar to RAID5 with uneven parity rotation
          // Efficiency ≈ RAID5: (N-1)/N
          return (usableDrives - 1) / usableDrives
        case 'netapp_raid_dp':
          // RAID-DP: double parity per RAID group
          return (usableDrives - 2) / usableDrives
        case 'netapp_raid_tec':
          // RAID-TEC: triple parity per RAID group (for drives >10TB)
          return (usableDrives - 3) / usableDrives
        default:
          return 1.0
      }

    case 'vsan_osa':
      // vSAN OSA (Original Storage Architecture) - disk groups with cache + capacity
      // Stripe width scales with cluster size and available drives
      switch (topology.level) {
        case 'vsan_osa_raid1':
          // RAID-1 FTT=1: 2-way mirror, 50% efficiency
          return 0.5
        case 'vsan_osa_raid1_ftt2':
          // RAID-1 FTT=2: 3-way mirror, 33% efficiency
          return 1 / 3
        case 'vsan_osa_raid5': {
          // RAID-5: stripe width adapts to cluster size
          // Min 4 hosts for 3+1, scales up with more hosts
          const drivesPerHost = driveCount / serverCount
          const maxDataDrives = Math.min(serverCount - 1, Math.floor(drivesPerHost / 2), 7)
          const dataDrives = Math.max(3, maxDataDrives)
          return dataDrives / (dataDrives + 1)
        }
        case 'vsan_osa_raid6': {
          // RAID-6: stripe width adapts to cluster size
          // Min 6 hosts for 4+2, scales up with more hosts
          const drivesPerHost = driveCount / serverCount
          const maxDataDrives = Math.min(serverCount - 2, Math.floor(drivesPerHost / 2), 6)
          const dataDrives = Math.max(4, maxDataDrives)
          return dataDrives / (dataDrives + 2)
        }
        default:
          return 0.5
      }

    case 'vsan_esa':
      // vSAN ESA (Express Storage Architecture) - single-tier NVMe only
      // Stripe width determined by cluster resources (hosts and drives)
      switch (topology.level) {
        case 'vsan_esa_raid1':
          // RAID-1: 2-way mirror, 50% efficiency (only for 2-node clusters)
          return 0.5
        case 'vsan_esa_raid5': {
          // Adaptive RAID-5: stripe width scales with cluster size
          // 4+1 requires min 5 hosts and sufficient drives (120+ with 24 slots/server)
          // 2+1 for smaller clusters
          const canUse4Plus1 = serverCount >= 5 && driveCount >= serverCount * 20
          return canUse4Plus1 ? 4 / 5 : 2 / 3
        }
        case 'vsan_esa_raid6': {
          // RAID-6: stripe width scales with cluster size
          // 6+2 requires min 8 hosts, 4+2 for smaller clusters
          const canUse6Plus2 = serverCount >= 8 && driveCount >= serverCount * 20
          return canUse6Plus2 ? 6 / 8 : 4 / 6
        }
        default:
          return 2 / 3
      }

    case 'objectscale':
      // Dell ObjectScale (Object Storage S3) - per SME specs
      switch (topology.level) {
        case 'objectscale_ec_12_4':
          // EC 12+4: 12/(12+4) = 75% efficiency, min 5 nodes, default
          return 12 / 16
        case 'objectscale_ec_10_2':
          // EC 10+2: 10/(10+2) = 83.3% efficiency, min 7 nodes, cold/archive
          return 10 / 12
        case 'objectscale_ec_24_4':
          // EC 24+4: 24/(24+4) = 85.7% efficiency, min 8 nodes, tech preview
          return 24 / 28
        case 'objectscale_mirror_3':
          // Triple mirroring: 33.3% efficiency, for metadata/small configs
          return 1 / 3
        default:
          return 12 / 16 // Default to EC 12+4
      }

    case 'powerstore':
      // Dell PowerStore (Block Storage)
      switch (topology.level) {
        case 'powerstore_raid5':
          // PowerStore RAID-5: typically 4+1 or 8+1 stripes, ~80% efficiency
          return 0.8
        case 'powerstore_raid6':
          // PowerStore RAID-6: typically 4+2 or 8+2 stripes, ~75% efficiency
          return 0.75
        case 'powerstore_raid10':
          // PowerStore RAID-10: mirrored stripes, 50% efficiency
          return 0.5
        default:
          return 0.8 // Default to RAID-5
      }

    case 'powerscale':
      // Dell PowerScale (Scale-out NAS)
      switch (topology.level) {
        case 'powerscale_n1':
          // N+1 protection: (n-1)/n
          return (usableDrives - 1) / usableDrives
        case 'powerscale_n2':
          // N+2 protection: (n-2)/n
          return (usableDrives - 2) / usableDrives
        case 'powerscale_n2_1':
          // N+2:1 protection: (n-2)/n with 1 stripe failure tolerance
          return (usableDrives - 2) / usableDrives
        case 'powerscale_n3':
          // N+3 protection: (n-3)/n
          return (usableDrives - 3) / usableDrives
        case 'powerscale_n4':
          // N+4 protection: (n-4)/n
          return (usableDrives - 4) / usableDrives
        case 'powerscale_mirror_2x':
          // 2x mirrored: 50% efficiency
          return 0.5
        case 'powerscale_mirror_3x':
          // 3x mirrored: 33.3% efficiency
          return 1 / 3
        default:
          return (usableDrives - 2) / usableDrives // Default to N+2
      }

    case 'ceph':
      switch (topology.level) {
        case 'ceph_replicated_2':
          // 2-way replication: 50% efficiency
          return 1 / 2
        case 'ceph_replicated_3':
          // 3-way replication: 33% efficiency
          return 1 / 3
        case 'ceph_ec_2_1':
          // Erasure coded k=2, m=1: 2/(2+1) = 66.7% efficiency
          return 2 / 3
        case 'ceph_ec_4_2':
          // Erasure coded k=4, m=2: 4/(4+2) = 66.7% efficiency
          return 4 / 6
        case 'ceph_ec_8_3':
          // Erasure coded k=8, m=3: 8/(8+3) = 72.7% efficiency
          return 8 / 11
        case 'ceph_ec_8_4':
          // Erasure coded k=8, m=4: 8/(8+4) = 66.7% efficiency
          return 8 / 12
        default:
          // Fallback to options if not matched
          if (cephOptions.poolType === 'replicated') {
            return 1 / cephOptions.replicationFactor
          } else {
            // Erasure coded: k / (k + m)
            return cephOptions.ecK / (cephOptions.ecK + cephOptions.ecM)
          }
      }

    case 'powerflex':
      switch (topology.level) {
        case 'powerflex_medium_2way':
        case 'powerflex_fine_2way':
          // 2-way mirror: 50% efficiency (FG only supports 2-way)
          return 0.5
        case 'powerflex_medium_3way':
          // 3-way mirror: 33% efficiency (Medium Granularity only)
          return 1 / 3
        case 'powerflex_ec_4_1':
          // Erasure coding 4+1: 4/(4+1) = 80% efficiency
          return 4 / 5
        case 'powerflex_ec_4_2':
          // Erasure coding 4+2: 4/(4+2) = 66.7% efficiency
          return 4 / 6
        case 'powerflex_ec_8_2':
          // Erasure coding 8+2: 8/(8+2) = 80% efficiency
          return 8 / 10
        case 'powerflex_ec_12_4':
          // Erasure coding 12+4: 12/(12+4) = 75% efficiency
          return 12 / 16
        default:
          return 0.5
      }

    case 'nutanix':
      // Nutanix AOS: RF2 = 50%, RF3 = 33%, EC-X improves efficiency
      switch (topology.level) {
        case 'nutanix_rf2':
          // RF2: 2 copies = 50% efficiency
          return 1 / nutanixOptions.replicationFactor
        case 'nutanix_rf3':
          // RF3: 3 copies = 33% efficiency
          return 1 / nutanixOptions.replicationFactor
        case 'nutanix_ec_rf2':
          // EC-X with RF2 base: 4:1 striping = 75% efficiency (approximation)
          // Per spec: C_usable_ec = C_formatted × 0.75
          return 0.75
        case 'nutanix_ec_rf3':
          // EC-X with RF3 base: 6:2 striping = 75% efficiency
          return 6 / 8
        default:
          // Default to RF2 if not specified
          return 1 / nutanixOptions.replicationFactor
      }

    default:
      return 1.0
  }
}

/**
 * Calculate ZFS-specific overhead.
 */
function getZfsOverhead(
  capacity: number,
  zfsOptions: ZfsOptions,
  sectorSize: number,
): { slop: number; ashift: number } {
  // ZFS slop space: reserves 1/32 (3.125%) of pool capacity
  const slop = capacity / 32

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

  // Check for tiered configuration
  let tieredCapacity: TieredCapacityResult | null = null

  // S2D tiering
  if (topology.type === 's2d' && s2dOptions.storageTiers && s2dOptions.tieringConfig) {
    tieredCapacity = calculateTieredCapacity(s2dOptions.tieringConfig, serverCount)
  }

  // vSAN OSA tiering (disk groups)
  if (topology.type === 'vsan_osa' && vsanOptions.tiering) {
    tieredCapacity = calculateTieredCapacity(vsanOptions.tiering, serverCount)
  }

  // Ceph WAL/DB tiering
  if (topology.type === 'ceph' && cephOptions.walDbOffload && cephOptions.tiering) {
    tieredCapacity = calculateTieredCapacity(cephOptions.tiering, serverCount)
  }

  // Nutanix hybrid tiering (SSD cache + HDD capacity)
  if (
    topology.type === 'nutanix' &&
    nutanixOptions.clusterType === 'hybrid' &&
    nutanixOptions.tiering
  ) {
    tieredCapacity = calculateTieredCapacity(nutanixOptions.tiering, serverCount)
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
  if (topology.type === 'zfs') {
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
  if (topology.type === 'ceph') {
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
  const efficiency = (usableCapacity / rawCapacity) * 100

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
  if (topology.type === 'zfs') {
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
