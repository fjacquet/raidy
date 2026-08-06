/**
 * The neutral workload defaults, pinned.
 *
 * These values are not free to drift: `partialize` runs `omitDefaults`, so any field left at its
 * default is absent from the shared URL and is restored from whatever the default happens to be
 * at read time. Changing one silently rewrites every link that never touched that field — which
 * is why this test exists to make the change deliberate and to date it against a version bump.
 */

import { describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('neutral workload defaults', () => {
  it('starts at the parallel-filesystem neutral, not the general-purpose one', () => {
    useConfigStore.getState().resetToDefaults()
    const state = useConfigStore.getState()

    expect(state.readPercent).toBe(60)
    expect(state.randomPercent).toBe(25)
    expect(state.blockSize).toBe('512K')
    expect(state.dailyWriteVolume).toBe(1024 ** 4) // 1 TB, unchanged
  })
})
