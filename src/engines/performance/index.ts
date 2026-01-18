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
  Topology,
} from '@/types/topology'
import { CONTROLLER_LIMITS, type TopologyType } from '@/types/topology'
import { raidPerformanceStrategy } from './strategies/raid'
import { zfsPerformanceStrategy } from './strategies/zfs'
import { s2dPerformanceStrategy } from './strategies/s2d'
import { vsanPerformanceStrategy } from './strategies/vsan'
import { cephPerformanceStrategy } from './strategies/ceph'
import { nutanixPerformanceStrategy } from './strategies/nutanix'
import { powerFlexPerformanceStrategy } from './strategies/powerflex'
import { dellPerformanceStrategy } from './strategies/dell'
import { proprietaryPerformanceStrategy } from './strategies/proprietary'
import type { PerformanceStrategy } from './strategies/PerformanceStrategy'
import { assertNever } from '@/utils/typeGuards'
import {
  calculateXfsAlignment,
  calculateEstimatedLatency,
  getPowerFlexCpuFactor,
} from './utils'

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

/** Network speed in MB/s */
const NETWORK_SPEED_MBS: Record<NetworkSpeed, number> = {
  '1GbE': 125,
  '10GbE': 1250,
  '25GbE': 3125,
  '40GbE': 5000,
  '100GbE': 12500,
  '200GbE': 25000,
  '400GbE': 50000,
}

/** PCIe bandwidth per lane in MB/s */
const PCIE_LANE_BANDWIDTH: Record<PCIeGen, number> = {
  gen3: 985, // ~1GB/s per lane
  gen4: 1969, // ~2GB/s per lane
  gen5: 3938, // ~4GB/s per lane
}

/** PCIe lane count */
const PCIE_LANE_COUNT: Record<PCIeLanes, number> = {
  x4: 4,
  x8: 8,
  x16: 16,
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
function getRaidWritePenalty(topology: Topology): number {
  const strategy = getStrategy(topology.type)
  return strategy.getWritePenalty(topology.level, topology)
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
  } = input

  const usableDrives = driveCount - hotSpares
  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent
  const blockSizeBytes = BLOCK_SIZE_BYTES[blockSize]

  // Calculate write penalty for random I/O
  const randomWritePenalty = getRaidWritePenalty(topology)

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
  // Each server has its own PCIe bus, so aggregate scales with serverCount
  const pcieBandwidthPerServer = PCIE_LANE_BANDWIDTH[pcieGen] * PCIE_LANE_COUNT[pcieLanes]
  const pcieBandwidth = pcieBandwidthPerServer * serverCount
  const pcieIOPS = (pcieBandwidth * 1024 * 1024) / blockSizeBytes

  // --- Network Layer ---
  // Each server has its own network uplink, so aggregate scales with serverCount
  const networkBandwidthPerServer = NETWORK_SPEED_MBS[networkSpeed]
  const networkBandwidth = networkBandwidthPerServer * serverCount
  const networkIOPS = (networkBandwidth * 1024 * 1024) / blockSizeBytes

  // --- Build bottleneck layers ---
  const layers: BottleneckLayer[] = [
    {
      name: 'Media (Drives)',
      throughputMBs: effectiveThroughput,
      iops: blendedIOPS,
      isBottleneck: false,
      utilization: 0,
    },
    {
      name: controllerName,
      throughputMBs: controllerThroughput,
      iops: controllerIOPS,
      isBottleneck: false,
      utilization: 0,
    },
    {
      name: `PCIe ${pcieGen} ${pcieLanes}`,
      throughputMBs: pcieBandwidth,
      iops: pcieIOPS,
      isBottleneck: false,
      utilization: 0,
    },
    {
      name: `Network (${networkSpeed})`,
      throughputMBs: networkBandwidth,
      iops: networkIOPS,
      isBottleneck: false,
      utilization: 0,
    },
  ]

  // Find the bottleneck (lowest throughput)
  const minThroughput = Math.min(...layers.map((l) => l.throughputMBs))
  const minIOPS = Math.min(...layers.map((l) => l.iops))

  // Mark bottleneck and calculate utilization
  for (const layer of layers) {
    if (layer.throughputMBs === minThroughput || layer.iops === minIOPS) {
      layer.isBottleneck = true
    }
    layer.utilization = (minThroughput / layer.throughputMBs) * 100
  }

  const bottleneck = layers.find((l) => l.isBottleneck)
  const bottleneckDescription = bottleneck
    ? `Bottleneck: ${bottleneck.name} (${Math.round(minThroughput)} MB/s)`
    : 'No bottleneck detected'

  // XFS alignment
  const xfsAlignment = calculateXfsAlignment(controllerOptions.stripeSize, usableDrives, topology)

  // Calculate max read/write throughput considering bottlenecks
  const maxReadThroughputMBs = Math.min(effectiveReadThroughput, minThroughput)
  const maxWriteThroughputMBs = Math.min(effectiveWriteThroughput, minThroughput)

  // Cap IOPS by controller/appliance limit
  // For integrated appliances (PowerStore, PowerScale, etc.), the controller IS the system limit
  const cappedReadIOPS = Math.min(adjustedReadIOPS, controllerIOPS)
  const cappedWriteIOPS = Math.min(adjustedWriteIOPS, controllerIOPS)

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
