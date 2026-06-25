/**
 * Bottleneck identification for performance calculations.
 *
 * Identifies the limiting factor in storage performance by comparing:
 * 1. Media limit (drive IOPS/bandwidth)
 * 2. Controller limit (HBA/RAID controller throughput)
 * 3. Bus limit (PCIe interface bandwidth)
 * 4. Network limit (storage network throughput)
 *
 * Returns the bottleneck name and marks layers accordingly.
 */

import type { BottleneckLayer } from '@/types/results'
import type { VsanEsaTopology, VsanOsaTopology } from '@/types/topology'

/** Every vSAN topology level — used to key the egress table exhaustively. */
type VsanLevel = VsanOsaTopology | VsanEsaTopology

/**
 * Identify performance bottleneck from layer array.
 *
 * Finds the layer with minimum throughput/IOPS, marks it as bottleneck,
 * and calculates utilization percentages for all layers.
 *
 * Mutates the layers array by setting isBottleneck and utilization.
 *
 * @param layers - Array of bottleneck layers (media, controller, bus, network)
 * @returns Bottleneck description string
 *
 * @example
 * const layers = [
 *   { name: 'Media', throughputMBs: 12000, iops: 100000, isBottleneck: false, utilization: 0 },
 *   { name: 'Controller', throughputMBs: 8000, iops: 80000, isBottleneck: false, utilization: 0 },
 *   { name: 'PCIe', throughputMBs: 10000, iops: 120000, isBottleneck: false, utilization: 0 },
 * ]
 * const description = identifyBottleneck(layers)
 * // Returns: "Bottleneck: Controller (8000 MB/s)"
 * // layers[1].isBottleneck === true
 */
export function identifyBottleneck(layers: BottleneckLayer[]): string {
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
  return bottleneck
    ? `Bottleneck: ${bottleneck.name} (${Math.round(minThroughput)} MB/s)`
    : 'No bottleneck detected'
}

/**
 * Get minimum throughput from layers.
 *
 * Helper function to get the effective throughput after bottleneck analysis.
 *
 * @param layers - Array of bottleneck layers
 * @returns Minimum throughput in MB/s
 */
export function getMinThroughput(layers: BottleneckLayer[]): number {
  return Math.min(...layers.map((l) => l.throughputMBs))
}

/**
 * Get minimum IOPS from layers.
 *
 * Helper function to get the effective IOPS after bottleneck analysis.
 *
 * @param layers - Array of bottleneck layers
 * @returns Minimum IOPS
 */
export function getMinIOPS(layers: BottleneckLayer[]): number {
  return Math.min(...layers.map((l) => l.iops))
}

/**
 * Calculate PCIe bus bandwidth and IOPS limits.
 *
 * @param pcieGen - PCIe generation (gen3, gen4, gen5)
 * @param pcieLanes - Number of PCIe lanes (x4, x8, x16)
 * @param serverCount - Number of servers (for aggregation)
 * @param blockSizeBytes - Block size in bytes
 * @returns PCIe bandwidth in MB/s and IOPS limit
 */
export function calculatePcieLimits(
  pcieGen: string,
  pcieLanes: string,
  serverCount: number,
  blockSizeBytes: number,
): { bandwidth: number; iops: number } {
  /** PCIe bandwidth per lane in MB/s */
  const PCIE_LANE_BANDWIDTH: Record<string, number> = {
    gen3: 985, // ~1GB/s per lane
    gen4: 1969, // ~2GB/s per lane
    gen5: 3938, // ~4GB/s per lane
  }

  /** PCIe lane count */
  const PCIE_LANE_COUNT: Record<string, number> = {
    x4: 4,
    x8: 8,
    x16: 16,
  }

  // Each server has its own PCIe bus, so aggregate scales with serverCount
  const laneBandwidth = PCIE_LANE_BANDWIDTH[pcieGen] ?? 0
  const laneCount = PCIE_LANE_COUNT[pcieLanes] ?? 8
  const pcieBandwidthPerServer = laneBandwidth * laneCount
  const pcieBandwidth = pcieBandwidthPerServer * serverCount
  const pcieIOPS = (pcieBandwidth * 1024 * 1024) / blockSizeBytes

  return { bandwidth: pcieBandwidth, iops: pcieIOPS }
}

/**
 * Optional refinements for the network bottleneck on distributed (HCI) storage.
 *
 * Defaults are neutral (1×) so non-vSAN platforms reproduce the simple aggregate
 * model exactly — no behavioural change outside callers that opt in.
 */
export interface NetworkModel {
  /** Full-duplex multiplier (2 = count both directions). */
  duplex: number
  /** On-the-wire compression ratio (data is compressed before replication). */
  compressionRatio: number
  /** Fraction of throughput that actually traverses the fabric (0..1). */
  trafficFraction: number
}

const DEFAULT_NETWORK_MODEL: NetworkModel = { duplex: 1, compressionRatio: 1, trafficFraction: 1 }

/**
 * vSAN network write amplification: how many copies of a logical write leave the
 * originating node. Mirroring replicates full copies (FTT remote copies cross the
 * fabric); erasure coding shards data so only ~1× logical write + small parity crosses.
 */
const VSAN_EGRESS_FACTOR: Record<VsanLevel, number> = {
  vsan_osa_raid1: 1.0, // FTT=1 mirror -> 1 remote copy
  vsan_esa_raid1: 1.0, // FTT=1 mirror (2-node) -> 1 remote copy
  vsan_osa_raid1_ftt2: 2.0, // FTT=2 mirror -> 2 remote copies
  vsan_osa_raid5: 1.0, // single-parity EC, sharded
  vsan_esa_raid5: 1.0, // adaptive single-parity EC, sharded
  vsan_osa_raid6: 1.0, // dual-parity EC, sharded
  vsan_esa_raid6: 1.0, // dual-parity EC, sharded
}

/**
 * Estimate the fraction of cluster throughput that crosses the vSAN network.
 *
 * Writes always egress to remote nodes (× the replication/EC factor); reads are
 * partly served by remote nodes since data is distributed across the cluster
 * (≈ (N−1)/N remote for evenly striped objects). A 0.1 floor avoids div-by-zero.
 *
 * @param level - vSAN topology level (e.g. 'vsan_esa_raid5')
 * @param readPercent - Read share of the workload (0..100)
 * @param serverCount - Number of cluster nodes
 * @returns Traffic fraction in (0, 1]
 */
export function getVsanNetworkTrafficFraction(
  level: string,
  readPercent: number,
  serverCount: number,
): number {
  const readRatio = readPercent / 100
  const writeRatio = 1 - readRatio
  const egress = VSAN_EGRESS_FACTOR[level as VsanLevel] ?? 1.0
  const remoteReadFraction = serverCount > 1 ? (serverCount - 1) / serverCount : 0
  const fraction = writeRatio * egress + readRatio * remoteReadFraction
  return Math.max(fraction, 0.1)
}

/**
 * Calculate network bandwidth and IOPS limits.
 *
 * @param networkSpeed - Network speed (1GbE, 10GbE, etc.)
 * @param serverCount - Number of servers (for aggregation)
 * @param blockSizeBytes - Block size in bytes
 * @param model - Optional distributed-storage refinements (defaults to neutral 1×)
 * @returns Network bandwidth in MB/s and IOPS limit
 */
export function calculateNetworkLimits(
  networkSpeed: string,
  serverCount: number,
  blockSizeBytes: number,
  model: NetworkModel = DEFAULT_NETWORK_MODEL,
): { bandwidth: number; iops: number } {
  /** Network speed in MB/s */
  const NETWORK_SPEED_MBS: Record<string, number> = {
    '1GbE': 125,
    '10GbE': 1250,
    '25GbE': 3125,
    '40GbE': 5000,
    '100GbE': 12500,
    '200GbE': 25000,
    '400GbE': 50000,
  }

  // Each server has its own network uplink, so aggregate scales with serverCount.
  // The model raises the effective ceiling for full-duplex use and on-the-wire
  // compression, and lowers it by the fraction of traffic that crosses the fabric.
  const networkBandwidthPerServer = NETWORK_SPEED_MBS[networkSpeed] ?? 1250 // Default to 10GbE
  const networkBandwidth =
    (networkBandwidthPerServer * serverCount * model.duplex * model.compressionRatio) /
    model.trafficFraction
  const networkIOPS = (networkBandwidth * 1024 * 1024) / blockSizeBytes

  return { bandwidth: networkBandwidth, iops: networkIOPS }
}
