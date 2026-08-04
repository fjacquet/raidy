/**
 * BeeGFS volumetry strategy.
 *
 * BeeGFS is a parallel filesystem, not a redundancy scheme. It federates
 * *storage targets*, and each storage target is a local RAID volume — the
 * topology level says which one. Cluster-level protection is Buddy Mirroring,
 * synchronous replication between pairs of targets, which costs exactly 2x.
 *
 * Usable fraction = localRaidFraction(level, drivesPerTarget) x buddyFactor
 *
 * Striping (`numtargets`, `chunksize`) has no capacity effect — only performance.
 * Metadata targets are handled outside this strategy, through the shared tiering
 * mechanism (fast tier counts toward raw, never toward usable).
 *
 * @see https://doc.beegfs.io/latest/system_design/system_requirements.html
 * @see https://doc.beegfs.io/latest/advanced_topics/storage_tuning.html
 */

import type { BeeGfsOptions } from '@/types/topology'
import type { VolumetryStrategy } from './VolumetryStrategy'

/** Minimum drives per target for each local RAID level */
export const BEEGFS_MIN_DRIVES_PER_TARGET: Record<string, number> = {
  beegfs_raid6: 4,
  beegfs_raidz2: 4,
  beegfs_raid10: 2,
  beegfs_single: 1,
}

/**
 * Data fraction of a single storage target's local RAID volume.
 *
 * @param level - BeeGFS topology level (the local RAID of the storage target)
 * @param drivesPerTarget - Local RAID group width
 * @returns Fraction of the target's raw capacity holding data (0-1)
 */
export function getLocalRaidFraction(level: string, drivesPerTarget: number): number {
  const minDrives = BEEGFS_MIN_DRIVES_PER_TARGET[level] ?? 4
  const width = Math.max(minDrives, Math.floor(drivesPerTarget))

  switch (level) {
    case 'beegfs_raid6':
    case 'beegfs_raidz2':
      // Dual parity: two drives per target hold parity
      return (width - 2) / width
    case 'beegfs_raid10':
      // Mirrored stripes: half the drives hold replicas
      return 0.5
    case 'beegfs_single':
      // One drive = one target, no local redundancy
      return 1
    default:
      // Unknown level: assume the RAID6 default rather than 100% efficiency
      return (width - 2) / width
  }
}

/** Storage-target derivation from a drive count: whole targets plus leftover drives. */
export interface BeeGfsStorageTargets {
  storageTargetCount: number
  strandedDrives: number
}

/**
 * Derive the number of whole storage targets and stranded (leftover) drives from an
 * already-hot-spare-adjusted, already-tiering-resolved drive count.
 *
 * Single source of truth for this arithmetic — both `calculateVolumetry` (engine) and
 * `BeeGfsOptionsPanel` (UI, before the engine has run) call this so the two surfaces cannot
 * independently drift on the formula. Callers are responsible for passing the *same* drive
 * count the engine would use: total drives across all servers, minus hot spares scaled by
 * server count, using the tiering capacity-tier count instead of the Hardware panel's
 * driveCount when MDT tiering (`metadataTargets`) is active.
 *
 * @param usableDrives - Drive count after hot-spare and tiering resolution (never negative)
 * @param drivesPerTarget - Local RAID group width (BeeGfsOptions.drivesPerTarget)
 */
export function calculateStorageTargets(
  usableDrives: number,
  drivesPerTarget: number,
): BeeGfsStorageTargets {
  const storageTargetCount = drivesPerTarget > 0 ? Math.floor(usableDrives / drivesPerTarget) : 0
  const strandedDrives = usableDrives - storageTargetCount * drivesPerTarget
  return { storageTargetCount, strandedDrives }
}

export const beeGfsStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, options?: unknown): number {
    const opts = options as BeeGfsOptions | undefined
    const drivesPerTarget = opts?.drivesPerTarget ?? 12

    const localFraction = getLocalRaidFraction(level, drivesPerTarget)

    // Buddy mirroring replicates each chunk onto a second target: exactly 2x
    const buddyFactor = opts?.storageBuddyMirror ? 0.5 : 1

    return localFraction * buddyFactor
  },
}
