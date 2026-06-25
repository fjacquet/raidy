import type { S2DOptions } from '@/types/topology'
import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Microsoft S2D (Storage Spaces Direct) performance strategy.
 *
 * S2D write penalties based on resiliency mode (a mirror write fans out to one
 * backend write per copy, so the penalty scales with mirrorCopies):
 * - simple: 1x (no redundancy)
 * - mirror: 2x (2-way) or 3x (3-way) — equals mirrorCopies
 * - parity: 3x (single parity with journal)
 * - dual_parity: 4x (dual parity with journal)
 * - map: mirrorCopies + 0.5 (writes mostly land on the mirror tier; small parity surcharge)
 */
export const s2dPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string, options?: unknown): number {
    const mirrorCopies = (options as S2DOptions | undefined)?.mirrorCopies ?? 2

    switch (level) {
      case 'simple':
        return 1.0 // No redundancy

      case 'mirror':
        return mirrorCopies // One backend write per copy (2-way = 2x, 3-way = 3x)

      case 'parity':
        return 3.0 // Single parity with journal optimization

      case 'dual_parity':
        return 4.0 // Dual parity with journal

      case 'map':
        return mirrorCopies + 0.5 // Mirror-Accelerated Parity (mostly mirror-tier writes)

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
