/**
 * Ceph volumetry strategy.
 *
 * Supports: Replicated (2x/3x) and Erasure Coded (k+m) pools
 * Includes safe capacity threshold (nearfull factor, default 85%).
 */

import type { VolumetryStrategy } from './VolumetryStrategy'
import type { CephOptions } from '@/types/topology'

export const cephStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, options?: CephOptions): number {
    const cephOptions = options as CephOptions

    switch (level) {
      case 'ceph_replicated_2':
        // 2-way replication: 50% efficiency
        return 1 / 2

      case 'ceph_replicated_3':
        // 3-way replication: 33% efficiency
        return 1 / 3

      case 'ceph_ec_2_1':
        // Erasure coded k=2, m=1: 2/(2+1) = 66.7% efficiency
        return 2 / 3

      case 'ceph_ec_4_2':
        // Erasure coded k=4, m=2: 4/(4+2) = 66.7% efficiency
        return 4 / 6

      case 'ceph_ec_8_3':
        // Erasure coded k=8, m=3: 8/(8+3) = 72.7% efficiency
        return 8 / 11

      case 'ceph_ec_8_4':
        // Erasure coded k=8, m=4: 8/(8+4) = 66.7% efficiency
        return 8 / 12

      default:
        // Fallback to options if not matched
        if (!cephOptions) return 0.5

        if (cephOptions.poolType === 'replicated') {
          return 1 / cephOptions.replicationFactor
        }
        // Erasure coded: k / (k + m)
        return cephOptions.ecK / (cephOptions.ecK + cephOptions.ecM)
    }
  },

  // Ceph safe capacity reduction is handled in main volumetry engine
  // as a post-calculation adjustment (applied to usable capacity)
  // calculateOverhead not applicable here
}
