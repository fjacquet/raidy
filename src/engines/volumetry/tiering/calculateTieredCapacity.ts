/**
 * Tiering calculation module for hybrid storage configurations.
 *
 * Handles fast tier (SSD/NVMe) + capacity tier (HDD) configurations
 * for S2D, Nutanix, Ceph, and vSAN hybrid deployments.
 */

import drivesData from '@/data/drives.json'
import type { Drive } from '@/types/drive'
import type { TieringConfig } from '@/types/topology'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Result of tiered capacity calculation.
 * Contains capacity breakdown for fast tier (cache) and capacity tier.
 */
export interface TieredCapacityResult {
  cacheTierCapacity: number
  cacheTierDrive: Drive | null
  cacheTierDriveCount: number
  capacityTierCapacity: number
  capacityTierDrive: Drive | null
  capacityTierDriveCount: number
}

/**
 * Calculate tiered capacity when tiering is enabled.
 *
 * Supports hybrid storage configurations with separate tiers:
 * - Fast tier: SSD/NVMe for cache, hot data, WAL/DB
 * - Capacity tier: HDD for bulk storage
 *
 * Used by:
 * - S2D: Storage Spaces tiering (SSD + HDD)
 * - vSAN OSA: Disk groups (cache + capacity)
 * - Ceph: WAL/DB offload to NVMe
 * - Nutanix: Hybrid cluster (SSD cache + HDD capacity)
 *
 * @param tieringConfig - Tiering configuration (null if disabled)
 * @param serverCount - Number of servers/nodes in cluster
 * @returns Tiered capacity result or null if tiering disabled
 *
 * @example
 * // S2D hybrid: 4x NVMe per server, 12x HDD per server, 3 servers
 * const result = calculateTieredCapacity(
 *   {
 *     enabled: true,
 *     fastTier: { driveId: 'ent-nvme-pcie4-960gb-m2-ri', driveCount: 4 },
 *     capacityTier: { driveId: 'ent-hdd-7k2-sata-18tb-cmr', driveCount: 12 },
 *   },
 *   3
 * )
 * // Returns:
 * // {
 * //   cacheTierCapacity: 23.04 TB (12 NVMe × 1.92 TB),
 * //   cacheTierDriveCount: 12,
 * //   capacityTierCapacity: 720 TB (36 HDD × 20 TB),
 * //   capacityTierDriveCount: 36,
 * // }
 */
export function calculateTieredCapacity(
  tieringConfig: TieringConfig | undefined,
  serverCount: number,
): TieredCapacityResult | null {
  if (!tieringConfig?.enabled) {
    return null
  }

  const cacheDrive = tieringConfig.fastTier.driveId ? drives[tieringConfig.fastTier.driveId] : null
  const capacityDrive = tieringConfig.capacityTier.driveId
    ? drives[tieringConfig.capacityTier.driveId]
    : null

  if (!cacheDrive || !capacityDrive) {
    return null
  }

  const cacheDriveCount = tieringConfig.fastTier.driveCount * serverCount
  const capacityDriveCount = tieringConfig.capacityTier.driveCount * serverCount

  return {
    cacheTierCapacity: cacheDrive.capacity_raw * cacheDriveCount,
    cacheTierDrive: cacheDrive,
    cacheTierDriveCount: cacheDriveCount,
    capacityTierCapacity: capacityDrive.capacity_raw * capacityDriveCount,
    capacityTierDrive: capacityDrive,
    capacityTierDriveCount: capacityDriveCount,
  }
}
