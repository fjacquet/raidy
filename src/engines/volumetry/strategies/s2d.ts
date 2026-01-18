/**
 * Microsoft Storage Spaces Direct (S2D) volumetry strategy.
 *
 * Supports: Simple, Mirror (2-way/3-way), Parity, Dual Parity, MAP
 * Includes automatic rebuild reserve (1 drive equivalent per node).
 */

import type { S2DOptions } from '@/types/topology'
import type { VolumetryStrategy } from './VolumetryStrategy'

export const s2dStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, options?: S2DOptions): number {
    const s2dOptions = options as S2DOptions

    switch (level) {
      case 'simple':
        // No redundancy - 100% efficiency
        return 1.0

      case 'mirror':
        // Mirror: efficiency = 1 / copies (2-way or 3-way)
        return 1 / (s2dOptions?.mirrorCopies ?? 2)

      case 'parity':
        // Single parity across fault domains
        // Handle division by zero
        if (!s2dOptions || s2dOptions.faultDomains === 0) return 0
        return (s2dOptions.faultDomains - 1) / s2dOptions.faultDomains

      case 'dual_parity':
        // Dual parity across fault domains
        if (!s2dOptions || s2dOptions.faultDomains === 0) return 0
        return (s2dOptions.faultDomains - 2) / s2dOptions.faultDomains

      case 'map': {
        // MAP (Mirror-Accelerated Parity): hybrid approach
        // Estimate 20% mirror, 80% parity
        const mirrorPortion = 0.2 / (s2dOptions?.mirrorCopies ?? 2)
        if (!s2dOptions || s2dOptions.faultDomains === 0) return mirrorPortion
        const parityPortion = 0.8 * ((s2dOptions.faultDomains - 2) / s2dOptions.faultDomains)
        return mirrorPortion + parityPortion
      }

      default:
        // Unknown S2D level - return 100%
        return 1.0
    }
  },

  // S2D rebuild reserve is calculated in main volumetry engine
  // based on per-drive capacity and node count, not raw capacity
  // calculateOverhead not applicable here
}
