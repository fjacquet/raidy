/**
 * Tests for useCalculations hook error handling and logging.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as performanceEngine from '@/engines/performance'
import * as sustainabilityEngine from '@/engines/sustainability'
import * as volumetryEngine from '@/engines/volumetry'
import { useCalculations } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'
import type { ConfigStore } from '@/store/configStore'

describe('useCalculations error handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset store to default state
    useConfigStore.setState({
      driveId: 'seagate-exos-x20-20tb',
      driveCount: 8,
      serverCount: 1,
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 1,
    } as Partial<ConfigStore>)

    // Spy on console.error to verify logging
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('volumetry engine errors', () => {
    it('should log error with context when volumetry calculation fails', () => {
      // Mock volumetry engine to throw error
      vi.spyOn(volumetryEngine, 'calculateVolumetry').mockImplementation(() => {
        throw new Error('Division by zero in RAID calculation')
      })

      const { result } = renderHook(() => useCalculations())

      // Verify console.error was called with structured logging
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Volumetry Engine Error]',
        expect.objectContaining({
          message: 'Division by zero in RAID calculation',
          context: expect.objectContaining({
            driveId: 'seagate-exos-x20-20tb',
            driveCount: 8,
            serverCount: 1,
            topology: 'standard',
            level: 'RAID6',
          }),
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        }),
      )

      // Verify safe fallback state returned
      expect(result.current.volumetry).toEqual({
        rawCapacity: 0,
        parityOverhead: 0,
        hotSpareOverhead: 0,
        filesystemOverhead: 0,
        slopOverhead: 0,
        usableCapacity: 0,
        effectiveCapacity: 0,
        efficiency: 0,
        breakdown: [],
      })

      // Verify error added to errors array
      expect(result.current.errors).toContain('Volumetry calculation failed')
    })

    it('should handle non-Error thrown values', () => {
      // Mock volumetry engine to throw non-Error value
      vi.spyOn(volumetryEngine, 'calculateVolumetry').mockImplementation(() => {
        throw 'String error'
      })

      const { result } = renderHook(() => useCalculations())

      // Verify logging handled non-Error value
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Volumetry Engine Error]',
        expect.objectContaining({
          message: 'Unknown error',
        }),
      )

      // Verify calculation continues
      expect(result.current.volumetry.efficiency).toBe(0)
    })
  })

  describe('performance engine errors', () => {
    it('should log error with context when performance calculation fails', () => {
      // Mock performance engine to throw error
      vi.spyOn(performanceEngine, 'calculatePerformance').mockImplementation(() => {
        throw new Error('Invalid write penalty multiplier')
      })

      const { result } = renderHook(() => useCalculations())

      // Verify console.error was called with structured logging
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Performance Engine Error]',
        expect.objectContaining({
          message: 'Invalid write penalty multiplier',
          context: expect.objectContaining({
            driveId: 'seagate-exos-x20-20tb',
            driveCount: 8,
            serverCount: 1,
            topology: 'standard',
            level: 'RAID6',
          }),
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        }),
      )

      // Verify safe fallback state returned
      expect(result.current.performance).toEqual({
        maxReadThroughputMBs: 0,
        maxWriteThroughputMBs: 0,
        maxReadIOPS: 0,
        maxWriteIOPS: 0,
        layers: [],
        bottleneckDescription: 'Performance calculation failed',
      })

      // Verify error added to errors array
      expect(result.current.errors).toContain('Performance calculation failed')
    })
  })

  describe('sustainability engine errors', () => {
    it('should log error with context when sustainability calculation fails', () => {
      // Mock sustainability engine to throw error
      vi.spyOn(sustainabilityEngine, 'calculateSustainability').mockImplementation(() => {
        throw new Error('Invalid carbon region')
      })

      const { result } = renderHook(() => useCalculations())

      // Verify console.error was called with structured logging
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sustainability Engine Error]',
        expect.objectContaining({
          message: 'Invalid carbon region',
          context: expect.objectContaining({
            driveId: 'seagate-exos-x20-20tb',
            driveCount: 8,
            serverCount: 1,
          }),
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        }),
      )

      // Verify safe fallback state returned
      expect(result.current.sustainability).toEqual({
        annualEnergyKwh: 0,
        annualEnergyCost: 0,
        annualCO2Kg: 0,
        powerBreakdown: { drives: 0, servers: 0, cooling: 0, total: 0 },
      })

      // Verify error added to errors array
      expect(result.current.errors).toContain('Sustainability calculation failed')
    })
  })

  describe('multiple engine failures', () => {
    it('should continue calculating other engines when one fails', () => {
      // Mock only volumetry to fail
      vi.spyOn(volumetryEngine, 'calculateVolumetry').mockImplementation(() => {
        throw new Error('Volumetry failed')
      })

      const { result } = renderHook(() => useCalculations())

      // Verify volumetry failed but other engines ran
      expect(result.current.volumetry.efficiency).toBe(0)
      expect(result.current.errors).toContain('Volumetry calculation failed')

      // Performance and sustainability should have calculated successfully
      // (they won't throw because we only mocked volumetry)
      expect(result.current.performance).toBeDefined()
      expect(result.current.sustainability).toBeDefined()
    })

    it('should log errors for all failing engines', () => {
      // Mock all engines to fail
      vi.spyOn(volumetryEngine, 'calculateVolumetry').mockImplementation(() => {
        throw new Error('Volumetry failed')
      })
      vi.spyOn(performanceEngine, 'calculatePerformance').mockImplementation(() => {
        throw new Error('Performance failed')
      })
      vi.spyOn(sustainabilityEngine, 'calculateSustainability').mockImplementation(() => {
        throw new Error('Sustainability failed')
      })

      const { result } = renderHook(() => useCalculations())

      // Verify all three errors logged
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3)
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Volumetry Engine Error]', expect.any(Object))
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Performance Engine Error]', expect.any(Object))
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sustainability Engine Error]',
        expect.any(Object),
      )

      // Verify all errors in array
      expect(result.current.errors).toHaveLength(3)
      expect(result.current.errors).toContain('Volumetry calculation failed')
      expect(result.current.errors).toContain('Performance calculation failed')
      expect(result.current.errors).toContain('Sustainability calculation failed')
    })
  })

  describe('timestamp format', () => {
    it('should include ISO 8601 timestamp in error logs', () => {
      vi.spyOn(volumetryEngine, 'calculateVolumetry').mockImplementation(() => {
        throw new Error('Test error')
      })

      renderHook(() => useCalculations())

      const errorCall = consoleErrorSpy.mock.calls[0][1]
      expect(errorCall.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
  })
})
