/**
 * Longhorn volumetry strategy.
 *
 * Longhorn replicates each volume to R full copies (one per node), so raw
 * efficiency is 1/R — identical in shape to Ceph replicated pools. Free-space
 * and snapshot guardrails are applied as post-calculation reductions in the
 * main volumetry engine (see index.ts), mirroring Ceph's safe-capacity factor.
 */

import type { VolumetryStrategy } from './VolumetryStrategy'

export const longhornStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string): number {
    switch (level) {
      case 'longhorn_r2':
        return 1 / 2 // 2 replicas: 50% efficiency
      case 'longhorn_r3':
        return 1 / 3 // 3 replicas: 33% efficiency
      default:
        return 1 / 3 // Safe default: 3-way replication
    }
  },
}
