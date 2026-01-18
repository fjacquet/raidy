import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * VMware vSAN performance strategy.
 *
 * Handles both OSA (Original Storage Architecture) and ESA (Express Storage Architecture).
 *
 * vSAN OSA (disk groups):
 * - vsan_osa_raid1: 2x (2-way mirror)
 * - vsan_osa_raid1_ftt2: 3x (3-way mirror, FTT=2)
 * - vsan_osa_raid5: 4x (traditional RAID-5, 3+1)
 * - vsan_osa_raid6: 6x (traditional RAID-6, 4+2)
 *
 * vSAN ESA (single-tier NVMe):
 * - vsan_esa_raid1: 2x (mirror writes)
 * - vsan_esa_raid5: 2.5x (log-structured, near RAID-1 performance)
 * - vsan_esa_raid6: 3.5x (optimized dual parity, much better than OSA)
 */
export const vsanPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      // vSAN OSA (Original Storage Architecture)
      case 'vsan_osa_raid1':
        return 2.0 // 2-way mirror writes

      case 'vsan_osa_raid1_ftt2':
        return 3.0 // 3-way mirror writes (FTT=2)

      case 'vsan_osa_raid5':
        return 4.0 // Traditional RAID-5 penalty (3+1)

      case 'vsan_osa_raid6':
        return 6.0 // Traditional RAID-6 penalty (4+2)

      // vSAN ESA (Express Storage Architecture)
      case 'vsan_esa_raid1':
        return 2.0 // Mirror writes

      case 'vsan_esa_raid5':
        return 2.5 // Log-structured optimized, near RAID-1 performance

      case 'vsan_esa_raid6':
        return 3.5 // Optimized double parity, much better than OSA

      default:
        return 2.5
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

    // vSAN read performance
    const readIOPS = driveCount * driveIOPS * readFraction

    // vSAN write performance with penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    // ESA has additional NVMe optimizations
    const isESA = level.startsWith('vsan_esa')
    const esaBoost = isESA ? 1.1 : 1.0

    return (readIOPS + writeIOPS) * esaBoost
  },
}
