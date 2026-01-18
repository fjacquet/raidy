import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Dell storage systems performance strategy.
 *
 * Handles PowerStore, PowerScale, ObjectScale, and PowerVault.
 *
 * PowerStore (block storage):
 * - powerstore_raid5: 3x (optimized RAID-5 with NVMe)
 * - powerstore_raid6: 4x
 * - powerstore_raid10: 2x
 *
 * PowerScale (scale-out NAS):
 * - powerscale_n1: 2.5x (N+1 with inline writes)
 * - powerscale_n2: 3.5x (N+2)
 * - powerscale_n3: 4.5x (N+3)
 * - powerscale_n4: 5.5x (N+4)
 * - powerscale_mirror_2x: 2x
 * - powerscale_mirror_3x: 3x
 *
 * ObjectScale (S3 object storage):
 * - objectscale_ec_12_4: 1.33x (EC 12+4: 16/12, default min 5 nodes)
 * - objectscale_ec_10_2: 1.2x (EC 10+2: 12/10, cold/archive min 7 nodes)
 * - objectscale_ec_24_4: 1.17x (EC 24+4: 28/24, tech preview min 8 nodes)
 * - objectscale_mirror_3: 3x (triple mirroring for metadata)
 *
 * PowerVault (entry-level SAN):
 * - powervault_raid1: 2x
 * - powervault_raid5: 4x
 * - powervault_raid6: 6x
 * - powervault_raid10: 2x
 * - powervault_adapt: 2.5x (distributed parity)
 */
export const dellPerformanceStrategy: PerformanceStrategy = {
  getWritePenalty(level: string): number {
    switch (level) {
      // PowerStore
      case 'powerstore_raid5':
        return 3.0 // Optimized RAID-5 with NVMe

      case 'powerstore_raid6':
        return 4.0

      case 'powerstore_raid10':
        return 2.0

      // PowerScale
      case 'powerscale_n1':
        return 2.5 // N+1 with inline writes

      case 'powerscale_n2':
      case 'powerscale_n2_1':
        return 3.5 // N+2

      case 'powerscale_n3':
        return 4.5 // N+3

      case 'powerscale_n4':
        return 5.5 // N+4

      case 'powerscale_mirror_2x':
        return 2.0

      case 'powerscale_mirror_3x':
        return 3.0

      // ObjectScale
      case 'objectscale_ec_12_4':
        return 1.33 // EC 12+4: write amplification = 16/12 = 1.33

      case 'objectscale_ec_10_2':
        return 1.2 // EC 10+2: write amplification = 12/10 = 1.2

      case 'objectscale_ec_24_4':
        return 1.17 // EC 24+4: write amplification = 28/24 = 1.17

      case 'objectscale_mirror_3':
        return 3.0 // Triple mirroring

      // PowerVault
      case 'powervault_raid1':
        return 2.0

      case 'powervault_raid5':
        return 4.0

      case 'powervault_raid6':
        return 6.0

      case 'powervault_raid10':
        return 2.0

      case 'powervault_adapt':
        return 2.5 // Distributed parity reduces penalty

      default:
        return 3.0
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

    // Read performance
    const readIOPS = driveCount * driveIOPS * readFraction

    // Write performance with penalty
    const writeIOPS = (driveCount * driveIOPS * writeFraction) / writePenalty

    // ObjectScale has higher protocol overhead for S3
    const isObjectScale = level.startsWith('objectscale')
    const protocolOverhead = isObjectScale ? 0.9 : 1.0

    return (readIOPS + writeIOPS) * protocolOverhead
  },
}
