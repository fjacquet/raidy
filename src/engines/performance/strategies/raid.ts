import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * RAID performance strategy.
 *
 * Write penalties validated against MassiveGRID and WintelGuy formulas:
 * - RAID0: 1x (no redundancy overhead)
 * - RAID1: 2x (duplicate writes)
 * - RAID5: 4x (read-modify-write: 2 reads + 2 writes)
 * - RAID6: 6x (dual parity: 3 reads + 3 writes)
 * - RAID10: 2x (mirrored writes)
 */
export const raidPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'RAID0':
        return 1.0 // No redundancy, no penalty

      case 'RAID1':
      case 'RAID10':
        return 2.0 // Duplicate writes to mirrors

      case 'RAID3':
      case 'RAID4':
      case 'RAID5':
      case 'RAID50':
        return 4.0 // Read-modify-write: 2 reads + 2 writes

      case 'RAID6':
      case 'RAID60':
        return 6.0 // Dual parity: 3 reads + 3 writes

      case 'RAID1E':
        return 2.0 // Similar to RAID1

      case 'RAID5E':
      case 'RAID5EE':
        return 4.0 // Similar to RAID5

      case 'RAID1_3WAY':
        return 3.0 // Write to all 3 mirrors

      default:
        return 1.0 // Unknown level, no penalty assumed
    }
  },

  calculateIOPS(level: string, driveCount: number, driveIOPS: number, readPercent: number): number {
    const writePenalty = this.getWritePenalty(level)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction

    // Read IOPS: full parallel access across drives
    const readIOPS = driveCount * driveIOPS * readFraction

    // Write IOPS: divided by write penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    return readIOPS + writeIOPS
  },
}
