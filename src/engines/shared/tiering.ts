/**
 * Shared tiering resolver for hybrid storage configurations.
 *
 * A "tiered" configuration splits the cluster into two drive pools:
 * - Fast tier (cache): SSD/NVMe for write cache, hot data, WAL/DB
 * - Capacity tier: HDD (or slower SSD) for bulk storage
 *
 * Only the capacity tier is user-addressable usable capacity; the cache tier is
 * excluded from usable and counted only toward raw (so cluster efficiency reflects it).
 *
 * Used by S2D (Storage Spaces tiering), vSAN OSA (disk groups), Ceph (WAL/DB offload),
 * and Nutanix (hybrid cluster). All three calculation engines (volumetry, performance,
 * sustainability) resolve tiering through this single module so the cache/capacity split
 * is computed once and identically.
 */

import drivesData from '@/data/drives.json'
import type { Drive } from '@/types/drive'
import type {
  CephOptions,
  NutanixOptions,
  S2DOptions,
  TieringConfig,
  Topology,
  VsanOptions,
} from '@/types/topology'

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
 * Resolve a single tiering config into per-tier drives and totals.
 *
 * The platform-level toggle (see {@link resolveTiering}) plus drive selection are the
 * source of truth — the legacy `enabled` flag on {@link TieringConfig} is no longer
 * consulted (it was never set true by the UI, which silently disabled all tiering).
 *
 * @returns null when the config is missing or either tier has no drive selected.
 */
export function calculateTieredCapacity(
  tieringConfig: TieringConfig | undefined,
  serverCount: number,
): TieredCapacityResult | null {
  if (!tieringConfig) {
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

/** Per-platform option bag for {@link resolveTiering}. */
export interface TieringResolverOptions {
  s2dOptions?: S2DOptions
  vsanOptions?: VsanOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
}

/**
 * Resolve the active tiering configuration for a topology, if any.
 *
 * Each platform gates tiering on its own toggle; when on (and drives are selected) the
 * shared {@link calculateTieredCapacity} produces the cache/capacity split.
 */
export function resolveTiering(
  topology: Topology,
  serverCount: number,
  options: TieringResolverOptions,
): TieredCapacityResult | null {
  const { s2dOptions, vsanOptions, cephOptions, nutanixOptions } = options

  // S2D Storage Spaces tiering (SSD cache + HDD/SSD capacity)
  if (topology.type === 's2d' && s2dOptions?.storageTiers && s2dOptions.tieringConfig) {
    return calculateTieredCapacity(s2dOptions.tieringConfig, serverCount)
  }

  // vSAN OSA tiering (disk groups: cache + capacity)
  if (topology.type === 'vsan_osa' && vsanOptions?.tiering) {
    return calculateTieredCapacity(vsanOptions.tiering, serverCount)
  }

  // Ceph WAL/DB offload to NVMe
  if (topology.type === 'ceph' && cephOptions?.walDbOffload && cephOptions.tiering) {
    return calculateTieredCapacity(cephOptions.tiering, serverCount)
  }

  // Nutanix hybrid cluster (SSD cache + HDD capacity)
  if (
    topology.type === 'nutanix' &&
    nutanixOptions?.clusterType === 'hybrid' &&
    nutanixOptions.tiering
  ) {
    return calculateTieredCapacity(nutanixOptions.tiering, serverCount)
  }

  return null
}

/**
 * Whether the resiliency media is all-flash (SSD/NVMe) vs hybrid (contains HDD).
 *
 * For S2D this selects between Microsoft's two dual-parity efficiency tables. When tiered,
 * the capacity tier is the resiliency media; otherwise the single pool drive is.
 */
export function isAllFlashMedia(
  tieredCapacity: TieredCapacityResult | null,
  fallbackDrive: Drive | null | undefined,
): boolean {
  const mediaDrive = tieredCapacity?.capacityTierDrive ?? fallbackDrive
  return mediaDrive ? mediaDrive.type.startsWith('SSD') : true
}
