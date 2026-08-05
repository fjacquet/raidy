/**
 * Unit tests for the network bottleneck model used by the performance engine.
 *
 * Covers the vSAN traffic-fraction estimate, the BeeGFS per-platform network model,
 * and the backward-compatible network-limit calculation (neutral default must
 * reproduce the legacy formula).
 */

import { describe, expect, it } from 'vitest'
import {
  calculateNetworkLimits,
  chainMinThroughput,
  getVsanNetworkTrafficFraction,
  NETWORK_MODEL_BY_TOPOLOGY,
  resolveNetworkModel,
} from '@/engines/performance/utils/bottleneck-chain'
import type { BottleneckLayer } from '@/types/results'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types/topology'

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

  // `networkSpeed` is `NetworkSpeed` (closed union, Important 4), so an unknown speed is now a
  // compile-time error, not a runtime fallback — `NETWORK_SPEED_MBS` is `Record<NetworkSpeed,
  // number>` and exhaustive by construction. The `?? 1250` runtime fallback this test used to
  // cover was removed as unreachable; there is no longer a runtime path to exercise here.
})

describe('resolveNetworkModel', () => {
  it('has no entry for platforms without a network model refinement (e.g. standard RAID)', () => {
    expect(NETWORK_MODEL_BY_TOPOLOGY.standard).toBeUndefined()
    expect(
      resolveNetworkModel('standard', { level: 'RAID6', readPercent: 50, serverCount: 1 }),
    ).toBeUndefined()
  })

  describe('BeeGFS', () => {
    it('resolves to exactly the neutral default (fraction 1.0) without buddy mirroring', () => {
      const model = resolveNetworkModel('beegfs', {
        level: 'beegfs_raid6',
        readPercent: 30,
        serverCount: 4,
        beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: false },
      })
      expect(model).toEqual({ duplex: 1, compressionRatio: 1, trafficFraction: 1.0 })
    })

    it('resolves to the neutral default even with no beeGfsOptions at all', () => {
      const model = resolveNetworkModel('beegfs', {
        level: 'beegfs_raid6',
        readPercent: 70,
        serverCount: 4,
      })
      expect(model).toEqual({ duplex: 1, compressionRatio: 1, trafficFraction: 1.0 })
    })

    it('doubles the write traffic fraction when storage buddy mirroring is on', () => {
      // 80% write, 20% read, buddy on: 0.8 × 2 + 0.2 × 1 = 1.8
      const model = resolveNetworkModel('beegfs', {
        level: 'beegfs_raid6',
        readPercent: 20,
        serverCount: 4,
        beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: true },
      })
      expect(model?.trafficFraction).toBeCloseTo(1.8, 5)
    })

    it('is network-limited earlier with buddy mirroring on than off, for the same write-heavy workload', () => {
      const ctxBase = { level: 'beegfs_raid6', readPercent: 10, serverCount: 4 }
      const modelOff = resolveNetworkModel('beegfs', {
        ...ctxBase,
        beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: false },
      })
      const modelOn = resolveNetworkModel('beegfs', {
        ...ctxBase,
        beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: true },
      })
      expect(modelOff).toBeDefined()
      expect(modelOn).toBeDefined()

      const limitsOff = calculateNetworkLimits('100GbE', 4, BLOCK_64K, modelOff)
      const limitsOn = calculateNetworkLimits('100GbE', 4, BLOCK_64K, modelOn)

      // Higher traffic fraction -> lower effective bandwidth ceiling -> hits the
      // network bottleneck at a lower throughput than the no-buddy configuration.
      expect(limitsOn.bandwidth).toBeLessThan(limitsOff.bandwidth)
    })

    it('bottoms out at exactly 1.0 — the 0.1 floor is never the binding constraint', () => {
      // The previous version of this test asserted `>= 0.1` against a model whose minimum over
      // ALL inputs is 1.0, so it could not fail. Assert the reachable minimum instead: since
      // readRatio + writeRatio = 1 and both amplifications are >= 1, the fraction is 1.0 at
      // every read/write mix without buddy mirroring, and >= 1.0 with it. Any mutation that
      // dropped an amplification below 1, or let the 0.1 floor bind, fails here.
      const fractions: number[] = []
      for (const storageBuddyMirror of [false, true]) {
        for (let readPercent = 0; readPercent <= 100; readPercent += 5) {
          const model = resolveNetworkModel('beegfs', {
            level: 'beegfs_raid6',
            readPercent,
            serverCount: 4,
            beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror },
          })
          fractions.push(model?.trafficFraction ?? Number.NaN)
        }
      }
      expect(Math.min(...fractions)).toBe(1)
      expect(Math.max(...fractions)).toBe(2) // 100% writes with buddy mirroring
    })
  })
})

/**
 * `chainMinThroughput` is the shared derivation behind BOTH the burst and sustained bottleneck
 * figures (#127). Before it existed, the sustained path spelled the chain out again with its own
 * `isNvmeDirect` ternary — so which links belong to the chain was a fact stated in two places.
 *
 * These tests pin the two properties that make sharing safe: the media figure is substituted
 * (not merged with the layer's own), and chain membership comes from the array alone.
 */
describe('chainMinThroughput (#127)', () => {
  const layer = (name: string, throughputMBs: number): BottleneckLayer => ({
    name,
    throughputMBs,
    iops: 0,
    isBottleneck: false,
    utilization: 0,
  })

  it('reproduces a plain min over the array when passed the media layer’s own figure', () => {
    const media = layer('Media (Drives)', 15000)
    const layers = [media, layer('Controller', 9000), layer('PCIe', 63008), layer('Network', 50000)]
    expect(chainMinThroughput(layers, media, media.throughputMBs)).toBe(
      Math.min(...layers.map((l) => l.throughputMBs)),
    )
  })

  /**
   * Substitution, not merging — a contract test rather than a live-bug test, and worth being
   * precise about which.
   *
   * Every fast-tier model in the engine today yields a sustained media figure at or below the
   * burst one, so `Math.min(sustained, ...allLayers)` and `Math.min(sustained, ...infraLayers)`
   * agree on real inputs: mutating the helper to merge leaves `sustained-write-throughput.spec.ts`
   * entirely green (verified). What the merge form would break is a model whose sustained figure
   * exceeds the burst media layer — the media layer would then clamp a figure it has no business
   * bounding. Pinning it here costs four lines and means the next fast-tier model does not have
   * to rediscover the rule.
   */
  it('replaces the media figure rather than taking the lower of the two', () => {
    const media = layer('Media (Drives)', 15000)
    const layers = [media, layer('Controller', 9000)]
    // A sustained figure BELOW the burst one must win...
    expect(chainMinThroughput(layers, media, 105)).toBe(105)
    // ...and one ABOVE it must not be dragged back down to 15000 by the media layer itself;
    // the controller, a real chain link, is what binds.
    expect(chainMinThroughput(layers, media, 40000)).toBe(9000)
  })

  it('takes chain membership from the array, so a missing controller (vSAN ESA) simply is not there', () => {
    const media = layer('Media (Drives)', 15000)
    const controller = layer('Controller', 9000)
    const withController = [media, controller, layer('PCIe', 63008)]
    const nvmeDirect = [media, layer('PCIe', 63008)]

    expect(chainMinThroughput(withController, media, 40000)).toBe(9000)
    expect(chainMinThroughput(nvmeDirect, media, 40000)).toBe(40000)
  })

  it('handles a chain with no infra layers at all — the media figure passes through', () => {
    const media = layer('Media (Drives)', 15000)
    expect(chainMinThroughput([media], media, 105)).toBe(105)
  })
})
