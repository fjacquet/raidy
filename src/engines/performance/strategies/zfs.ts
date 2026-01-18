import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * ZFS performance strategy.
 *
 * ZFS has similar write penalties to RAID but with additional
 * considerations for ARC (cache) and ZIL (write log).
 *
 * Copy-on-Write (CoW) reduces traditional RAID penalties:
 * - stripe: 1x (no redundancy)
 * - mirror: 2x (duplicate to both mirrors)
 * - raidz1/draid1: 2x (CoW reduces traditional RAID5 4x penalty)
 * - raidz2/draid2: 3x (CoW reduces traditional RAID6 6x penalty)
 * - raidz3/draid3: 4x (triple parity)
 */
export const zfsPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'stripe':
        return 1.0

      case 'mirror':
        return 2.0 // Duplicate to both mirrors

      case 'raidz1':
      case 'draid1':
        return 2.0 // CoW reduces traditional RAID5 penalty

      case 'raidz2':
      case 'draid2':
        return 3.0 // CoW reduces traditional RAID6 penalty

      case 'raidz3':
      case 'draid3':
        return 4.0 // Triple parity

      default:
        return 1.0
    }
  },

  calculateIOPS(
    level: string,
    driveCount: number,
    driveIOPS: number,
    readPercent: number,
    options?: any
  ): number {
    const writePenalty = this.getWritePenalty(level)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction

    // ZFS read performance similar to RAID
    const readIOPS = driveCount * driveIOPS * readFraction

    // ZFS write performance with penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    // ARC cache boost (optional modeling - simplified here)
    const arcBoost = options?.arcCacheEnabled ? 1.1 : 1.0

    return (readIOPS + writeIOPS) * arcBoost
  },
}
