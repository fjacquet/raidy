/**
 * Storage topology type definitions.
 * Covers RAID, ZFS, S2D, and proprietary configurations.
 */

/** Standard RAID levels */
export type StandardRaidLevel =
  | 'RAID0'
  | 'RAID1'
  | 'RAID5'
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
  | 'netapp_raid_dp' // NetApp RAID-DP (double parity)
  | 'netapp_raid_tec' // NetApp RAID-TEC (triple parity)

/** VMware vSAN topologies */
export type VsanTopology =
  | 'vsan_osa_raid1' // OSA with RAID-1 (FTT=1)
  | 'vsan_osa_raid5' // OSA with RAID-5 (FTT=1)
  | 'vsan_osa_raid6' // OSA with RAID-6 (FTT=2)
  | 'vsan_esa_raid1' // ESA with RAID-1
  | 'vsan_esa_raid5' // ESA with RAID-5
  | 'vsan_esa_raid6' // ESA with RAID-6

/** Dell storage topologies */
export type DellTopology =
  | 'objectscale_ec' // ObjectScale erasure coding
  | 'powerscale_n1' // PowerScale N+1 protection
  | 'powerscale_n2' // PowerScale N+2 protection
  | 'powerscale_mirror' // PowerScale mirrored
  | 'powerstore_raid5' // PowerStore RAID-5
  | 'powerstore_raid6' // PowerStore RAID-6

/** Ceph storage topologies */
export type CephTopology =
  | 'ceph_replicated_2' // 2-way replication
  | 'ceph_replicated_3' // 3-way replication (default)
  | 'ceph_ec_2_1' // Erasure coded k=2, m=1 (2 data + 1 parity)
  | 'ceph_ec_4_2' // Erasure coded k=4, m=2 (4 data + 2 parity)
  | 'ceph_ec_8_3' // Erasure coded k=8, m=3 (8 data + 3 parity)
  | 'ceph_ec_8_4' // Erasure coded k=8, m=4 (8 data + 4 parity)

/** All supported topology types */
export type TopologyType = 'standard' | 'zfs' | 's2d' | 'proprietary' | 'vmware' | 'dell' | 'ceph'

/** Union of all topology configurations */
export type Topology =
  | { type: 'standard'; level: StandardRaidLevel }
  | { type: 'zfs'; level: ZfsTopology }
  | { type: 's2d'; level: S2DTopology }
  | { type: 'proprietary'; level: ProprietaryRaid }
  | { type: 'vmware'; level: VsanTopology }
  | { type: 'dell'; level: DellTopology }
  | { type: 'ceph'; level: CephTopology }

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
  /** Special allocation class enabled */
  specialVdev: boolean
}

/** S2D-specific configuration options */
export interface S2DOptions {
  /** Number of fault domains (nodes) */
  faultDomains: number
  /** Mirror copies for mirror/MAP topologies */
  mirrorCopies: 2 | 3
  /** Enable automatic rebuild reserve */
  rebuildReserve: boolean
  /** Storage tiers enabled */
  storageTiers: boolean
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

/** Combined controller/HBA types */
export type ControllerType = HbaType | RaidControllerType

/** Topologies that require HBA (direct disk access) */
export const HBA_REQUIRED_TOPOLOGIES: TopologyType[] = ['zfs', 's2d', 'vmware', 'ceph']

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
  /** Storage architecture */
  architecture: 'osa' | 'esa'
  /** Failures To Tolerate */
  ftt: 1 | 2 | 3
  /** Stripe width for RAID-5/6 */
  stripeWidth: number
  /** Enable compression */
  compression: boolean
  /** Enable deduplication */
  dedup: boolean
  /** Enable encryption */
  encryption: boolean
}

/** Dell storage-specific configuration options */
export interface DellOptions {
  /** Storage platform */
  platform: 'objectscale' | 'powerscale' | 'powerstore'
  /** Protection level descriptor */
  protectionLevel: string
  /** Enable compression */
  compression: boolean
  /** Enable deduplication */
  dedup: boolean
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
}

/** Default S2D options */
export const DEFAULT_S2D_OPTIONS: S2DOptions = {
  faultDomains: 4,
  mirrorCopies: 2,
  rebuildReserve: true,
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
  architecture: 'esa',
  ftt: 1,
  stripeWidth: 4,
  compression: true,
  dedup: false,
  encryption: false,
}

/** Default Dell options */
export const DEFAULT_DELL_OPTIONS: DellOptions = {
  platform: 'powerstore',
  protectionLevel: 'raid5',
  compression: true,
  dedup: false,
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
}

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
}

/** Get controller options filtered by topology requirements */
export function getControllerOptions(topologyType: TopologyType): ControllerType[] {
  const needsHba = requiresHba(topologyType)
  return (Object.keys(CONTROLLER_LIMITS) as ControllerType[]).filter(
    (key) => CONTROLLER_LIMITS[key].isHba === needsHba,
  )
}
