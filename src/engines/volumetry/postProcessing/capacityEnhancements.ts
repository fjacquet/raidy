/**
 * Capacity enhancements (compression, dedup) and ZFS details calculation.
 *
 * Handles:
 * - Compression and deduplication for various topologies
 * - ZFS-specific capacity breakdown with practical usable recommendations
 */

import type { ZfsCapacityDetails } from '@/types/results'
import type {
  CephOptions,
  NetAppOptions,
  NutanixOptions,
  ObjectScaleOptions,
  PowerFlexOptions,
  PowerScaleOptions,
  PowerStoreOptions,
  Topology,
  ZfsOptions,
} from '@/types/topology'

/**
 * Ceph BlueStore inline-compression ratios by algorithm.
 *
 * Algorithm-driven defaults: ZSTD compresses harder than LZ4, which beats
 * Snappy (the trade-off is CPU cost). These are representative ratios for
 * mixed/general data — actual ratios depend on the data being stored.
 * `none` means compression disabled, hence 1.0 (no reduction).
 */
export const CEPH_COMPRESSION_RATIOS: Record<CephOptions['compressionAlgorithm'], number> = {
  none: 1.0,
  snappy: 1.3,
  lz4: 1.4,
  zstd: 1.7,
}

/**
 * Apply compression and deduplication based on topology support.
 *
 * Only applies compression/dedup for topologies that support it:
 * - ZFS: Compression and dedup via filesystem
 * - NetApp: DRR (Data Reduction Ratio) includes zero-detection + inline dedup + inline compression + compaction
 * - PowerFlex: Compression ratio (only for modes with compression enabled)
 * - Nutanix: Compression and deduplication
 * - ObjectScale: Compression for S3 object storage
 * - PowerStore: Compression and deduplication
 * - PowerScale: Compression and deduplication
 * - Ceph: BlueStore inline compression, ratio driven by the chosen algorithm
 *
 * @param topology - Storage topology configuration
 * @param usableCapacity - Usable capacity before compression/dedup
 * @param compressionRatio - Global compression ratio
 * @param dedupRatio - Global dedup ratio
 * @param options - Topology-specific options
 * @returns Effective capacity after compression/dedup
 */
export function applyCompressionDedup(
  topology: Topology,
  usableCapacity: number,
  compressionRatio: number,
  dedupRatio: number,
  options: {
    netAppOptions: NetAppOptions
    powerFlexOptions: PowerFlexOptions
    nutanixOptions: NutanixOptions
    objectscaleOptions: ObjectScaleOptions
    powerstoreOptions: PowerStoreOptions
    powerscaleOptions: PowerScaleOptions
    cephOptions: CephOptions
  },
): number {
  const {
    netAppOptions,
    powerFlexOptions,
    nutanixOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
  } = options

  // Standard RAID has no compression/deduplication - effectiveCapacity = usableCapacity
  // S2D has no inline compression/dedup at storage layer

  // ZFS supports compression and dedup via filesystem
  if (topology.type === 'zfs') {
    return usableCapacity * compressionRatio * dedupRatio
  }

  // NetApp DRR (Data Reduction Ratio) - applies on top of standard compression/dedup
  // Includes zero-detection + inline dedup + inline compression + compaction
  if (topology.type === 'proprietary' && topology.level.startsWith('netapp_')) {
    return usableCapacity * netAppOptions.dataReductionRatio
  }

  // PowerFlex compression ratio (only for modes with compression enabled)
  if (topology.type === 'powerflex' && powerFlexOptions.compression) {
    return usableCapacity * powerFlexOptions.compressionRatio
  }

  // Nutanix compression and deduplication
  // Per spec: C_effective = C_usable × (Ratio_comp × Ratio_dedup)
  if (topology.type === 'nutanix') {
    const nutanixCompRatio = nutanixOptions.compression ? nutanixOptions.compressionRatio : 1.0
    const nutanixDedupRatio = nutanixOptions.dedup ? nutanixOptions.dedupRatio : 1.0
    return usableCapacity * nutanixCompRatio * nutanixDedupRatio
  }

  // ObjectScale compression (for S3 object storage)
  if (topology.type === 'objectscale' && objectscaleOptions.compression) {
    return usableCapacity * objectscaleOptions.compressionRatio
  }

  // PowerStore compression and deduplication
  if (topology.type === 'powerstore') {
    const psCompRatio = powerstoreOptions.compression ? powerstoreOptions.compressionRatio : 1.0
    const psDedupRatio = powerstoreOptions.dedup ? powerstoreOptions.dedupRatio : 1.0
    return usableCapacity * psCompRatio * psDedupRatio
  }

  // PowerScale compression and deduplication
  if (topology.type === 'powerscale') {
    const pscCompRatio = powerscaleOptions.compression ? powerscaleOptions.compressionRatio : 1.0
    const pscDedupRatio = powerscaleOptions.dedup ? powerscaleOptions.dedupRatio : 1.0
    return usableCapacity * pscCompRatio * pscDedupRatio
  }

  // Ceph BlueStore inline compression — ratio is driven by the chosen algorithm.
  // Ceph has no native inline dedup, so only compression applies (no global ratio).
  // cephOptions may be absent on malformed input; treat that as no compression.
  if (topology.type === 'ceph') {
    const cephCompRatio = cephOptions?.compression
      ? CEPH_COMPRESSION_RATIOS[cephOptions.compressionAlgorithm]
      : 1.0
    return usableCapacity * cephCompRatio
  }

  // No compression/dedup support for this topology
  return usableCapacity
}

/**
 * Build ZFS-specific capacity details.
 *
 * Provides detailed breakdown of ZFS capacity with practical recommendations:
 * - Total raw capacity
 * - zpool capacity (after hot spares)
 * - Parity overhead
 * - Ashift padding overhead
 * - zpool usable capacity
 * - Slop space reservation
 * - ZFS usable capacity
 * - Recommended 20% free space for optimal performance
 * - Practical usable capacity
 * - Effective capacity after compression/dedup
 *
 * @param rawCapacity - Total raw capacity
 * @param rawUsableCapacity - Raw capacity after hot spares
 * @param parityOverhead - Parity overhead
 * @param zfsAshiftOverhead - Ashift padding overhead
 * @param slopOverhead - Slop space overhead
 * @param filesystemOverhead - Filesystem overhead
 * @param effectiveCapacity - Effective capacity after compression/dedup
 * @param compressionRatio - Compression ratio
 * @param dedupRatio - Dedup ratio
 * @param zfsOptions - ZFS configuration options
 * @returns ZFS capacity details
 */
export function buildZfsDetails(
  rawCapacity: number,
  rawUsableCapacity: number,
  parityOverhead: number,
  zfsAshiftOverhead: number,
  slopOverhead: number,
  filesystemOverhead: number,
  effectiveCapacity: number,
  compressionRatio: number,
  dedupRatio: number,
  zfsOptions: ZfsOptions,
): ZfsCapacityDetails {
  const zpoolUsable = rawUsableCapacity - parityOverhead - zfsAshiftOverhead
  const zfsUsable = zpoolUsable - slopOverhead - filesystemOverhead
  const recommendedMinFree = zfsUsable * 0.2 // 20% headroom recommendation
  const practicalUsable = zfsUsable - recommendedMinFree

  return {
    totalRawCapacity: rawCapacity,
    zpoolCapacity: rawUsableCapacity, // After hot spares
    parityOverhead: parityOverhead,
    ashiftPaddingOverhead: zfsAshiftOverhead,
    zpoolUsableCapacity: zpoolUsable,
    slopSpaceReservation: slopOverhead,
    zfsUsableCapacity: zfsUsable,
    recommendedMinFreeSpace: recommendedMinFree,
    practicalUsableCapacity: practicalUsable,
    effectiveCapacity: effectiveCapacity,
    compressionRatio,
    dedupRatio,
    ashift: zfsOptions.ashift,
    recordSize: zfsOptions.recordsize,
  }
}
