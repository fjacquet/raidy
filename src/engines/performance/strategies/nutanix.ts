import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Nutanix performance strategy.
 *
 * Nutanix DSF write penalties based on RF (Replication Factor) and EC:
 * - nutanix_rf2: 2x (RF2: write to 2 copies via OpLog)
 * - nutanix_rf3: 3x (RF3: write to 3 copies via OpLog)
 * - nutanix_ec_rf2: 1.25x (EC-X with RF2: 4:1 striping)
 * - nutanix_ec_rf3: 1.33x (EC-X with RF3: 6:2 striping)
 */
export const nutanixPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'nutanix_rf2':
        return 2.0 // RF2: write to 2 copies (primary + 1 replica)

      case 'nutanix_rf3':
        return 3.0 // RF3: write to 3 copies (primary + 2 replicas)

      case 'nutanix_ec_rf2':
        return 1.25 // EC-X with RF2: 4:1 striping reduces penalty

      case 'nutanix_ec_rf3':
        return 1.33 // EC-X with RF3: 6:2 striping

      default:
        return 2.0
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

    // Nutanix read performance scales with drives
    const readIOPS = driveCount * driveIOPS * readFraction

    // Nutanix write performance with RF penalty
    // OpLog provides write coalescing benefit
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    return readIOPS + writeIOPS
  },
}
