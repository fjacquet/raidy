/**
 * Four hand-written lists described the same field set and drifted:
 * `performanceThreshold` was missing from both `partialize` and `ConfigStateSchema`, so it reset
 * on every shared link while every other setting survived (#63).
 *
 * These assertions force a decision. A newly added setting fails this test until someone puts it
 * in PERSISTED_KEYS or EPHEMERAL_KEYS — it can no longer vanish from a shared link by omission.
 */

import { describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'
import { EPHEMERAL_KEYS, PERSISTED_KEYS } from '@/store/persistedKeys'
import { ConfigStateSchema } from '@/utils/schemas'

/** Settings, not actions — an action is a function, a setting never is. */
function configKeysOfLiveStore(): string[] {
  return Object.entries(useConfigStore.getState())
    .filter(([, value]) => typeof value !== 'function')
    .map(([key]) => key)
}

describe('persisted-key parity', () => {
  it('classifies every configuration field exactly once', () => {
    const declared = [...PERSISTED_KEYS, ...EPHEMERAL_KEYS].sort()
    expect(declared).toEqual(configKeysOfLiveStore().sort())
  })

  it('keeps the two lists disjoint', () => {
    const overlap = PERSISTED_KEYS.filter((key) =>
      (EPHEMERAL_KEYS as readonly string[]).includes(key),
    )
    expect(overlap).toEqual([])
  })

  it('matches the URL schema field for field', () => {
    expect([...PERSISTED_KEYS].sort()).toEqual(Object.keys(ConfigStateSchema.shape).sort())
  })

  it('persists performanceThreshold', () => {
    expect(PERSISTED_KEYS).toContain('performanceThreshold')
  })
})

import { urlHashStorage } from '@/store/urlStorage'

describe('performanceThreshold round trip', () => {
  const stateKey = 'raidy'

  it('survives a shared link', () => {
    window.location.hash = ''
    useConfigStore.getState().resetToDefaults()
    useConfigStore.getState().setPerformanceThreshold(0.7)

    // partialize + createJSONStorage is what writes the hash; read it back the same way.
    const written = urlHashStorage.getItem(stateKey)
    expect(written).not.toBeNull()
    expect(JSON.parse(written as string).state.performanceThreshold).toBe(0.7)
  })
})
