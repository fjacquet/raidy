/**
 * ZFS volumetry strategy.
 *
 * Supports: stripe, mirror, raidz1/2/3, draid1/2/3
 * Includes ZFS slop space calculation (1/32 with min/max bounds).
 *
 * Formulas validated against OpenZFS documentation (Phase 2).
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

export const zfsStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, driveCount: number): number {
    const usableDrives = driveCount

    switch (level) {
      case 'stripe':
        // No redundancy - 100% efficiency
        return 1.0

      case 'mirror':
        // 2-way mirror - 50% efficiency
        return 0.5

      case 'raidz1':
      case 'draid1':
        // Single parity - (n-1)/n efficiency
        return (usableDrives - 1) / usableDrives

      case 'raidz2':
      case 'draid2':
        // Dual parity - (n-2)/n efficiency
        return (usableDrives - 2) / usableDrives

      case 'raidz3':
      case 'draid3':
        // Triple parity - (n-3)/n efficiency
        return (usableDrives - 3) / usableDrives

      default:
        // Unknown ZFS level - return 100%
        return 1.0
    }
  },

  calculateOverhead(rawCapacity: number): number {
    /**
     * ZFS slop space: clamp(capacity / 32, 128 MiB, 128 GiB)
     *
     * Per OpenZFS source code:
     * - spa_slop_shift = 5 (default, means 1/32 = 2^5)
     * - SPA_MIN_SLOP = 128 MiB
     * - SPA_MAX_SLOP = 128 GiB
     *
     * This space is reserved for metadata and emergency allocations.
     */
    const MIN_SLOP = 128 * 1024 * 1024 // 128 MiB
    const MAX_SLOP = 128 * 1024 * 1024 * 1024 // 128 GiB

    const slopSpace = rawCapacity / 32
    return Math.min(Math.max(slopSpace, MIN_SLOP), MAX_SLOP)
  },
}
