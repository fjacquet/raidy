/**
 * Panel-side storage-target derivation for BeeGFS, sharing the engine's actual tiering
 * resolution and hot-spare scaling — not a private re-implementation of it — so
 * `BeeGfsOptionsPanel` can show a live target/stranded-drive count before a result exists
 * without ever disagreeing with `beeGfsDetails` once one does.
 *
 * Both `resolveBeeGfsUsableDrives` (calls the real `resolveTiering`) and
 * `calculateStorageTargets` live in `src/engines/volumetry/strategies/beegfs.ts` and are
 * imported here rather than reimplemented, so a future change to the tiering-activation gate
 * or the hot-spare scaling rule cannot silently leave this panel out of sync.
 */

import {
  calculateStorageTargets,
  resolveBeeGfsUsableDrives,
} from '@/engines/volumetry/strategies/beegfs'
import type { BeeGfsOptions } from '@/types/topology'

export interface BeeGfsPanelDerivedTargets {
  storageTargetCount: number
  strandedDrives: number
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
  const usableDrives = resolveBeeGfsUsableDrives(driveCount, serverCount, hotSpares, beeGfsOptions)
  return calculateStorageTargets(usableDrives, beeGfsOptions.drivesPerTarget)
}
