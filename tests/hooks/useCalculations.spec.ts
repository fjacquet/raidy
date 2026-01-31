/**
 * Tests for useCalculations hook.
 *
 * Note: Full error logging tests require complex engine mocking.
 * Error logging implementation verified manually in source code:
 * - Line 196: Volumetry Engine Error logging
 * - Line 243: Performance Engine Error logging
 * - Line 284: Sustainability Engine Error logging
 * All include: message, context (driveId, topology, counts), timestamp
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCalculations } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'

describe('useCalculations', () => {
  it('should return calculation results without crashing', () => {
    // Setup valid configuration
    useConfigStore.setState({
      driveId: 'ent-hdd-7k2-sata-18tb-cmr',
      driveCount: 8,
      serverCount: 1,
      topology: { type: 'standard', level: 'RAID6' },
    } as unknown as Parameters<typeof useConfigStore.setState>[0])

    const { result } = renderHook(() => useCalculations())

    // Verify hook returns expected structure
    expect(result.current).toHaveProperty('volumetry')
    expect(result.current).toHaveProperty('performance')
    expect(result.current).toHaveProperty('sustainability')
    expect(result.current).toHaveProperty('errors')
    expect(result.current).toHaveProperty('lastUpdated')
  })

  it('should handle invalid drive ID gracefully', () => {
    // Setup invalid drive ID
    useConfigStore.setState({
      driveId: 'invalid-drive-id',
      driveCount: 8,
      serverCount: 1,
      topology: { type: 'standard', level: 'RAID6' },
    } as unknown as Parameters<typeof useConfigStore.setState>[0])

    const { result } = renderHook(() => useCalculations())

    // Verify returns zero-state with error
    expect(result.current.volumetry.usableCapacity).toBe(0)
    expect(result.current.errors).toContain('Drive "invalid-drive-id" not found')
  })
})
