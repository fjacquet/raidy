/**
 * Performance calculation utilities.
 *
 * Helper functions for XFS alignment, latency estimation, and platform-specific adjustments.
 */

import type { NetworkSpeed } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { CephOptions, NutanixOptions, PowerFlexOptions, Topology } from '@/types/topology'

/** PowerFlex CPU factor based on mode (per PowerFlex spec) */
const POWERFLEX_CPU_FACTOR = {
  /** Medium Granularity (Standard): 100% IOPS available */
  medium: 1.0,
  /** Fine Granularity with compression (Ultra): -15% IOPS */
  fine_compressed: 0.85,
  /** Fine Granularity without compression: -5% IOPS */
  fine: 0.95,
  /** Erasure Coding: -30% IOPS due to parity calculation */
  erasure: 0.7,
} as const

/** Estimated base latency by drive type in microseconds */
const DRIVE_BASE_LATENCY_US = {
  HDD: 8000, // 8ms for HDD seek/rotational
  SSD_SATA: 150, // 150μs for SATA SSD
  SSD_SAS: 100, // 100μs for SAS SSD
  SSD_NVMe: 20, // 20μs for NVMe
} as const

/** Network latency by speed in microseconds */
const NETWORK_LATENCY_US: Record<NetworkSpeed, number> = {
  '1GbE': 500,
  '10GbE': 50,
  '25GbE': 25,
  '40GbE': 20,
  '100GbE': 10,
  '200GbE': 5,
  '400GbE': 3,
}

/** CPU overhead for different operations in microseconds */
const CPU_OVERHEAD_US = {
  standard: 10, // Standard RAID
  compression: 50, // LZ4/zstd compression
  dedup: 100, // Deduplication lookup
  erasure_coding: 80, // EC parity calculation
  replication: 20, // Data replication coordination
} as const

/**
 * Calculate XFS stripe alignment parameters.
 */
export function calculateXfsAlignment(
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
        case 'RAID3':
        case 'RAID4':
        case 'RAID5':
        case 'RAID50':
          dataDrives = driveCount - 1
          break
        case 'RAID5E':
        case 'RAID5EE':
        case 'RAID6':
        case 'RAID60':
          dataDrives = driveCount - 2
          break
        case 'RAID1':
        case 'RAID1E':
        case 'RAID10':
          dataDrives = driveCount / 2
          break
        case 'RAID1_3WAY':
          dataDrives = driveCount / 3
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
 * Calculate PowerFlex CPU factor based on granularity and protection mode.
 * Per PowerFlex spec:
 * - Standard (Medium Granularity): 100% IOPS
 * - Ultra (Fine Granularity + compression): -15% IOPS
 * - Erasure Coding: -30% IOPS
 */
export function getPowerFlexCpuFactor(
  topology: Topology,
  powerFlexOptions?: PowerFlexOptions,
): number {
  if (topology.type !== 'powerflex' || !powerFlexOptions) {
    return 1.0
  }

  // Check if using erasure coding
  if (powerFlexOptions.protectionMode === 'erasure') {
    return POWERFLEX_CPU_FACTOR.erasure // -30%
  }

  // Check granularity and compression
  if (powerFlexOptions.granularity === 'fine') {
    if (powerFlexOptions.compression) {
      return POWERFLEX_CPU_FACTOR.fine_compressed // -15%
    }
    return POWERFLEX_CPU_FACTOR.fine // -5%
  }

  return POWERFLEX_CPU_FACTOR.medium // 100%
}

/**
 * Calculate estimated latency in microseconds.
 * Per Ceph spec: Latency = (Lat_media × 2) + Lat_réseau + Overhead_CPU
 *
 * The ×2 factor accounts for:
 * - Read: seek + transfer
 * - Write: journal/WAL write + data write
 */
export function calculateEstimatedLatency(
  drive: Drive,
  topology: Topology,
  networkSpeed: NetworkSpeed,
  cephOptions?: CephOptions,
  nutanixOptions?: NutanixOptions,
): number {
  // Base media latency
  const mediaLatency = DRIVE_BASE_LATENCY_US[drive.type] || DRIVE_BASE_LATENCY_US.HDD

  // Network latency
  const networkLatency = NETWORK_LATENCY_US[networkSpeed]

  // CPU overhead based on operations
  let cpuOverhead: number = CPU_OVERHEAD_US.standard

  switch (topology.type) {
    case 'ceph':
      // Ceph formula: (Lat_media × 2) + Lat_réseau + Overhead_CPU
      cpuOverhead =
        cephOptions?.poolType === 'erasure'
          ? CPU_OVERHEAD_US.erasure_coding
          : CPU_OVERHEAD_US.replication
      if (cephOptions?.compression) {
        cpuOverhead += CPU_OVERHEAD_US.compression
      }
      // Double media latency for Ceph (primary + replica writes)
      return mediaLatency * 2 + networkLatency + cpuOverhead

    case 'powerflex':
      // PowerFlex with compression adds CPU overhead
      return mediaLatency * 1.5 + networkLatency + cpuOverhead

    case 'objectscale':
      // ObjectScale S3: eventual consistency, EC overhead
      cpuOverhead = CPU_OVERHEAD_US.erasure_coding
      // Object storage has higher protocol overhead
      return mediaLatency * 2 + networkLatency * 1.5 + cpuOverhead

    case 'powerstore':
      // PowerStore: optimized block storage with NVMe
      return mediaLatency * 1.2 + cpuOverhead

    case 'powerscale':
      // PowerScale: scale-out NAS with parity writes
      cpuOverhead = CPU_OVERHEAD_US.replication
      return mediaLatency * 1.5 + networkLatency + cpuOverhead

    case 'zfs':
      // ZFS with CoW adds some overhead
      return mediaLatency * 1.2 + cpuOverhead

    case 'nutanix': {
      // Nutanix DSF: CVM-to-CVM replication adds network latency
      // Per spec: NVMe/RoCE = +0.1ms, 10GbE = +0.5ms
      cpuOverhead = CPU_OVERHEAD_US.replication
      if (nutanixOptions?.compression) {
        cpuOverhead += CPU_OVERHEAD_US.compression
      }
      if (nutanixOptions?.dedup) {
        cpuOverhead += CPU_OVERHEAD_US.dedup
      }
      // Network latency based on network type
      const nutanixNetworkLatency =
        nutanixOptions?.networkType === 'rdma'
          ? 100 // 0.1ms for RDMA
          : nutanixOptions?.networkType === '25gbe'
            ? 250 // 0.25ms for 25GbE
            : 500 // 0.5ms for 10GbE
      // Nutanix writes to OpLog first, then destages - similar to 2x media latency
      return mediaLatency * 2 + nutanixNetworkLatency + cpuOverhead
    }

    default:
      // Standard storage: single media access + overhead
      return mediaLatency + cpuOverhead
  }
}
