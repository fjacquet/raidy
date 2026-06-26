/**
 * Overhead calculator for topology-specific overhead factors.
 *
 * Calculates various overhead types:
 * - S2D rebuild reserve
 * - ZFS slop space and ashift penalty
 * - PowerFlex Fine Granularity metadata
 * - NetApp snapshot reserve
 * - Nutanix system overhead
 * - ObjectScale system and geo-overhead
 * - PowerStore snapshot reserve
 * - PowerScale snapshot reserve
 * - Ceph safe capacity reduction
 * - Filesystem overhead
 */

import type { Drive } from '@/types/drive'
import type {
  CephOptions,
  NetAppOptions,
  NutanixOptions,
  ObjectScaleOptions,
  PowerFlexOptions,
  PowerScaleOptions,
  PowerStoreOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  ZfsOptions,
} from '@/types/topology'
import { getZfsOverhead } from '../helpers/calculationHelpers'
import { getFilesystemOverheadPercent } from './filesystem-overhead'
import { getObjectScaleGeoOverhead } from './objectscale-geo'

/**
 * S2D / Azure Local infrastructure-volume reserve (cluster-wide, fixed, decimal bytes).
 * Microsoft reserves capacity for infrastructure volumes: ARC Resource Bridge + AKS images
 * (~250 GB), ClusterPerformanceHistory (~20 GB), plus ~7 GB system ≈ 277 GB total. These are
 * usable volumes stored on the cluster, so the reserve is taken from post-efficiency capacity.
 */
const S2D_INFRA_RESERVE_BYTES = 277_000_000_000

export interface OverheadResult {
  // Individual overhead components
  synologySystemOverhead: number
  s2dInfraReserve: number
  slopOverhead: number
  zfsAshiftOverhead: number
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

  // Total overhead sum
  totalOverhead: number
}

export interface OverheadInput {
  topology: Topology
  drive: Drive
  usableDrives: number
  rawUsableCapacity: number
  capacityAfterParity: number
  usableCapacity: number

  // Options
  synologyOptions: SynologyOptions
  s2dOptions: S2DOptions
  zfsOptions: ZfsOptions
  powerFlexOptions: PowerFlexOptions
  netAppOptions: NetAppOptions
  nutanixOptions: NutanixOptions
  objectscaleOptions: ObjectScaleOptions
  powerstoreOptions: PowerStoreOptions
  powerscaleOptions: PowerScaleOptions
  cephOptions: CephOptions
  fsType: 'xfs' | 'ext4' | 'zfs' | 'refs' | 'ntfs' | 'btrfs'
}

/**
 * Calculate all overhead factors for the topology.
 *
 * @param input - Overhead calculation input
 * @returns Overhead breakdown
 */
export function calculateOverheads(input: OverheadInput): OverheadResult {
  const {
    topology,
    drive,
    usableDrives,
    capacityAfterParity,
    usableCapacity,
    synologyOptions,
    zfsOptions,
    powerFlexOptions,
    netAppOptions,
    nutanixOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
    fsType,
  } = input

  // Synology system partition overhead (20-30GB per disk)
  let synologySystemOverhead = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('synology_')) {
    synologySystemOverhead = synologyOptions.systemPartitionSize * usableDrives
  }

  // S2D / Azure Local infrastructure-volume reserve (fixed, cluster-wide). Taken from
  // post-efficiency capacity since these are usable volumes stored on the cluster.
  // The rebuild reserve itself is handled in the main engine (raw, before efficiency).
  let s2dInfraReserve = 0
  if (topology.type === 's2d') {
    s2dInfraReserve = Math.min(S2D_INFRA_RESERVE_BYTES, Math.max(0, capacityAfterParity))
  }

  // ZFS-specific overhead (slop space = 1/32)
  let slopOverhead = 0
  let zfsAshiftOverhead = 0
  if (topology.type === 'zfs' && zfsOptions) {
    const zfsOverhead = getZfsOverhead(capacityAfterParity, zfsOptions, drive.sector_size)
    slopOverhead = zfsOverhead.slop
    zfsAshiftOverhead = zfsOverhead.ashift
  }

  // PowerFlex Fine Granularity metadata overhead (12-15%)
  let powerFlexFgOverhead = 0
  if (topology.type === 'powerflex' && powerFlexOptions.granularity === 'fine') {
    powerFlexFgOverhead = capacityAfterParity * powerFlexOptions.fgOverhead
  }

  // NetApp snapshot reserve
  let netAppSnapshotReserve = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('netapp_')) {
    netAppSnapshotReserve = capacityAfterParity * netAppOptions.snapshotReserve
  }

  // Nutanix system overhead (5-10% for snapshots, metadata, CVM, rebuild)
  // Per spec: C_formatted = C_raw × 0.90 (10% overhead)
  let nutanixSystemOverhead = 0
  if (topology.type === 'nutanix') {
    nutanixSystemOverhead = capacityAfterParity * nutanixOptions.systemOverhead
  }

  // ObjectScale system overhead (10-20% for metadata, indexes, S3 protocol overhead)
  // Plus geo-overhead for multi-site replication (per SME spec)
  let objectscaleSystemOverhead = 0
  let objectscaleGeoOverhead = 0
  if (topology.type === 'objectscale') {
    objectscaleSystemOverhead =
      capacityAfterParity * (objectscaleOptions.systemOverheadPercent / 100)
    // Apply geo-overhead factor for multi-site replication
    const geoFactor = getObjectScaleGeoOverhead(topology, objectscaleOptions.sites)
    if (geoFactor > 1.0) {
      // Geo-overhead reduces usable capacity by the inverse of the factor
      objectscaleGeoOverhead = capacityAfterParity * (1 - 1 / geoFactor)
    }
  }

  // PowerStore snapshot reserve
  let powerstoreSnapshotReserve = 0
  if (topology.type === 'powerstore') {
    powerstoreSnapshotReserve =
      capacityAfterParity * (powerstoreOptions.snapshotReservePercent / 100)
  }

  // PowerStore system overhead (metadata, distributed spare, formatting)
  // Default 5% from Dell Sizer 5200Q reference case
  let powerstoreSystemOverhead = 0
  if (topology.type === 'powerstore') {
    powerstoreSystemOverhead = capacityAfterParity * (powerstoreOptions.systemOverheadPercent / 100)
  }

  // PowerScale snapshot reserve
  let powerscaleSnapshotReserve = 0
  if (topology.type === 'powerscale') {
    powerscaleSnapshotReserve =
      capacityAfterParity * (powerscaleOptions.snapshotReservePercent / 100)
  }

  // Filesystem overhead
  const fsOverheadPercent = getFilesystemOverheadPercent(
    topology,
    fsType,
    synologyOptions,
    netAppOptions,
  )
  const capacityForFs = Math.max(
    0,
    capacityAfterParity -
      slopOverhead -
      s2dInfraReserve -
      powerFlexFgOverhead -
      netAppSnapshotReserve -
      nutanixSystemOverhead -
      objectscaleSystemOverhead -
      objectscaleGeoOverhead -
      powerstoreSnapshotReserve -
      powerstoreSystemOverhead -
      powerscaleSnapshotReserve,
  )
  const filesystemOverhead = capacityForFs * fsOverheadPercent

  // Ceph safe capacity factor (nearfull threshold, default 85%)
  // Per spec: C_safe = C_usable × 0.85
  let cephSafeCapacityReduction = 0
  if (topology.type === 'ceph' && cephOptions) {
    cephSafeCapacityReduction = usableCapacity * (1 - cephOptions.safeCapacityThreshold)
  }

  const totalOverhead =
    synologySystemOverhead +
    s2dInfraReserve +
    slopOverhead +
    zfsAshiftOverhead +
    powerFlexFgOverhead +
    netAppSnapshotReserve +
    nutanixSystemOverhead +
    objectscaleSystemOverhead +
    objectscaleGeoOverhead +
    powerstoreSnapshotReserve +
    powerstoreSystemOverhead +
    powerscaleSnapshotReserve +
    cephSafeCapacityReduction +
    filesystemOverhead

  return {
    synologySystemOverhead,
    s2dInfraReserve,
    slopOverhead,
    zfsAshiftOverhead,
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
    totalOverhead,
  }
}
