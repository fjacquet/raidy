/**
 * Proprietary storage volumetry strategy.
 *
 * Supports vendor-specific RAID variants:
 * - Synology: SHR (Synology Hybrid RAID), SHR-2, RAID F1
 * - NetApp: RAID-DP (Double Parity), RAID-TEC (Triple Erasure Coding)
 * - Dell PowerVault ME5: Traditional RAID and ADAPT distributed RAID
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

export const proprietaryStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, driveCount: number): number {
    const usableDrives = driveCount

    // Synology variants
    if (level.startsWith('synology_')) {
      switch (level) {
        case 'synology_shr':
          // SHR approximates RAID5 efficiency
          return (usableDrives - 1) / usableDrives

        case 'synology_shr2':
          // SHR2 approximates RAID6 efficiency
          return (usableDrives - 2) / usableDrives

        case 'synology_raid_f1':
          // RAID F1: All-Flash optimized, similar to RAID5 with uneven parity rotation
          // Efficiency ≈ RAID5: (N-1)/N
          return (usableDrives - 1) / usableDrives

        default:
          return 1.0
      }
    }

    // NetApp variants
    if (level.startsWith('netapp_')) {
      switch (level) {
        case 'netapp_raid_dp':
          // RAID-DP: double parity per RAID group
          return (usableDrives - 2) / usableDrives

        case 'netapp_raid_tec':
          // RAID-TEC: triple parity per RAID group (for drives >10TB)
          return (usableDrives - 3) / usableDrives

        default:
          return 1.0
      }
    }

    // Dell PowerVault ME5
    if (level.startsWith('powervault_')) {
      switch (level) {
        case 'powervault_raid1':
          // RAID 1: 2-way mirror, 50% efficiency
          return 0.5

        case 'powervault_raid5':
          // RAID 5: single parity, (n-1)/n efficiency
          return (usableDrives - 1) / usableDrives

        case 'powervault_raid6':
          // RAID 6: dual parity, (n-2)/n efficiency
          return (usableDrives - 2) / usableDrives

        case 'powervault_raid10':
          // RAID 10: mirrored stripes, 50% efficiency
          return 0.5

        case 'powervault_adapt':
          // ADAPT: distributed RAID with ~87% efficiency for 24+ drives
          // Uses distributed spare capacity and parity across all drives
          return usableDrives >= 24 ? 0.87 : 0.85

        default:
          return 0.8
      }
    }

    // Unknown proprietary topology
    return 1.0
  },

  // Proprietary systems have various overhead mechanisms:
  // - Synology system partition: handled in main engine (20-30GB per disk)
  // - NetApp WAFL overhead: handled in main engine (1-2%)
  // - NetApp snapshot reserve: handled in main engine
  // calculateOverhead not needed here
}
