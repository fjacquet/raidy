import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Ceph performance strategy.
 *
 * Ceph write penalties depend on replication vs erasure coding:
 *
 * Replication:
 * - ceph_replicated_2: 2x (2-way replication)
 * - ceph_replicated_3: 3x (3-way replication)
 *
 * Erasure Coding:
 * - ceph_ec_2_1: 2x (k=2, m=1 with primary OSD coordination)
 * - ceph_ec_4_2: 2.5x (k=4, m=2)
 * - ceph_ec_8_3: 3x (k=8, m=3)
 * - ceph_ec_8_4: 3.5x (k=8, m=4)
 */
export const cephPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      // Ceph Replication
      case 'ceph_replicated_2':
        return 2.0 // 2-way replication

      case 'ceph_replicated_3':
        return 3.0 // 3-way replication

      // Ceph Erasure Coding
      case 'ceph_ec_2_1':
        return 2.0 // EC k=2, m=1 with primary OSD coordination

      case 'ceph_ec_4_2':
        return 2.5 // EC k=4, m=2

      case 'ceph_ec_8_3':
        return 3.0 // EC k=8, m=3

      case 'ceph_ec_8_4':
        return 3.5 // EC k=8, m=4

      default:
        return 3.0 // Default to 3x replication
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

    // Ceph read performance scales with OSDs
    const readIOPS = driveCount * driveIOPS * readFraction

    // Ceph write performance with replication/EC penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    // Network latency impact (could be adjusted based on options)
    const networkFactor = options?.networkSpeed === '100GbE' ? 1.1 : 1.0

    return (readIOPS + writeIOPS) * networkFactor
  },
}
