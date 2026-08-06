/**
 * `resetToDefaults()` is `set(getDefaultState())`, and zustand's `set` merges — so any field
 * missing from `getDefaultState()` keeps its current value instead of resetting. Three fields
 * lived only in their slices' initial state and were therefore never reset:
 * `performanceThreshold`, `driveConnectivity` and `driveFormFactor`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('resetToDefaults', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
  })

  it('resets fields that live only in their slice', () => {
    const store = useConfigStore.getState()
    store.setPerformanceThreshold(0.6)
    store.setDriveConnectivity('nvme')
    store.setDriveFormFactor('u.2')

    expect(useConfigStore.getState().performanceThreshold).toBe(0.6)
    expect(useConfigStore.getState().driveConnectivity).toBe('nvme')

    useConfigStore.getState().resetToDefaults()

    const after = useConfigStore.getState()
    expect(after.performanceThreshold).toBe(1.0)
    expect(after.driveConnectivity).toBe('all')
    expect(after.driveFormFactor).toBe('all')
  })

  it('still resets the fields it always did', () => {
    useConfigStore.getState().setDriveCount(99)
    useConfigStore.getState().setReadPercent(10)

    useConfigStore.getState().resetToDefaults()

    const after = useConfigStore.getState()
    expect(after.driveCount).toBe(12)
    expect(after.readPercent).toBe(60)
  })

  it('installs fresh option objects rather than sharing one reference', () => {
    useConfigStore.getState().resetToDefaults()
    const first = useConfigStore.getState().zfsOptions

    useConfigStore.getState().resetToDefaults()
    const second = useConfigStore.getState().zfsOptions

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
