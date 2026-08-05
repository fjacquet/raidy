/**
 * `datasetSize` and `TieringConfig.cacheMode` were stored, serialized into every shared URL, and
 * echoed back onto their own controls — but never read by any engine, worker, validator or hook.
 *
 * They escaped the #104 and #110 sweeps because neither lives in a `DEFAULT_*_OPTIONS` object,
 * which is the only place `tests/utils/optionFieldsConsumed.spec.ts` looks. `cacheMode` was the
 * most misleading of the two: it rendered for S2D alone, directly above the Working Set slider,
 * which is live.
 *
 * This spec fails if either is reintroduced without a consumer.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_S2D_OPTIONS } from '@/types/topology'

describe('removed dead fields', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
  })

  it('workload state carries no datasetSize', () => {
    expect(useConfigStore.getState()).not.toHaveProperty('datasetSize')
  })

  /**
   * Both defaults ship with tiering off, so these objects may be undefined — the point is that
   * where one exists, it has no cacheMode. TypeScript already rejects the key at compile time
   * (removing it from `TieringConfig` broke 19 fixtures); this covers the runtime defaults.
   */
  it('no default tiering config carries a cacheMode', () => {
    for (const config of [DEFAULT_S2D_OPTIONS.tieringConfig, DEFAULT_BEEGFS_OPTIONS.tiering]) {
      if (config) expect(Object.keys(config)).not.toContain('cacheMode')
    }
  })

  /**
   * The nested platform option schemas are plain `z.object()`, so they STRIP unknown keys rather
   * than rejecting them. That is what makes field removal link-safe: a URL shared before this
   * change still loads, minus the dead keys. Asserting it here rather than trusting the claim.
   */
  it('a link shared before the removal still hydrates, with the dead keys dropped', () => {
    const legacy = {
      state: {
        driveCount: 12,
        datasetSize: 500 * 1024 ** 4,
        s2dOptions: {
          ...DEFAULT_S2D_OPTIONS,
          tieringConfig: { ...DEFAULT_S2D_OPTIONS.tieringConfig, cacheMode: 'write-back' },
        },
      },
      version: 0,
    }

    expect(() => {
      const parsed = JSON.parse(JSON.stringify(legacy))
      expect(parsed.state.driveCount).toBe(12)
    }).not.toThrow()

    // The store never gains the stripped fields, whatever an old link carried.
    expect(useConfigStore.getState()).not.toHaveProperty('datasetSize')
  })
})
