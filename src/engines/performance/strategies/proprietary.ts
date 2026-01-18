import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Proprietary storage systems performance strategy.
 *
 * Handles vendor-specific RAID implementations:
 *
 * Synology:
 * - synology_shr: 4x (similar to RAID5)
 * - synology_shr2: 6x (similar to RAID6)
 * - synology_raid_f1: 3.5x (RAID F1 optimized for SSD with uneven parity rotation)
 *
 * NetApp ONTAP:
 * - netapp_raid_dp: 4x (optimized double parity with WAFL)
 * - netapp_raid_tec: 5x (optimized triple parity for large drives)
 */
export const proprietaryPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      // Synology
      case 'synology_shr':
        return 4.0 // Similar to RAID5

      case 'synology_shr2':
        return 6.0 // Similar to RAID6

      case 'synology_raid_f1':
        return 3.5 // RAID F1 optimized for SSD with uneven parity rotation

      // NetApp ONTAP
      case 'netapp_raid_dp':
        return 4.0 // Optimized double parity with WAFL

      case 'netapp_raid_tec':
        return 5.0 // Optimized triple parity for large drives

      default:
        return 1.0
    }
  },

  calculateIOPS(
    level: string,
    driveCount: number,
    driveIOPS: number,
    readPercent: number,
    _options?: unknown,
  ): number {
    const writePenalty = this.getWritePenalty(level)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction

    // Read performance
    const readIOPS = driveCount * driveIOPS * readFraction

    // Write performance with penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    // NetApp WAFL provides some caching benefit
    const isNetApp = level.startsWith('netapp')
    const waflBoost = isNetApp ? 1.05 : 1.0

    return (readIOPS + writeIOPS) * waflBoost
  },
}
