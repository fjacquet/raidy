/**
 * Dell storage volumetry strategy.
 *
 * Supports multiple Dell storage platforms:
 * - PowerFlex (formerly VxFlex OS/ScaleIO): SDS with 2/3-way mirror or EC
 * - PowerStore: Block/file storage with RAID 5/6/10
 * - PowerScale (formerly Isilon): Scale-out NAS with N+x protection
 * - ObjectScale: Object storage (S3) with EC and geo-replication
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

interface DellPowerscaleOptions {
  serverCount: number
}

export const dellStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, driveCount: number, options?: unknown): number {
    const usableDrives = driveCount

    // PowerFlex (Software-Defined Storage)
    if (level.startsWith('powerflex_')) {
      switch (level) {
        case 'powerflex_medium_2way':
        case 'powerflex_fine_2way':
          // 2-way mirror: 50% efficiency (FG only supports 2-way)
          return 0.5

        case 'powerflex_medium_3way':
          // 3-way mirror: 33% efficiency (Medium Granularity only)
          return 1 / 3

        case 'powerflex_ec_4_1':
          // Erasure coding 4+1: 4/(4+1) = 80% efficiency
          return 4 / 5

        case 'powerflex_ec_4_2':
          // Erasure coding 4+2: 4/(4+2) = 66.7% efficiency
          return 4 / 6

        case 'powerflex_ec_8_2':
          // Erasure coding 8+2: 8/(8+2) = 80% efficiency
          return 8 / 10

        case 'powerflex_ec_12_4':
          // Erasure coding 12+4: 12/(12+4) = 75% efficiency
          return 12 / 16

        default:
          return 0.5
      }
    }

    // PowerStore (Block Storage)
    if (level.startsWith('powerstore_')) {
      switch (level) {
        case 'powerstore_raid5': {
          // PowerStore RAID-5 DRE geometry (Dell KB 000188491):
          //   <10 drives: 4+1 stripe -> 4/5 = 80%
          //   >=10 drives: 8+1 stripe -> 8/9 = 88.89%
          return usableDrives < 10 ? 4 / 5 : 8 / 9
        }

        case 'powerstore_raid6': {
          // PowerStore RAID-6 DRE geometry (Dell KB 000188491):
          //   <8 drives: 4+2 stripe -> 4/6 = 66.67%
          //   8-19 drives: 8+2 stripe -> 8/10 = 80%
          //   >=20 drives: 16+2 stripe -> 16/18 = 88.89%
          if (usableDrives < 8) return 4 / 6
          if (usableDrives < 20) return 8 / 10
          return 16 / 18
        }

        case 'powerstore_raid10':
          // PowerStore RAID-10: mirrored stripes, 50% efficiency
          return 0.5

        default:
          return 0.8 // Default to RAID-5
      }
    }

    // PowerScale (Scale-out NAS)
    // OneFS protection is NODE-level: formula N/(N+M) where N = data nodes, M = protection nodes
    // serverCount (node count) is threaded via options from calculationHelpers.ts
    if (level.startsWith('powerscale_')) {
      const opts = options as DellPowerscaleOptions | undefined
      const nodeCount = opts?.serverCount ?? usableDrives // fallback to driveCount if no serverCount passed

      switch (level) {
        case 'powerscale_n1':
          // N+1 protection: (N-1)/N where N = node count
          return (nodeCount - 1) / nodeCount

        case 'powerscale_n2':
          // N+2 protection: (N-2)/N where N = node count
          return (nodeCount - 2) / nodeCount

        case 'powerscale_n2_1':
          // N+2:1 protection: (N-2)/N with 1 stripe failure tolerance
          return (nodeCount - 2) / nodeCount

        case 'powerscale_n3':
          // N+3 protection: (N-3)/N where N = node count
          return (nodeCount - 3) / nodeCount

        case 'powerscale_n4':
          // N+4 protection: (N-4)/N where N = node count
          return (nodeCount - 4) / nodeCount

        case 'powerscale_mirror_2x':
          // 2x mirrored: 50% efficiency (independent of node count)
          return 0.5

        case 'powerscale_mirror_3x':
          // 3x mirrored: 33.3% efficiency (independent of node count)
          return 1 / 3

        default:
          return (nodeCount - 2) / nodeCount // Default to N+2
      }
    }

    // ObjectScale (Object Storage S3)
    if (level.startsWith('objectscale_')) {
      switch (level) {
        case 'objectscale_ec_12_4':
          // EC 12+4: 12/(12+4) = 75% efficiency, min 5 nodes, default
          return 12 / 16

        case 'objectscale_ec_10_2':
          // EC 10+2: 10/(10+2) = 83.3% efficiency, min 7 nodes, cold/archive
          return 10 / 12

        case 'objectscale_ec_24_4':
          // EC 24+4: 24/(24+4) = 85.7% efficiency, min 8 nodes, tech preview
          return 24 / 28

        case 'objectscale_mirror_3':
          // Triple mirroring: 33.3% efficiency, for metadata/small configs
          return 1 / 3

        default:
          return 12 / 16 // Default to EC 12+4
      }
    }

    // Unknown Dell topology
    return 1.0
  },

  // Dell storage systems have various overhead mechanisms:
  // - PowerFlex FG metadata: handled in main engine (12-15%)
  // - PowerStore/PowerScale snapshot reserves: handled in main engine
  // - ObjectScale system/geo overhead: handled in main engine
  // calculateOverhead not needed here
}
