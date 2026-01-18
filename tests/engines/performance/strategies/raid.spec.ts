/**
 * RAID Performance Strategy Tests
 *
 * Validates RAID write penalties and IOPS calculations against industry formulas.
 * Reference: MassiveGRID and WintelGuy calculators
 */

import { describe, expect, it } from 'vitest'
import { raidPerformanceStrategy } from '@/engines/performance/strategies/raid'

describe('RAID Performance Strategy', () => {
  describe('getWritePenalty', () => {
    it('returns 1.0 for RAID0 (no redundancy)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID0')).toBe(1.0)
    })

    it('returns 2.0 for RAID1 (duplicate writes)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID1')).toBe(2.0)
    })

    it('returns 2.0 for RAID10 (mirrored writes)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID10')).toBe(2.0)
    })

    it('returns 3.0 for RAID1_3WAY (triple mirror)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID1_3WAY')).toBe(3.0)
    })

    it('returns 4.0 for RAID5 (industry formula: 2 reads + 2 writes)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID5')).toBe(4.0)
    })

    it('returns 4.0 for RAID50 (RAID5 penalty per group)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID50')).toBe(4.0)
    })

    it('returns 6.0 for RAID6 (industry formula: 3 reads + 3 writes)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID6')).toBe(6.0)
    })

    it('returns 6.0 for RAID60 (RAID6 penalty per group)', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID60')).toBe(6.0)
    })

    it('returns 2.0 for RAID1E', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID1E')).toBe(2.0)
    })

    it('returns 4.0 for RAID5E and RAID5EE', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID5E')).toBe(4.0)
      expect(raidPerformanceStrategy.getWritePenalty('RAID5EE')).toBe(4.0)
    })

    it('returns 4.0 for RAID3 and RAID4', () => {
      expect(raidPerformanceStrategy.getWritePenalty('RAID3')).toBe(4.0)
      expect(raidPerformanceStrategy.getWritePenalty('RAID4')).toBe(4.0)
    })

    it('returns 1.0 for unknown RAID levels', () => {
      expect(raidPerformanceStrategy.getWritePenalty('UNKNOWN')).toBe(1.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates IOPS with 50% read/write mix for RAID5', () => {
      // 6 drives, 200 IOPS/drive, 50% reads
      // Reads: 6 * 200 * 0.5 = 600 IOPS
      // Writes: 6 * 200 * 0.5 / 4 = 150 IOPS (4x penalty)
      // Total: 750 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID5', 6, 200, 50)
      expect(iops).toBe(750)
    })

    it('calculates IOPS with 70% read workload for RAID5', () => {
      // 6 drives, 200 IOPS/drive, 70% reads
      // Reads: 6 * 200 * 0.7 = 840 IOPS
      // Writes: 6 * 200 * 0.3 / 4 = 90 IOPS (4x penalty)
      // Total: 930 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID5', 6, 200, 70)
      expect(iops).toBe(930)
    })

    it('calculates IOPS with 50% read/write mix for RAID6', () => {
      // 8 drives, 200 IOPS/drive, 50% reads
      // Reads: 8 * 200 * 0.5 = 800 IOPS
      // Writes: 8 * 200 * 0.5 / 6 = 133.33 IOPS (6x penalty)
      // Total: 933.33 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID6', 8, 200, 50)
      expect(iops).toBeCloseTo(933.33, 1)
    })

    it('calculates IOPS with 100% read workload (no penalty)', () => {
      // 6 drives, 200 IOPS/drive, 100% reads
      // Reads: 6 * 200 * 1.0 = 1200 IOPS
      // Writes: 0
      // Total: 1200 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID5', 6, 200, 100)
      expect(iops).toBe(1200)
    })

    it('calculates IOPS with 0% read workload (full penalty)', () => {
      // 6 drives, 200 IOPS/drive, 0% reads (100% writes)
      // Reads: 0
      // Writes: 6 * 200 * 1.0 / 4 = 300 IOPS (4x penalty)
      // Total: 300 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID5', 6, 200, 0)
      expect(iops).toBe(300)
    })

    it('calculates IOPS for RAID0 (no penalty)', () => {
      // 4 drives, 200 IOPS/drive, 50% reads
      // Reads: 4 * 200 * 0.5 = 400 IOPS
      // Writes: 4 * 200 * 0.5 / 1 = 400 IOPS (no penalty)
      // Total: 800 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID0', 4, 200, 50)
      expect(iops).toBe(800)
    })

    it('calculates IOPS for RAID1 (2x penalty)', () => {
      // 2 drives, 200 IOPS/drive, 50% reads
      // Reads: 2 * 200 * 0.5 = 200 IOPS
      // Writes: 2 * 200 * 0.5 / 2 = 100 IOPS (2x penalty)
      // Total: 300 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID1', 2, 200, 50)
      expect(iops).toBe(300)
    })

    it('calculates IOPS for RAID10 (2x penalty)', () => {
      // 4 drives, 200 IOPS/drive, 50% reads
      // Reads: 4 * 200 * 0.5 = 400 IOPS
      // Writes: 4 * 200 * 0.5 / 2 = 200 IOPS (2x penalty)
      // Total: 600 IOPS
      const iops = raidPerformanceStrategy.calculateIOPS('RAID10', 4, 200, 50)
      expect(iops).toBe(600)
    })
  })
})
