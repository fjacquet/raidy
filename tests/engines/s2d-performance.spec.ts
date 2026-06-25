/**
 * S2D Performance Strategy Tests
 *
 * Locks in the per-copy mirror write penalty: a mirror write fans out to one
 * backend write per copy, so the penalty equals mirrorCopies (2-way = 2x, 3-way = 3x).
 * MAP applies a small parity surcharge on top of the mirror-tier penalty (mirrorCopies + 0.5).
 */

import { describe, expect, it } from 'vitest'
import { s2dPerformanceStrategy } from '@/engines/performance/strategies/s2d'

describe('S2D Performance Strategy - getWritePenalty', () => {
  it('two-way mirror has a 2.0x write penalty (one backend write per copy)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('mirror', { mirrorCopies: 2 })).toBe(2.0)
  })

  it('three-way mirror has a 3.0x write penalty (one backend write per copy)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('mirror', { mirrorCopies: 3 })).toBe(3.0)
  })

  it('simple (no redundancy) has a 1.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('simple')).toBe(1.0)
  })

  it('single parity has a 3.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('parity')).toBe(3.0)
  })

  it('dual parity has a 4.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('dual_parity')).toBe(4.0)
  })

  it('MAP with a two-way mirror tier has a 2.5x write penalty (mirrorCopies + 0.5)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('map', { mirrorCopies: 2 })).toBe(2.5)
  })

  it('MAP with a three-way mirror tier has a 3.5x write penalty (mirrorCopies + 0.5)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('map', { mirrorCopies: 3 })).toBe(3.5)
  })
})
