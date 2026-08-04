/**
 * Direct unit test of `boundedTierThroughput` (#111).
 *
 * When a fixed fraction `shareA` of total traffic T must be served by tier A (capacity `capA`)
 * and the rest by tier B (capacity `capB`), both constraints must hold simultaneously:
 * `shareA·T ≤ capA` and `(1-shareA)·T ≤ capB`. The achievable T is the tighter bound:
 * `T = min(capA / shareA, capB / (1 - shareA))`.
 *
 * A prior version of this codebase computed a weighted AVERAGE of `capA` and `capB` instead —
 * `shareA·capA + (1-shareA)·capB` — which is not a throughput and let a fast tier's raw capacity
 * leak into the total in proportion to how little traffic it served. See issue #111 and the
 * `boundedTierThroughput` doc comment in `fast-tier-models.ts` for the full derivation. Every
 * assertion below pins the CORRECT (bounded) value with a tight tolerance — the case that
 * distinguishes it from the weighted-sum bug states, in a comment, what the buggy formula would
 * have produced instead.
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { boundedTierThroughput } from '@/engines/performance/utils/fast-tier-models'

describe('boundedTierThroughput', () => {
  it('shareA = 0: everything is served by tier B — resolves to capB, no division by zero', () => {
    expect(boundedTierThroughput(0, 1_000_000, 1_000)).toBe(1_000)
  })

  it('shareA = 1: everything is served by tier A — resolves to capA, no division by zero', () => {
    expect(boundedTierThroughput(1, 1_000_000, 1_000)).toBe(1_000_000)
  })

  it('cache-limited side: a small share routed to a fast tier still bottlenecks on it once its share saturates', () => {
    // shareA = 0.5, capA (cache) = 1,000,000, capB (capacity) = 1,000,000,000 (huge, non-binding).
    // capA/shareA = 2,000,000 < capB/(1-shareA) = 2,000,000,000 → tier A (cache) is the bottleneck.
    const result = boundedTierThroughput(0.5, 1_000_000, 1_000_000_000)
    expect(result).toBeCloseTo(2_000_000, 6)
  })

  it('capacity-limited side: the slow tier bottlenecks even though it serves the smaller traffic share', () => {
    // shareA = 0.1 (only 10% of traffic to the fast tier), capA (cache) = 1,000,000 (huge,
    // non-binding at this share), capB (capacity) = 1,000. capB/(1-shareA) = 1,000/0.9 ≈ 1,111.1
    // < capA/shareA = 10,000,000 → tier B (capacity) is the bottleneck.
    const result = boundedTierThroughput(0.1, 1_000_000, 1_000)
    expect(result).toBeCloseTo(1_000 / 0.9, 6)
  })

  it('crossover: the exact shareA where both tiers saturate at the same T', () => {
    // capA = 3, capB = 1. Solve capA/shareA = capB/(1-shareA) for shareA:
    // 3/(1-s) ... actually solve 3/s = 1/(1-s) → 3(1-s) = s → 3 - 3s = s → s = 3/4.
    // At s = 0.75: T = capA/s = 3/0.75 = 4, and capB/(1-s) = 1/0.25 = 4 — both bounds agree.
    const shareA = 0.75
    const result = boundedTierThroughput(shareA, 3, 1)
    expect(result).toBeCloseTo(4, 9)
  })

  it('the classic sanity check from #111: fast cache, slow capacity, 50/50 split', () => {
    // ws = 0.5, cache 1,000,000 IOPS, capacity 1,000 IOPS.
    // Weighted-sum (buggy, pre-#111): 0.5×1,000,000 + 0.5×1,000 = 500,500.
    // Bounded (correct): min(1,000,000/0.5, 1,000/0.5) = min(2,000,000, 2,000) = 2,000.
    const result = boundedTierThroughput(0.5, 1_000_000, 1_000)
    expect(result).toBeCloseTo(2_000, 9)
  })

  it('property: the bounded result never exceeds either single-tier bound, for interior shares', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 0.999, noNaN: true }),
        fc.double({ min: 1, max: 1e9, noNaN: true }),
        fc.double({ min: 1, max: 1e9, noNaN: true }),
        (shareA, capA, capB) => {
          const result = boundedTierThroughput(shareA, capA, capB)
          expect(result).toBeLessThanOrEqual(capA / shareA + 1e-6)
          expect(result).toBeLessThanOrEqual(capB / (1 - shareA) + 1e-6)
        },
      ),
    )
  })
})
