/**
 * Panel-side storage-target derivation for BeeGFS, kept byte-for-byte aligned with what the
 * engine actually computes (src/engines/volumetry/index.ts + src/hooks/useVolumetryCalc.ts),
 * so `BeeGfsOptionsPanel` can show a live target/stranded-drive count before a result exists
 * without ever disagreeing with `beeGfsDetails` once one does.
 *
 * Two things the engine does that are easy to miss when re-deriving this in the UI:
 * - `hotSpares` is a *per-server* count — `useVolumetryCalc.ts` scales it by `serverCount`
 *   before subtracting it (`totalHotSpares = hotSpares * effServerCount`).
 * - When MDT tiering (`metadataTargets`) is active, the storage-target drive source switches
 *   from the Hardware panel's `driveCount` to `tiering.capacityTier.driveCount`, scaled the
 *   same way by `serverCount` (see `resolveTiering` in src/engines/shared/tiering.ts).
 */

import drivesData from '@/data/drives.json'
import { calculateStorageTargets } from '@/engines/volumetry/strategies/beegfs'
import type { Drive } from '@/types'
import type { BeeGfsOptions } from '@/types/topology'

const drives = drivesData as Record<string, Drive>

export interface BeeGfsPanelDerivedTargets {
  storageTargetCount: number
  strandedDrives: number
}

/**
 * True when MDT tiering is actually active for capacity purposes: the `metadataTargets`
 * opt-in is on AND both tier drive pickers resolve to real drives — the same gate
 * `resolveTiering`/`calculateTieredCapacity` apply (BeeGFS branch requires `metadataTargets`;
 * `calculateTieredCapacity` returns null unless both `cacheDrive` and `capacityDrive` exist).
 */
export function isBeeGfsTieringActive(beeGfsOptions: BeeGfsOptions): boolean {
  const tiering = beeGfsOptions.tiering
  return Boolean(
    beeGfsOptions.metadataTargets &&
      tiering?.fastTier.driveId &&
      drives[tiering.fastTier.driveId] &&
      tiering?.capacityTier.driveId &&
      drives[tiering.capacityTier.driveId],
  )
}

/**
 * Derive `{ storageTargetCount, strandedDrives }` from the same inputs and formula the engine
 * uses, so the panel and `beeGfsDetails` can never disagree.
 */
export function deriveBeeGfsStorageTargets(
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  beeGfsOptions: BeeGfsOptions,
): BeeGfsPanelDerivedTargets {
  const tieringActive = isBeeGfsTieringActive(beeGfsOptions)
  const effectiveDriveCount = tieringActive
    ? (beeGfsOptions.tiering?.capacityTier.driveCount ?? 0) * serverCount
    : driveCount * serverCount
  const totalHotSpares = hotSpares * serverCount
  const usableDrives = Math.max(0, effectiveDriveCount - totalHotSpares)

  return calculateStorageTargets(usableDrives, beeGfsOptions.drivesPerTarget)
}
