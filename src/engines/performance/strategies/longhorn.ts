import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Longhorn performance strategy.
 *
 * Synchronous replication: each write is mirrored to R replicas across nodes,
 * so the write penalty equals the replica count (like Ceph replicated pools).
 * Reads scale with the number of drives (OSD-equivalent).
 */
export const longhornPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      case 'longhorn_r2':
        return 2.0 // 2-way replication
      case 'longhorn_r3':
        return 3.0 // 3-way replication
      default:
        return 3.0
    }
  },

  calculateIOPS(level: string, driveCount: number, driveIOPS: number, readPercent: number): number {
    const writePenalty = this.getWritePenalty(level)
    const readFraction = readPercent / 100
    const writeFraction = 1 - readFraction
    const readIOPS = driveCount * driveIOPS * readFraction
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty
    return readIOPS + writeIOPS
  },
}
