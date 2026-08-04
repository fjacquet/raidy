/**
 * Shared tiering fixtures for the hybrid-cluster (S2D / vSAN OSA / Ceph / Nutanix / BeeGFS) test
 * specs. Every one of these specs needs the same fast/capacity drive pair — chosen because they
 * differ on every simulated or costed characteristic (capacity, IOPS, bandwidth, URE rate, AFR)
 * so a test that reads the wrong tier is falsifiable — plus a `TieringConfig` built from it.
 *
 * Each spec keeps its own per-node drive counts; only the drive identity and the config shape
 * are shared here.
 */

import drivesData from '@/data/drives.json'
import { DEFAULT_TIERING_CONFIG } from '@/types'
import type { Drive } from '@/types/drive'
import type { TieringConfig } from '@/types/topology'

const drives = drivesData as Record<string, Drive>

function getDriveById(id: string): Drive {
  const drive = drives[id]
  if (!drive) throw new Error(`fixture drive not found: ${id}`)
  return drive
}

/** Fast tier: 960GB NVMe (ure_rate 17, afr 0.5) */
export const FAST_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri'
/** Capacity tier: 18TB HDD (ure_rate 15, afr 0.44) */
export const CAPACITY_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr'

export const fastDrive = getDriveById(FAST_DRIVE_ID)
export const capacityDrive = getDriveById(CAPACITY_DRIVE_ID)

/**
 * Builds a `TieringConfig` with the given per-node fast/capacity drive counts, on top of
 * {@link FAST_DRIVE_ID} / {@link CAPACITY_DRIVE_ID}.
 */
export function buildTieringConfig(
  fastDriveCountPerNode: number,
  capacityDriveCountPerNode: number,
): TieringConfig {
  return {
    ...DEFAULT_TIERING_CONFIG,
    fastTier: { driveId: FAST_DRIVE_ID, driveCount: fastDriveCountPerNode },
    capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: capacityDriveCountPerNode },
  }
}
