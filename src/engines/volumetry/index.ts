/**
 * Volumetry & Efficiency Engine (Module A)
 * Calculates usable capacity after all overhead factors.
 */

import type { Drive } from '@/types/drive'
import type { VolumetryResult } from '@/types/results'
import type {
  CephOptions,
  DellOptions,
  NetAppOptions,
  PowerFlexOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
import { FILESYSTEM_OVERHEAD } from '@/types/topology'

export interface VolumetryInput {
  drive: Drive
  driveCount: number
  hotSpares: number
  topology: Topology
  zfsOptions: ZfsOptions
  s2dOptions: S2DOptions
  vsanOptions: VsanOptions
  dellOptions: DellOptions
  cephOptions: CephOptions
  powerFlexOptions: PowerFlexOptions
  netAppOptions: NetAppOptions
  synologyOptions: SynologyOptions
  compressionRatio: number
  dedupRatio: number
}

/**
 * Calculate parity overhead factor based on topology.
 * Returns the fraction of capacity used for data (0-1).
 */
function getDataFraction(
  topology: Topology,
  driveCount: number,
  s2dOptions: S2DOptions,
  vsanOptions: VsanOptions,
  _dellOptions: DellOptions,
  cephOptions: CephOptions,
): number {
  const usableDrives = driveCount // Hot spares handled separately

  switch (topology.type) {
    case 'standard':
      switch (topology.level) {
        case 'RAID0':
          return 1.0 // No redundancy
        case 'RAID1':
          return 0.5 // Mirror
        case 'RAID5':
          return (usableDrives - 1) / usableDrives
        case 'RAID6':
          return (usableDrives - 2) / usableDrives
        case 'RAID10':
          return 0.5 // Mirrored stripes
        case 'RAID50':
          // Assume 2 groups for RAID50
          return (usableDrives - 2) / usableDrives
        case 'RAID60':
          // Assume 2 groups for RAID60
          return (usableDrives - 4) / usableDrives
        default:
          return 1.0
      }

    case 'zfs':
      switch (topology.level) {
        case 'stripe':
          return 1.0
        case 'mirror':
          return 0.5
        case 'raidz1':
        case 'draid1':
          return (usableDrives - 1) / usableDrives
        case 'raidz2':
        case 'draid2':
          return (usableDrives - 2) / usableDrives
        case 'raidz3':
        case 'draid3':
          return (usableDrives - 3) / usableDrives
        default:
          return 1.0
      }

    case 's2d':
      switch (topology.level) {
        case 'simple':
          return 1.0
        case 'mirror':
          return 1 / s2dOptions.mirrorCopies
        case 'parity':
          // Single parity across fault domains
          return (s2dOptions.faultDomains - 1) / s2dOptions.faultDomains
        case 'dual_parity':
          return (s2dOptions.faultDomains - 2) / s2dOptions.faultDomains
        case 'map': {
          // MAP uses mirror for hot data portion (estimate 20% mirror, 80% parity)
          const mirrorPortion = 0.2 / s2dOptions.mirrorCopies
          const parityPortion = 0.8 * ((s2dOptions.faultDomains - 2) / s2dOptions.faultDomains)
          return mirrorPortion + parityPortion
        }
        default:
          return 1.0
      }

    case 'proprietary':
      switch (topology.level) {
        case 'synology_shr':
          // SHR approximates RAID5 efficiency
          return (usableDrives - 1) / usableDrives
        case 'synology_shr2':
          // SHR2 approximates RAID6 efficiency
          return (usableDrives - 2) / usableDrives
        case 'synology_raid_f1':
          // RAID F1: All-Flash optimized, similar to RAID5 with uneven parity rotation
          // Efficiency ≈ RAID5: (N-1)/N
          return (usableDrives - 1) / usableDrives
        case 'netapp_raid_dp':
          // RAID-DP: double parity per RAID group
          return (usableDrives - 2) / usableDrives
        case 'netapp_raid_tec':
          // RAID-TEC: triple parity per RAID group (for drives >10TB)
          return (usableDrives - 3) / usableDrives
        default:
          return 1.0
      }

    case 'vmware':
      // vSAN efficiency depends on FTT and protection method
      switch (topology.level) {
        case 'vsan_osa_raid1':
        case 'vsan_esa_raid1':
          // RAID-1 with FTT mirrors: capacity / (FTT + 1)
          return 1 / (vsanOptions.ftt + 1)
        case 'vsan_osa_raid5':
        case 'vsan_esa_raid5':
          // RAID-5 requires minimum (3 × FTT + 1) hosts, efficiency ~(n-FTT)/n
          // For FTT=1: minimum 4 hosts, ~75% efficiency
          return (usableDrives - vsanOptions.ftt) / usableDrives
        case 'vsan_osa_raid6':
        case 'vsan_esa_raid6':
          // RAID-6 with FTT=2: minimum 6 hosts, ~67% efficiency
          return (usableDrives - 2 * vsanOptions.ftt) / usableDrives
        default:
          return 1.0
      }

    case 'dell':
      switch (topology.level) {
        case 'powerstore_raid5':
          // PowerStore RAID-5: typically 4+1 or 8+1 stripes, ~80% efficiency
          return 0.8
        case 'powerstore_raid6':
          // PowerStore RAID-6: typically 4+2 or 8+2 stripes, ~66-80% efficiency
          return 0.75
        case 'powerscale_n1':
          // PowerScale N+1: single parity, (n-1)/n
          return (usableDrives - 1) / usableDrives
        case 'powerscale_n2':
          // PowerScale N+2: double parity, (n-2)/n
          return (usableDrives - 2) / usableDrives
        case 'powerscale_mirror':
          // PowerScale mirror: 50% efficiency
          return 0.5
        case 'objectscale_ec':
          // ObjectScale erasure coding: typically 10+2 = 83% or 6+3 = 67%
          // Using 10+2 as default
          return 10 / 12
        default:
          return 1.0
      }

    case 'ceph':
      switch (topology.level) {
        case 'ceph_replicated_2':
          // 2-way replication: 50% efficiency
          return 1 / 2
        case 'ceph_replicated_3':
          // 3-way replication: 33% efficiency
          return 1 / 3
        case 'ceph_ec_2_1':
          // Erasure coded k=2, m=1: 2/(2+1) = 66.7% efficiency
          return 2 / 3
        case 'ceph_ec_4_2':
          // Erasure coded k=4, m=2: 4/(4+2) = 66.7% efficiency
          return 4 / 6
        case 'ceph_ec_8_3':
          // Erasure coded k=8, m=3: 8/(8+3) = 72.7% efficiency
          return 8 / 11
        case 'ceph_ec_8_4':
          // Erasure coded k=8, m=4: 8/(8+4) = 66.7% efficiency
          return 8 / 12
        default:
          // Fallback to options if not matched
          if (cephOptions.poolType === 'replicated') {
            return 1 / cephOptions.replicationFactor
          } else {
            // Erasure coded: k / (k + m)
            return cephOptions.ecK / (cephOptions.ecK + cephOptions.ecM)
          }
      }

    case 'powerflex':
      switch (topology.level) {
        case 'powerflex_medium_2way':
        case 'powerflex_fine_2way':
          // 2-way mirror: 50% efficiency (FG only supports 2-way)
          return 0.5
        case 'powerflex_medium_3way':
          // 3-way mirror: 33% efficiency (Medium Granularity only)
          return 1 / 3
        case 'powerflex_ec_4_1':
          // Erasure coding 4+1: 4/(4+1) = 80% efficiency
          return 4 / 5
        case 'powerflex_ec_4_2':
          // Erasure coding 4+2: 4/(4+2) = 66.7% efficiency
          return 4 / 6
        case 'powerflex_ec_8_2':
          // Erasure coding 8+2: 8/(8+2) = 80% efficiency
          return 8 / 10
        case 'powerflex_ec_12_4':
          // Erasure coding 12+4: 12/(12+4) = 75% efficiency
          return 12 / 16
        default:
          return 0.5
      }

    default:
      return 1.0
  }
}

/**
 * Calculate ZFS-specific overhead.
 */
function getZfsOverhead(
  capacity: number,
  zfsOptions: ZfsOptions,
  sectorSize: number,
): { slop: number; ashift: number } {
  // ZFS slop space: reserves 1/32 (3.125%) of pool capacity
  const slop = capacity / 32

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

/**
 * Get filesystem overhead percentage.
 * Uses FILESYSTEM_OVERHEAD constants from specs:
 * - Btrfs: 4% (Synology spec)
 * - WAFL: 1-2% (NetApp spec)
 * - ZFS slop: 1/64 = 1.5625% (ZFS spec)
 */
function getFilesystemOverheadPercent(
  topology: Topology,
  synologyOptions?: SynologyOptions,
  netAppOptions?: NetAppOptions,
): number {
  switch (topology.type) {
    case 'zfs':
      // ZFS metadata overhead (slop handled separately)
      return 0.01

    case 'vmware':
      // vSAN object overhead (~1-2% for metadata, witness components)
      return 0.015

    case 'dell':
      // Dell storage platforms have minimal metadata overhead
      return 0.01

    case 's2d':
      // S2D ReFS/CSV overhead
      return FILESYSTEM_OVERHEAD.refs

    case 'ceph':
      // Ceph BlueStore uses ~1-2% for metadata, OSD journals
      return 0.02

    case 'powerflex':
      // PowerFlex metadata overhead is minimal (~1%)
      return 0.01

    case 'proprietary':
      // Check for Synology or NetApp based on topology level
      if (topology.level.startsWith('synology_') && synologyOptions) {
        // Synology: Btrfs 4%, ext4 2%
        return synologyOptions.filesystem === 'btrfs'
          ? FILESYSTEM_OVERHEAD.btrfs
          : FILESYSTEM_OVERHEAD.ext4
      }
      if (topology.level.startsWith('netapp_') && netAppOptions) {
        // NetApp: WAFL overhead (1-2%)
        return netAppOptions.waflOverhead
      }
      return 0.02

    default:
      // ext4/XFS typically use 1-3% for metadata
      return 0.02
  }
}

/**
 * Calculate complete volumetry results.
 * Implements spec formulas:
 * - Ceph: C_safe = C_usable × safeCapacityThreshold (default 0.85)
 * - NetApp: C_eff = (C_raw - RAID_overhead) × (1 - snap%) × DRR × (1 - WAFL%)
 * - Synology: System partition 20-30GB per disk
 * - PowerFlex FG: 12-15% metadata overhead
 * - ZFS: Slop space 1/64 = 1.5625%
 */
export function calculateVolumetry(input: VolumetryInput): VolumetryResult {
  const {
    drive,
    driveCount,
    hotSpares,
    topology,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    dellOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    compressionRatio,
    dedupRatio,
  } = input

  // Raw capacity (all drives including hot spares)
  const rawCapacity = drive.capacity_raw * driveCount

  // Hot spare overhead
  const hotSpareOverhead = drive.capacity_raw * hotSpares

  // Usable drives after hot spares
  const usableDrives = driveCount - hotSpares
  const rawUsableCapacity = drive.capacity_raw * usableDrives

  // Synology system partition overhead (20-30GB per disk)
  let synologySystemOverhead = 0
  if (topology.type === 'proprietary' && topology.level.startsWith('synology_')) {
    synologySystemOverhead = synologyOptions.systemPartitionSize * usableDrives
  }

  // Calculate parity/redundancy overhead
  const dataFraction = getDataFraction(
    topology,
    usableDrives,
    s2dOptions,
    vsanOptions,
    dellOptions,
    cephOptions,
  )
  const capacityAfterSysPartition = rawUsableCapacity - synologySystemOverhead
  const capacityAfterParity = capacityAfterSysPartition * dataFraction
  const parityOverhead = capacityAfterSysPartition - capacityAfterParity

  // S2D rebuild reserve (per-drive or per-node based on reserveStrategy)
  let s2dReserve = 0
  if (topology.type === 's2d' && s2dOptions.rebuildReserve) {
    if (s2dOptions.reserveStrategy === 'node_failure') {
      // Reserve one node's worth of capacity
      s2dReserve = drive.capacity_raw * (usableDrives / s2dOptions.faultDomains)
    } else {
      // Reserve one drive equivalent per fault domain
      s2dReserve = drive.capacity_raw * s2dOptions.faultDomains
    }
  }

  // ZFS-specific overhead (slop space = 1/64)
  let slopOverhead = 0
  if (topology.type === 'zfs') {
    const zfsOverhead = getZfsOverhead(capacityAfterParity, zfsOptions, drive.sector_size)
    slopOverhead = zfsOverhead.slop
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

  // Filesystem overhead
  const fsOverheadPercent = getFilesystemOverheadPercent(topology, synologyOptions, netAppOptions)
  const capacityForFs =
    capacityAfterParity - slopOverhead - s2dReserve - powerFlexFgOverhead - netAppSnapshotReserve
  const filesystemOverhead = capacityForFs * fsOverheadPercent

  // Usable capacity (before compression/dedup and safe capacity factor)
  let usableCapacity = capacityForFs - filesystemOverhead

  // Ceph safe capacity factor (nearfull threshold, default 85%)
  // Per spec: C_safe = C_usable × 0.85
  let cephSafeCapacityReduction = 0
  if (topology.type === 'ceph') {
    cephSafeCapacityReduction = usableCapacity * (1 - cephOptions.safeCapacityThreshold)
    usableCapacity = usableCapacity * cephOptions.safeCapacityThreshold
  }

  // Effective capacity (after compression and dedup)
  let effectiveCapacity = usableCapacity * compressionRatio * dedupRatio

  // NetApp DRR (Data Reduction Ratio) - applies on top of standard compression/dedup
  // Includes zero-detection + inline dedup + inline compression + compaction
  if (topology.type === 'proprietary' && topology.level.startsWith('netapp_')) {
    effectiveCapacity = usableCapacity * netAppOptions.dataReductionRatio
  }

  // PowerFlex compression ratio (only for modes with compression enabled)
  if (topology.type === 'powerflex' && powerFlexOptions.compression) {
    effectiveCapacity = usableCapacity * powerFlexOptions.compressionRatio
  }

  // Overall efficiency
  const efficiency = (usableCapacity / rawCapacity) * 100

  // Build breakdown for visualization
  const breakdown = [
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

  return {
    rawCapacity,
    parityOverhead,
    hotSpareOverhead,
    filesystemOverhead,
    slopOverhead,
    usableCapacity,
    effectiveCapacity,
    efficiency,
    breakdown,
  }
}
