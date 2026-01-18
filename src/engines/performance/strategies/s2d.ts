import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Microsoft S2D (Storage Spaces Direct) performance strategy.
 *
 * S2D write penalties based on resiliency mode:
 * - simple: 1x (no redundancy)
 * - mirror: 2x (2-way mirror)
 * - parity: 3x (single parity with journal)
 * - dual_parity: 4x (dual parity with journal)
 * - map: 2.5x (Mirror-Accelerated Parity blend)
 */
export const s2dPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'simple':
        return 1.0 // No redundancy

      case 'mirror':
        return 2.0 // 2-way mirror writes

      case 'parity':
        return 3.0 // Single parity with journal optimization

      case 'dual_parity':
        return 4.0 // Dual parity with journal

      case 'map':
        return 2.5 // Mirror-Accelerated Parity (blend of mirror and parity)

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

    // S2D read performance scales with drives
    const readIOPS = driveCount * driveIOPS * readFraction

    // S2D write performance with penalty
    // Parity modes benefit from columnar write optimization
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    return readIOPS + writeIOPS
  },
}
