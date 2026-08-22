import { STRIPE_SHAPES } from '@/engines/volumetry/powerscale/stripeShape'
import type { PowerScaleProtection } from '@/types/topology'
import type { PerformanceStrategy } from './PerformanceStrategy'

/**
 * Dell storage systems performance strategy.
 *
 * Handles PowerStore, ObjectScale, PowerVault, and PowerScale.
 *
 * PowerScale (scale-out NAS) protection lives on the tier, not the level —
 * see the protection-driven branch at the top of `getWritePenalty`.
 *
 * PowerStore (block storage):
 * - powerstore_raid5: 3x (optimized RAID-5 with NVMe)
 * - powerstore_raid6: 4x
 * - powerstore_raid10: 2x
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
  getWritePenalty(level: string, options?: unknown): number {
    // PowerScale protection now lives on the tier, not the level. The penalty follows the FEC
    // unit count the pre-existing +1n..+4n values already encoded: 2.5, 3.5, 4.5, 5.5 for
    // M = 1..4, i.e. M + 1.5. Drive-level levels carry the same FEC count as their node-level
    // peers, so +2d:1n prices like +2n — which is also what the old powerscale_n2_1 case did.
    if (level === 'powerscale_onefs') {
      const protection = (options as { protection?: PowerScaleProtection } | undefined)?.protection
      if (!protection) return 3.0
      return STRIPE_SHAPES[protection].M + 1.5
    }
    switch (level) {
      // PowerStore
      case 'powerstore_raid5':
        return 3.0 // Optimized RAID-5 with NVMe

      case 'powerstore_raid6':
        return 4.0

      case 'powerstore_raid10':
        return 2.0

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
    options?: unknown,
  ): number {
    const writePenalty = this.getWritePenalty(level, options)
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
