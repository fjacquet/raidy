/**
 * Nutanix AOS volumetry strategy.
 *
 * Supports: RF2 (2x replication), RF3 (3x replication), EC-X (Erasure Coding)
 * System overhead (5-10% for snapshots, metadata, CVM, rebuild) handled in main engine.
 */

import type { NutanixOptions } from '@/types/topology'
import type { VolumetryStrategy } from './VolumetryStrategy'

export const nutanixStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, _options?: NutanixOptions): number {
    switch (level) {
      case 'nutanix_rf2':
        // RF2: 2 copies = 50% efficiency (1/2)
        return 0.5

      case 'nutanix_rf3':
        // RF3: 3 copies = 33.3% efficiency (1/3)
        return 1 / 3

      case 'nutanix_ec_rf2':
        // EC-X with RF2: 4+1 striping = 80% efficiency (4/5)
        // Per Nutanix TN-2032: 4 data blocks + 1 parity
        return 4 / 5

      case 'nutanix_ec_rf3':
        // EC-X with RF3: 4+2 striping = 66.7% efficiency (4/6)
        // Per Nutanix TN-2032: 4 data blocks + 2 parity
        return 4 / 6

      default:
        // Default to RF2 if not specified
        return 0.5
    }
  },

  // Nutanix system overhead is handled in main volumetry engine
  // as percentage of capacity after parity
  // calculateOverhead not applicable here
}
