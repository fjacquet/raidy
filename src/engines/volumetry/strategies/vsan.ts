/**
 * VMware vSAN volumetry strategy.
 *
 * Supports both architectures:
 * - vSAN OSA (Original Storage Architecture): disk groups with cache + capacity
 * - vSAN ESA (Express Storage Architecture): single-tier NVMe only
 *
 * Stripe width adapts to cluster size and drive count.
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

interface VsanCalculationOptions {
  serverCount: number
}

export const vsanStrategy: VolumetryStrategy = {
  calculateDataFraction(
    level: string,
    driveCount: number,
    options?: VsanCalculationOptions,
  ): number {
    const serverCount = options?.serverCount ?? 3

    switch (level) {
      // vSAN OSA (Original Storage Architecture)
      case 'vsan_osa_raid1':
        // RAID-1 FTT=1: 2-way mirror, 50% efficiency
        return 0.5

      case 'vsan_osa_raid1_ftt2':
        // RAID-1 FTT=2: 3-way mirror, 33% efficiency
        return 1 / 3

      case 'vsan_osa_raid5': {
        // RAID-5: stripe width adapts to cluster size
        // Min 4 hosts for 3+1, scales up with more hosts
        const drivesPerHost = driveCount / serverCount
        const maxDataDrives = Math.min(serverCount - 1, Math.floor(drivesPerHost / 2), 7)
        const dataDrives = Math.max(3, maxDataDrives)
        return dataDrives / (dataDrives + 1)
      }

      case 'vsan_osa_raid6': {
        // RAID-6: stripe width adapts to cluster size
        // Min 6 hosts for 4+2, scales up with more hosts
        const drivesPerHost = driveCount / serverCount
        const maxDataDrives = Math.min(serverCount - 2, Math.floor(drivesPerHost / 2), 6)
        const dataDrives = Math.max(4, maxDataDrives)
        return dataDrives / (dataDrives + 2)
      }

      // vSAN ESA (Express Storage Architecture)
      case 'vsan_esa_raid1':
        // RAID-1: 2-way mirror, 50% efficiency (only for 2-node clusters)
        return 0.5

      case 'vsan_esa_raid5': {
        // Adaptive RAID-5: stripe width scales with cluster size
        // 4+1 requires min 5 hosts and sufficient drives (120+ with 24 slots/server)
        // 2+1 for smaller clusters
        const canUse4Plus1 = serverCount >= 5 && driveCount >= serverCount * 20
        return canUse4Plus1 ? 4 / 5 : 2 / 3
      }

      case 'vsan_esa_raid6': {
        // Adaptive RAID-6: stripe width scales with cluster size
        // 6+2 requires min 8 hosts, 4+2 for smaller clusters
        const canUse6Plus2 = serverCount >= 8 && driveCount >= serverCount * 20
        return canUse6Plus2 ? 6 / 8 : 4 / 6
      }

      default:
        // Default to 2+1 RAID-5 efficiency
        return 2 / 3
    }
  },

  // vSAN has no additional overhead beyond efficiency
  // Object metadata overhead (~1-2%) handled in main engine as filesystem overhead
  // calculateOverhead not needed
}
