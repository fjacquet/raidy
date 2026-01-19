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
 * Calculate network bandwidth and IOPS limits.
 *
 * @param networkSpeed - Network speed (1GbE, 10GbE, etc.)
 * @param serverCount - Number of servers (for aggregation)
 * @param blockSizeBytes - Block size in bytes
 * @returns Network bandwidth in MB/s and IOPS limit
 */
export function calculateNetworkLimits(
  networkSpeed: string,
  serverCount: number,
  blockSizeBytes: number,
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

  // Each server has its own network uplink, so aggregate scales with serverCount
  const networkBandwidthPerServer = NETWORK_SPEED_MBS[networkSpeed] ?? 1250 // Default to 10GbE
  const networkBandwidth = networkBandwidthPerServer * serverCount
  const networkIOPS = (networkBandwidth * 1024 * 1024) / blockSizeBytes

  return { bandwidth: networkBandwidth, iops: networkIOPS }
}
