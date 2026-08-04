/**
 * Calculation result interfaces for all engine modules.
 */

/** Volumetry calculation results (Module A) */
export interface VolumetryResult {
  /** Raw capacity in bytes (all drives) */
  rawCapacity: number
  /** Capacity lost to parity/redundancy in bytes */
  parityOverhead: number
  /** Capacity lost to hot spares in bytes */
  hotSpareOverhead: number
  /** Capacity lost to filesystem overhead in bytes */
  filesystemOverhead: number
  /** Capacity lost to ZFS slop factor (1/32) in bytes */
  slopOverhead: number
  /** Usable capacity before compression/dedup in bytes */
  usableCapacity: number
  /** Effective capacity after compression/dedup in bytes */
  effectiveCapacity: number
  /** Overall storage efficiency percentage */
  efficiency: number
  /** Breakdown of each overhead source */
  breakdown: {
    label: string
    bytes: number
    percent: number
    color: string
  }[]
  /** ZFS-specific detailed capacity breakdown (only present when topology is ZFS) */
  zfsDetails?: ZfsCapacityDetails
  /** Longhorn-specific detailed capacity breakdown (only present when topology is Longhorn) */
  longhornDetails?: LonghornCapacityDetails
  /** BeeGFS-specific metadata-target advisory (only present when topology is BeeGFS) */
  beeGfsDetails?: BeeGfsCapacityDetails
}

/**
 * BeeGFS metadata-target sizing advisory.
 *
 * ThinkParQ recommends provisioning 0.3-0.5% of total storage capacity for
 * metadata, and reports that 500 GB of ext4 metadata capacity holds roughly
 * 150 million files.
 *
 * @see https://doc.beegfs.io/latest/system_design/system_requirements.html
 * @see https://doc.beegfs.io/latest/advanced_topics/metadata_tuning.html
 */
export interface BeeGfsCapacityDetails {
  /** Raw capacity of the metadata targets (0 when no MDT configured), in bytes */
  mdtRawCapacity: number
  /** MDT capacity after RAID1/10 and metadata buddy mirroring, in bytes */
  mdtUsableCapacity: number
  /** Lower bound of the ThinkParQ rule (0.3% of usable data capacity), in bytes */
  mdtRecommendedMin: number
  /** Typical target of the ThinkParQ rule (0.5% of usable data capacity), in bytes */
  mdtRecommendedTypical: number
  /** Files the MDT can hold, from the 500 GB ~ 150M files ext4 density */
  estimatedFileCount: number
  /** Whether the MDT meets the recommendation */
  status: 'ok' | 'under' | 'none'
  /** Number of whole storage targets formed by the storage drives */
  storageTargetCount: number
  /** Drives left over because they do not fill a whole storage target */
  strandedDrives: number
  /** Buddy mirroring state, echoed for display */
  storageBuddyMirror: boolean
  metadataBuddyMirror: boolean
}

/** ZFS-specific capacity breakdown for detailed display */
export interface ZfsCapacityDetails {
  /** Total raw storage capacity (all vdevs) in bytes */
  totalRawCapacity: number
  /** Zpool capacity after RAID-Z parity/mirror overhead in bytes */
  zpoolCapacity: number
  /** Capacity lost to parity (RAID-Z) or mirror redundancy in bytes */
  parityOverhead: number
  /** Capacity lost to ashift padding (sector alignment) in bytes */
  ashiftPaddingOverhead: number
  /** Zpool usable capacity after parity in bytes */
  zpoolUsableCapacity: number
  /** Slop space reservation (1/32 of pool) in bytes */
  slopSpaceReservation: number
  /** ZFS usable capacity after slop in bytes */
  zfsUsableCapacity: number
  /** Recommended minimum free space (20% of usable) in bytes */
  recommendedMinFreeSpace: number
  /** Practical usable capacity after 20% headroom in bytes */
  practicalUsableCapacity: number
  /** Effective capacity after compression/dedup in bytes */
  effectiveCapacity: number
  /** Compression ratio applied (1.0 = no compression) */
  compressionRatio: number
  /** Deduplication ratio applied (1.0 = no dedup) */
  dedupRatio: number
  /** Ashift value used */
  ashift: number
  /** Record size in bytes */
  recordSize: number
}

/** Longhorn-specific capacity breakdown and advisory sizing readouts */
export interface LonghornCapacityDetails {
  /** Physical usable app-data ceiling incl. snapshots, in bytes */
  physicalUsable: number
  /** Recommended committed data today (physicalUsable ÷ growthHeadroom), in bytes */
  recommendedCommittedData: number
  /** Per-node usable allocation (physicalUsable ÷ serverCount), in bytes */
  perNodeUsable: number
  /** Replica count (2 or 3) */
  replicaCount: number
  /** Storage Minimal Available % guardrail */
  minimalAvailablePercent: number
  /** Storage Over-Provisioning % (advisory display) */
  overProvisioningPercent: number
  /** Disk deployment model */
  diskMode: 'dedicated' | 'root'
}

/** Performance bottleneck analysis (Module B) */
export interface BottleneckLayer {
  /** Layer name */
  name: string
  /** Maximum throughput in MB/s */
  throughputMBs: number
  /** Maximum IOPS */
  iops: number
  /** Is this the limiting factor? */
  isBottleneck: boolean
  /** Utilization percentage at current config */
  utilization: number
}

export interface PerformanceResult {
  /** Maximum system read throughput in MB/s */
  maxReadThroughputMBs: number
  /** Maximum system write throughput in MB/s */
  maxWriteThroughputMBs: number
  /** Maximum system read IOPS */
  maxReadIOPS: number
  /** Maximum system write IOPS */
  maxWriteIOPS: number
  /** Bottleneck analysis for each layer */
  layers: BottleneckLayer[]
  /** Overall bottleneck description */
  bottleneckDescription: string
  /** XFS stripe alignment recommendations */
  xfsAlignment?: {
    sunit: number
    swidth: number
    suValue: string
    swValue: string
  }
  /** Estimated latency in microseconds (for Ceph: media×2 + network + CPU) */
  estimatedLatencyUs?: number
  /** CPU factor applied (for PowerFlex: 1.0=standard, 0.85=ultra, 0.70=EC) */
  cpuFactor?: number
  /** Effective write penalty factor (RAID amplification) */
  writePenalty?: number
}

/** Monte Carlo resilience simulation results (Module C) */
export interface ResilienceResult {
  /** Survival probability (0-1) */
  survivalRate: number
  /** Formatted survival percentage */
  survivalPercent: string
  /** Number of nines (e.g., 5 for 99.999%) */
  nines: number
  /** Average rebuild time in hours */
  avgRebuildTimeHours: number
  /** Probability of URE during rebuild */
  ureProbability: number
  /** Probability of second drive failure during rebuild */
  dualFailureProbability: number
  /** Risk assessment level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  /** Recommended actions */
  recommendations: string[]
}

/** Simulation progress for UI updates */
export interface SimulationProgress {
  /** Simulations completed */
  completed: number
  /** Total simulations to run */
  total: number
  /** Progress percentage (0-100) */
  percent: number
  /** Is simulation running? */
  isRunning: boolean
}

/** Sustainability and TCO results (Module D) */
export interface SustainabilityResult {
  /** Annual energy consumption in kWh */
  annualEnergyKwh: number
  /** Annual energy cost in USD */
  annualEnergyCost: number
  /** Annual CO2 emissions in kg */
  annualCO2Kg: number
  /** Power breakdown */
  powerBreakdown: {
    drives: number
    servers: number
    cooling: number
    total: number
  }
  /** Flash endurance analysis (for SSDs) */
  flashEndurance?: {
    /** Calculated DWPD based on workload */
    requiredDwpd: number
    /** Drive's rated DWPD */
    ratedDwpd: number
    /** Expected lifespan in years */
    expectedLifeYears: number
    /** Will drive survive project duration? */
    surviveProject: boolean
    /** Endurance utilization percentage */
    utilizationPercent: number
  }
}

/** TCO (Total Cost of Ownership) breakdown */
export interface TCOResult {
  /** Initial hardware cost */
  hardwareCost: number
  /** Total energy cost over project lifetime */
  totalEnergyCost: number
  /** Estimated maintenance cost */
  maintenanceCost: number
  /** Drive replacement cost (based on AFR) */
  replacementCost: number
  /** Total cost of ownership */
  totalCost: number
  /** Cost per usable TB */
  costPerTB: number
  /** Cost per effective TB (after compression/dedup) */
  costPerEffectiveTB: number
  /** Annual operating cost */
  annualOpex: number
  /** Carbon cost (if carbon pricing applied) */
  carbonCost?: number
}

/** Backup storage requirements (Module E) */
export interface BackupResult {
  /** Daily data change volume in bytes */
  dailyChange: number
  /** Cumulative incremental backup storage in bytes */
  incrementalRaw: number
  /** Full backup storage in bytes (reserved for v2) */
  fullRaw: number
  /** Total backup storage required in bytes */
  totalRaw: number
  /** Number of retention days used */
  retentionDays: number
  /** Daily change rate percentage used */
  changeRatePercent: number
}

/** Complete calculation results from all modules */
export interface CalculationResults {
  volumetry: VolumetryResult
  performance: PerformanceResult
  resilience: ResilienceResult | null
  sustainability: SustainabilityResult
  tco: TCOResult | null
  /** Backup storage requirements (optional for backward compatibility) */
  backup?: BackupResult
  /** Timestamp of last calculation */
  lastUpdated: number
  /** Any calculation errors */
  errors: string[]
}

/** Command generation results */
export interface CommandResult {
  /** mkfs command for XFS/ext4 */
  mkfsCommand?: string
  /** zpool create command for ZFS */
  zpoolCommand?: string
  /** mdadm command for software RAID */
  mdadmCommand?: string
  /** PowerShell for S2D */
  s2dCommand?: string
}
