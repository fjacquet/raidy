/**
 * Drive type definitions for the storage infrastructure simulator.
 * These interfaces define the structure of drive data used throughout the application.
 */

/** Supported drive interface types */
export type DriveType = 'HDD' | 'SSD_SATA' | 'SSD_SAS' | 'SSD_NVMe'

/** Drive connectivity filter options */
export type DriveConnectivity = 'all' | 'nvme' | 'sas' | 'sata' | 'hdd'

/** Mapping from connectivity filter to drive types */
export const CONNECTIVITY_TO_TYPES: Record<DriveConnectivity, DriveType[]> = {
  all: ['HDD', 'SSD_SATA', 'SSD_SAS', 'SSD_NVMe'],
  nvme: ['SSD_NVMe'],
  sas: ['SSD_SAS'],
  sata: ['SSD_SATA'],
  hdd: ['HDD'],
}

/** Physical form factors for drives */
export type FormFactor =
  | '2.5"'
  | '3.5"'
  | 'M.2'
  | 'U.2'
  | 'U.3'
  | 'E1.S'
  | 'E1.L'
  | 'E3.S'
  | 'E3.L'

/** Form factor filter options */
export type FormFactorFilter = 'all' | '2.5"' | '3.5"' | 'u.2' | 'e3.s' | 'edsff' | 'm.2'

/** Mapping from form factor filter to actual form factors */
export const FORM_FACTOR_TO_TYPES: Record<FormFactorFilter, FormFactor[]> = {
  all: ['2.5"', '3.5"', 'M.2', 'U.2', 'U.3', 'E1.S', 'E1.L', 'E3.S', 'E3.L'],
  '2.5"': ['2.5"'],
  '3.5"': ['3.5"'],
  'u.2': ['U.2', 'U.3'],
  'e3.s': ['E3.S'],
  edsff: ['E1.S', 'E1.L', 'E3.S', 'E3.L'], // All EDSFF form factors
  'm.2': ['M.2'],
}

/**
 * Get default form factor based on drive type.
 * Used when a drive doesn't have formFactor specified.
 */
export function getDefaultFormFactor(driveType: DriveType): FormFactor {
  switch (driveType) {
    case 'HDD':
      return '3.5"'
    case 'SSD_SATA':
    case 'SSD_SAS':
      return '2.5"'
    case 'SSD_NVMe':
      return 'U.2'
  }
}

/** Sector size options (512B legacy or 4KN native) */
export type SectorSize = 512 | 4096

/** URE (Unrecoverable Read Error) rate exponent: 10^-x */
export type URERate = 14 | 15 | 16 | 17

/** Drive performance characteristics */
export interface DrivePerformance {
  /** Random read IOPS */
  iops_read: number
  /** Random write IOPS */
  iops_write: number
  /** Sequential read bandwidth in MB/s */
  bandwidth_read_mb: number
  /** Sequential write bandwidth in MB/s */
  bandwidth_write_mb: number
}

/** Drive reliability metrics */
export interface DriveReliability {
  /** URE rate as exponent: 10^-x (e.g., 15 means 10^-15) */
  ure_rate: URERate
  /** Annual Failure Rate percentage (e.g., 0.44 for 0.44%) */
  afr: number
  /** Drive Writes Per Day for SSD endurance (0 for HDD) */
  dwpd: number
  /** Mean Time Between Failures in hours (optional) */
  mtbf_hours?: number
}

/** Drive power consumption */
export interface DrivePower {
  /** Idle power consumption in watts */
  idle_watts: number
  /** Active/load power consumption in watts */
  load_watts: number
}

/**
 * Complete drive definition.
 * Contains all specifications needed for capacity, performance,
 * reliability, and TCO calculations.
 */
/** Drive interface/bus type */
export type DriveInterface = 'SATA' | 'SAS' | 'PCIe3' | 'PCIe4' | 'PCIe5'

/** HDD recording technology */
export type RecordingType = 'CMR' | 'SMR' | 'HAMR'

/** NAND flash type for SSDs */
export type NandType = 'SLC' | 'MLC' | 'TLC' | 'QLC' | '3DXPoint'

/** Drive market tier classification */
export type DriveTier = 'enterprise' | 'datacenter' | 'nas' | 'consumer'

/** Storage Class Memory latency in microseconds */
export interface SCMLatency {
  /** Read latency in microseconds */
  read: number
  /** Write latency in microseconds */
  write: number
}

export interface Drive {
  /** Unique identifier (e.g., "ent-hdd-7k2-sata-24tb-cmr") */
  id: string
  /** Display model name (e.g., "Enterprise HDD 7.2K SATA 3.5\" 24TB CMR") */
  model: string
  /** Drive interface type */
  type: DriveType
  /** Physical form factor (optional, mainly for enterprise SSDs) */
  formFactor?: FormFactor
  /** Drive interface/bus type (optional, more specific than 'type') */
  interface?: DriveInterface
  /** Raw capacity in bytes */
  capacity_raw: number
  /** Physical sector size */
  sector_size: SectorSize
  /** Performance characteristics */
  performance: DrivePerformance
  /** Reliability metrics */
  reliability: DriveReliability
  /** Power consumption */
  power: DrivePower
  /** Average cost in USD (reference price) */
  cost_usd: number
  /** HDD rotational speed in RPM (optional, only for HDDs) */
  rpm?: number
  /** HDD recording technology (optional, only for HDDs) */
  recording?: RecordingType
  /** Dual actuator technology (optional, for Mach.2 drives) */
  dualActuator?: boolean
  /** NAND flash type (optional, for SSDs) */
  nandType?: NandType
  /** SCM latency in microseconds (optional, for Storage Class Memory) */
  latency_us?: SCMLatency
  /** Drive market tier classification */
  tier?: DriveTier
}

/** Drive database as a record for fast lookup */
export type DriveDatabase = Record<string, Drive>
