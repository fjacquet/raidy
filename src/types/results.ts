/**
 * Calculation result interfaces for all engine modules.
 */
import type { PowerScaleProtection } from './topology'

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
  /** PowerScale-specific per-tier capacity breakdown (only present when topology is PowerScale) */
  powerScaleDetails?: PowerScaleCapacityDetails
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
  /** Disk deployment model */
  diskMode: 'dedicated' | 'root'
}

/** Sizing result for one PowerScale node pool (tier) */
export interface PowerScaleTierResult {
  nodeModel: string
  driveSizeTb: number
  nodeCount: number
  protection: PowerScaleProtection
  drivesPerNode: number
  /** Raw capacity of the pool, in bytes */
  rawCapacity: number
  /** Usable capacity after efficiency and usableFactor, before VHS, in bytes */
  usableCapacity: number
  /** Virtual Hot Spare reserve applied (the larger of the two vendor formulas), in bytes */
  vhsReserve: number
  /** Which VHS reserve won, as the workbook highlights */
  vhsSource: 'driveCount' | 'percent'
  /** Usable capacity after the VHS reserve, in bytes */
  usableLessVhs: number
  /** Capacity after the per-model data reduction ratio, in bytes */
  effectiveCapacity: number
  /** Storage efficiency for this pool, 0-1 */
  efficiency: number
  /** Data reduction ratio for this node model (1.0, 1.6 or 2.0) */
  drr: number
  generation: 'Gen6' | 'Gen6.5' | 'Gen7'
  tier: 'All Flash' | 'Hybrid' | 'Archive'
  /** ISO date, when the model is end-of-life */
  endOfLife?: string
}

/** PowerScale-specific capacity breakdown: one row per tier plus cluster totals */
export interface PowerScaleCapacityDetails {
  tiers: PowerScaleTierResult[]
  clusterRaw: number
  clusterUsable: number
  clusterEffective: number
  /** Cluster-wide efficiency: Σ usable / Σ raw */
  clusterEfficiency: number
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

/**
 * The bottleneck outcome as data rather than a sentence (#139).
 *
 * It used to be a pre-rendered English string — `"Bottleneck: Controller (8000 MB/s)"` — built in
 * the engine and shown verbatim in the dashboard and the PDF, so French, German and Italian users
 * read English there. The engine cannot fix that itself: `src/engines/**` is pure functions with
 * no i18n, and the PDF path would freeze whatever language was current when it ran. So the engine
 * reports what it found and each render site writes the sentence.
 *
 * `layerName` stays untranslated on purpose: it is `Media (Drives)`, a controller model, `PCIe
 * gen5 x16` or `Network (100GbE)` — technical identifiers the project convention leaves alone.
 * Only the prose around it needs keys.
 */
export type BottleneckStatus =
  /** A layer binds, at `throughputMBs`. */
  | { kind: 'layer'; layerName: string; throughputMBs: number }
  /** Layers were computed but none could be singled out. */
  | { kind: 'none' }
  /** No drive is selected, so nothing was computed. */
  | { kind: 'noDrive' }
  /** The calculation threw; the result is a zero state. */
  | { kind: 'error' }

export interface PerformanceResult {
  /** Maximum system read throughput in MB/s */
  maxReadThroughputMBs: number
  /** Maximum system write throughput in MB/s — the BURST figure: what the fast tier (write-back
   *  cache/OpLog) absorbs before it saturates. For an untiered configuration, or a tiered
   *  platform with no fast-tier write model, this equals `sustainedWriteThroughputMBs` exactly. */
  maxWriteThroughputMBs: number
  /** Maximum system read IOPS */
  maxReadIOPS: number
  /** Maximum system write IOPS — the BURST figure, same caveat as `maxWriteThroughputMBs`. */
  maxWriteIOPS: number
  /** Sustained (steady-state) write throughput in MB/s — bounded by the capacity tier's own
   *  write capacity, since every byte written through a fast tier eventually has to destage
   *  there and no vendor publishes a numeric drain rate to model a tighter ceiling against
   *  (see #112). Equal to `maxWriteThroughputMBs` whenever the platform has no distinct
   *  fast-tier write model (untiered, Ceph, BeeGFS, or no cache drive selected). */
  sustainedWriteThroughputMBs: number
  /** Sustained (steady-state) write IOPS — same bound as `sustainedWriteThroughputMBs`, IOPS axis. */
  sustainedWriteIOPS: number
  /** The drives' own throughput ceiling, before the controller/PCIe/network chain caps it. */
  mediaCeilingMBs: number
  /** The drives' own IOPS ceiling, before the controller/PCIe/network chain caps it. */
  mediaCeilingIOPS: number
  /** Bottleneck analysis for each layer */
  layers: BottleneckLayer[]
  /** Which layer binds, or why no figure could be produced. See {@link BottleneckStatus}. */
  bottleneck: BottleneckStatus
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
  /**
   * Recommended actions, as i18n key suffixes within the `output` namespace
   * (`resilience.recommendation.*`) — NOT display strings.
   *
   * They stay untranslated here on purpose. This array is produced once, when the worker
   * replies, and then held in state; translating at that moment would freeze the language, so
   * a user switching FR→DE after running a simulation would keep reading French. `ResilienceAct`
   * translates at render instead, which re-runs on language change.
   */
  recommendations: string[]
  /**
   * True when this simulation used a BeeGFS group topology (beegfs_raid6,
   * beegfs_raidz2, beegfs_raid10) with buddy mirroring requested but an ODD
   * storage-target count, so the worker withheld buddy credit entirely and
   * fell back to the unmerged per-target model (issue #68). Without this the
   * survival discontinuity — a 5-target cluster reporting worse survival than
   * a 4-target one — reads as a bug rather than the deliberately conservative
   * "no unpaired-target credit" choice it actually is.
   */
  oddTargetCountNoBuddyCredit: boolean
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
