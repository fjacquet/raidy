/**
 * Nutanix AOS volumetry strategy.
 *
 * Supports: RF2 (2x replication), RF3 (3x replication), EC-X (Erasure Coding)
 * System overhead (5-10% for snapshots, metadata, CVM, rebuild) handled in main engine.
 */

import type { NutanixOptions } from '@/types/topology'
import type { VolumetryStrategy } from './VolumetryStrategy'

export const nutanixStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, options?: NutanixOptions): number {
    const nutanixOptions = options as NutanixOptions

    switch (level) {
      case 'nutanix_rf2':
        // RF2: 2 copies = 50% efficiency
        return 1 / (nutanixOptions?.replicationFactor ?? 2)

      case 'nutanix_rf3':
        // RF3: 3 copies = 33% efficiency
        return 1 / (nutanixOptions?.replicationFactor ?? 3)

      case 'nutanix_ec_rf2':
        // EC-X with RF2 base: 4:1 striping = 75% efficiency (approximation)
        // Per spec: C_usable_ec = C_formatted × 0.75
        return 0.75

      case 'nutanix_ec_rf3':
        // EC-X with RF3 base: 6:2 striping = 75% efficiency
        return 6 / 8

      default:
        // Default to RF2 if not specified
        return 1 / (nutanixOptions?.replicationFactor ?? 2)
    }
  },

  // Nutanix system overhead is handled in main volumetry engine
  // as percentage of capacity after parity
  // calculateOverhead not applicable here
}
