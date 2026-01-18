import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Dell PowerFlex performance strategy.
 *
 * PowerFlex write penalties based on protection mode:
 * - powerflex_medium_2way / powerflex_fine_2way: 2x (2-way mirror)
 * - powerflex_medium_3way: 3x (3-way mirror, Medium Granularity only)
 * - powerflex_ec_4_1: 1.25x (EC 4+1: write amplification = 5/4)
 * - powerflex_ec_4_2: 1.5x (EC 4+2: write amplification = 6/4)
 * - powerflex_ec_8_2: 1.25x (EC 8+2: write amplification = 10/8)
 * - powerflex_ec_12_4: 1.33x (EC 12+4: write amplification = 16/12)
 */
export const powerFlexPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'powerflex_medium_2way':
      case 'powerflex_fine_2way':
        return 2.0 // 2-way mirror writes

      case 'powerflex_medium_3way':
        return 3.0 // 3-way mirror writes (Medium Granularity only)

      case 'powerflex_ec_4_1':
        return 1.25 // EC 4+1: write amplification = 5/4 = 1.25

      case 'powerflex_ec_4_2':
        return 1.5 // EC 4+2: write amplification = 6/4 = 1.5

      case 'powerflex_ec_8_2':
        return 1.25 // EC 8+2: write amplification = 10/8 = 1.25

      case 'powerflex_ec_12_4':
        return 1.33 // EC 12+4: write amplification = 16/12 = 1.33

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

    // PowerFlex read performance
    const readIOPS = driveCount * driveIOPS * readFraction

    // PowerFlex write performance with penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    return readIOPS + writeIOPS
  },
}
