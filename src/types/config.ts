/**
 * Configuration state interfaces for the application store.
 * Defines all user-configurable parameters.
 */

import type { DriveConnectivity, FormFactorFilter } from './drive'
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
  RaidControllerOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from './topology'

/** Workload block size options */
export const BLOCK_SIZES = ['4K', '8K', '16K', '64K', '128K', '256K', '1M'] as const
export type BlockSize = (typeof BLOCK_SIZES)[number]

/** Network speed options */
export const NETWORK_SPEEDS = [
  '1GbE',
  '10GbE',
  '25GbE',
  '40GbE',
  '100GbE',
  '200GbE',
  '400GbE',
] as const
export type NetworkSpeed = (typeof NETWORK_SPEEDS)[number]

/** PCIe generation options */
export const PCIE_GENS = ['gen3', 'gen4', 'gen5'] as const
export type PCIeGen = (typeof PCIE_GENS)[number]

/** PCIe lane configuration */
export const PCIE_LANES = ['x4', 'x8', 'x16'] as const
export type PCIeLanes = (typeof PCIE_LANES)[number]

/**
 * Carbon intensity regions. Order is the UI display order (Header's carbon-region select) —
 * not alphabetical, not grouped by intensity. Do not "tidy" this into alphabetical order; that
 * would silently reorder a live dropdown. z.enum() and Record<CarbonRegion, …> lookups that
 * consume this array are order-independent, so the display order here is the only place order
 * is observed at all.
 */
export const CARBON_REGIONS = [
  'switzerland',
  'norway',
  'france',
  'germany',
  'usa_average',
  'world_average',
  'china',
] as const
export type CarbonRegion = (typeof CARBON_REGIONS)[number]

/**
 * File system types available for backup calculations. Order is the UI display order
 * (AdvancedPanel's filesystem select) — not alphabetical. Do not "tidy" this into alphabetical
 * order; that would silently reorder a live dropdown. z.enum() consumes this array in an
 * order-independent way, so the display order here is the only place order is observed at all.
 */
export const FS_TYPES = ['zfs', 'xfs', 'ext4', 'btrfs', 'refs', 'ntfs'] as const
export type FsType = (typeof FS_TYPES)[number]

/** Hardware configuration state */
export interface HardwareState {
  /** Drive connectivity filter */
  driveConnectivity: DriveConnectivity
  /** Drive form factor filter */
  driveFormFactor: FormFactorFilter
  /** Selected drive ID */
  driveId: string
  /** Number of drives */
  driveCount: number
  /** Number of servers/nodes */
  serverCount: number
  /** Per-server power consumption (watts, excluding drives) */
  serverPowerWatts: number
}

/** Topology configuration state */
export interface TopologyState {
  /** Selected topology configuration */
  topology: Topology
  /** Hot spare count */
  hotSpares: number
  /** ZFS-specific options */
  zfsOptions: ZfsOptions
  /** S2D-specific options */
  s2dOptions: S2DOptions
  /** vSAN-specific options */
  vsanOptions: VsanOptions
  /** ObjectScale-specific options */
  objectscaleOptions: ObjectScaleOptions
  /** PowerStore-specific options */
  powerstoreOptions: PowerStoreOptions
  /** PowerScale-specific options */
  powerscaleOptions: PowerScaleOptions
  /** Ceph-specific options */
  cephOptions: CephOptions
  /** Longhorn-specific options */
  longhornOptions: LonghornOptions
  /** BeeGFS-specific options */
  beeGfsOptions: BeeGfsOptions
  /** PowerFlex-specific options */
  powerFlexOptions: PowerFlexOptions
  /** NetApp-specific options */
  netAppOptions: NetAppOptions
  /** Synology-specific options */
  synologyOptions: SynologyOptions
  /** Nutanix-specific options */
  nutanixOptions: NutanixOptions
  /** PowerVault ME5-specific options */
  /** RAID controller options */
  controllerOptions: RaidControllerOptions
}

/** Workload configuration state */
export interface WorkloadState {
  /** Read percentage (0-100), write = 100 - read */
  readPercent: number
  /** I/O block size */
  blockSize: BlockSize
  /** Random I/O percentage (0-100), sequential = 100 - random */
  randomPercent: number
  /** Daily write volume in bytes (for SSD endurance) */
  dailyWriteVolume: number
}

/** Advanced configuration state */
export interface AdvancedState {
  /** Expected compression ratio (1.0 = no compression, 2.0 = 50% reduction) */
  compressionRatio: number
  /** Expected deduplication ratio (1.0 = no dedup) */
  dedupRatio: number
  /** Frontend network speed */
  networkSpeed: NetworkSpeed
  /** PCIe generation */
  pcieGen: PCIeGen
  /** PCIe lanes */
  pcieLanes: PCIeLanes
  /** PUE (Power Usage Effectiveness) for datacenter */
  pue: number
  /** Carbon intensity region */
  carbonRegion: CarbonRegion
  /** Project lifespan in years (for TCO) */
  projectYears: number
  /** Electricity cost per kWh in USD */
  electricityCostPerKwh: number
  /** Unit system for display: binary (TiB/GiB) or decimal (TB/GB) */
  unitSystem: 'binary' | 'decimal'
  /** Performance threshold for display (0.5-1.0, default 1.0 = 100% = no limit) */
  performanceThreshold: number
}

/** File system options for backup calculations */
export interface FilesystemState {
  /** File system type */
  fsType: FsType
  /** Supports reflink/CoW for efficient backups */
  supportsReflink: boolean
  /** Backup retention count */
  backupRetention: number
  /** Daily change rate percentage */
  dailyChangeRate: number
}

/** Complete application configuration state */
export interface ConfigState {
  hardware: HardwareState
  topology: TopologyState
  workload: WorkloadState
  advanced: AdvancedState
  filesystem: FilesystemState
}

/** Actions for modifying configuration */
export interface ConfigActions {
  // Hardware actions
  setDriveConnectivity: (connectivity: DriveConnectivity) => void
  setDriveFormFactor: (formFactor: FormFactorFilter) => void
  setDriveId: (id: string) => void
  setDriveCount: (count: number) => void
  setServerCount: (count: number) => void
  setServerPower: (watts: number) => void

  // Topology actions
  setTopology: (topology: Topology) => void
  setHotSpares: (count: number) => void
  setZfsOptions: (options: Partial<ZfsOptions>) => void
  setS2DOptions: (options: Partial<S2DOptions>) => void
  setVsanOptions: (options: Partial<VsanOptions>) => void
  setObjectScaleOptions: (options: Partial<ObjectScaleOptions>) => void
  setPowerStoreOptions: (options: Partial<PowerStoreOptions>) => void
  setPowerScaleOptions: (options: Partial<PowerScaleOptions>) => void
  setCephOptions: (options: Partial<CephOptions>) => void
  setPowerFlexOptions: (options: Partial<PowerFlexOptions>) => void
  setNetAppOptions: (options: Partial<NetAppOptions>) => void
  setSynologyOptions: (options: Partial<SynologyOptions>) => void
  setNutanixOptions: (options: Partial<NutanixOptions>) => void
  setControllerOptions: (options: Partial<RaidControllerOptions>) => void

  // Workload actions
  setReadPercent: (percent: number) => void
  setBlockSize: (size: BlockSize) => void
  setRandomPercent: (percent: number) => void
  setDailyWriteVolume: (bytes: number) => void

  // Advanced actions
  setCompressionRatio: (ratio: number) => void
  setDedupRatio: (ratio: number) => void
  setNetworkSpeed: (speed: NetworkSpeed) => void
  setPcieGen: (gen: PCIeGen) => void
  setPcieLanes: (lanes: PCIeLanes) => void
  setPue: (pue: number) => void
  setCarbonRegion: (region: CarbonRegion) => void
  setProjectYears: (years: number) => void
  setElectricityCost: (cost: number) => void

  // Filesystem actions
  setFsType: (type: FilesystemState['fsType']) => void
  setSupportsReflink: (supports: boolean) => void
  setBackupRetention: (count: number) => void
  setDailyChangeRate: (rate: number) => void

  // Bulk actions
  resetToDefaults: () => void
  importConfig: (config: Partial<ConfigState>) => void
}

/** Combined store type */
export type ConfigStore = ConfigState & ConfigActions
