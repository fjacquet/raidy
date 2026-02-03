/**
 * Filesystem overhead mapping for capacity calculations.
 *
 * Each filesystem and storage system has metadata overhead that reduces
 * usable capacity beyond RAID/topology efficiency.
 *
 * Overhead percentages are validated against vendor documentation:
 * - ZFS: ~1% (metadata overhead, slop handled separately)
 * - vSAN: ~1.5% (object overhead, witness components)
 * - ObjectScale: ~1.5% (S3 metadata overhead)
 * - Ceph: ~2% (BlueStore metadata, OSD journals)
 * - S2D: ReFS overhead from FILESYSTEM_OVERHEAD constant
 * - Btrfs: 4% (Synology spec)
 * - WAFL: 1-2% (NetApp spec)
 */

import type { NetAppOptions, SynologyOptions, Topology } from '@/types/topology'
import { FILESYSTEM_OVERHEAD } from '@/types/topology'

/** Filesystem type for user selection */
type FsType = 'xfs' | 'ext4' | 'zfs' | 'refs' | 'ntfs' | 'btrfs'

/**
 * Get filesystem overhead percentage for topology.
 *
 * Returns the decimal overhead percentage (e.g., 0.015 = 1.5%).
 *
 * @param topology - Storage topology configuration
 * @param fsType - User-selected filesystem type (used for standard RAID)
 * @param synologyOptions - Synology-specific options (filesystem type)
 * @param netAppOptions - NetApp-specific options (WAFL overhead)
 * @returns Overhead percentage as decimal (0-1)
 *
 * @example
 * // Standard RAID with XFS
 * const overhead = getFilesystemOverheadPercent(
 *   { type: 'standard', level: 'raid5' },
 *   'xfs'
 * )
 * // Returns: 0.01 (1% XFS overhead)
 *
 * @example
 * // Synology with Btrfs
 * const overhead = getFilesystemOverheadPercent(
 *   { type: 'proprietary', level: 'synology_shr2' },
 *   'ext4',
 *   { filesystem: 'btrfs' }
 * )
 * // Returns: 0.04 (4% Btrfs overhead)
 */
export function getFilesystemOverheadPercent(
  topology: Topology,
  fsType: FsType,
  synologyOptions?: SynologyOptions,
  netAppOptions?: NetAppOptions,
): number {
  switch (topology.type) {
    case 'zfs':
      // ZFS metadata overhead (slop handled separately)
      return 0.01

    case 'vsan_osa':
    case 'vsan_esa':
      // vSAN object overhead (~1-2% for metadata, witness components)
      return 0.015

    case 'objectscale':
      // ObjectScale S3 metadata overhead (~1-2%)
      return 0.015

    case 'powerstore':
      // PowerStore block storage minimal metadata overhead
      return 0.01

    case 'powerscale':
      // PowerScale scale-out NAS filesystem overhead
      return 0.015

    case 's2d':
      // S2D ReFS/CSV overhead
      return FILESYSTEM_OVERHEAD.refs

    case 'ceph':
      // Ceph BlueStore uses ~1-2% for metadata, OSD journals
      return 0.02

    case 'powerflex':
      // PowerFlex metadata overhead is minimal (~1%)
      return 0.01

    case 'nutanix':
      // Nutanix AOS: CVM overhead, metadata, etc. (~1-2%)
      return 0.015

    case 'powervault':
      // PowerVault ME5: minimal metadata overhead (~1%)
      return 0.01

    case 'standard':
      // Standard RAID: use user-selected filesystem overhead
      return getFsTypeOverhead(fsType)

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
      // For other topologies, use user-selected filesystem overhead
      return getFsTypeOverhead(fsType)
  }
}

/**
 * Get overhead percentage for a specific filesystem type.
 */
function getFsTypeOverhead(fsType: FsType): number {
  switch (fsType) {
    case 'xfs':
      return FILESYSTEM_OVERHEAD.xfs
    case 'ext4':
      return FILESYSTEM_OVERHEAD.ext4
    case 'zfs':
      return FILESYSTEM_OVERHEAD.zfs
    case 'btrfs':
      return FILESYSTEM_OVERHEAD.btrfs
    case 'refs':
      return FILESYSTEM_OVERHEAD.refs
    case 'ntfs':
      return FILESYSTEM_OVERHEAD.ntfs
    default:
      return 0.02 // Fallback
  }
}
