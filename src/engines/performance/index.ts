/**
 * Performance & Bottleneck Engine (Module B)
 * Calculates IOPS/throughput and identifies limiting factors.
 *
 * Implements spec formulas:
 * - PowerFlex CPU malus: Standard=100%, Ultra=-15%, EC=-30%
 * - Ceph latency: (Lat_media × 2) + Lat_réseau + Overhead_CPU
 * - Write penalty per platform
 */

import type { TieredCapacityResult } from '@/engines/shared/tiering'
import type { BlockSize, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { BottleneckLayer, PerformanceResult } from '@/types/results'
import type {
  BeeGfsOptions,
  CephOptions,
  NutanixOptions,
  PowerFlexOptions,
  RaidControllerOptions,
  S2DOptions,
  Topology,
  VsanOptions,
} from '@/types/topology'
import { CONTROLLER_LIMITS, type TopologyType } from '@/types/topology'
import { assertNever } from '@/utils/typeGuards'
import { beeGfsPerformanceStrategy } from './strategies/beegfs'
import { cephPerformanceStrategy } from './strategies/ceph'
import { dellPerformanceStrategy } from './strategies/dell'
import { longhornPerformanceStrategy } from './strategies/longhorn'
import { nutanixPerformanceStrategy } from './strategies/nutanix'
import type { PerformanceStrategy } from './strategies/PerformanceStrategy'
import { powerFlexPerformanceStrategy } from './strategies/powerflex'
import { proprietaryPerformanceStrategy } from './strategies/proprietary'
import { raidPerformanceStrategy } from './strategies/raid'
import { s2dPerformanceStrategy } from './strategies/s2d'
import { vsanPerformanceStrategy } from './strategies/vsan'
import { zfsPerformanceStrategy } from './strategies/zfs'
import { calculateEstimatedLatency, calculateXfsAlignment, getPowerFlexCpuFactor } from './utils'
import {
  calculateNetworkLimits,
  calculatePcieLimits,
  chainMinThroughput,
  identifyBottleneck,
  resolveNetworkModel,
} from './utils/bottleneck-chain'
import { boundedTierThroughput, resolveFastTierModel } from './utils/fast-tier-models'

export interface PerformanceInput {
  drive: Drive
  driveCount: number
  hotSpares: number
  serverCount: number
  topology: Topology
  controllerOptions: RaidControllerOptions
  readPercent: number
  randomPercent: number
  blockSize: BlockSize
  networkSpeed: NetworkSpeed
  pcieGen: PCIeGen
  pcieLanes: PCIeLanes
  powerFlexOptions?: PowerFlexOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
  vsanOptions?: VsanOptions
  s2dOptions?: S2DOptions
  beeGfsOptions?: BeeGfsOptions
  tiering?: TieredCapacityResult | null
  workingSetPercent?: number
}

/** Block size in bytes */
const BLOCK_SIZE_BYTES: Record<BlockSize, number> = {
  '4K': 4096,
  '8K': 8192,
  '16K': 16384,
  '64K': 65536,
  '128K': 131072,
  '256K': 262144,
  '1M': 1048576,
}

/**
 * Get strategy for topology type.
 * Returns appropriate performance calculation strategy for the given topology.
 * Uses exhaustive type checking to ensure all topology types are handled.
 */
function getStrategy(topologyType: TopologyType): PerformanceStrategy {
  switch (topologyType) {
    case 'standard':
      return raidPerformanceStrategy
    case 'zfs':
      return zfsPerformanceStrategy
    case 's2d':
      return s2dPerformanceStrategy
    case 'vsan_osa':
    case 'vsan_esa':
      return vsanPerformanceStrategy
    case 'ceph':
      return cephPerformanceStrategy
    case 'longhorn':
      return longhornPerformanceStrategy
    case 'beegfs':
      return beeGfsPerformanceStrategy
    case 'nutanix':
      return nutanixPerformanceStrategy
    case 'powerflex':
      return powerFlexPerformanceStrategy
    case 'powerstore':
    case 'powerscale':
    case 'objectscale':
    case 'powervault':
      return dellPerformanceStrategy
    case 'proprietary':
      return proprietaryPerformanceStrategy
    default:
      // TypeScript will error if new topology added without case
      return assertNever(topologyType)
  }
}

/**
 * Get RAID write penalty for random I/O.
 * This is the number of I/O operations required per write.
 * Delegates to topology-specific strategy for calculation.
 */
function getRaidWritePenalty(
  topology: Topology,
  serverCount: number,
  s2dOptions?: S2DOptions,
  beeGfsOptions?: BeeGfsOptions,
): number {
  const strategy = getStrategy(topology.type)
  // Each strategy interprets `options` differently: standard RAID needs the RAID-group
  // count for RAID 50/60, S2D needs its mirrorCopies, BeeGFS needs storageBuddyMirror,
  // others read from the topology.
  let options: unknown = topology
  if (topology.type === 'standard') {
    options = { serverCount }
  } else if (topology.type === 's2d') {
    options = s2dOptions
  } else if (topology.type === 'beegfs') {
    options = beeGfsOptions
  }
  return strategy.getWritePenalty(topology.level, options)
}

/**
 * The IOPS a drive can sustain, as the lower of its read and write ratings — drives share a
 * single capacity budget between reads and writes, so the smaller figure is the real ceiling.
 */
function limitingIOPS(drive: Drive): number {
  return Math.min(drive.performance.iops_read, drive.performance.iops_write)
}

/**
 * Calculate complete performance results.
 */
export function calculatePerformance(input: PerformanceInput): PerformanceResult {
  const {
    drive,
    driveCount,
    hotSpares,
    serverCount,
    topology,
    controllerOptions,
    readPercent,
    randomPercent,
    blockSize,
    networkSpeed,
    pcieGen,
    pcieLanes,
    powerFlexOptions,
    cephOptions,
    nutanixOptions,
    vsanOptions,
    s2dOptions,
    beeGfsOptions,
    tiering,
    workingSetPercent,
  } = input

  const usableDrives = driveCount - hotSpares
  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent
  const blockSizeBytes = BLOCK_SIZE_BYTES[blockSize]

  // Calculate write penalty for random I/O
  const randomWritePenalty = getRaidWritePenalty(topology, serverCount, s2dOptions, beeGfsOptions)

  // Sequential write penalty is reduced (full-stripe writes avoid read-modify-write)
  // For RAID 5/6, sequential penalty ≈ 1 + parity_drives/data_drives
  const sequentialWritePenalty = Math.max(1, (randomWritePenalty + 1) / 2)

  // Calculate PowerFlex CPU factor (if applicable)
  const powerFlexCpuFactor = getPowerFlexCpuFactor(topology, powerFlexOptions)

  // Calculate estimated latency
  const estimatedLatencyUs = calculateEstimatedLatency(
    drive,
    topology,
    networkSpeed,
    cephOptions,
    nutanixOptions,
  )

  // --- Media Layer (drives) ---
  // Base IOPS from drives (use lower of read/write as drives share capacity)
  const driveIOPS = limitingIOPS(drive)
  const totalDriveIOPS = driveIOPS * usableDrives

  // Calculate effective write penalty based on random vs sequential mix
  // Random writes: full RAID penalty (read old data + parity, write new data + parity)
  // Sequential writes: reduced penalty (full-stripe writes)
  const randomRatio = randomPercent / 100
  const sequentialRatio = sequentialPercent / 100
  const effectiveWritePenalty =
    randomRatio * randomWritePenalty + sequentialRatio * sequentialWritePenalty

  // RAID IOPS calculations
  const readRatio = readPercent / 100
  const writeRatio = writePercent / 100

  // Tier-aware read/write capacity model (S2D hybrid write-back cache, first-order approximation).
  // When not tiered, readCapIOPS === writeCapIOPS === totalDriveIOPS and the harmonic formula
  // below reduces exactly to totalDriveIOPS / (readRatio + writeRatio * effectiveWritePenalty).
  const cacheDrive = tiering?.cacheTierDrive
  const capacityDrive = tiering?.capacityTierDrive

  let readCapIOPS: number
  let writeCapIOPS: number
  let readBW: number
  let writeBW: number
  // Sustained (steady-state) write ceiling — see #112. `writeCapIOPS`/`writeBW` above model the
  // BURST figure: what the fast tier absorbs before it saturates. Every byte written through a
  // write-back cache still has to land on the capacity tier eventually, and no numeric drain/
  // destage rate is published for S2D, vSAN OSA, or Nutanix's OpLog (see the fast-tier research
  // doc), so the only defensible sustained bound is the capacity tier's own write capacity —
  // once the cache is continuously full, throughput can't exceed what the slow tier can absorb.
  // For platforms/branches with no distinct fast-tier write model, burst already IS the
  // capacity-tier figure, so sustained is set equal to it (not merely close — identical), which
  // is what keeps burst and sustained visibly the same number in the UI for those cases.
  let sustainedWriteCapIOPS: number
  let sustainedWriteBW: number

  if (topology.type === 's2d' && tiering && cacheDrive && capacityDrive) {
    // cacheDrive / capacityDrive are narrowed to Drive by the guard above
    const c = cacheDrive
    const p = capacityDrive
    const cacheCount = tiering.cacheTierDriveCount
    const capCount = tiering.capacityTierDriveCount
    const capUsableDrivesS2d = Math.max(0, tiering.capacityTierDriveCount - hotSpares)
    const ws = (workingSetPercent ?? 20) / 100
    // Reads blend by working set: hot data served from cache tier, cold from capacity tier.
    // Bounded, not a weighted sum — see `boundedTierThroughput` for why (#111).
    readCapIOPS = boundedTierThroughput(
      ws,
      cacheCount * c.performance.iops_read,
      capCount * p.performance.iops_read,
    )
    // Writes are absorbed by the fast cache tier (write-back) — the BURST figure.
    writeCapIOPS = cacheCount * c.performance.iops_write
    readBW = boundedTierThroughput(
      ws,
      cacheCount * c.performance.bandwidth_read_mb,
      capCount * p.performance.bandwidth_read_mb,
    )
    writeBW = cacheCount * c.performance.bandwidth_write_mb
    // Sustained: bounded by the capacity tier's own write capacity, spares subtracted (the
    // population that actually serves I/O — same adjustment the media layer uses elsewhere).
    sustainedWriteCapIOPS = capUsableDrivesS2d * p.performance.iops_write
    sustainedWriteBW = capUsableDrivesS2d * p.performance.bandwidth_write_mb
  } else if (tiering && capacityDrive) {
    // Every other tiered platform (vSAN OSA disk groups, Ceph WAL/DB offload, Nutanix hybrid,
    // BeeGFS metadata targets): the bulk pool is the capacity tier, so the media layer is at
    // minimum sized from that drive and that count — the same substitution volumetry makes.
    const p = capacityDrive
    // Mirrors `spareAdjustedDrives` in src/engines/volumetry/index.ts.
    //
    // Deliberate divergence from volumetry for BeeGFS: volumetry additionally rounds this count
    // down to whole storage targets, dropping up to `drivesPerTarget - 1` "stranded" drives that
    // belong to no target and hold no data (see the comment at that site in
    // src/engines/volumetry/index.ts). Performance does NOT apply that rounding here — a drive
    // stranded from a storage target still physically exists on the bus, still draws from the
    // controller and PCIe budget, and can still serve rebuild traffic, so pricing it is correct
    // for a bottleneck model even though excluding it is correct for a capacity model. See #91.
    const capUsableDrives = Math.max(0, tiering.capacityTierDriveCount - hotSpares)

    // Fast-tier contribution, where one is modelled (see src/engines/performance/utils/fast-tier-models.ts).
    // vSAN OSA and Nutanix hybrid clusters get a per-platform model there; everything else
    // (including no cache drive selected) falls through to the capacity-only baseline below.
    const fastTierModel = resolveFastTierModel(topology.type)
    if (fastTierModel && cacheDrive) {
      const result = fastTierModel({
        cacheDrive,
        cacheCount: tiering.cacheTierDriveCount,
        capacityDrive: p,
        capCount: tiering.capacityTierDriveCount,
        capUsableDrives,
        workingSetPercent,
        randomPercent,
        vsanOptions,
      })
      readCapIOPS = result.readCapIOPS
      writeCapIOPS = result.writeCapIOPS
      readBW = result.readBW
      writeBW = result.writeBW
      // Sustained: bounded by the capacity tier's own write capacity — every write a fast-tier
      // model (vSAN OSA cache, Nutanix OpLog) absorbs still has to destage here eventually, and
      // no numeric drain rate is published for either (see the fast-tier research doc).
      sustainedWriteCapIOPS = capUsableDrives * p.performance.iops_write
      sustainedWriteBW = capUsableDrives * p.performance.bandwidth_write_mb
    } else {
      // Ceph WAL/DB offload: BlueStore's WAL/DB device holds only the internal write-ahead log
      // and RocksDB metadata — it is never in the data read path, and its write-path effect is
      // removing contention with bulk data sharing a spindle, not adding a parallel pool of
      // write IOPS. There is no vendor-published number to turn "removes contention" into an
      // IOPS or bandwidth delta, so it stays unmodelled.
      //
      // BeeGFS metadata targets: an MDT stores only inodes, directory entries, and striping
      // maps — never file content — so it is structurally incapable of serving bulk data I/O.
      // Blending it into the media-layer IOPS number would be a category error, not an
      // approximation, regardless of future research.
      const capDriveIOPS = limitingIOPS(p)
      readCapIOPS = capDriveIOPS * capUsableDrives
      writeCapIOPS = readCapIOPS
      readBW = p.performance.bandwidth_read_mb * capUsableDrives
      writeBW = p.performance.bandwidth_write_mb * capUsableDrives
      // No fast-tier write model here (Ceph, BeeGFS, or a fast-tier-model platform with no
      // cache drive selected) — the burst figure is already the capacity-tier baseline, so
      // sustained is identical to it, not merely close.
      sustainedWriteCapIOPS = writeCapIOPS
      sustainedWriteBW = writeBW
    }
  } else {
    readCapIOPS = totalDriveIOPS
    writeCapIOPS = totalDriveIOPS
    readBW = drive.performance.bandwidth_read_mb * usableDrives
    writeBW = drive.performance.bandwidth_write_mb * usableDrives
    // Untiered: no fast tier exists at all, so burst and sustained are the same number.
    sustainedWriteCapIOPS = writeCapIOPS
    sustainedWriteBW = writeBW
  }

  // Max Read IOPS = what you'd get with 100% reads (no RAID penalty)
  const maxPureReadIOPS = readCapIOPS

  // Max Write IOPS = what you'd get with 100% writes (full RAID penalty)
  const maxPureWriteIOPS = writeCapIOPS / effectiveWritePenalty

  // Sustained (steady-state) write IOPS — same RAID-penalty treatment as the burst figure above,
  // applied to the capacity-tier-bounded `sustainedWriteCapIOPS` instead of the burst
  // `writeCapIOPS`. See #112.
  const sustainedMaxPureWriteIOPS = sustainedWriteCapIOPS / effectiveWritePenalty

  // Blended IOPS for the actual workload mix using asymmetric harmonic formula.
  // Algebraic proof of reduction: when readCapIOPS === writeCapIOPS === totalDriveIOPS,
  //   denominator = readRatio/totalDriveIOPS + writeRatio*effectiveWritePenalty/totalDriveIOPS
  //               = (readRatio + writeRatio*effectiveWritePenalty) / totalDriveIOPS
  //   maxFrontendIOPS = 1/denominator = totalDriveIOPS / (readRatio + writeRatio*effectiveWritePenalty)
  // which is identical to the previous backendIOPSPerFrontendIO formula.
  const denominator = readRatio / readCapIOPS + (writeRatio * effectiveWritePenalty) / writeCapIOPS
  const maxFrontendIOPS = denominator > 0 ? 1 / denominator : 0

  // Apply PowerFlex CPU factor (reduces IOPS for FG mode and EC)
  const blendedIOPS = maxFrontendIOPS * powerFlexCpuFactor
  const adjustedReadIOPS = maxPureReadIOPS * powerFlexCpuFactor
  const adjustedWriteIOPS = maxPureWriteIOPS * powerFlexCpuFactor
  const sustainedAdjustedWriteIOPS = sustainedMaxPureWriteIOPS * powerFlexCpuFactor

  // Throughput from drives
  const totalReadThroughput = readBW
  const totalWriteThroughput = writeBW

  // Apply write penalty to throughput for write-heavy workloads
  // Sequential throughput is less affected by RAID penalty than random IOPS
  const effectiveWriteThroughput = totalWriteThroughput / sequentialWritePenalty
  // Sustained counterpart of the line above — see #112.
  const sustainedEffectiveWriteThroughput = sustainedWriteBW / sequentialWritePenalty

  // Blended throughput based on read/write mix
  const blendedThroughput = totalReadThroughput * readRatio + effectiveWriteThroughput * writeRatio

  // For random I/O, throughput is IOPS-limited
  const iopsLimitedThroughput = (blendedIOPS * blockSizeBytes) / (1024 * 1024)

  // Effective throughput: blend of sequential (bandwidth-limited) and random (IOPS-limited)
  const effectiveReadThroughput =
    sequentialRatio * totalReadThroughput + randomRatio * iopsLimitedThroughput
  const effectiveThroughput =
    sequentialRatio * blendedThroughput + randomRatio * iopsLimitedThroughput

  // Sustained counterpart of `effectiveThroughput` above — same read/write and random/sequential
  // blend, with `sustainedWriteCapIOPS`/`sustainedWriteBW` standing in for the burst
  // `writeCapIOPS`/`writeBW`. This is what the media layer would show under sustained load; it
  // feeds `sustainedMinThroughput` below the same way `effectiveThroughput` feeds `minThroughput`
  // for the burst figure — reusing the burst `minThroughput` here would let the (higher, cache-
  // inflated) burst media ceiling silently uncap the sustained bandwidth figure. See #112.
  const sustainedDenominator =
    readRatio / readCapIOPS + (writeRatio * effectiveWritePenalty) / sustainedWriteCapIOPS
  const sustainedMaxFrontendIOPS = sustainedDenominator > 0 ? 1 / sustainedDenominator : 0
  const sustainedBlendedIOPS = sustainedMaxFrontendIOPS * powerFlexCpuFactor
  const sustainedIopsLimitedThroughput = (sustainedBlendedIOPS * blockSizeBytes) / (1024 * 1024)
  const sustainedBlendedThroughput =
    totalReadThroughput * readRatio + sustainedEffectiveWriteThroughput * writeRatio
  const sustainedMediaThroughput =
    sequentialRatio * sustainedBlendedThroughput + randomRatio * sustainedIopsLimitedThroughput

  // --- Controller/CPU Layer ---
  // Use CONTROLLER_LIMITS to get the limits for the selected controller/HBA
  // Each server has its own controller, so aggregate scales with serverCount
  const controllerSpec = CONTROLLER_LIMITS[controllerOptions.controller]
  const controllerIOPS = (controllerSpec?.iops ?? 1000000) * serverCount
  const controllerThroughput = (controllerSpec?.throughputMBs ?? 10000) * serverCount
  const controllerName =
    serverCount > 1
      ? `${serverCount}× ${controllerSpec?.name ?? 'Controller'}`
      : (controllerSpec?.name ?? 'Controller')

  // --- Bus Layer (PCIe) ---
  const pcieLimits = calculatePcieLimits(pcieGen, pcieLanes, serverCount, blockSizeBytes)

  // --- Network Layer ---
  // Distributed platforms don't send every I/O straight to the wire at face value — vSAN
  // clusters distribute I/O over an east-west fabric (only replicated/EC writes + remote
  // reads cross nodes, full-duplex, ESA compresses on the wire), BeeGFS amplifies writes
  // under Buddy Mirroring, etc. `NETWORK_MODEL_BY_TOPOLOGY` is the per-platform lookup for
  // these refinements; platforms without an entry get the neutral default (1× everything).
  const networkModel = resolveNetworkModel(topology.type, {
    level: topology.level,
    readPercent,
    serverCount,
    vsanOptions,
    beeGfsOptions,
  })
  const networkLimits = calculateNetworkLimits(
    networkSpeed,
    serverCount,
    blockSizeBytes,
    networkModel,
  )

  // vSAN ESA is NVMe-only with drives attached directly to PCIe — there is no SAS/RAID
  // controller in the path, so the controller layer is dropped from the bottleneck chain
  // (PCIe represents the host interface). OSA keeps its controller (disk groups use HBAs).
  const isNvmeDirect = topology.type === 'vsan_esa'

  // --- Build bottleneck layers ---
  const mediaLayer: BottleneckLayer = {
    name: 'Media (Drives)',
    throughputMBs: effectiveThroughput,
    iops: blendedIOPS,
    isBottleneck: false,
    utilization: 0,
  }
  const controllerLayer: BottleneckLayer = {
    name: controllerName,
    throughputMBs: controllerThroughput,
    iops: controllerIOPS,
    isBottleneck: false,
    utilization: 0,
  }
  const pcieLayer: BottleneckLayer = {
    name: `PCIe ${pcieGen} ${pcieLanes}`,
    throughputMBs: pcieLimits.bandwidth,
    iops: pcieLimits.iops,
    isBottleneck: false,
    utilization: 0,
  }
  const networkLayer: BottleneckLayer = {
    name: `Network (${networkSpeed})`,
    throughputMBs: networkLimits.bandwidth,
    iops: networkLimits.iops,
    isBottleneck: false,
    utilization: 0,
  }
  const layers: BottleneckLayer[] = [
    mediaLayer,
    ...(isNvmeDirect ? [] : [controllerLayer]),
    pcieLayer,
    networkLayer,
  ]

  // Identify bottleneck and calculate utilization
  const bottleneckDescription = identifyBottleneck(layers)
  // Burst and sustained differ in exactly one input — the media figure — so they share one
  // derivation (#127). `layers` decides which links are in the chain, including vSAN ESA's
  // missing controller; neither call restates that.
  const minThroughput = chainMinThroughput(layers, mediaLayer, mediaLayer.throughputMBs)
  const sustainedMinThroughput = chainMinThroughput(layers, mediaLayer, sustainedMediaThroughput)

  // XFS alignment
  // A filesystem on a tiered pool is laid out on the data-bearing capacity tier — the fast tier
  // is cache or journal, not stripe members — so the alignment count follows the capacity tier's
  // population rather than the raw Hardware-panel count. Apply the same spare adjustment the
  // media layer applies above (`capUsableDrives` / S2D's `capCount`), so the alignment count and
  // the media count cannot diverge.
  const xfsAlignmentDriveCount =
    tiering && capacityDrive
      ? Math.max(0, tiering.capacityTierDriveCount - hotSpares)
      : usableDrives
  const xfsAlignment = calculateXfsAlignment(
    controllerOptions.stripeSize,
    xfsAlignmentDriveCount,
    topology,
  )

  // Calculate max read/write throughput considering bottlenecks
  const maxReadThroughputMBs = Math.min(effectiveReadThroughput, minThroughput)
  const maxWriteThroughputMBs = Math.min(effectiveWriteThroughput, minThroughput)
  // Sustained write throughput: capped by `sustainedMinThroughput` (its own media-aware infra
  // ceiling), not `minThroughput` — see the comment at `sustainedMinThroughput`. See #112.
  const sustainedWriteThroughputMBs = Math.min(
    sustainedEffectiveWriteThroughput,
    sustainedMinThroughput,
  )

  // Cap IOPS by controller/appliance limit
  // For integrated appliances (PowerStore, PowerScale, etc.), the controller IS the system limit.
  // For NVMe-direct topologies (vSAN ESA) there is no controller layer, so the PCIe/network
  // limits become the IOPS ceiling instead.
  const iopsCeiling = isNvmeDirect ? Math.min(pcieLimits.iops, networkLimits.iops) : controllerIOPS
  const cappedReadIOPS = Math.min(adjustedReadIOPS, iopsCeiling)
  const cappedWriteIOPS = Math.min(adjustedWriteIOPS, iopsCeiling)
  const sustainedWriteIOPS = Math.min(sustainedAdjustedWriteIOPS, iopsCeiling)

  return {
    maxReadThroughputMBs,
    maxWriteThroughputMBs,
    sustainedWriteThroughputMBs,
    sustainedWriteIOPS,
    // Max IOPS capped by the lowest limit in the chain (typically controller for appliances)
    maxReadIOPS: cappedReadIOPS,
    maxWriteIOPS: cappedWriteIOPS,
    // The drives' own ceiling, before the controller/PCIe/network chain caps it. Exposed so the
    // dashboard gauges can show what fraction of the media survives the chain — a fixed scale
    // saturates (the PERC13 recalibration in #84 alone raised controller limits 3.4-4.7x), and
    // scaling to the bottleneck is degenerate, since maxRead/WriteThroughputMBs IS the bottleneck
    // by construction.
    mediaCeilingMBs: mediaLayer.throughputMBs,
    mediaCeilingIOPS: mediaLayer.iops,
    // Blended IOPS for the actual workload is shown in the media layer
    layers,
    bottleneckDescription,
    xfsAlignment,
    estimatedLatencyUs,
    cpuFactor: powerFlexCpuFactor,
    writePenalty: effectiveWritePenalty,
  }
}
