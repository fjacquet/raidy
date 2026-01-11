/**
 * Volumetry & Efficiency Engine (Module A)
 * Calculates usable capacity after all overhead factors.
 */

import type { Drive } from '@/types/drive'
import type { VolumetryResult } from '@/types/results'
import type {
  CephOptions,
  DellOptions,
  S2DOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'

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
        case 'netapp_raid_dp':
          // RAID-DP: double parity
          return (usableDrives - 2) / usableDrives
        case 'netapp_raid_tec':
          // RAID-TEC: triple parity
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
 */
function getFilesystemOverheadPercent(topology: Topology): number {
  switch (topology.type) {
    case 'zfs':
      return 0.01 // 1% for metadata (in addition to slop)
    case 'vmware':
      // vSAN object overhead (~1-2% for metadata, witness components)
      return 0.015
    case 'dell':
      // Dell storage platforms have minimal metadata overhead
      return 0.01
    case 's2d':
      // S2D CSV overhead
      return 0.02
    case 'ceph':
      // Ceph BlueStore uses ~1-2% for metadata, OSD journals
      return 0.02
    default:
      // ext4/XFS typically use 1-3% for metadata
      return 0.02
  }
}

/**
 * Calculate complete volumetry results.
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

  // Calculate parity/redundancy overhead
  const dataFraction = getDataFraction(
    topology,
    usableDrives,
    s2dOptions,
    vsanOptions,
    dellOptions,
    cephOptions,
  )
  const capacityAfterParity = rawUsableCapacity * dataFraction
  const parityOverhead = rawUsableCapacity - capacityAfterParity

  // S2D rebuild reserve (1 drive equivalent per node)
  let s2dReserve = 0
  if (topology.type === 's2d' && s2dOptions.rebuildReserve) {
    s2dReserve = drive.capacity_raw * s2dOptions.faultDomains
  }

  // ZFS-specific overhead
  let slopOverhead = 0
  if (topology.type === 'zfs') {
    const zfsOverhead = getZfsOverhead(capacityAfterParity, zfsOptions, drive.sector_size)
    slopOverhead = zfsOverhead.slop
  }

  // Filesystem overhead
  const fsOverheadPercent = getFilesystemOverheadPercent(topology)
  const capacityForFs = capacityAfterParity - slopOverhead - s2dReserve
  const filesystemOverhead = capacityForFs * fsOverheadPercent

  // Usable capacity (before compression/dedup)
  const usableCapacity = capacityForFs - filesystemOverhead

  // Effective capacity (after compression and dedup)
  const effectiveCapacity = usableCapacity * compressionRatio * dedupRatio

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
      label: 'ZFS Slop Space',
      bytes: slopOverhead,
      percent: (slopOverhead / rawCapacity) * 100,
      color: 'var(--color-overhead)',
    })
  }

  if (s2dReserve > 0) {
    breakdown.push({
      label: 'S2D Rebuild Reserve',
      bytes: s2dReserve,
      percent: (s2dReserve / rawCapacity) * 100,
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
