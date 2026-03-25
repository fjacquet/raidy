/**
 * Capacity breakdown builder for visualization.
 *
 * Builds a detailed breakdown of capacity allocation showing:
 * - Usable capacity
 * - Parity/redundancy overhead
 * - Hot spares
 * - Cache tier (if tiered)
 * - Various system overheads (ZFS slop, S2D reserve, etc.)
 * - Filesystem overhead
 */

import type { ObjectScaleOptions, S2DOptions, Topology } from '@/types/topology'

export interface BreakdownEntry {
  label: string
  bytes: number
  percent: number
  color: string
}

export interface BreakdownInput {
  rawCapacity: number
  usableCapacity: number
  parityOverhead: number
  hotSpareOverhead: number
  cacheTierCapacity: number
  slopOverhead: number
  s2dReserve: number
  synologySystemOverhead: number
  powerFlexFgOverhead: number
  netAppSnapshotReserve: number
  nutanixSystemOverhead: number
  objectscaleSystemOverhead: number
  objectscaleGeoOverhead: number
  powerstoreSnapshotReserve: number
  powerstoreSystemOverhead: number
  powerscaleSnapshotReserve: number
  cephSafeCapacityReduction: number
  filesystemOverhead: number
  topology: Topology
  s2dOptions: S2DOptions
  objectscaleOptions: ObjectScaleOptions
}

/**
 * Build capacity breakdown for visualization.
 *
 * Creates an array of breakdown entries showing how raw capacity
 * is allocated across usable capacity and various overhead factors.
 *
 * @param input - Breakdown input with all overhead values
 * @returns Array of breakdown entries for visualization
 *
 * @example
 * const breakdown = buildBreakdown({
 *   rawCapacity: 100 * TB,
 *   usableCapacity: 67 * TB,
 *   parityOverhead: 33 * TB,
 *   // ... other overheads
 * })
 * // Returns:
 * // [
 * //   { label: 'Usable Capacity', bytes: 67TB, percent: 67, color: '...' },
 * //   { label: 'Parity/Redundancy', bytes: 33TB, percent: 33, color: '...' },
 * // ]
 */
export function buildBreakdown(input: BreakdownInput): BreakdownEntry[] {
  const {
    rawCapacity,
    usableCapacity,
    parityOverhead,
    hotSpareOverhead,
    cacheTierCapacity,
    slopOverhead,
    s2dReserve,
    synologySystemOverhead,
    powerFlexFgOverhead,
    netAppSnapshotReserve,
    nutanixSystemOverhead,
    objectscaleSystemOverhead,
    objectscaleGeoOverhead,
    powerstoreSnapshotReserve,
    powerstoreSystemOverhead,
    powerscaleSnapshotReserve,
    cephSafeCapacityReduction,
    filesystemOverhead,
    topology,
    s2dOptions,
    objectscaleOptions,
  } = input

  const breakdown: BreakdownEntry[] = [
    {
      label: 'Usable Capacity',
      bytes: usableCapacity,
      percent: (usableCapacity / rawCapacity) * 100,
      color: 'var(--color-capacity)',
    },
    {
      label: 'Parity/Redundancy',
      bytes: parityOverhead,
      percent: (parityOverhead / rawCapacity) * 100,
      color: 'var(--color-parity)',
    },
    {
      label: 'Hot Spares',
      bytes: hotSpareOverhead,
      percent: (hotSpareOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    },
  ]

  // Cache tier is overhead (not usable capacity) - shown as dedicated cache
  if (cacheTierCapacity > 0) {
    const cacheLabel =
      topology.type === 'ceph'
        ? 'WAL/DB NVMe (Cache)'
        : topology.type === 'vsan_osa'
          ? 'vSAN OSA Cache Tier'
          : 'Cache Tier (NVMe/SSD)'
    breakdown.push({
      label: cacheLabel,
      bytes: cacheTierCapacity,
      percent: (cacheTierCapacity / rawCapacity) * 100,
      color: 'var(--color-cache)',
    })
  }

  if (slopOverhead > 0) {
    breakdown.push({
      label: 'ZFS Slop Space (1/64)',
      bytes: slopOverhead,
      percent: (slopOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (s2dReserve > 0) {
    const reserveLabel =
      s2dOptions.reserveStrategy === 'node_failure'
        ? 'S2D Node Failure Reserve'
        : 'S2D Drive Failure Reserve'
    breakdown.push({
      label: reserveLabel,
      bytes: s2dReserve,
      percent: (s2dReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (synologySystemOverhead > 0) {
    breakdown.push({
      label: 'Synology System Partition',
      bytes: synologySystemOverhead,
      percent: (synologySystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerFlexFgOverhead > 0) {
    breakdown.push({
      label: 'PowerFlex FG Metadata',
      bytes: powerFlexFgOverhead,
      percent: (powerFlexFgOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (netAppSnapshotReserve > 0) {
    breakdown.push({
      label: 'NetApp Snapshot Reserve',
      bytes: netAppSnapshotReserve,
      percent: (netAppSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (nutanixSystemOverhead > 0) {
    breakdown.push({
      label: 'Nutanix System/CVM Reserve',
      bytes: nutanixSystemOverhead,
      percent: (nutanixSystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (objectscaleSystemOverhead > 0) {
    breakdown.push({
      label: 'ObjectScale System Overhead',
      bytes: objectscaleSystemOverhead,
      percent: (objectscaleSystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (objectscaleGeoOverhead > 0) {
    breakdown.push({
      label: `ObjectScale Geo-Replication (${objectscaleOptions.sites} sites)`,
      bytes: objectscaleGeoOverhead,
      percent: (objectscaleGeoOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerstoreSnapshotReserve > 0) {
    breakdown.push({
      label: 'PowerStore Snapshot Reserve',
      bytes: powerstoreSnapshotReserve,
      percent: (powerstoreSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerstoreSystemOverhead > 0) {
    breakdown.push({
      label: 'PowerStore System Overhead',
      bytes: powerstoreSystemOverhead,
      percent: (powerstoreSystemOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (powerscaleSnapshotReserve > 0) {
    breakdown.push({
      label: 'PowerScale Snapshot Reserve',
      bytes: powerscaleSnapshotReserve,
      percent: (powerscaleSnapshotReserve / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (cephSafeCapacityReduction > 0) {
    breakdown.push({
      label: 'Ceph Safe Capacity (85%)',
      bytes: cephSafeCapacityReduction,
      percent: (cephSafeCapacityReduction / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  breakdown.push({
    label: 'Filesystem Overhead',
    bytes: filesystemOverhead,
    percent: (filesystemOverhead / rawCapacity) * 100,
    color: 'var(--color-overhead)',
  })

  return breakdown
}
