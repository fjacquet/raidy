/**
 * Tests for RAID volumetry strategy.
 *
 * Validates RAID capacity calculations against industry-standard formulas
 * from WintelGuy RAID Calculator.
 */

import { describe, expect, it } from 'vitest'
import { raidStrategy } from '@/engines/volumetry/strategies/raid'

describe('RAID Volumetry Strategy', () => {
  describe('RAID 0', () => {
    it('should return 100% efficiency (no redundancy)', () => {
      expect(raidStrategy.calculateDataFraction('RAID0', 4)).toBe(1.0)
      expect(raidStrategy.calculateDataFraction('RAID0', 8)).toBe(1.0)
    })
  })

  describe('RAID 1', () => {
    it('should return 50% efficiency (2-way mirror)', () => {
      expect(raidStrategy.calculateDataFraction('RAID1', 2)).toBe(0.5)
      expect(raidStrategy.calculateDataFraction('RAID1', 4)).toBe(0.5)
    })
  })

  describe('RAID 1E', () => {
    it('should return 50% efficiency (mirrored striping)', () => {
      expect(raidStrategy.calculateDataFraction('RAID1E', 4)).toBe(0.5)
      expect(raidStrategy.calculateDataFraction('RAID1E', 6)).toBe(0.5)
    })
  })

  describe('RAID 1 (3-way)', () => {
    it('should return 33.3% efficiency (triple mirror)', () => {
      expect(raidStrategy.calculateDataFraction('RAID1_3WAY', 3)).toBe(1 / 3)
      expect(raidStrategy.calculateDataFraction('RAID1_3WAY', 6)).toBe(1 / 3)
    })
  })

  describe('RAID 3', () => {
    it('should calculate (n-1)/n efficiency (byte-level striping with dedicated parity)', () => {
      expect(raidStrategy.calculateDataFraction('RAID3', 4)).toBe(3 / 4) // 75%
      expect(raidStrategy.calculateDataFraction('RAID3', 8)).toBe(7 / 8) // 87.5%
    })
  })

  describe('RAID 4', () => {
    it('should calculate (n-1)/n efficiency (block-level striping with dedicated parity)', () => {
      expect(raidStrategy.calculateDataFraction('RAID4', 5)).toBe(4 / 5) // 80%
      expect(raidStrategy.calculateDataFraction('RAID4', 10)).toBe(9 / 10) // 90%
    })
  })

  describe('RAID 5', () => {
    it('should calculate (n-1)/n efficiency (distributed parity)', () => {
      expect(raidStrategy.calculateDataFraction('RAID5', 3)).toBe(2 / 3) // 66.7%
      expect(raidStrategy.calculateDataFraction('RAID5', 6)).toBeCloseTo(5 / 6, 5) // 83.3%
      expect(raidStrategy.calculateDataFraction('RAID5', 12)).toBeCloseTo(11 / 12, 5) // 91.7%
    })
  })

  describe('RAID 5E', () => {
    it('should calculate (n-2)/n efficiency (RAID 5 + integrated distributed hot spare)', () => {
      expect(raidStrategy.calculateDataFraction('RAID5E', 6)).toBe(4 / 6) // 66.7%
      expect(raidStrategy.calculateDataFraction('RAID5E', 8)).toBe(6 / 8) // 75%
    })
  })

  describe('RAID 5EE', () => {
    it('should calculate (n-2)/n efficiency (RAID 5 + active hot spare)', () => {
      expect(raidStrategy.calculateDataFraction('RAID5EE', 6)).toBe(4 / 6) // 66.7%
      expect(raidStrategy.calculateDataFraction('RAID5EE', 10)).toBe(8 / 10) // 80%
    })
  })

  describe('RAID 6', () => {
    it('should calculate (n-2)/n efficiency (dual distributed parity)', () => {
      expect(raidStrategy.calculateDataFraction('RAID6', 4)).toBe(2 / 4) // 50%
      expect(raidStrategy.calculateDataFraction('RAID6', 8)).toBe(6 / 8) // 75%
      expect(raidStrategy.calculateDataFraction('RAID6', 12)).toBeCloseTo(10 / 12, 5) // 83.3%
    })
  })

  describe('RAID 10', () => {
    it('should return 50% efficiency (mirrored stripes)', () => {
      expect(raidStrategy.calculateDataFraction('RAID10', 4)).toBe(0.5)
      expect(raidStrategy.calculateDataFraction('RAID10', 8)).toBe(0.5)
    })
  })

  describe('RAID 50', () => {
    it('should calculate (n-groups)/n efficiency with 2 groups', () => {
      // 2 groups = 2 parity drives
      expect(raidStrategy.calculateDataFraction('RAID50', 6, { serverCount: 2 })).toBe(4 / 6) // 66.7%
      expect(raidStrategy.calculateDataFraction('RAID50', 12, { serverCount: 2 })).toBeCloseTo(
        10 / 12,
        5,
      ) // 83.3%
    })

    it('should calculate (n-groups)/n efficiency with 3 groups', () => {
      // 3 groups = 3 parity drives
      expect(raidStrategy.calculateDataFraction('RAID50', 12, { serverCount: 3 })).toBe(9 / 12) // 75%
      expect(raidStrategy.calculateDataFraction('RAID50', 24, { serverCount: 3 })).toBeCloseTo(
        21 / 24,
        5,
      ) // 87.5%
    })

    it('should default to 1 group when serverCount not provided', () => {
      // 1 group = RAID 5 equivalent
      expect(raidStrategy.calculateDataFraction('RAID50', 6)).toBe(5 / 6) // 83.3%
    })
  })

  describe('RAID 60', () => {
    it('should calculate (n-groups*2)/n efficiency with 2 groups', () => {
      // 2 groups = 4 parity drives
      expect(raidStrategy.calculateDataFraction('RAID60', 8, { serverCount: 2 })).toBe(4 / 8) // 50%
      expect(raidStrategy.calculateDataFraction('RAID60', 12, { serverCount: 2 })).toBeCloseTo(
        8 / 12,
        5,
      ) // 66.7%
    })

    it('should calculate (n-groups*2)/n efficiency with 3 groups', () => {
      // 3 groups = 6 parity drives
      expect(raidStrategy.calculateDataFraction('RAID60', 12, { serverCount: 3 })).toBe(6 / 12) // 50%
      expect(raidStrategy.calculateDataFraction('RAID60', 24, { serverCount: 3 })).toBeCloseTo(
        18 / 24,
        5,
      ) // 75%
    })

    it('should default to 1 group when serverCount not provided', () => {
      // 1 group = RAID 6 equivalent
      expect(raidStrategy.calculateDataFraction('RAID60', 8)).toBe(6 / 8) // 75%
    })
  })

  describe('Unknown RAID level', () => {
    it('should return 100% efficiency for unknown levels (graceful fallback)', () => {
      expect(raidStrategy.calculateDataFraction('RAID99' as unknown as string, 6)).toBe(1.0)
      expect(raidStrategy.calculateDataFraction('UNKNOWN' as unknown as string, 8)).toBe(1.0)
    })
  })

  describe('Edge cases', () => {
    it('should handle single drive RAID 0', () => {
      expect(raidStrategy.calculateDataFraction('RAID0', 1)).toBe(1.0)
    })

    it('should handle minimum drives for RAID levels', () => {
      // RAID 5 minimum: 3 drives
      expect(raidStrategy.calculateDataFraction('RAID5', 3)).toBe(2 / 3)

      // RAID 6 minimum: 4 drives
      expect(raidStrategy.calculateDataFraction('RAID6', 4)).toBe(2 / 4)

      // RAID 10 minimum: 4 drives
      expect(raidStrategy.calculateDataFraction('RAID10', 4)).toBe(0.5)
    })

    it('should handle large drive counts', () => {
      // RAID 5 with 24 drives: 95.8% efficiency
      expect(raidStrategy.calculateDataFraction('RAID5', 24)).toBeCloseTo(23 / 24, 5)

      // RAID 6 with 24 drives: 91.7% efficiency
      expect(raidStrategy.calculateDataFraction('RAID6', 24)).toBeCloseTo(22 / 24, 5)
    })
  })

  describe('No overhead calculation', () => {
    it('should not implement calculateOverhead (RAID has no additional overhead)', () => {
      expect(raidStrategy.calculateOverhead).toBeUndefined()
    })
  })
})
