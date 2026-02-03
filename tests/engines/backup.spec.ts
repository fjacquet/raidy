/**
 * Backup Engine Tests
 *
 * Validates backup storage requirement calculations.
 * Reference: Issue #8 specifies:
 *   - dailyChange = usableCapacity × (dailyChangeRate / 100)
 *   - incrementalRaw = dailyChange × backupRetention
 *   - totalRaw = incrementalRaw + fullRaw
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { calculateBackup } from '@/engines/backup'

describe('Backup Engine', () => {
  describe('Basic calculations', () => {
    it('should calculate daily change correctly', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000, // 1 TB
        dailyChangeRate: 5, // 5%
        backupRetention: 14,
      })

      // 1TB * 5% = 50GB daily change
      expect(result.dailyChange).toBe(50_000_000_000)
    })

    it('should calculate incremental storage correctly', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000, // 1 TB
        dailyChangeRate: 5, // 5%
        backupRetention: 14,
      })

      // 50GB * 14 days = 700GB
      expect(result.incrementalRaw).toBe(700_000_000_000)
    })

    it('should return fullRaw as 0 (v1 feature)', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 5,
        backupRetention: 14,
      })

      expect(result.fullRaw).toBe(0)
    })

    it('should calculate totalRaw as sum of incremental and full', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 5,
        backupRetention: 14,
      })

      expect(result.totalRaw).toBe(result.incrementalRaw + result.fullRaw)
    })

    it('should match acceptance criteria example: 100TB × 5% × 14d ≈ 70TB', () => {
      const result = calculateBackup({
        usableCapacity: 100_000_000_000_000, // 100 TB
        dailyChangeRate: 5,
        backupRetention: 14,
      })

      // 100TB * 5% = 5TB daily change
      // 5TB * 14 days = 70TB
      expect(result.totalRaw).toBe(70_000_000_000_000)
    })
  })

  describe('Edge cases', () => {
    it('should handle 0% change rate', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 0,
        backupRetention: 14,
      })

      expect(result.dailyChange).toBe(0)
      expect(result.totalRaw).toBe(0)
    })

    it('should handle 100% change rate', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000, // 1 TB
        dailyChangeRate: 100,
        backupRetention: 14,
      })

      // 1TB * 100% * 14 days = 14TB
      expect(result.totalRaw).toBe(14_000_000_000_000)
    })

    it('should handle 0 usable capacity', () => {
      const result = calculateBackup({
        usableCapacity: 0,
        dailyChangeRate: 5,
        backupRetention: 14,
      })

      expect(result.totalRaw).toBe(0)
    })

    it('should enforce minimum 1 day retention', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 5,
        backupRetention: 0,
      })

      expect(result.retentionDays).toBe(1)
    })

    it('should clamp negative usable capacity to 0', () => {
      const result = calculateBackup({
        usableCapacity: -1_000_000_000_000,
        dailyChangeRate: 5,
        backupRetention: 14,
      })

      expect(result.dailyChange).toBe(0)
      expect(result.totalRaw).toBe(0)
    })

    it('should clamp change rate above 100 to 100', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 150,
        backupRetention: 14,
      })

      expect(result.changeRatePercent).toBe(100)
    })

    it('should clamp negative change rate to 0', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: -5,
        backupRetention: 14,
      })

      expect(result.changeRatePercent).toBe(0)
      expect(result.dailyChange).toBe(0)
    })
  })

  describe('Metadata fields', () => {
    it('should include retention days in result', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 5,
        backupRetention: 30,
      })

      expect(result.retentionDays).toBe(30)
    })

    it('should include change rate percent in result', () => {
      const result = calculateBackup({
        usableCapacity: 1_000_000_000_000,
        dailyChangeRate: 7.5,
        backupRetention: 14,
      })

      expect(result.changeRatePercent).toBe(7.5)
    })
  })

  describe('Property-based tests', () => {
    it('should always return non-negative values', () => {
      fc.assert(
        fc.property(
          fc.nat(10_000_000_000_000), // usableCapacity 0-10TB
          fc.integer({ min: 0, max: 100 }), // dailyChangeRate
          fc.integer({ min: 1, max: 365 }), // backupRetention
          (usableCapacity, dailyChangeRate, backupRetention) => {
            const result = calculateBackup({
              usableCapacity,
              dailyChangeRate,
              backupRetention,
            })

            return (
              result.dailyChange >= 0 &&
              result.incrementalRaw >= 0 &&
              result.fullRaw >= 0 &&
              result.totalRaw >= 0
            )
          },
        ),
      )
    })

    it('should maintain totalRaw = incrementalRaw + fullRaw invariant', () => {
      fc.assert(
        fc.property(
          fc.nat(10_000_000_000_000),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 365 }),
          (usableCapacity, dailyChangeRate, backupRetention) => {
            const result = calculateBackup({
              usableCapacity,
              dailyChangeRate,
              backupRetention,
            })

            return result.totalRaw === result.incrementalRaw + result.fullRaw
          },
        ),
      )
    })

    it('should maintain incrementalRaw = dailyChange × retentionDays', () => {
      fc.assert(
        fc.property(
          fc.nat(10_000_000_000_000),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 1, max: 365 }),
          (usableCapacity, dailyChangeRate, backupRetention) => {
            const result = calculateBackup({
              usableCapacity,
              dailyChangeRate,
              backupRetention,
            })

            return result.incrementalRaw === result.dailyChange * result.retentionDays
          },
        ),
      )
    })
  })
})
