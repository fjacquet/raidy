import type { BeeGfsOptions } from '@/types/topology'
import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * BeeGFS performance strategy.
 *
 * Each storage target is a local RAID volume, so the write penalty is the local
 * RAID's penalty (RAID6/RAIDz2 dual parity = 6x, RAID10 mirror = 2x, single
 * disk = 1x), multiplied by 2 when Buddy Mirroring replicates every chunk to a
 * second target. Reads scale linearly with drive count; the wire amplification
 * for Buddy Mirroring writes is modelled separately in
 * `NETWORK_MODEL_BY_TOPOLOGY` (bottleneck-chain.ts).
 *
 * `BeeGfsOptions.numTargets` and `chunkSizeKb` are deliberately NOT consulted
 * here — they are per-file striping tunables, while every figure this engine
 * produces is a cluster aggregate over all clients and files. See their
 * doc-comments in `src/types/topology.ts` for the full reasoning; both are
 * labelled informational in the options panel.
 */
export const beeGfsPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string, options?: unknown): number {
    const opts = options as BeeGfsOptions | undefined

    let base: number
    switch (level) {
      case 'beegfs_raid6':
      case 'beegfs_raidz2':
        base = 6
        break
      case 'beegfs_raid10':
        base = 2
        break
      case 'beegfs_single':
        base = 1
        break
      default:
        base = 6
    }

    return base * (opts?.storageBuddyMirror ? 2 : 1)
  },

  calculateIOPS(
    level: string,
    driveCount: number,
    driveIOPS: number,
    readPercent: number,
    options?: unknown,
  ): number {
    const writePenalty = this.getWritePenalty(level, options)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction
    const readIOPS = driveCount * driveIOPS * readFraction
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty
    return readIOPS + writeIOPS
  },
}
