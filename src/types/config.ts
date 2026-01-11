/**
 * Configuration state interfaces for the application store.
 * Defines all user-configurable parameters.
 */

import type { DriveConnectivity, FormFactorFilter } from './drive'
import type {
  CephOptions,
  DellOptions,
  RaidControllerOptions,
  S2DOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from './topology'

/** Workload block size options */
export type BlockSize = '4K' | '8K' | '16K' | '64K' | '128K' | '256K' | '1M'

/** Network speed options */
export type NetworkSpeed = '1GbE' | '10GbE' | '25GbE' | '40GbE' | '100GbE' | '200GbE' | '400GbE'

/** PCIe generation options */
export type PCIeGen = 'gen3' | 'gen4' | 'gen5'

/** PCIe lane configuration */
export type PCIeLanes = 'x4' | 'x8' | 'x16'

/** Carbon intensity regions */
export type CarbonRegion =
  | 'switzerland'
  | 'france'
  | 'norway'
  | 'germany'
  | 'usa_average'
  | 'china'
  | 'world_average'

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
  /** Dell-specific options */
  dellOptions: DellOptions
  /** Ceph-specific options */
  cephOptions: CephOptions
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
  /** Total dataset size in bytes */
  datasetSize: number
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
}

/** File system options for backup calculations */
export interface FilesystemState {
  /** File system type */
  fsType: 'xfs' | 'ext4' | 'zfs' | 'refs' | 'ntfs' | 'btrfs'
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
  setDellOptions: (options: Partial<DellOptions>) => void
  setCephOptions: (options: Partial<CephOptions>) => void
  setControllerOptions: (options: Partial<RaidControllerOptions>) => void

  // Workload actions
  setReadPercent: (percent: number) => void
  setBlockSize: (size: BlockSize) => void
  setRandomPercent: (percent: number) => void
  setDatasetSize: (bytes: number) => void
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
