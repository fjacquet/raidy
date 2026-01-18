/**
 * Helper functions for volumetry calculations.
 *
 * Provides:
 * - Strategy selection based on topology type
 * - Data fraction calculation (parity/redundancy overhead)
 * - ZFS-specific overhead calculation (slop + ashift)
 */

import type {
  CephOptions,
  NutanixOptions,
  S2DOptions,
  Topology,
  TopologyType,
  ZfsOptions,
} from '@/types/topology'
import { assertNever } from '@/utils/typeGuards'
import { cephStrategy } from '../strategies/ceph'
import { dellStrategy } from '../strategies/dell'
import { nutanixStrategy } from '../strategies/nutanix'
import { proprietaryStrategy } from '../strategies/proprietary'
import { raidStrategy } from '../strategies/raid'
import { s2dStrategy } from '../strategies/s2d'
import type { VolumetryStrategy } from '../strategies/VolumetryStrategy'
import { vsanStrategy } from '../strategies/vsan'
import { zfsStrategy } from '../strategies/zfs'

/**
 * Valid topology types for runtime checking.
 * Used to gracefully handle invalid topology types from URL params or user input.
 */
const VALID_TOPOLOGY_TYPES: readonly TopologyType[] = [
  'standard',
  'zfs',
  's2d',
  'proprietary',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'powerstore',
  'powerscale',
  'objectscale',
  'nutanix',
  'powervault',
] as const

/**
 * Get volumetry strategy for topology type with exhaustive type checking.
 *
 * Uses strategy pattern to delegate calculations to topology-specific modules.
 * TypeScript will error at compile time if new topology type added without case.
 *
 * @param topologyType - Topology type
 * @returns Strategy for the topology type
 */
export function getStrategy(topologyType: TopologyType): VolumetryStrategy {
  switch (topologyType) {
    case 'standard':
      return raidStrategy
    case 'zfs':
      return zfsStrategy
    case 's2d':
      return s2dStrategy
    case 'ceph':
      return cephStrategy
    case 'nutanix':
      return nutanixStrategy
    case 'vsan_esa':
    case 'vsan_osa':
      return vsanStrategy
    case 'powerflex':
    case 'powerstore':
    case 'powerscale':
    case 'objectscale':
      return dellStrategy
    case 'proprietary':
    case 'powervault':
      return proprietaryStrategy
    default:
      // TypeScript error if new topology type added without case
      return assertNever(topologyType)
  }
}

/**
 * Calculate parity overhead factor based on topology.
 * Returns the fraction of capacity used for data (0-1).
 *
 * Delegates to topology-specific strategy for calculation.
 *
 * @param topology - Storage topology configuration
 * @param driveCount - Number of drives
 * @param s2dOptions - S2D-specific options
 * @param cephOptions - Ceph-specific options
 * @param nutanixOptions - Nutanix-specific options
 * @param serverCount - Number of servers/nodes
 * @returns Data fraction (0-1)
 */
export function getDataFraction(
  topology: Topology,
  driveCount: number,
  s2dOptions: S2DOptions,
  cephOptions: CephOptions,
  nutanixOptions: NutanixOptions,
  serverCount: number,
): number {
  // Runtime type guard: handle invalid topology types from URL params/user input
  // TypeScript can't catch these at compile time when data comes from external sources
  if (!VALID_TOPOLOGY_TYPES.includes(topology.type as TopologyType)) {
    console.warn(`Unknown topology type: ${topology.type}, falling back to 100% efficiency`)
    return 1.0
  }

  const strategy = getStrategy(topology.type)

  // Build options object based on topology type
  let options: unknown = {}

  switch (topology.type) {
    case 's2d':
      options = s2dOptions
      break
    case 'ceph':
      options = cephOptions
      break
    case 'nutanix':
      options = nutanixOptions
      break
    case 'vsan_esa':
    case 'vsan_osa':
      // vSAN strategies need serverCount for adaptive stripe width
      options = { serverCount }
      break
    default:
      // Other topologies don't need special options
      options = {}
  }

  return strategy.calculateDataFraction(topology.level, driveCount, options)
}

/**
 * Calculate ZFS-specific overhead.
 * Per OpenZFS documentation:
 * - Slop space: clamp(capacity / 32, 128 MiB, 128 GiB)
 * - spa_slop_shift = 5 (default, means 1/32 = 2^5)
 * - SPA_MIN_SLOP = 128 MiB
 * - SPA_MAX_SLOP = 128 GiB
 *
 * @param capacity - Capacity to calculate overhead for
 * @param zfsOptions - ZFS configuration options
 * @param sectorSize - Physical sector size of drives
 * @returns ZFS overhead breakdown (slop + ashift penalty)
 */
export function getZfsOverhead(
  capacity: number,
  zfsOptions: ZfsOptions,
  sectorSize: number,
): { slop: number; ashift: number } {
  // Use ZFS strategy for slop space calculation
  const slop = zfsStrategy.calculateOverhead?.(capacity) ?? 0

  // Ashift padding penalty when ashift > physical sector size
  let ashiftPenalty = 0
  const physicalSectorLog = Math.log2(sectorSize)
  if (zfsOptions.ashift > physicalSectorLog) {
    // Each ashift level above physical wastes (2^diff - 1) / 2^diff
    // For 512B drives with ashift=12: ~87.5% waste on small blocks
    // This is worst-case; actual impact depends on recordsize
    // Using conservative 5% estimate for typical workloads
    ashiftPenalty = capacity * 0.05 * (zfsOptions.ashift - physicalSectorLog)
  }

  return { slop, ashift: ashiftPenalty }
}
