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

/**
 * OneFS protection levels as Dell's PowerSizer names them.
 * `+Nn` tolerates N node failures; `+Nd:1n` tolerates N drive failures or 1 node;
 * `+3d:1n1d` tolerates 3 drives, or 1 node plus 1 drive.
 */
export type PowerScaleProtection =
  | '+1n'
  | '+2n'
  | '+3n'
  | '+4n'
  | '+2d:1n'
  | '+3d:1n'
  | '+3d:1n1d'
  | '+4d:1n'
  | '+4d:2n'

/** Ceph storage topologies */
export type CephTopology =
  | 'ceph_replicated_2' // 2-way replication
  | 'ceph_replicated_3' // 3-way replication (default)
  | 'ceph_ec_2_1' // Erasure coded k=2, m=1 (2 data + 1 parity)
  | 'ceph_ec_4_2' // Erasure coded k=4, m=2 (4 data + 2 parity)
  | 'ceph_ec_8_3' // Erasure coded k=8, m=3 (8 data + 3 parity)
  | 'ceph_ec_8_4' // Erasure coded k=8, m=4 (8 data + 4 parity)

/** SUSE Longhorn topologies (Kubernetes distributed block storage, replicated) */
export type LonghornTopology =
  | 'longhorn_r2' // 2 replicas, 50% efficiency
  | 'longhorn_r3' // 3 replicas, 33% efficiency

/**
 * BeeGFS topologies — the level describes the *local* RAID of each storage
 * target, not a BeeGFS-level protection scheme. BeeGFS federates targets; it
 * does not protect data itself. Cluster protection comes from Buddy Mirroring,
 * which is an independent option (see BeeGfsOptions).
 */
export type BeeGfsTopology =
  | 'beegfs_raid6' // storage target = local RAID6 (default, 10-12 drives recommended)
  | 'beegfs_raid10' // storage target = local RAID10
  | 'beegfs_raidz2' // storage target = ZFS RAIDz2
  | 'beegfs_single' // one drive = one target, no local RAID

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
  | 'longhorn'
  | 'beegfs' // BeeGFS parallel filesystem (HPC/AI)

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
  | { type: 'longhorn'; level: LonghornTopology }
  | { type: 'beegfs'; level: BeeGfsTopology }

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
const HBA_TYPES = [
  'hba_sas', // Generic SAS HBA (IT mode)
  'hba_nvme', // NVMe HBA / direct attach
  'lsi_9500', // Broadcom/LSI 9500 series (24G SAS)
  'lsi_9400', // Broadcom/LSI 9400 series (12G SAS)
  'dell_hba355i', // Dell HBA355i (12G SAS)
  'dell_hba355e', // Dell HBA355e external (12G SAS)
] as const
export type HbaType = (typeof HBA_TYPES)[number]

/** RAID controller types including Dell PERC */
const RAID_CONTROLLER_TYPES = [
  'software',
  'hardware',
  'gpu',
  'perc_h755', // Dell PERC H755 (PCIe Gen4)
  'perc_h965i', // Dell PERC H965i (PCIe Gen5)
  'perc_h755n', // Dell PERC H755N (NVMe)
  'perc_h965in', // Dell PERC H965iN (NVMe Gen5)
  'perc_h975i', // Dell PERC H975i (PERC13, PCIe Gen5 NVMe)
  'powervault_me5_single', // Dell PowerVault ME5 (Single Controller)
  'powervault_me5_dual', // Dell PowerVault ME5 (Dual Active Controllers)
  'powerstore_t', // Dell PowerStore T Model (integrated appliance)
  'powerscale_node', // Dell PowerScale Node Controller (Isilon)
  'objectscale_node', // Dell ObjectScale Node Controller (ECS-based)
] as const
export type RaidControllerType = (typeof RAID_CONTROLLER_TYPES)[number]

/** Every controller value, in HBA-then-RAID order. Derived so `CONTROLLER_LIMITS` below stays
 * exhaustive by compilation: adding a member here breaks the build until the table follows. */
export const CONTROLLER_TYPES = [...HBA_TYPES, ...RAID_CONTROLLER_TYPES] as const
export type ControllerType = HbaType | RaidControllerType

/**
 * Topologies that require HBA (direct disk access) - software-defined storage only.
 *
 * BeeGFS is deliberately ABSENT: its controller class depends on the level, not on
 * the platform, so it is resolved by `BEEGFS_CONTROLLER_REQUIREMENT` below.
 */
export const HBA_REQUIRED_TOPOLOGIES: TopologyType[] = [
  'zfs',
  's2d',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'nutanix',
  'longhorn',
  // Note: powerscale and objectscale are appliances with built-in controllers, not HBA-based
]

/**
 * Controller class a topology can attach its drives through.
 * - `hba` — software-defined storage that addresses raw disks (IT mode)
 * - `raid` — the drives sit behind a hardware or software RAID controller
 * - `either` — both are physically valid, so the UI offers the union
 */
export type ControllerRequirement = 'hba' | 'raid' | 'either'

/**
 * BeeGFS does not protect data itself. Every storage target is a LOCAL volume that
 * BeeGFS sees as a single block device — it never sees the disks. So the controller
 * class follows the level (the local RAID), not the platform:
 * - RAID6 / RAID10 targets are normally built on a hardware RAID controller (PERC, LSI).
 * - RAIDz2 needs an IT-mode HBA because ZFS addresses the disks directly.
 * - One drive per target works behind either.
 *
 * Classifying BeeGFS as pure SDS (HBA-only) modelled a RAID6 node with the HBA
 * ceiling — ~2.7x the IOPS and ~1.6x the throughput a PERC H755 really offers.
 */
const BEEGFS_CONTROLLER_REQUIREMENT: Record<BeeGfsTopology, ControllerRequirement> = {
  beegfs_raid6: 'raid',
  beegfs_raid10: 'raid',
  beegfs_raidz2: 'hba',
  beegfs_single: 'either',
}

/**
 * Resolve which controller class a topology may use.
 *
 * `level` is optional so existing callers keep working; it only changes the answer
 * for BeeGFS. Every other platform resolves from `HBA_REQUIRED_TOPOLOGIES` exactly
 * as before and can never return `'either'`.
 */
export function getControllerRequirement(
  topologyType: TopologyType,
  level?: string,
): ControllerRequirement {
  if (topologyType === 'beegfs') {
    // No level supplied: fall back to the default level's class (beegfs_raid6 -> raid).
    return BEEGFS_CONTROLLER_REQUIREMENT[level as BeeGfsTopology] ?? 'raid'
  }
  return HBA_REQUIRED_TOPOLOGIES.includes(topologyType) ? 'hba' : 'raid'
}

/** Check if topology requires HBA */
export function requiresHba(topologyType: TopologyType, level?: string): boolean {
  return getControllerRequirement(topologyType, level) === 'hba'
}

/**
 * Topologies that rebuild from distributed reserve capacity instead of dedicated hot-spare
 * drives, so a "hot spares" input is not something their administrator configures.
 *
 * Per vendor documentation:
 *  - `vsan_osa` / `vsan_esa` — vSAN reserves free capacity across the cluster; never spare disks.
 *  - `s2d`        — reserve capacity "serves the same function as a hot spare" but is "taken
 *                   evenly from every drive in the pool" (Microsoft, Storage Pool deep dive).
 *  - `powerscale` — Virtual Hot Spare: reserved space as a percentage or virtual-drive count,
 *                   not a physical disk (OneFS Administration Guide).
 *  - `powerstore` — "Dedicated hot spare drives are not required"; spare space is distributed
 *                   across each resiliency set (Dell KB 000188491).
 *  - `powerflex`  — spare capacity spread across all disks (Dell KB 000219120).
 *  - `nutanix`    — many-to-many rebuild across the cluster, no single hot-spare destination
 *                   (Definitive Guide to AOS Storage).
 *  - `ceph`       — no traditional hot spare; recovery backfills into free cluster capacity
 *                   (Red Hat Ceph Storage Operations Guide).
 *  - `longhorn`   — replicas rebuild onto any node with free space, governed by the minimum
 *                   free-space threshold (Longhorn space-consumption guideline).
 *  - `objectscale` — INFERRED, not sourced: 12+4 erasure coding disperses fragments across
 *                   nodes and recovery re-creates them on the survivors, which leaves no role
 *                   for a spare drive. No vendor document states this outright.
 *
 * Platforms deliberately NOT here, because their vendors document dedicated spares: standard
 * RAID (PERC/mdadm global hot spares), ZFS (spare vdevs), PowerVault ME5 (global and dedicated
 * spares), Synology DSM (Hot Spare in Storage Manager), NetApp ONTAP (two per disk type is the
 * documented best practice), and BeeGFS — whose storage targets are local hardware RAID
 * volumes, so spares matter at the controller level even though BeeGFS itself has no such
 * concept.
 *
 * This list is the SINGLE source of truth for hot-spare relevance (issue #130). It cannot live
 * in `PLATFORM_CAPABILITIES` alongside the other control flags, and the reason is worth stating
 * because it looks like an inconsistency: the engines genuinely subtract hot spares for all
 * fifteen types, and the zeroing happens in the hooks (`useVolumetryCalc`, `usePerformanceCalc`,
 * `useResilience`) *before* the engine is called. A capability flag saying "this platform
 * ignores hot spares" would therefore be refuted by the capability probe, which drives
 * `calculateVolumetry` directly and would still observe the subtraction — correctly, since the
 * engine really does subtract. The flag would be describing the hooks while claiming to describe
 * the engine.
 *
 * So the question this list answers is not "does the engine read hotSpares" (yes, always) but
 * "does this platform have a dedicated spare drive for the user to configure". That is a
 * vendor-architecture fact, which is why it is sourced above rather than probed.
 */
export const DISTRIBUTED_SPARE_TOPOLOGIES: TopologyType[] = [
  'vsan_osa',
  'vsan_esa',
  's2d',
  'ceph',
  'powerflex',
  'powerstore',
  'powerscale',
  'objectscale',
  'nutanix',
  'longhorn',
]

/** Check if topology uses distributed spare capacity (no dedicated hot-spare drives) */
export function usesDistributedSpares(topologyType: TopologyType): boolean {
  return DISTRIBUTED_SPARE_TOPOLOGIES.includes(topologyType)
}

/** VMware vSAN topology family (OSA + ESA) */
const VSAN_TOPOLOGIES: TopologyType[] = ['vsan_osa', 'vsan_esa']

/** Check if topology is a vSAN architecture (OSA or ESA) */
export function isVsanTopology(topologyType: TopologyType): boolean {
  return VSAN_TOPOLOGIES.includes(topologyType)
}

/** Standard RAID controller options */
export interface RaidControllerOptions {
  /** Controller type */
  controller: ControllerType
  /** Stripe/chunk size in KB */
  stripeSize: 64 | 128 | 256 | 512 | 1024
  /** Read policy */
  readPolicy: 'read-ahead' | 'no-read-ahead' | 'adaptive'
  /**
   * Write policy.
   *
   * Deliberately NOT consumed by the performance engine, and the same reasoning applies
   * to `readPolicy` and `cacheSize`. The engine models SUSTAINED IOPS and throughput. A
   * battery/flash-backed write-back cache is a finite buffer: under a sustained write
   * stream the host rate converges on the rate at which the cache drains to the array, so
   * once the cache saturates the ceiling is the back-end array's, unchanged. The RAID 5/6
   * read-modify-write penalty (read old data + P + Q, write new data + P + Q) is a
   * back-end disk cost that the cache defers but never removes.
   *
   * The real benefits — write latency (ack from NVRAM instead of media) and burst
   * absorption — are properties of the *unsaturated* cache, i.e. of a transient this
   * engine does not model. There is one genuine sustained effect, full-stripe write
   * coalescing, which converts a 6-I/O RMW into an (N+2)/N full-stripe write; but its
   * magnitude is a function of write locality and stripe alignment, and no platform's
   * write penalty in this engine is workload-dependent. Deriving a factor without a
   * locality model would mean inventing one, so it is left unmodelled and documented.
   *
   * Exported to the config report (`exportConfig.ts`) so the operator still records it.
   */
  writePolicy: 'write-back' | 'write-through' | 'write-back-with-bbu'
  /** Cache size in MB (for hardware controllers) — see `writePolicy`: not consumed by any engine */
  cacheSize?: number
}

/** vSAN-specific configuration options */
export interface VsanOptions {
  /** Disk group mode for OSA: hybrid (HDD capacity) or all-flash (SSD capacity) */
  diskGroupMode: 'hybrid' | 'all-flash'
  /** Enable compression (always-on in ESA, opt-in cluster-wide in OSA) */
  compression: boolean
  /** Expected compression ratio (1.0 = none, 1.5 = 1.5:1) */
  compressionRatio: number
  /** Enable deduplication (OSA all-flash; ESA global dedup since VCF 9.x) */
  dedup: boolean
  /** Expected deduplication ratio (1.0 = none, 1.2 = 1.2:1) */
  dedupRatio: number
  /** Tiering configuration (disk groups with cache + capacity) - OSA only */
  tiering?: TieringConfig
}

/** Synology NAS-specific configuration options */
export interface SynologyOptions {
  /** File system type */
  filesystem: 'btrfs' | 'ext4'
  /** System partition size per disk in bytes (20-30GB) */
  systemPartitionSize: number
  /** SSD cache mode — see `ssdCache` */
}

/** Dell ObjectScale-specific configuration options (Object Storage S3) - per SME specs */
export interface ObjectScaleOptions {
  /** System overhead percentage (10-20% for formatting, metadata, rebalance, rebuild) */
  systemOverheadPercent: number
  /** Number of sites in Replication Group (1-8, impacts geo-overhead) */
  sites: number
  /** Enable compression */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1) */
  compressionRatio: number
}

/** Dell PowerStore-specific configuration options (Block Storage) */
export interface PowerStoreOptions {
  /**
   * Hardware model class.
   *
   * Not read directly by any engine — it is a UI preset picker. Selecting a model
   * in `DellOptionsPanel.tsx` writes `POWERSTORE_MODEL_OVERHEAD[model]` into
   * `systemOverheadPercent` (unless `model` is `'custom'`), and `systemOverheadPercent`
   * is what `overheadCalculator.ts` actually reads. The field itself is still worth
   * persisting (it drives the preset and is shown back to the user), so it stays.
   */
  model: 'powerstore_3200' | 'powerstore_5200t' | 'powerstore_5200q' | 'custom'
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
}

/** NetApp storage-specific configuration options */
export interface NetAppOptions {
  /** RAID type — read by `validators.ts` (RAID-TEC recommended above 10TB drives) */
  raidType: 'raid_dp' | 'raid_tec'
  /**
   * Snapshot reserve as a FRACTION of capacity after parity (0–0.2; default 0.05 = 5%, or 0
   * on AFF). Not a percent: `overheadCalculator.ts` multiplies by this value directly, unlike
   * `PowerStoreOptions`/`PowerScaleOptions.snapshotReservePercent`, which are divided by 100
   * there. The NetApp panel's slider works in percent and converts on both sides.
   */
  snapshotReserve: number
  /**
   * Data Reduction Ratio (1.0 = none, 3.0 = 3:1 compression+dedup). Gated in
   * `capacityEnhancements.ts` by `compression || dedup`, matching every other
   * platform's `<flag> ? ratio : 1.0` pattern.
   */
  dataReductionRatio: number
  /** WAFL filesystem overhead (0.01-0.02 = 1-2%) */
  waflOverhead: number
  /** Enable inline compression — gates `dataReductionRatio`, see its doc comment */
  compression: boolean
  /** Enable inline deduplication — gates `dataReductionRatio`, see its doc comment */
  dedup: boolean
}

/** Ceph storage-specific configuration options */
export interface CephOptions {
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
  /** WAL/DB offload to separate NVMe (for HDD OSDs) */
  walDbOffload: boolean
  /** Safe capacity threshold (Ceph nearfull, default 0.85 = 85%) */
  safeCapacityThreshold: number
  /** Cache tiering configuration (CRUSH rules) */
  tiering?: TieringConfig
}

/** SUSE Longhorn configuration options */
export interface LonghornOptions {
  /** Disk deployment model — presets the fields below */
  diskMode: 'dedicated' | 'root'
  /** Longhorn "Storage Minimal Available %" (0–100) → free-space factor F = 1 − pct/100 */
  minimalAvailablePercent: number
  /** Snapshot headroom S ≥ 1.0 — reserves physical snapshot-chain space */
  snapshotHeadroom: number
  /** Growth headroom G ≥ 1.0 — advisory only, never subtracted from usable */
  growthHeadroom: number
}

/**
 * BeeGFS configuration options.
 *
 * BeeGFS has no data protection of its own: each storage target is a local RAID
 * volume (the topology level) and cluster protection is Buddy Mirroring —
 * synchronous replication between *pairs* of targets, costing exactly 2x
 * capacity. Data and metadata buddy mirroring are configured independently.
 *
 * Metadata targets (MDT) are modelled with the shared TieringConfig primitive:
 * fastTier = MDT, capacityTier = storage targets. MDT drives count toward raw
 * capacity but never toward usable capacity.
 *
 * @see https://doc.beegfs.io/latest/system_design/system_requirements.html
 */
export interface BeeGfsOptions {
  /** Drives per storage target (the local RAID group width). BeeGFS recommends 10-12 for RAID6. */
  drivesPerTarget: number
  /** Buddy mirroring for storage targets — halves usable capacity */
  storageBuddyMirror: boolean
  /** Buddy mirroring for metadata targets — doubles the MDT capacity requirement */
  metadataBuddyMirror: boolean
  /**
   * Overhead of the ext4/xfs filesystem under each storage target, in percent
   * (e.g. `2` = 2%). User-configurable in the BeeGFS options panel (range 0.5-5%,
   * matched exactly by the Zod schema in src/utils/schemas.ts) because it varies
   * with the target filesystem's inode ratio and formatting options in real
   * deployments, and it feeds `getFilesystemOverheadPercent` /
   * `overheadCalculator.ts`, so it changes usable capacity.
   */
  fsOverheadPercent: number
  /**
   * Explicit opt-in for configuring metadata targets (MDT) separately from the Hardware
   * panel's drive/count, mirroring Ceph's `walDbOffload` toggle. Default `false`: with no
   * MDT configured, BeeGFS co-locates metadata on the storage nodes and `beeGfsDetails.status`
   * is `'none'`. Enabling this switches the storage-target drive selection from the Hardware
   * sidebar to the `tiering.capacityTier` picker (see `resolveTiering` in
   * src/engines/shared/tiering.ts) — the panel must make that switch explicit, not implicit,
   * since the two drive counts can otherwise silently diverge.
   */
  metadataTargets: boolean
  /** Metadata target configuration (fastTier = MDT, capacityTier = storage targets) */
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
  /** Enable compression (Ultra mode) */
  compression: boolean
  /** Compression ratio (1.0 = none, 2.0 = 2:1, 4.0 = 4:1) */
  compressionRatio: number
  /** Fine Granularity metadata overhead (12-15% for FG mode) */
  fgOverhead: number
}

/** Nutanix AOS configuration options */
export interface NutanixOptions {
  /** Cluster configuration: All-Flash or Hybrid */
  clusterType: 'all-flash' | 'hybrid'
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

/** Default ZFS options */
export const DEFAULT_ZFS_OPTIONS: ZfsOptions = {
  ashift: 12,
  compression: true,
  compressionType: 'lz4',
  dedup: false,
  recordsize: 131072, // 128K
  maxOccupation: 80, // Performance degrades beyond 80%
}

/** Default S2D options */
export const DEFAULT_S2D_OPTIONS: S2DOptions = {
  faultDomains: 4,
  mirrorCopies: 2,
  rebuildReserve: true,
  // Microsoft sizes rebuild reserve as one capacity drive per server (capped at 4).
  reserveStrategy: 'drive_failure',
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
  compressionRatio: 1.5,
  dedup: false,
  dedupRatio: 1.0,
}

/** Default ObjectScale options - per SME specs */
export const DEFAULT_OBJECTSCALE_OPTIONS: ObjectScaleOptions = {
  systemOverheadPercent: 15, // 10-20% for formatting, metadata, rebalance, rebuild
  sites: 1, // Single site (1-8 supported for geo-replication)
  compression: false,
  compressionRatio: 1.0,
}

/**
 * Per-model system overhead rates for PowerStore appliances.
 * Sources:
 *   - 5200Q: Dell Sizer 5200Q reference case (35x30.72TB NVMe) → 5%
 *   - 3200:  Entry-level model, simpler metadata footprint → 5%
 *   - 5200T: T-Series all-flash, larger metadata density → 7%
 *   - custom: User-specified via UI slider
 */
export const POWERSTORE_MODEL_OVERHEAD: Record<
  Exclude<PowerStoreOptions['model'], 'custom'>,
  number
> = {
  powerstore_3200: 5,
  powerstore_5200q: 5,
  powerstore_5200t: 7,
}

/** Default PowerStore options */
export const DEFAULT_POWERSTORE_OPTIONS: PowerStoreOptions = {
  model: 'powerstore_5200q',
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
}

/** Default Ceph options */
export const DEFAULT_CEPH_OPTIONS: CephOptions = {
  poolType: 'replicated',
  replicationFactor: 3,
  ecK: 4,
  ecM: 2,
  compression: false,
  compressionAlgorithm: 'none',
  walDbOffload: false,
  safeCapacityThreshold: 0.85, // Ceph nearfull at 85%
}

/** Default Longhorn options (dedicated-disk production preference) */
export const DEFAULT_LONGHORN_OPTIONS: LonghornOptions = {
  diskMode: 'dedicated',
  minimalAvailablePercent: 10,
  snapshotHeadroom: 1.2,
  growthHeadroom: 1.2,
}

/**
 * Default BeeGFS options.
 *
 * 12 drives per RAID6 target sits in the 10-12 range BeeGFS recommends as the
 * capacity/resilience/performance balance. Metadata buddy mirroring defaults on
 * (losing the namespace loses the filesystem); storage buddy mirroring defaults
 * off since most HPC deployments rely on the local RAID and restore from tape.
 */
export const DEFAULT_BEEGFS_OPTIONS: BeeGfsOptions = {
  drivesPerTarget: 12,
  storageBuddyMirror: false,
  metadataBuddyMirror: true,
  fsOverheadPercent: 2,
  metadataTargets: false,
}

/** Default tiering configuration */
export const DEFAULT_TIERING_CONFIG: TieringConfig = {
  enabled: false,
  fastTier: { driveId: '', driveCount: 2 },
  capacityTier: { driveId: '', driveCount: 4 },
  workingSetPercent: 20,
}

/** Default PowerFlex options (SSD/NVMe only - HDD no longer supported) */
export const DEFAULT_POWERFLEX_OPTIONS: PowerFlexOptions = {
  granularity: 'medium',
  protectionMode: 'mirror',
  mirrorCopies: 2, // Fine granularity only supports 2-way mirror
  compression: true,
  compressionRatio: 2.0, // 2:1 compression
  fgOverhead: 0.12, // 12% FG metadata overhead
}

/**
 * Default Nutanix AOS options.
 *
 * RF/EC-X configuration is carried entirely by the `nutanix_*` topology `level`
 * (`nutanix_rf2` / `nutanix_rf3` / `nutanix_ec_rf2` / `nutanix_ec_rf3`, see
 * `nutanixStrategy` in src/engines/volumetry/strategies/nutanix.ts) — there used to
 * be a parallel `replicationFactor`/`erasureCoding`/`ecStripe` trio on this options
 * object that duplicated that choice but had no UI control and no reader anywhere;
 * it was removed rather than wired, since the topology level is already the single
 * source of truth for RF/EC-X.
 */
export const DEFAULT_NUTANIX_OPTIONS: NutanixOptions = {
  clusterType: 'all-flash',
  compression: true,
  compressionRatio: 1.5, // 1.5:1 inline compression
  dedup: false,
  dedupRatio: 1.0,
  systemOverhead: 0.1, // 10% for system/metadata/snapshots
  networkType: '25gbe',
}

/** Default Synology options */
export const DEFAULT_SYNOLOGY_OPTIONS: SynologyOptions = {
  filesystem: 'btrfs',
  systemPartitionSize: 25 * 1024 * 1024 * 1024, // 25GB per disk
}

/** Default NetApp options */
export const DEFAULT_NETAPP_OPTIONS: NetAppOptions = {
  raidType: 'raid_dp',
  snapshotReserve: 0.05, // 5% default
  dataReductionRatio: 1.0, // No reduction by default
  waflOverhead: 0.015, // 1.5% WAFL overhead
  compression: true,
  dedup: false,
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

/**
 * Controller/HBA performance limits (IOPS, throughput in MB/s).
 *
 * **Basis for every entry in this table (#84):** one controller, 100% 4K random read for
 * `iops`, 100% 64K sequential read for `throughputMBs`, FIO, on an optimal (non-degraded)
 * volume. Per-entry values must be at this basis or explicitly marked otherwise — do not mix
 * a rebuild-time, degraded-mode, or multi-controller-aggregate figure into a field described
 * as this basis without saying so in the entry's comment.
 *
 * **PERC entries** (`perc_h755`, `perc_h755n`, `perc_h965i`, `perc_h965in`, `perc_h975i`) are
 * sourced from one of two vendor-commissioned, independently verified lab reports, both at the
 * basis above:
 *   - **Tolly Report #223103** (January 2023), "Dell PowerEdge RAID Controller 12 (PERC 12)
 *     16th Generation Server Performance vs PERC 11 & PERC 10" — commissioned by Dell, testing
 *     by Broadcom, verified by Tolly, FIO on RHEL 8.6. SAS results: 16x 24G SAS SSD, one
 *     controller (Table 2, tests 1 and 2). NVMe results: 8 NVMe SSDs, one controller (Table 4,
 *     tests 14 and 15).
 *   - **Signal65 PERC13 lab testing** (2026), corroborated by StorageReview's PERC13 review, "Meet PERC13: The Gen5 NVMe HW RAID
 *     Breakthrough" — lab-validated on PowerEdge 17G, RAID 5, 16 NVMe drives, one controller.
 *
 * Each PERC entry's comment cites its source table/test so the next person adding a PERC
 * generation knows what figure to look for and cannot silently pick a different basis.
 *
 * **Every non-PERC entry is `ESTIMATED`**: no published per-controller figure at this exact
 * basis (single controller, 4K random read IOPS / 64K sequential read throughput, FIO) could
 * be found for it at the time of #84's audit. Vendors either don't publish IOPS/throughput
 * specs for bare HBAs (pass-through devices, rated by port/device count instead) or publish
 * only aggregate multi-node/multi-controller marketing figures, not a comparable
 * single-controller number. These are carried-over legacy estimates on an unknown basis —
 * they are NOT derived from the PERC ratios above, and must not be "harmonised" to match them.
 * If a genuine per-controller figure at this basis is found for one of these, replace the
 * value, cite the source, and remove the `ESTIMATED` marker.
 */
export const CONTROLLER_LIMITS: Record<
  ControllerType,
  { iops: number; throughputMBs: number; name: string; isHba: boolean }
> = {
  // HBA options (direct passthrough - high performance, no RAID overhead)
  // ESTIMATED — no published single-HBA IOPS/throughput datasheet figure found at the stated
  // basis; Broadcom/vendor HBA datasheets publish port/device counts, not FIO IOPS numbers.
  hba_sas: { iops: 2000000, throughputMBs: 24000, name: 'Generic SAS HBA (IT Mode)', isHba: true },
  // ESTIMATED — generic NVMe direct-attach figure, no single-vendor datasheet basis.
  hba_nvme: { iops: 10000000, throughputMBs: 64000, name: 'NVMe Direct Attach', isHba: true },
  // ESTIMATED — Broadcom does not publish a per-controller FIO IOPS/throughput figure for the
  // 9500-8i/9500-16i; datasheet lists port/device counts only.
  lsi_9500: { iops: 4000000, throughputMBs: 28000, name: 'Broadcom 9500 (24G SAS)', isHba: true },
  // ESTIMATED — same basis gap as lsi_9500; no published per-controller figure for the 9400-8i.
  lsi_9400: { iops: 2000000, throughputMBs: 19200, name: 'Broadcom 9400 (12G SAS)', isHba: true },
  // ESTIMATED — Dell's HBA355 User's Guide documents ports/topology, not FIO IOPS/throughput.
  dell_hba355i: {
    iops: 2000000,
    throughputMBs: 19200,
    name: 'Dell HBA355i (12G SAS)',
    isHba: true,
  },
  // ESTIMATED — same basis gap as dell_hba355i.
  dell_hba355e: { iops: 2000000, throughputMBs: 19200, name: 'Dell HBA355e External', isHba: true },
  // RAID controller options
  // ESTIMATED — mdraid/Windows Storage Spaces figures vary enormously with host CPU; no single
  // "software RAID controller" spec exists to source against this basis.
  software: { iops: 1000000, throughputMBs: 10000, name: 'Software RAID', isHba: false },
  // ESTIMATED — deliberately conservative generic placeholder, not tied to a specific product.
  hardware: { iops: 500000, throughputMBs: 6000, name: 'Hardware RAID (Generic)', isHba: false },
  // ESTIMATED — no published per-controller GPU-RAID figure at this basis was found.
  gpu: { iops: 2000000, throughputMBs: 20000, name: 'GPU-Accelerated RAID', isHba: false },
  // Tolly #223103 Table 2, tests 2 (IOPS) and 1 (throughput), PERC 11 column, 16x 24G SAS SSD.
  perc_h755: { iops: 3500000, throughputMBs: 14100, name: 'Dell PERC H755', isHba: false },
  // Tolly #223103 Table 2, tests 2 (IOPS) and 1 (throughput), PERC 12 column, 16x 24G SAS SSD.
  perc_h965i: { iops: 5148110, throughputMBs: 27800, name: 'Dell PERC H965i', isHba: false },
  // Tolly #223103 Table 4, tests 15 (IOPS) and 14 (throughput), PERC 11 column, 8x NVMe SSD.
  perc_h755n: {
    iops: 3402370,
    throughputMBs: 14108,
    name: 'Dell PERC H755N (NVMe)',
    isHba: false,
  },
  // Tolly #223103 Table 4, tests 15 (IOPS) and 14 (throughput), PERC 12 column, 8x NVMe SSD.
  perc_h965in: {
    iops: 6918729,
    throughputMBs: 28205,
    name: 'Dell PERC H965iN (NVMe)',
    isHba: false,
  },
  // Signal65 PERC13 lab testing, corroborated by storagereview.com/review/dell-perc13. RAID 5, 16 NVMe, one controller.
  // Dell PERC H975i: Broadcom SAS5132W, PCIe Gen5 x16, RAID 0/1/5/6/10/50/60,
  // supercapacitor-backed cache, up to 16 NVMe drives per controller.
  perc_h975i: {
    iops: 12900000,
    throughputMBs: 56000,
    name: 'Dell PERC H975i (PERC13)',
    isHba: false,
  },
  // ESTIMATED — ME5 spec sheet publishes 12 GB/s read / 10 GB/s write and ~12K IOPS in
  // community-reported RAID5 tests, but no controller-count-normalized FIO figure at this
  // basis was found; those aggregate numbers were not adopted to avoid mixing bases.
  powervault_me5_single: {
    iops: 420000,
    throughputMBs: 7000,
    name: 'Dell PowerVault ME5 (Single Controller)',
    isHba: false,
  },
  // ESTIMATED — same basis gap as powervault_me5_single; carried at 2x the single-controller
  // placeholder for the dual-active configuration.
  powervault_me5_dual: {
    iops: 840000,
    throughputMBs: 14000,
    name: 'Dell PowerVault ME5 (Dual Active)',
    isHba: false,
  },
  // ESTIMATED — Dell publishes appliance-level marketing figures (e.g. 5200T = 7.5M IOPS,
  // 9200T = 12.5M IOPS) that are not per-controller/per-node and not at this FIO basis; no
  // per-node breakdown was found. Value is a placeholder, not derived from those figures.
  powerstore_t: {
    iops: 5000000,
    throughputMBs: 25000,
    name: 'Dell PowerStore T Model',
    isHba: false,
  },
  // ESTIMATED — Dell PowerScale spec sheets publish capacity/power per node but no per-node
  // FIO IOPS/throughput figure at this basis was found (only cluster-level marketing numbers
  // for some models, e.g. F810).
  powerscale_node: {
    iops: 800000,
    throughputMBs: 15000,
    name: 'Dell PowerScale Node Controller',
    isHba: false,
  },
  // ESTIMATED — no published per-node ObjectScale/ECS FIO IOPS/throughput figure at this basis
  // was found.
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

/**
 * Preferred default controller for topologies that mandate a specific one.
 * vSAN ESA is NVMe-only with direct PCIe attach, so it must default to the NVMe
 * HBA rather than the first (SAS) HBA in the list. Topologies absent here fall
 * back to "first valid controller" / "only switch when the current is invalid".
 *
 * BeeGFS is deliberately absent. This map is keyed by topology TYPE and so cannot
 * express a per-level preference, and BeeGFS mandates no specific model: mdraid and
 * PERC/LSI RAID6 targets are both common, and any IT-mode HBA suits RAIDz2. A
 * declared default here is applied unconditionally on every `setTopology`, which
 * would discard the user's explicit controller choice each time they change level.
 * The generic "keep the choice unless it became invalid" fallback already snaps to a
 * valid controller across every BeeGFS level transition.
 */
export const DEFAULT_CONTROLLER_BY_TOPOLOGY: Partial<Record<TopologyType, ControllerType>> = {
  vsan_esa: 'hba_nvme',
}

/**
 * Get controller options filtered by topology requirements.
 *
 * `level` is optional and only affects BeeGFS (see `getControllerRequirement`); the
 * list returned for every other topology is unchanged.
 */
export function getControllerOptions(topologyType: TopologyType, level?: string): ControllerType[] {
  // Storage appliances have fixed built-in controllers
  const applianceControllers = APPLIANCE_CONTROLLERS[topologyType]
  if (applianceControllers) {
    return applianceControllers
  }

  // Software-defined storage needs HBAs, traditional RAID needs controllers,
  // and a level that admits both (beegfs_single) gets the union.
  const requirement = getControllerRequirement(topologyType, level)
  const allControllers = Object.keys(CONTROLLER_LIMITS) as ControllerType[]
  if (requirement === 'either') {
    return allControllers
  }
  return allControllers.filter((key) => CONTROLLER_LIMITS[key].isHba === (requirement === 'hba'))
}
