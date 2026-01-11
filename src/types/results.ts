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

/** Complete calculation results from all modules */
export interface CalculationResults {
  volumetry: VolumetryResult
  performance: PerformanceResult
  resilience: ResilienceResult | null
  sustainability: SustainabilityResult
  tco: TCOResult
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
