/**
 * Storage topology type definitions.
 * Covers RAID, ZFS, S2D, and proprietary configurations.
 */

/** Standard RAID levels */
export type StandardRaidLevel =
  | 'RAID0'
  | 'RAID1'
  | 'RAID1E'
  | 'RAID1_3WAY'
  | 'RAID3'
  | 'RAID4'
  | 'RAID5'
  | 'RAID5E'
  | 'RAID5EE'
  | 'RAID6'
  | 'RAID10'
  | 'RAID50'
  | 'RAID60'

/** ZFS RAID topologies */
export type ZfsTopology =
  | 'stripe'
  | 'mirror'
  | 'raidz1'
  | 'raidz2'
  | 'raidz3'
  | 'draid1'
  | 'draid2'
  | 'draid3'

/** Storage Spaces Direct (S2D) configurations */
export type S2DTopology =
  | 'simple' // No redundancy (stripe)
  | 'mirror' // 2-way or 3-way mirror
  | 'parity' // Single parity
  | 'dual_parity' // Dual parity (erasure coding)
  | 'map' // Mirror-Accelerated Parity

/** Proprietary RAID implementations */
export type ProprietaryRaid =
  | 'synology_shr' // Synology Hybrid RAID
  | 'synology_shr2' // SHR with 2-drive fault tolerance
  | 'synology_raid_f1' // Synology RAID F1 (All-Flash, optimized parity rotation)
  | 'netapp_raid_dp' // NetApp RAID-DP (double parity)
  | 'netapp_raid_tec' // NetApp RAID-TEC (triple parity)

/** VMware vSAN OSA (Original Storage Architecture) topologies */
export type VsanOsaTopology =
  | 'vsan_osa_raid1' // RAID-1 FTT=1 (min 3 hosts, 50% efficiency)
  | 'vsan_osa_raid1_ftt2' // RAID-1 FTT=2 (min 5 hosts, 33% efficiency)
  | 'vsan_osa_raid5' // RAID-5 3+1 FTT=1 (min 4 hosts, 75% efficiency)
  | 'vsan_osa_raid6' // RAID-6 4+2 FTT=2 (min 6 hosts, 67% efficiency)

/** VMware vSAN ESA (Express Storage Architecture) topologies */
export type VsanEsaTopology =
  | 'vsan_esa_raid5' // Adaptive RAID-5 (2+1 or 4+1, min 3 hosts, 67-80% efficiency) - RECOMMENDED
  | 'vsan_esa_raid6' // RAID-6 4+2 FTT=2 (min 6 hosts, 67% efficiency)
  | 'vsan_esa_raid1' // RAID-1 (only for 2-node clusters, 50% efficiency)

/** Dell ObjectScale topologies (Object Storage S3) - per SME specs */
export type ObjectScaleTopology =
  | 'objectscale_ec_12_4' // EC 12+4 (75%) - default, min 5 nodes
  | 'objectscale_ec_10_2' // EC 10+2 (83%) - cold/archive, min 7 nodes
  | 'objectscale_ec_24_4' // EC 24+4 (86%) - tech preview, min 8 nodes
  | 'objectscale_mirror_3' // Triple mirroring (33%) - metadata/small configs

/** Dell PowerStore topologies (Block Storage) */
export type PowerStoreTopology =
  | 'powerstore_raid5' // RAID-5
  | 'powerstore_raid6' // RAID-6
  | 'powerstore_raid10' // RAID-10

/** Dell PowerScale topologies (Scale-out NAS) */
export type PowerScaleTopology =
  | 'powerscale_n1' // N+1 protection
  | 'powerscale_n2' // N+2 protection
  | 'powerscale_n2_1' // N+2:1 protection
  | 'powerscale_n3' // N+3 protection
  | 'powerscale_n4' // N+4 protection
  | 'powerscale_mirror_2x' // 2x mirrored
  | 'powerscale_mirror_3x' // 3x mirrored

/** Ceph storage topologies */
export type CephTopology =
  | 'ceph_replicated_2' // 2-way replication
  | 'ceph_replicated_3' // 3-way replication (default)
  | 'ceph_ec_2_1' // Erasure coded k=2, m=1 (2 data + 1 parity)
  | 'ceph_ec_4_2' // Erasure coded k=4, m=2 (4 data + 2 parity)
  | 'ceph_ec_8_3' // Erasure coded k=8, m=3 (8 data + 3 parity)
  | 'ceph_ec_8_4' // Erasure coded k=8, m=4 (8 data + 4 parity)

/** Dell PowerFlex topologies (SSD/NVMe only - HDD no longer supported) */
export type PowerFlexTopology =
  | 'powerflex_medium_2way' // Medium granularity, 2-way mirror (1MB chunk)
  | 'powerflex_medium_3way' // Medium granularity, 3-way mirror (1MB chunk)
  | 'powerflex_fine_2way' // Fine granularity, 2-way mirror only (8KB chunk) - 3-way not supported in FG mode
  | 'powerflex_ec_4_1' // Erasure coding 4+1 (4 data + 1 parity = 80%)
  | 'powerflex_ec_4_2' // Erasure coding 4+2 (4 data + 2 parity = 67%)
  | 'powerflex_ec_8_2' // Erasure coding 8+2 (8 data + 2 parity = 80%)
  | 'powerflex_ec_12_4' // Erasure coding 12+4 (12 data + 4 parity = 75%)

/** Nutanix AOS topologies (based on RF and EC-X) */
export type NutanixTopology =
  | 'nutanix_rf2' // Replication Factor 2 (2 copies)
  | 'nutanix_rf3' // Replication Factor 3 (3 copies)
  | 'nutanix_ec_rf2' // EC-X with RF2 base (4:1 striping, ~75% efficiency)
  | 'nutanix_ec_rf3' // EC-X with RF3 base (6:2 striping)

/** Dell PowerVault ME5 topologies (Mid-range Block Storage) */
export type PowerVaultTopology =
  | 'powervault_raid1' // 2-way mirror, 50% efficiency
  | 'powervault_raid5' // Single parity, (n-1)/n efficiency, 4x write penalty
  | 'powervault_raid6' // Dual parity, (n-2)/n efficiency, 6x write penalty
  | 'powervault_raid10' // Mirrored stripes, 50% efficiency
  | 'powervault_adapt' // ADAPT distributed RAID, ~87% efficiency, 12-128 drives

/** All supported topology types */
export type TopologyType =
  | 'standard'
  | 'zfs'
  | 's2d'
  | 'proprietary'
  | 'vsan_osa' // vSAN Original Storage Architecture (disk groups)
  | 'vsan_esa' // vSAN Express Storage Architecture (NVMe-only)
  | 'ceph'
  | 'powerflex'
  | 'powerstore'
  | 'powerscale'
  | 'objectscale'
  | 'nutanix'
  | 'powervault' // Dell PowerVault ME5 (mid-range block storage)

/** Union of all topology configurations */
export type Topology =
  | { type: 'standard'; level: StandardRaidLevel }
  | { type: 'zfs'; level: ZfsTopology }
  | { type: 's2d'; level: S2DTopology }
  | { type: 'proprietary'; level: ProprietaryRaid }
  | { type: 'vsan_osa'; level: VsanOsaTopology }
  | { type: 'vsan_esa'; level: VsanEsaTopology }
  | { type: 'ceph'; level: CephTopology }
  | { type: 'powerflex'; level: PowerFlexTopology }
  | { type: 'powerstore'; level: PowerStoreTopology }
  | { type: 'powerscale'; level: PowerScaleTopology }
  | { type: 'objectscale'; level: ObjectScaleTopology }
  | { type: 'nutanix'; level: NutanixTopology }
  | { type: 'powervault'; level: PowerVaultTopology }

/** ZFS-specific configuration options */
export interface ZfsOptions {
  /** Sector alignment shift (9 = 512B, 12 = 4K) */
  ashift: 9 | 12 | 13
  /** Enable compression */
  compression: boolean
  /** Compression algorithm */
  compressionType: 'lz4' | 'zstd' | 'gzip' | 'off'
  /** Enable deduplication */
  dedup: boolean
  /** Record size in bytes */
  recordsize: number
  /** Special allocation class enabled (metadata on fast flash) */
  specialVdev: boolean
  /** Separate SLOG (ZIL) device for sync writes */
  slogDevice: boolean
  /** L2ARC read cache device (SSD/NVMe) */
  l2arcDevice: boolean
  /** Maximum recommended occupation before performance degradation (default 80%) */
  maxOccupation: number
}

/** Storage tier definition for tiered storage configurations */
export interface StorageTier {
  /** Drive ID for this tier */
  driveId: string
  /** Number of drives in this tier */
  driveCount: number
}

/** Tiering configuration for platforms supporting dual drive pools */
export interface TieringConfig {
  /** Whether tiering is enabled */
  enabled: boolean
  /** Fast tier (cache) - typically NVMe/SSD */
  fastTier: StorageTier
  /** Capacity tier (bulk storage) - typically HDD or slower SSD */
  capacityTier: StorageTier
  /** Cache mode */
  cacheMode: 'write-back' | 'write-through' | 'read-only'
  /** Working set percentage (for cache hit rate calculation) */
  workingSetPercent: number
}

/** S2D-specific configuration options */
export interface S2DOptions {
  /** Number of fault domains (nodes) */
  faultDomains: number
  /** Mirror copies for mirror/MAP topologies */
  mirrorCopies: 2 | 3
  /** Enable automatic rebuild reserve */
  rebuildReserve: boolean
  /** Reserve strategy: per-drive or per-node */
  reserveStrategy: 'drive_failure' | 'node_failure'
  /** Storage tiers enabled */
  storageTiers: boolean
  /** Tiering configuration (when storageTiers is true) */
  tieringConfig?: TieringConfig
}

/** HBA types for direct disk passthrough (required for ZFS, vSAN, S2D, etc.) */
export type HbaType =
  | 'hba_sas' // Generic SAS HBA (IT mode)
  | 'hba_nvme' // NVMe HBA / direct attach
  | 'lsi_9500' // Broadcom/LSI 9500 series (24G SAS)
  | 'lsi_9400' // Broadcom/LSI 9400 series (12G SAS)
  | 'dell_hba355i' // Dell HBA355i (12G SAS)
  | 'dell_hba355e' // Dell HBA355e external (12G SAS)

/** RAID controller types including Dell PERC */
export type RaidControllerType =
  | 'software'
  | 'hardware'
  | 'gpu'
  | 'perc_h755' // Dell PERC H755 (PCIe Gen4)
  | 'perc_h965i' // Dell PERC H965i (PCIe Gen5)
  | 'perc_h755n' // Dell PERC H755N (NVMe)
  | 'perc_h965in' // Dell PERC H965iN (NVMe Gen5)
  | 'powervault_me5_single' // Dell PowerVault ME5 (Single Controller)
  | 'powervault_me5_dual' // Dell PowerVault ME5 (Dual Active Controllers)
  | 'powerstore_t' // Dell PowerStore T Model (integrated appliance)
  | 'powerscale_node' // Dell PowerScale Node Controller (Isilon)
  | 'objectscale_node' // Dell ObjectScale Node Controller (ECS-based)

/** Combined controller/HBA types */
export type ControllerType = HbaType | RaidControllerType

/** Topologies that require HBA (direct disk access) - software-defined storage only */
export const HBA_REQUIRED_TOPOLOGIES: TopologyType[] = [
  'zfs',
  's2d',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'nutanix',
  // Note: powerscale and objectscale are appliances with built-in controllers, not HBA-based
]

/** Check if topology requires HBA */
export function requiresHba(topologyType: TopologyType): boolean {
  return HBA_REQUIRED_TOPOLOGIES.includes(topologyType)
}

/** Standard RAID controller options */
export interface RaidControllerOptions {
  /** Controller type */
  controller: ControllerType
  /** Stripe/chunk size in KB */
  stripeSize: 64 | 128 | 256 | 512 | 1024
  /** Read policy */
  readPolicy: 'read-ahead' | 'no-read-ahead' | 'adaptive'
  /** Write policy */
  writePolicy: 'write-back' | 'write-through' | 'write-back-with-bbu'
  /** Cache size in MB (for hardware controllers) */
  cacheSize?: number
}

/** vSAN-specific configuration options */
export interface VsanOptions {
  /** Disk group mode for OSA: hybrid (HDD capacity) or all-flash (SSD capacity) */
  diskGroupMode: 'hybrid' | 'all-flash'
  /** Enable compression */
  compression: boolean
  /** Enable deduplication */
  dedup: boolean
  /** Enable encryption */
  encryption: boolean
  /** Tiering configuration (disk groups with cache + capacity) - OSA only */
  tiering?: TieringConfig
}

/** Synology NAS-specific configuration options */
export interface SynologyOptions {
  /** File system type */
  filesystem: 'btrfs' | 'ext4'
  /** Btrfs metadata overhead (default 4% = 0.04) */
  btrfsOverhead: number
  /** System partition size per disk in bytes (20-30GB) */
  systemPartitionSize: number
  /** NAS model series (J series has CPU limitations) */
  modelSeries: 'j' | 'value' | 'plus' | 'xs'
  /** Enable SSD cache */
  ssdCache: boolean
  /** SSD cache mode */
  cacheMode: 'read_only' | 'read_write'
}

/** Dell ObjectScale-specific configuration options (Object Storage S3) - per SME specs */
export interface ObjectScaleOptions {
  /** Average object size in KB (10KB - 1GB, impacts performance calculations) */
  objectSizeKB: number
  /** System overhead percentage (10-20% for formatting, metadata, rebalance, rebuild) */
  systemOverheadPercent: number
  /** Network efficiency factor (0.5-0.6 for East-West traffic: EC, XOR, rebalance, geo) */
  networkEfficiencyFactor: number
  /** Number of sites in Replication Group (1-8, impacts geo-overhead) */
  sites: number
  /** Maximum fill rate percentage (80-85% recommended, >90% may block writes) */
  fillRatePercent: number
  /** Enable compression */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1) */
  compressionRatio: number
}

/** Dell PowerStore-specific configuration options (Block Storage) */
export interface PowerStoreOptions {
  /** Enable compression */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1) */
  compressionRatio: number
  /** Enable deduplication */
  dedup: boolean
  /** Deduplication ratio (1.0 = none, 2.0 = 2:1) */
  dedupRatio: number
  /** Snapshot reserve percentage */
  snapshotReservePercent: number
  /** System overhead percentage (metadata, distributed spare, formatting). Default 5% from Dell Sizer 5200Q reference. */
  systemOverheadPercent: number
}

/** Dell PowerScale-specific configuration options (Scale-out NAS) */
export interface PowerScaleOptions {
  /** Enable compression */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1) */
  compressionRatio: number
  /** Enable deduplication */
  dedup: boolean
  /** Deduplication ratio (1.0 = none, 2.0 = 2:1) */
  dedupRatio: number
  /** Snapshot reserve percentage */
  snapshotReservePercent: number
  /** SmartQuotas enabled */
  smartQuotas: boolean
  /** SyncIQ replication enabled */
  syncIQ: boolean
}

/** NetApp storage-specific configuration options */
export interface NetAppOptions {
  /** Storage platform */
  platform: 'aff_a' | 'aff_c' | 'fas' | 'asa' | 'e_series'
  /** RAID type */
  raidType: 'raid_dp' | 'raid_tec'
  /** Advanced Drive Partitioning version */
  adpVersion: 'none' | 'adpv1' | 'adpv2'
  /** Snapshot reserve percentage (0-20%, default 5% or 0% on AFF) */
  snapshotReserve: number
  /** Data Reduction Ratio (1.0 = none, 3.0 = 3:1 compression+dedup) */
  dataReductionRatio: number
  /** WAFL filesystem overhead (0.01-0.02 = 1-2%) */
  waflOverhead: number
  /** Enable inline compression */
  compression: boolean
  /** Enable inline deduplication */
  dedup: boolean
  /** Enable zero-block detection */
  zeroDetection: boolean
}

/** Ceph storage-specific configuration options */
export interface CephOptions {
  /** Storage backend */
  backend: 'bluestore' | 'filestore'
  /** Pool type */
  poolType: 'replicated' | 'erasure'
  /** Replication factor (for replicated pools) */
  replicationFactor: 2 | 3 | 4
  /** Erasure coding k (data chunks) */
  ecK: number
  /** Erasure coding m (parity chunks) */
  ecM: number
  /** Enable compression */
  compression: boolean
  /** Compression algorithm */
  compressionAlgorithm: 'none' | 'snappy' | 'zstd' | 'lz4'
  /** Enable encryption */
  encryption: boolean
  /** OSD journal on SSD */
  journalOnSsd: boolean
  /** WAL/DB offload to separate NVMe (for HDD OSDs) */
  walDbOffload: boolean
  /** WAL/DB ratio: how many HDDs per NVMe for WAL/DB (e.g., 4 = 1 NVMe for 4 HDDs) */
  walDbRatio: number
  /** Safe capacity threshold (Ceph nearfull, default 0.85 = 85%) */
  safeCapacityThreshold: number
  /** Cache tiering configuration (CRUSH rules) */
  tiering?: TieringConfig
}

/** PowerFlex configuration options */
export interface PowerFlexOptions {
  /** Granularity level */
  granularity: 'medium' | 'fine'
  /** Protection mode */
  protectionMode: 'mirror' | 'erasure'
  /** Mirror copies (for mirror mode) */
  mirrorCopies: 2 | 3
  /** Erasure coding scheme (for erasure mode) */
  ecScheme: '4_1' | '4_2' | '8_2' | '12_4'
  /** Enable compression (Ultra mode) */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1, 4.0 = 4:1) */
  compressionRatio: number
  /** Storage pools count */
  storagePools: number
  /** Fault sets (for distributed placement) */
  faultSets: number
  /** Fine Granularity metadata overhead (12-15% for FG mode) */
  fgOverhead: number
}

/** Nutanix AOS configuration options */
export interface NutanixOptions {
  /** Cluster configuration: All-Flash or Hybrid */
  clusterType: 'all-flash' | 'hybrid'
  /** Replication Factor (RF2 or RF3) */
  replicationFactor: 2 | 3
  /** Enable Erasure Coding (EC-X) for cold data */
  erasureCoding: boolean
  /** EC-X stripe configuration (only if erasureCoding is true) */
  ecStripe: '4_1' | '6_2'
  /** Enable inline compression */
  compression: boolean
  /** Expected compression ratio (1.0 = none, 1.5 = 1.5:1) */
  compressionRatio: number
  /** Enable deduplication (capacity tier) */
  dedup: boolean
  /** Expected deduplication ratio (1.0 = none, 1.2 = 1.2:1) */
  dedupRatio: number
  /** System/metadata overhead (5-10% for snapshots, metadata, rebuild) */
  systemOverhead: number
  /** Network type for inter-CVM replication */
  networkType: '10gbe' | '25gbe' | 'rdma'
  /** Tiering configuration (for hybrid clusters) */
  tiering?: TieringConfig
}

/** Dell PowerVault ME5 configuration options */
export interface PowerVaultOptions {
  /** Model: ME5212 (12 drives), ME5224 (24 drives), ME5284 (84 drives) */
  model: 'ME5212' | 'ME5224' | 'ME5284'
  /** Number of controllers (1 = single, 2 = dual-active) */
  controllers: 1 | 2
  /** Enable auto-tiering (3 tiers: Performance SSD, Standard 10K, Archive NL-SAS) */
  tiering: boolean
  /** Enable SSD read cache (uses SSDs as read cache for HDD pools) */
  ssdReadCache: boolean
  /** Thin provisioning enabled (4MB page size) */
  thinProvisioning: boolean
}

/** Complete topology configuration */
export interface TopologyConfig {
  /** Selected topology */
  topology: Topology
  /** Number of drives */
  driveCount: number
  /** Number of data drives per RAID group (for RAID 50/60) */
  drivesPerGroup?: number
  /** Hot spare count */
  hotSpares: number
  /** ZFS options (if type is 'zfs') */
  zfsOptions?: ZfsOptions
  /** S2D options (if type is 's2d') */
  s2dOptions?: S2DOptions
  /** RAID controller options */
  controllerOptions?: RaidControllerOptions
}

/** Default ZFS options */
export const DEFAULT_ZFS_OPTIONS: ZfsOptions = {
  ashift: 12,
  compression: true,
  compressionType: 'lz4',
  dedup: false,
  recordsize: 131072, // 128K
  specialVdev: false,
  slogDevice: false,
  l2arcDevice: false,
  maxOccupation: 80, // Performance degrades beyond 80%
}

/** Default S2D options */
export const DEFAULT_S2D_OPTIONS: S2DOptions = {
  faultDomains: 4,
  mirrorCopies: 2,
  rebuildReserve: true,
  reserveStrategy: 'node_failure',
  storageTiers: false,
}

/** Default RAID controller options */
export const DEFAULT_CONTROLLER_OPTIONS: RaidControllerOptions = {
  controller: 'software',
  stripeSize: 256,
  readPolicy: 'adaptive',
  writePolicy: 'write-back',
}

/** Default vSAN options */
export const DEFAULT_VSAN_OPTIONS: VsanOptions = {
  diskGroupMode: 'all-flash',
  compression: true,
  dedup: false,
  encryption: false,
}

/** Default ObjectScale options - per SME specs */
export const DEFAULT_OBJECTSCALE_OPTIONS: ObjectScaleOptions = {
  objectSizeKB: 1024, // 1MB average object size
  systemOverheadPercent: 15, // 10-20% for formatting, metadata, rebalance, rebuild
  networkEfficiencyFactor: 0.55, // 0.5-0.6 for East-West traffic (EC, XOR, rebalance, geo)
  sites: 1, // Single site (1-8 supported for geo-replication)
  fillRatePercent: 80, // 80-85% recommended, >90% may block writes
  compression: false,
  compressionRatio: 1.0,
}

/** Default PowerStore options */
export const DEFAULT_POWERSTORE_OPTIONS: PowerStoreOptions = {
  compression: true,
  compressionRatio: 1.5,
  dedup: false,
  dedupRatio: 1.0,
  snapshotReservePercent: 20,
  systemOverheadPercent: 5,
}

/** Default PowerScale options */
export const DEFAULT_POWERSCALE_OPTIONS: PowerScaleOptions = {
  compression: true,
  compressionRatio: 1.5,
  dedup: false,
  dedupRatio: 1.0,
  snapshotReservePercent: 20,
  smartQuotas: false,
  syncIQ: false,
}

/** Default Ceph options */
export const DEFAULT_CEPH_OPTIONS: CephOptions = {
  backend: 'bluestore',
  poolType: 'replicated',
  replicationFactor: 3,
  ecK: 4,
  ecM: 2,
  compression: false,
  compressionAlgorithm: 'none',
  encryption: false,
  journalOnSsd: true,
  walDbOffload: false,
  walDbRatio: 4, // 1 NVMe for 4 HDDs
  safeCapacityThreshold: 0.85, // Ceph nearfull at 85%
}

/** Default tiering configuration */
export const DEFAULT_TIERING_CONFIG: TieringConfig = {
  enabled: false,
  fastTier: { driveId: '', driveCount: 2 },
  capacityTier: { driveId: '', driveCount: 4 },
  cacheMode: 'write-back',
  workingSetPercent: 20,
}

/** Default PowerFlex options (SSD/NVMe only - HDD no longer supported) */
export const DEFAULT_POWERFLEX_OPTIONS: PowerFlexOptions = {
  granularity: 'medium',
  protectionMode: 'mirror',
  mirrorCopies: 2, // Fine granularity only supports 2-way mirror
  ecScheme: '8_2',
  compression: true,
  compressionRatio: 2.0, // 2:1 compression
  storagePools: 1,
  faultSets: 1, // Fault sets are optional (1 = no fault sets, distributed placement)
  fgOverhead: 0.12, // 12% FG metadata overhead
}

/** Default Nutanix AOS options */
export const DEFAULT_NUTANIX_OPTIONS: NutanixOptions = {
  clusterType: 'all-flash',
  replicationFactor: 2, // RF2 is standard
  erasureCoding: false,
  ecStripe: '4_1', // 4:1 striping (75% efficiency)
  compression: true,
  compressionRatio: 1.5, // 1.5:1 inline compression
  dedup: false,
  dedupRatio: 1.0,
  systemOverhead: 0.1, // 10% for system/metadata/snapshots
  networkType: '25gbe',
}

/** Default PowerVault ME5 options */
export const DEFAULT_POWERVAULT_OPTIONS: PowerVaultOptions = {
  model: 'ME5224',
  controllers: 2, // Dual-active (most common configuration)
  tiering: false,
  ssdReadCache: false,
  thinProvisioning: true, // Enabled by default
}

/** Default Synology options */
export const DEFAULT_SYNOLOGY_OPTIONS: SynologyOptions = {
  filesystem: 'btrfs',
  btrfsOverhead: 0.04, // 4% for metadata
  systemPartitionSize: 25 * 1024 * 1024 * 1024, // 25GB per disk
  modelSeries: 'plus',
  ssdCache: false,
  cacheMode: 'read_write',
}

/** Default NetApp options */
export const DEFAULT_NETAPP_OPTIONS: NetAppOptions = {
  platform: 'aff_a',
  raidType: 'raid_dp',
  adpVersion: 'adpv2',
  snapshotReserve: 0.05, // 5% default
  dataReductionRatio: 1.0, // No reduction by default
  waflOverhead: 0.015, // 1.5% WAFL overhead
  compression: true,
  dedup: false,
  zeroDetection: true,
}

/** Filesystem overhead constants */
export const FILESYSTEM_OVERHEAD = {
  btrfs: 0.04, // 4% for Btrfs metadata + CoW
  ext4: 0.05, // 5% for ext4 (default root reservation)
  xfs: 0.01, // 1% for XFS (minimal metadata)
  zfs: 0.01, // 1% for ZFS metadata (slop handled separately)
  zfs_slop: 1 / 64, // 1.5625% ZFS slop space
  wafl: 0.015, // 1.5% WAFL default
  refs: 0.02, // 2% for ReFS (integrity streams)
  ntfs: 0.02, // 2% for NTFS (MFT reservation)
} as const

/** Controller/HBA performance limits (IOPS, throughput in MB/s) */
export const CONTROLLER_LIMITS: Record<
  ControllerType,
  { iops: number; throughputMBs: number; name: string; isHba: boolean }
> = {
  // HBA options (direct passthrough - high performance, no RAID overhead)
  hba_sas: { iops: 2000000, throughputMBs: 24000, name: 'Generic SAS HBA (IT Mode)', isHba: true },
  hba_nvme: { iops: 10000000, throughputMBs: 64000, name: 'NVMe Direct Attach', isHba: true },
  lsi_9500: { iops: 4000000, throughputMBs: 28000, name: 'Broadcom 9500 (24G SAS)', isHba: true },
  lsi_9400: { iops: 2000000, throughputMBs: 19200, name: 'Broadcom 9400 (12G SAS)', isHba: true },
  dell_hba355i: {
    iops: 2000000,
    throughputMBs: 19200,
    name: 'Dell HBA355i (12G SAS)',
    isHba: true,
  },
  dell_hba355e: { iops: 2000000, throughputMBs: 19200, name: 'Dell HBA355e External', isHba: true },
  // RAID controller options
  software: { iops: 1000000, throughputMBs: 10000, name: 'Software RAID', isHba: false },
  hardware: { iops: 500000, throughputMBs: 6000, name: 'Hardware RAID (Generic)', isHba: false },
  gpu: { iops: 2000000, throughputMBs: 20000, name: 'GPU-Accelerated RAID', isHba: false },
  perc_h755: { iops: 750000, throughputMBs: 12000, name: 'Dell PERC H755', isHba: false },
  perc_h965i: { iops: 1200000, throughputMBs: 22000, name: 'Dell PERC H965i', isHba: false },
  perc_h755n: { iops: 1000000, throughputMBs: 14000, name: 'Dell PERC H755N (NVMe)', isHba: false },
  perc_h965in: {
    iops: 1800000,
    throughputMBs: 28000,
    name: 'Dell PERC H965iN (NVMe)',
    isHba: false,
  },
  powervault_me5_single: {
    iops: 420000,
    throughputMBs: 7000,
    name: 'Dell PowerVault ME5 (Single Controller)',
    isHba: false,
  },
  powervault_me5_dual: {
    iops: 840000,
    throughputMBs: 14000,
    name: 'Dell PowerVault ME5 (Dual Active)',
    isHba: false,
  },
  // Dell PowerStore T-Series (dedicated storage appliance)
  // Based on Dell specs: 5200T=7.5M IOPS, 9200T=12.5M IOPS
  // Using mid-range 3200T/5200T representative values
  powerstore_t: {
    iops: 5000000,
    throughputMBs: 25000,
    name: 'Dell PowerStore T Model',
    isHba: false,
  },
  // Dell PowerScale (Isilon node controllers)
  powerscale_node: {
    iops: 800000,
    throughputMBs: 15000,
    name: 'Dell PowerScale Node Controller',
    isHba: false,
  },
  // Dell ObjectScale (ECS-based node controllers)
  objectscale_node: {
    iops: 500000,
    throughputMBs: 10000,
    name: 'Dell ObjectScale Node Controller',
    isHba: false,
  },
}

/** Maps storage appliances to their specific built-in controllers */
const APPLIANCE_CONTROLLERS: Partial<Record<TopologyType, ControllerType[]>> = {
  powervault: ['powervault_me5_single', 'powervault_me5_dual'],
  powerstore: ['powerstore_t'],
  powerscale: ['powerscale_node'],
  objectscale: ['objectscale_node'],
}

/** Get controller options filtered by topology requirements */
export function getControllerOptions(topologyType: TopologyType): ControllerType[] {
  // Storage appliances have fixed built-in controllers
  const applianceControllers = APPLIANCE_CONTROLLERS[topologyType]
  if (applianceControllers) {
    return applianceControllers
  }

  // Software-defined storage needs HBAs, traditional RAID needs controllers
  const needsHba = requiresHba(topologyType)
  return (Object.keys(CONTROLLER_LIMITS) as ControllerType[]).filter(
    (key) => CONTROLLER_LIMITS[key].isHba === needsHba,
  )
}
