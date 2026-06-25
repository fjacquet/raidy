/**
 * Unit tests for the network bottleneck model used by the performance engine.
 *
 * Covers the vSAN traffic-fraction estimate and the backward-compatible
 * network-limit calculation (neutral default must reproduce the legacy formula).
 */

import { describe, expect, it } from 'vitest'
import {
  calculateNetworkLimits,
  getVsanNetworkTrafficFraction,
} from '@/engines/performance/utils/bottleneck-chain'

const BLOCK_64K = 64 * 1024

describe('getVsanNetworkTrafficFraction', () => {
  it('counts every write as egress for an FTT=1 mirror (100% write)', () => {
    expect(getVsanNetworkTrafficFraction('vsan_esa_raid1', 0, 5)).toBeCloseTo(1.0, 5)
  })

  it('amplifies write egress for an FTT=2 mirror', () => {
    // 100% write × egress 2.0 = 2.0 (two remote copies cross the fabric)
    expect(getVsanNetworkTrafficFraction('vsan_osa_raid1_ftt2', 0, 5)).toBeCloseTo(2.0, 5)
  })

  it('treats reads as mostly remote on a distributed cluster ((N-1)/N)', () => {
    // 100% read, 5 nodes → 4/5 of reads come from remote nodes
    expect(getVsanNetworkTrafficFraction('vsan_esa_raid5', 100, 5)).toBeCloseTo(0.8, 5)
  })

  it('blends read and write fractions for a mixed workload', () => {
    // 70% read, EC raid5 (egress 1.0), 5 nodes: 0.3×1.0 + 0.7×0.8 = 0.86
    expect(getVsanNetworkTrafficFraction('vsan_esa_raid5', 70, 5)).toBeCloseTo(0.86, 5)
  })

  it('floors the fraction at 0.1 to avoid divide-by-zero (single node, all reads)', () => {
    expect(getVsanNetworkTrafficFraction('vsan_esa_raid5', 100, 1)).toBeCloseTo(0.1, 5)
  })

  it('falls back to egress 1.0 for an unknown level', () => {
    expect(getVsanNetworkTrafficFraction('not_a_real_level', 0, 4)).toBeCloseTo(1.0, 5)
  })
})

describe('calculateNetworkLimits', () => {
  it('reproduces the legacy aggregate formula with the default (neutral) model', () => {
    const { bandwidth } = calculateNetworkLimits('100GbE', 5, BLOCK_64K)
    expect(bandwidth).toBeCloseTo(12_500 * 5, 5)
  })

  it('applies duplex, compression and traffic-fraction refinements', () => {
    const model = { duplex: 2, compressionRatio: 1.5, trafficFraction: 0.86 }
    const { bandwidth } = calculateNetworkLimits('100GbE', 5, BLOCK_64K, model)
    expect(bandwidth).toBeCloseTo((12_500 * 5 * 2 * 1.5) / 0.86, 3)
  })

  it('derives IOPS from bandwidth and block size', () => {
    const { bandwidth, iops } = calculateNetworkLimits('100GbE', 5, BLOCK_64K)
    expect(iops).toBeCloseTo((bandwidth * 1024 * 1024) / BLOCK_64K, 3)
  })

  it('defaults unknown network speeds to 10GbE', () => {
    const { bandwidth } = calculateNetworkLimits('999GbE', 1, BLOCK_64K)
    expect(bandwidth).toBeCloseTo(1250, 5)
  })
})
