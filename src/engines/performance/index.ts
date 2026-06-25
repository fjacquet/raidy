/**
 * Performance & Bottleneck Engine (Module B)
 * Calculates IOPS/throughput and identifies limiting factors.
 *
 * Implements spec formulas:
 * - PowerFlex CPU malus: Standard=100%, Ultra=-15%, EC=-30%
 * - Ceph latency: (Lat_media × 2) + Lat_réseau + Overhead_CPU
 * - Write penalty per platform
 */

import type { BlockSize, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { BottleneckLayer, PerformanceResult } from '@/types/results'
import type {
  CephOptions,
  NutanixOptions,
  PowerFlexOptions,
  RaidControllerOptions,
  S2DOptions,
  Topology,
  VsanOptions,
} from '@/types/topology'
import { CONTROLLER_LIMITS, isVsanTopology, type TopologyType } from '@/types/topology'
import { assertNever } from '@/utils/typeGuards'
import { cephPerformanceStrategy } from './strategies/ceph'
import { dellPerformanceStrategy } from './strategies/dell'
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
  getMinThroughput,
  getVsanNetworkTrafficFraction,
  identifyBottleneck,
} from './utils/bottleneck-chain'

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
): number {
  const strategy = getStrategy(topology.type)
  // Each strategy interprets `options` differently: standard RAID needs the RAID-group
  // count for RAID 50/60, S2D needs its mirrorCopies, others read from the topology.
  let options: unknown = topology
  if (topology.type === 'standard') {
    options = { serverCount }
  } else if (topology.type === 's2d') {
    options = s2dOptions
  }
  return strategy.getWritePenalty(topology.level, options)
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
  } = input

  const usableDrives = driveCount - hotSpares
  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent
  const blockSizeBytes = BLOCK_SIZE_BYTES[blockSize]

  // Calculate write penalty for random I/O
  const randomWritePenalty = getRaidWritePenalty(topology, serverCount, s2dOptions)

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
  const driveIOPS = Math.min(drive.performance.iops_read, drive.performance.iops_write)
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

  // Max Read IOPS = what you'd get with 100% reads (no RAID penalty)
  const maxPureReadIOPS = totalDriveIOPS

  // Max Write IOPS = what you'd get with 100% writes (full RAID penalty)
  const maxPureWriteIOPS = totalDriveIOPS / effectiveWritePenalty

  // Blended IOPS for the actual workload mix
  // Formula: Frontend IOPS = Backend IOPS / (ReadRatio + WriteRatio × Penalty)
  const backendIOPSPerFrontendIO = readRatio + writeRatio * effectiveWritePenalty
  const maxFrontendIOPS = totalDriveIOPS / backendIOPSPerFrontendIO

  // Apply PowerFlex CPU factor (reduces IOPS for FG mode and EC)
  const blendedIOPS = maxFrontendIOPS * powerFlexCpuFactor
  const adjustedReadIOPS = maxPureReadIOPS * powerFlexCpuFactor
  const adjustedWriteIOPS = maxPureWriteIOPS * powerFlexCpuFactor

  // Throughput from drives
  const totalReadThroughput = drive.performance.bandwidth_read_mb * usableDrives
  const totalWriteThroughput = drive.performance.bandwidth_write_mb * usableDrives

  // Apply write penalty to throughput for write-heavy workloads
  // Sequential throughput is less affected by RAID penalty than random IOPS
  const effectiveWriteThroughput = totalWriteThroughput / sequentialWritePenalty

  // Blended throughput based on read/write mix
  const blendedThroughput = totalReadThroughput * readRatio + effectiveWriteThroughput * writeRatio

  // For random I/O, throughput is IOPS-limited
  const iopsLimitedThroughput = (blendedIOPS * blockSizeBytes) / (1024 * 1024)

  // Effective throughput: blend of sequential (bandwidth-limited) and random (IOPS-limited)
  const effectiveReadThroughput =
    sequentialRatio * totalReadThroughput + randomRatio * iopsLimitedThroughput
  const effectiveThroughput =
    sequentialRatio * blendedThroughput + randomRatio * iopsLimitedThroughput

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
  // vSAN clusters distribute I/O over an east-west fabric: the network only carries
  // the traffic that actually crosses nodes (writes × replication/EC + remote reads),
  // it runs full-duplex, and ESA compresses data before it is replicated. Modelling
  // those three effects keeps a small NVMe cluster from being flagged network-bound on
  // raw aggregate media bandwidth. Non-vSAN topologies use the neutral default model.
  // Non-vSAN topologies omit the model so calculateNetworkLimits applies its neutral default.
  const networkModel = isVsanTopology(topology.type)
    ? {
        duplex: 2, // (a) full-duplex
        compressionRatio: vsanOptions?.compression ? vsanOptions.compressionRatio : 1, // (b) compress-on-wire
        trafficFraction: getVsanNetworkTrafficFraction(topology.level, readPercent, serverCount), // (c)
      }
    : undefined
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
  const minThroughput = getMinThroughput(layers)

  // XFS alignment
  const xfsAlignment = calculateXfsAlignment(controllerOptions.stripeSize, usableDrives, topology)

  // Calculate max read/write throughput considering bottlenecks
  const maxReadThroughputMBs = Math.min(effectiveReadThroughput, minThroughput)
  const maxWriteThroughputMBs = Math.min(effectiveWriteThroughput, minThroughput)

  // Cap IOPS by controller/appliance limit
  // For integrated appliances (PowerStore, PowerScale, etc.), the controller IS the system limit.
  // For NVMe-direct topologies (vSAN ESA) there is no controller layer, so the PCIe/network
  // limits become the IOPS ceiling instead.
  const iopsCeiling = isNvmeDirect ? Math.min(pcieLimits.iops, networkLimits.iops) : controllerIOPS
  const cappedReadIOPS = Math.min(adjustedReadIOPS, iopsCeiling)
  const cappedWriteIOPS = Math.min(adjustedWriteIOPS, iopsCeiling)

  return {
    maxReadThroughputMBs,
    maxWriteThroughputMBs,
    // Max IOPS capped by the lowest limit in the chain (typically controller for appliances)
    maxReadIOPS: cappedReadIOPS,
    maxWriteIOPS: cappedWriteIOPS,
    // Blended IOPS for the actual workload is shown in the media layer
    layers,
    bottleneckDescription,
    xfsAlignment,
    estimatedLatencyUs,
    cpuFactor: powerFlexCpuFactor,
    writePenalty: effectiveWritePenalty,
  }
}
