/**
 * RAID volumetry strategy for standard RAID levels.
 *
 * Supports: RAID0, RAID1, RAID1E, RAID1_3WAY, RAID3, RAID4, RAID5, RAID5E, RAID5EE,
 * RAID6, RAID10, RAID50, RAID60
 *
 * Formulas validated against WintelGuy RAID Calculator (Phase 2).
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

export const raidStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, driveCount: number): number {
    const usableDrives = driveCount

    switch (level) {
      case 'RAID0':
        // No redundancy - 100% efficiency
        return 1.0

      case 'RAID1':
        // Mirror (2-way) - 50% efficiency
        return 0.5

      case 'RAID1E':
        // RAID 1E: Mirrored striping, each block written twice
        // Efficiency is ~50% regardless of drive count
        return 0.5

      case 'RAID1_3WAY':
        // 3-Way Mirror / Triple Mirror - 33% efficiency
        return 1 / 3

      case 'RAID3':
        // Byte-level striping with dedicated parity disk
        // (n-1)/n efficiency
        return (usableDrives - 1) / usableDrives

      case 'RAID4':
        // Block-level striping with dedicated parity disk
        // (n-1)/n efficiency
        return (usableDrives - 1) / usableDrives

      case 'RAID5':
        // Distributed parity - (n-1)/n efficiency
        return (usableDrives - 1) / usableDrives

      case 'RAID5E':
        // RAID 5E: RAID 5 with integrated distributed hot spare
        // Uses 1 drive worth for parity + 1 for distributed spare
        // (n-2)/n efficiency
        return (usableDrives - 2) / usableDrives

      case 'RAID5EE':
        // RAID 5EE: Similar to 5E but with active hot spare
        // (n-2)/n efficiency
        return (usableDrives - 2) / usableDrives

      case 'RAID6':
        // Dual distributed parity - (n-2)/n efficiency
        return (usableDrives - 2) / usableDrives

      case 'RAID10':
        // Mirrored stripes - 50% efficiency
        return 0.5

      case 'RAID50':
        // RAID 5 stripes: assume 2 groups
        // (n-2)/n accounting for parity per stripe
        return (usableDrives - 2) / usableDrives

      case 'RAID60':
        // RAID 6 stripes: assume 2 groups
        // (n-4)/n accounting for dual parity per stripe
        return (usableDrives - 4) / usableDrives

      default:
        // Unknown RAID level - return 100% (no redundancy assumed)
        return 1.0
    }
  },

  // RAID has no additional overhead beyond parity
  // calculateOverhead not needed
}
