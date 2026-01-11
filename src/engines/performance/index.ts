/**
 * Performance & Bottleneck Engine (Module B)
 * Calculates IOPS/throughput and identifies limiting factors.
 */

import type { BlockSize, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { BottleneckLayer, PerformanceResult } from '@/types/results'
import type { RaidControllerOptions, Topology } from '@/types/topology'
import { CONTROLLER_LIMITS } from '@/types/topology'

export interface PerformanceInput {
  drive: Drive
  driveCount: number
  hotSpares: number
  topology: Topology
  controllerOptions: RaidControllerOptions
  readPercent: number
  randomPercent: number
  blockSize: BlockSize
  networkSpeed: NetworkSpeed
  pcieGen: PCIeGen
  pcieLanes: PCIeLanes
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
 * Get RAID write penalty for random I/O.
 * This is the number of I/O operations required per write.
 */
function getRaidWritePenalty(topology: Topology): number {
  switch (topology.type) {
    case 'standard':
      switch (topology.level) {
        case 'RAID0':
          return 1
        case 'RAID1':
          return 2 // Write to both mirrors
        case 'RAID5':
          return 4 // Read old data + parity, write new data + parity
        case 'RAID6':
          return 6 // Read old data + 2 parities, write new data + 2 parities
        case 'RAID10':
          return 2 // Mirror penalty
        case 'RAID50':
          return 4 // RAID5 penalty per group
        case 'RAID60':
          return 6 // RAID6 penalty per group
        default:
          return 1
      }

    case 'zfs':
      // ZFS uses Copy-on-Write, so write penalty is different
      // For random writes, CoW can amplify I/O but also batches
      switch (topology.level) {
        case 'stripe':
          return 1
        case 'mirror':
          return 2
        case 'raidz1':
        case 'draid1':
          return 2 // CoW reduces traditional RAID5 penalty
        case 'raidz2':
        case 'draid2':
          return 3
        case 'raidz3':
        case 'draid3':
          return 4
        default:
          return 1
      }

    case 's2d':
      switch (topology.level) {
        case 'simple':
          return 1
        case 'mirror':
          return 2
        case 'parity':
          return 3
        case 'dual_parity':
          return 4
        case 'map':
          return 2.5 // Blend of mirror and parity
        default:
          return 1
      }

    case 'proprietary':
      switch (topology.level) {
        case 'synology_shr':
          return 4 // Similar to RAID5
        case 'synology_shr2':
          return 6 // Similar to RAID6
        case 'netapp_raid_dp':
          return 4 // Optimized double parity
        case 'netapp_raid_tec':
          return 5 // Optimized triple parity
        default:
          return 1
      }

    case 'vmware':
      // vSAN write penalties
      switch (topology.level) {
        case 'vsan_osa_raid1':
        case 'vsan_esa_raid1':
          return 2 // Mirror writes
        case 'vsan_osa_raid5':
          return 4 // OSA RAID-5 has traditional penalty
        case 'vsan_esa_raid5':
          return 2.5 // ESA is more efficient with log-structured writes
        case 'vsan_osa_raid6':
          return 6 // OSA RAID-6 traditional penalty
        case 'vsan_esa_raid6':
          return 3.5 // ESA optimizes double parity
        default:
          return 1
      }

    case 'dell':
      // Dell storage platform write characteristics
      switch (topology.level) {
        case 'powerstore_raid5':
          return 3 // PowerStore uses optimized RAID-5 with NVMe
        case 'powerstore_raid6':
          return 4 // PowerStore RAID-6
        case 'powerscale_n1':
          return 2.5 // PowerScale N+1 with inline writes
        case 'powerscale_n2':
          return 3.5 // PowerScale N+2
        case 'powerscale_mirror':
          return 2 // Mirror writes
        case 'objectscale_ec':
          return 1.5 // ObjectScale EC with eventual consistency
        default:
          return 1
      }

    case 'ceph':
      // Ceph write characteristics depend on replication/erasure coding
      switch (topology.level) {
        case 'ceph_replicated_2':
          return 2 // 2-way replication
        case 'ceph_replicated_3':
          return 3 // 3-way replication
        case 'ceph_ec_2_1':
          return 2 // EC k=2, m=1 with primary OSD coordination
        case 'ceph_ec_4_2':
          return 2.5 // EC k=4, m=2
        case 'ceph_ec_8_3':
          return 3 // EC k=8, m=3
        case 'ceph_ec_8_4':
          return 3.5 // EC k=8, m=4
        default:
          return 3 // Default to 3x replication
      }

    default:
      return 1
  }
}

/**
 * Calculate XFS stripe alignment parameters.
 */
function calculateXfsAlignment(
  stripeSize: number,
  driveCount: number,
  topology: Topology,
): { sunit: number; swidth: number; suValue: string; swValue: string } | undefined {
  if (topology.type === 'zfs') {
    return undefined // ZFS handles its own alignment
  }

  // Get number of data drives
  let dataDrives = driveCount
  switch (topology.type) {
    case 'standard':
      switch (topology.level) {
        case 'RAID5':
        case 'RAID50':
          dataDrives = driveCount - 1
          break
        case 'RAID6':
        case 'RAID60':
          dataDrives = driveCount - 2
          break
        case 'RAID1':
        case 'RAID10':
          dataDrives = driveCount / 2
          break
      }
      break
  }

  // sunit: stripe unit size in 512-byte blocks
  const sunit = (stripeSize * 1024) / 512

  // swidth: stripe width = sunit * number of data drives
  const swidth = sunit * dataDrives

  return {
    sunit,
    swidth,
    suValue: `${stripeSize}k`,
    swValue: `${stripeSize * dataDrives}k`,
  }
}

/**
 * Calculate complete performance results.
 */
export function calculatePerformance(input: PerformanceInput): PerformanceResult {
  const {
    drive,
    driveCount,
    hotSpares,
    topology,
    controllerOptions,
    readPercent,
    randomPercent,
    blockSize,
    networkSpeed,
    pcieGen,
    pcieLanes,
  } = input

  const usableDrives = driveCount - hotSpares
  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent
  const blockSizeBytes = BLOCK_SIZE_BYTES[blockSize]

  // Calculate write penalty
  const writePenalty = getRaidWritePenalty(topology)

  // --- Media Layer (drives) ---
  // Base IOPS from drives
  const totalReadIOPS = drive.performance.iops_read * usableDrives
  const baseWriteIOPS = drive.performance.iops_write * usableDrives

  // Apply write penalty for random writes
  const randomWriteFactor = randomPercent / 100
  const effectiveWriteIOPS = baseWriteIOPS / (1 + (writePenalty - 1) * randomWriteFactor)

  // Blended IOPS based on read/write mix
  const blendedIOPS = (totalReadIOPS * readPercent + effectiveWriteIOPS * writePercent) / 100

  // Throughput from drives
  const totalReadThroughput = drive.performance.bandwidth_read_mb * usableDrives
  const totalWriteThroughput = drive.performance.bandwidth_write_mb * usableDrives

  // For sequential I/O, throughput is additive; for random, IOPS-limited
  const effectiveReadThroughput =
    (sequentialPercent / 100) * totalReadThroughput +
    ((randomPercent / 100) * (totalReadIOPS * blockSizeBytes)) / (1024 * 1024)

  const effectiveWriteThroughput =
    (sequentialPercent / 100) * totalWriteThroughput +
    ((randomPercent / 100) * (effectiveWriteIOPS * blockSizeBytes)) / (1024 * 1024)

  // --- Controller/CPU Layer ---
  // Use CONTROLLER_LIMITS to get the limits for the selected controller/HBA
  const controllerSpec = CONTROLLER_LIMITS[controllerOptions.controller]
  const controllerIOPS = controllerSpec?.iops ?? 1000000
  const controllerThroughput = controllerSpec?.throughputMBs ?? 10000
  const controllerName = controllerSpec?.name ?? 'Controller'

  // --- Bus Layer (PCIe) ---
  const pcieBandwidth = PCIE_LANE_BANDWIDTH[pcieGen] * PCIE_LANE_COUNT[pcieLanes]
  const pcieIOPS = (pcieBandwidth * 1024 * 1024) / blockSizeBytes

  // --- Network Layer ---
  const networkBandwidth = NETWORK_SPEED_MBS[networkSpeed]
  const networkIOPS = (networkBandwidth * 1024 * 1024) / blockSizeBytes

  // --- Build bottleneck layers ---
  const layers: BottleneckLayer[] = [
    {
      name: 'Media (Drives)',
      throughputMBs: Math.min(effectiveReadThroughput, effectiveWriteThroughput),
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

  return {
    maxReadThroughputMBs: Math.min(effectiveReadThroughput, minThroughput),
    maxWriteThroughputMBs: Math.min(effectiveWriteThroughput, minThroughput),
    maxReadIOPS: Math.min(totalReadIOPS, minIOPS),
    maxWriteIOPS: Math.min(effectiveWriteIOPS, minIOPS),
    layers,
    bottleneckDescription,
    xfsAlignment,
  }
}
