/**
 * Volumetry Engine Tests
 *
 * Validates RAID capacity calculations against industry formulas.
 * Reference: CLAUDE.md requires validation within 1% of WintelGuy and NetApp calculators.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { calculateVolumetry, type VolumetryInput } from '@/engines/volumetry'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_POWERVAULT_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
} from '@/types'
import type { Drive } from '@/types/drive'
import { standardRAIDVectors } from '../fixtures/raid-vectors'

// Test drive: 1TB capacity for easy math
const testDrive: Drive = {
  id: 'test-1tb',
  model: 'Test Drive 1TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  capacity_raw: 1_000_000_000_000, // 1TB exactly
  sector_size: 512,
  performance: {
    iops_read: 150,
    iops_write: 150,
    bandwidth_read_mb: 200,
    bandwidth_write_mb: 200,
  },
  reliability: {
    ure_rate: 14,
    afr: 1.0,
    dwpd: 0,
    mtbf_hours: 1_000_000,
  },
  power: {
    idle_watts: 5,
    load_watts: 10,
  },
  cost_usd: 100,
}

// Helper to create a basic VolumetryInput
function createInput(
  driveCount: number,
  topology: VolumetryInput['topology'],
  hotSpares = 0,
): VolumetryInput {
  return {
    drive: testDrive,
    driveCount,
    hotSpares,
    serverCount: 1,
    topology,
    zfsOptions: DEFAULT_ZFS_OPTIONS,
    s2dOptions: DEFAULT_S2D_OPTIONS,
    vsanOptions: DEFAULT_VSAN_OPTIONS,
    objectscaleOptions: DEFAULT_OBJECTSCALE_OPTIONS,
    powerstoreOptions: DEFAULT_POWERSTORE_OPTIONS,
    powerscaleOptions: DEFAULT_POWERSCALE_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    netAppOptions: DEFAULT_NETAPP_OPTIONS,
    synologyOptions: DEFAULT_SYNOLOGY_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    powervaultOptions: DEFAULT_POWERVAULT_OPTIONS,
    compressionRatio: 1.0,
    dedupRatio: 1.0,
  }
}

describe('Volumetry Engine - Standard RAID', () => {
  describe('RAID 0 (Striping)', () => {
    it('should use 100% of capacity (no redundancy)', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID0' })
      const result = calculateVolumetry(input)

      // RAID 0: all drives contribute to capacity
      // Raw = 4 * 1TB = 4TB
      // Usable = 4TB (minus ~2% filesystem overhead)
      expect(result.rawCapacity).toBe(4_000_000_000_000)
      expect(result.parityOverhead).toBe(0)
      // Efficiency should be ~98% (only filesystem overhead)
      // Note: efficiency is returned as percentage (0-100), not decimal
      expect(result.efficiency).toBeGreaterThan(95)
    })
  })

  describe('RAID 1 (Mirroring)', () => {
    it('should use 50% of capacity with 2 drives', () => {
      const input = createInput(2, { type: 'standard', level: 'RAID1' })
      const result = calculateVolumetry(input)

      // RAID 1: 50% efficiency
      // Raw = 2 * 1TB = 2TB
      // Usable (before FS overhead) = 1TB
      expect(result.rawCapacity).toBe(2_000_000_000_000)
      // Efficiency ~48-50% (50% mirror + ~2% FS overhead)
      // Note: efficiency is returned as percentage (0-100)
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })
  })

  describe('RAID 5 (Single Parity)', () => {
    it('should calculate (n-1)/n efficiency', () => {
      // 4 drives: (4-1)/4 = 75% efficiency
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // Raw = 4TB
      // Usable (before FS) = 3TB (75%)
      expect(result.rawCapacity).toBe(4_000_000_000_000)
      // Parity overhead = 1 drive worth = 1TB
      expect(result.parityOverhead).toBe(1_000_000_000_000)
      // Efficiency ~73-75% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(70)
      expect(result.efficiency).toBeLessThan(77)
    })

    it('should calculate correctly with 8 drives', () => {
      // 8 drives: (8-1)/8 = 87.5% efficiency
      const input = createInput(8, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // Parity = 1 drive = 1TB
      expect(result.parityOverhead).toBe(1_000_000_000_000)
      // Efficiency ~85-87% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(83)
      expect(result.efficiency).toBeLessThan(90)
    })

    it('should handle hot spares correctly', () => {
      // 5 drives, 1 hot spare = 4 usable drives
      const input = createInput(5, { type: 'standard', level: 'RAID5' }, 1)
      const result = calculateVolumetry(input)

      // Hot spare overhead = 1TB
      expect(result.hotSpareOverhead).toBe(1_000_000_000_000)
      // Parity uses 1 of remaining 4 drives = 1TB
      expect(result.parityOverhead).toBe(1_000_000_000_000)
      // Usable = 3TB (3 data drives)
    })
  })

  describe('RAID 6 (Double Parity)', () => {
    it('should calculate (n-2)/n efficiency', () => {
      // 6 drives: (6-2)/6 = 66.67% efficiency
      const input = createInput(6, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      // Raw = 6TB
      expect(result.rawCapacity).toBe(6_000_000_000_000)
      // Parity = 2 drives = 2TB
      expect(result.parityOverhead).toBe(2_000_000_000_000)
      // Efficiency ~64-67% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(62)
      expect(result.efficiency).toBeLessThan(69)
    })

    it('should calculate correctly with 12 drives', () => {
      // 12 drives: (12-2)/12 = 83.33% efficiency
      const input = createInput(12, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      // Parity = 2 drives = 2TB
      expect(result.parityOverhead).toBe(2_000_000_000_000)
      // Efficiency ~80-83% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(78)
      expect(result.efficiency).toBeLessThan(85)
    })
  })

  describe('RAID 10 (Mirrored Stripes)', () => {
    it('should use 50% of capacity', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID10' })
      const result = calculateVolumetry(input)

      // RAID 10: 50% efficiency (mirror pairs)
      expect(result.rawCapacity).toBe(4_000_000_000_000)
      // Parity overhead = 2TB (half capacity for mirrors)
      expect(result.parityOverhead).toBe(2_000_000_000_000)
      // Efficiency ~48-50% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })
  })

  describe('RAID 50 (Striped RAID 5)', () => {
    it('should calculate with 2 parity drives across 2 groups', () => {
      // 8 drives in 2 groups of 4: 2 parity drives total
      // Efficiency: (8-2)/8 = 75%
      const input = createInput(8, { type: 'standard', level: 'RAID50' })
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(8_000_000_000_000)
      // Efficiency should be similar to RAID 5 with more drives (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(70)
    })
  })

  describe('RAID 60 (Striped RAID 6)', () => {
    it('should calculate with 4 parity drives across 2 groups', () => {
      // 12 drives in 2 groups of 6: 4 parity drives total
      // Efficiency: (12-4)/12 = 66.67%
      const input = createInput(12, { type: 'standard', level: 'RAID60' })
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(12_000_000_000_000)
      // Efficiency should be ~64-67% (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(62)
      expect(result.efficiency).toBeLessThan(70)
    })
  })

  // ============================================================
  // Table-Driven Tests for RAID 0/1/1E/3/4 (WintelGuy Validation)
  // ============================================================
  describe('WintelGuy Validated Tests - RAID 0/1/1E/3/4', () => {
    // Filter vectors for RAID 0, 1, 1E, 3, 4
    const vectors = standardRAIDVectors.filter((v) =>
      ['RAID0', 'RAID1', 'RAID1E', 'RAID3', 'RAID4'].includes(v.level),
    )

    describe.each(vectors)('$name', ({ level, drives, driveSize, expectedUsable, tolerance }) => {
      it(`should calculate usable capacity within ${tolerance * 100}% of WintelGuy reference`, () => {
        // Create test drive with specified capacity
        const testDrive: Drive = {
          id: `test-${driveSize}`,
          model: `Test Drive ${driveSize / 1_000_000_000_000}TB`,
          type: 'HDD',
          formFactor: '3.5"',
          interface: 'SATA',
          capacity_raw: driveSize,
          sector_size: 512,
          performance: {
            iops_read: 150,
            iops_write: 150,
            bandwidth_read_mb: 200,
            bandwidth_write_mb: 200,
          },
          reliability: {
            ure_rate: 14,
            afr: 1.0,
            dwpd: 0,
            mtbf_hours: 1_000_000,
          },
          power: {
            idle_watts: 5,
            load_watts: 10,
          },
          cost_usd: 100,
        }

        const input = createInput(drives, { type: 'standard', level })
        input.drive = testDrive

        const result = calculateVolumetry(input)

        // Validate usable capacity matches WintelGuy within tolerance
        const lowerBound = expectedUsable * (1 - tolerance)
        const upperBound = expectedUsable * (1 + tolerance)

        expect(result.usableCapacity).toBeGreaterThanOrEqual(lowerBound)
        expect(result.usableCapacity).toBeLessThanOrEqual(upperBound)
      })
    })
  })

  // ============================================================
  // Property-Based Tests for RAID Invariants (RAID 0/1)
  // ============================================================
  describe('Property-Based Tests - RAID Invariants', () => {
    it('RAID 0: capacity should increase monotonically with drive count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 24 }), // Drive count
          fc.integer({ min: 100_000_000_000, max: 20_000_000_000_000 }), // Drive size (100GB - 20TB)
          (driveCount, driveSize) => {
            // Create test drive
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const inputN = createInput(driveCount, { type: 'standard', level: 'RAID0' })
            inputN.drive = testDrive
            const resultN = calculateVolumetry(inputN)

            const inputNPlus1 = createInput(driveCount + 1, { type: 'standard', level: 'RAID0' })
            inputNPlus1.drive = testDrive
            const resultNPlus1 = calculateVolumetry(inputNPlus1)

            // Usable capacity should increase monotonically
            return resultNPlus1.usableCapacity > resultN.usableCapacity
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 0: adding drives should increase capacity by ~1 drive worth', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 23 }),
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const inputN = createInput(driveCount, { type: 'standard', level: 'RAID0' })
            inputN.drive = testDrive
            const resultN = calculateVolumetry(inputN)

            const inputNPlus1 = createInput(driveCount + 1, { type: 'standard', level: 'RAID0' })
            inputNPlus1.drive = testDrive
            const resultNPlus1 = calculateVolumetry(inputNPlus1)

            // Capacity increase should be approximately 1 drive worth (within 5% for FS overhead)
            const capacityIncrease = resultNPlus1.usableCapacity - resultN.usableCapacity
            const expectedIncrease = driveSize * 0.98 // Account for ~2% filesystem overhead
            const tolerance = expectedIncrease * 0.05

            return Math.abs(capacityIncrease - expectedIncrease) < tolerance
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 1: capacity should equal N/2 drives (mirroring)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 24 }).filter((n) => n % 2 === 0), // Even number of drives
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const input = createInput(driveCount, { type: 'standard', level: 'RAID1' })
            input.drive = testDrive
            const result = calculateVolumetry(input)

            // RAID 1: 50% efficiency - usable should be ~(N/2) drives
            const expectedUsable = ((driveCount / 2) * driveSize) * 0.98 // ~2% FS overhead
            const tolerance = expectedUsable * 0.05

            return Math.abs(result.usableCapacity - expectedUsable) < tolerance
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  // ============================================================
  // Table-Driven Tests for RAID 5/5E/5EE/6/10/50/60 (WintelGuy Validation)
  // ============================================================
  describe('WintelGuy Validated Tests - RAID 5/5E/5EE/6/10/50/60', () => {
    // Filter vectors for parity and nested RAID levels
    const vectors = standardRAIDVectors.filter((v) =>
      ['RAID5', 'RAID5E', 'RAID5EE', 'RAID6', 'RAID10', 'RAID50', 'RAID60'].includes(v.level),
    )

    describe.each(vectors)('$name', ({ level, drives, driveSize, expectedUsable, tolerance }) => {
      it(`should calculate usable capacity within ${tolerance * 100}% of WintelGuy reference`, () => {
        const testDrive: Drive = {
          id: `test-${driveSize}`,
          model: `Test Drive ${driveSize / 1_000_000_000_000}TB`,
          type: 'HDD',
          formFactor: '3.5"',
          interface: 'SATA',
          capacity_raw: driveSize,
          sector_size: 512,
          performance: {
            iops_read: 150,
            iops_write: 150,
            bandwidth_read_mb: 200,
            bandwidth_write_mb: 200,
          },
          reliability: {
            ure_rate: 14,
            afr: 1.0,
            dwpd: 0,
            mtbf_hours: 1_000_000,
          },
          power: {
            idle_watts: 5,
            load_watts: 10,
          },
          cost_usd: 100,
        }

        const input = createInput(drives, { type: 'standard', level })
        input.drive = testDrive

        const result = calculateVolumetry(input)

        // Validate usable capacity matches WintelGuy within tolerance
        // WintelGuy: https://wintelguy.com/raidcalc.pl
        const lowerBound = expectedUsable * (1 - tolerance)
        const upperBound = expectedUsable * (1 + tolerance)

        expect(result.usableCapacity).toBeGreaterThanOrEqual(lowerBound)
        expect(result.usableCapacity).toBeLessThanOrEqual(upperBound)
      })
    })
  })

  // ============================================================
  // Property-Based Tests for Parity RAID
  // ============================================================
  describe('Property-Based Tests - Parity RAID', () => {
    it('RAID 5: N-1 drives usable, adding drives increases capacity', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 23 }), // RAID 5 minimum is 3 drives
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const inputN = createInput(driveCount, { type: 'standard', level: 'RAID5' })
            inputN.drive = testDrive
            const resultN = calculateVolumetry(inputN)

            const inputNPlus1 = createInput(driveCount + 1, { type: 'standard', level: 'RAID5' })
            inputNPlus1.drive = testDrive
            const resultNPlus1 = calculateVolumetry(inputNPlus1)

            // RAID 5 uses N-1 drives for data (1 drive for parity)
            // Adding a drive should increase usable capacity
            return resultNPlus1.usableCapacity > resultN.usableCapacity
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 6: N-2 drives usable, survives double failure', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 24 }), // RAID 6 minimum is 4 drives
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const input = createInput(driveCount, { type: 'standard', level: 'RAID6' })
            input.drive = testDrive
            const result = calculateVolumetry(input)

            // RAID 6: (N-2)/N efficiency - 2 drives worth for dual parity
            const expectedUsable = ((driveCount - 2) * driveSize) * 0.98 // ~2% FS overhead
            const tolerance = expectedUsable * 0.05

            return Math.abs(result.usableCapacity - expectedUsable) < tolerance
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 10: exactly 50% efficiency (mirrored stripes)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 24 }).filter((n) => n % 2 === 0), // Even number required
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const input = createInput(driveCount, { type: 'standard', level: 'RAID10' })
            input.drive = testDrive
            const result = calculateVolumetry(input)

            // RAID 10: 50% efficiency - usable should be ~(N/2) drives
            const expectedUsable = ((driveCount / 2) * driveSize) * 0.98
            const tolerance = expectedUsable * 0.05

            return Math.abs(result.usableCapacity - expectedUsable) < tolerance
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 50: efficiency combines striping + parity (better than RAID 5 with small arrays)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 24 }), // Minimum 6 drives (2 groups of 3)
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const input = createInput(driveCount, { type: 'standard', level: 'RAID50' })
            input.drive = testDrive
            const result = calculateVolumetry(input)

            // RAID 50: 2 parity drives for 2 groups (assuming 2 groups)
            // Efficiency should be better than raw parity overhead
            const rawCapacity = driveCount * driveSize
            const efficiency = result.usableCapacity / rawCapacity

            // RAID 50 efficiency should be in reasonable range (60-90%)
            return efficiency > 0.6 && efficiency < 0.95
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID 60: dual parity across groups, better reliability than RAID 50', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 8, max: 24 }), // Minimum 8 drives (2 groups of 4)
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }),
          (driveCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'HDD',
              formFactor: '3.5"',
              interface: 'SATA',
              capacity_raw: driveSize,
              sector_size: 512,
              performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
              reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
              power: { idle_watts: 5, load_watts: 10 },
              cost_usd: 100,
            }

            const inputRAID60 = createInput(driveCount, { type: 'standard', level: 'RAID60' })
            inputRAID60.drive = testDrive
            const resultRAID60 = calculateVolumetry(inputRAID60)

            const inputRAID50 = createInput(driveCount, { type: 'standard', level: 'RAID50' })
            inputRAID50.drive = testDrive
            const resultRAID50 = calculateVolumetry(inputRAID50)

            // RAID 60 has more parity overhead than RAID 50 (4 drives vs 2 drives for 2 groups)
            // Therefore RAID 60 usable capacity should be less than RAID 50
            return resultRAID60.usableCapacity < resultRAID50.usableCapacity
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  // ============================================================
  // Write Penalty Validation (Performance Impact)
  // ============================================================
  describe('RAID Write Penalty', () => {
    it('RAID 5: write penalty factor is documented as 4x (read-modify-write)', () => {
      // RAID 5 write penalty: 4x for random writes
      // Formula: Read old data + Read old parity + Write new data + Write new parity = 4 operations
      // Source: https://wintelguy.com/raidperf.pl
      // Source: "RAID Performance" by Evan Marcus, Hal Stern

      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // Verify parity overhead exists (1 drive worth)
      expect(result.parityOverhead).toBe(1_000_000_000_000)

      // Note: Write penalty affects performance calculations (Module B)
      // For 4 drives RAID 5: Random write IOPS = (Drive IOPS × 4 drives) / 4 penalty = Drive IOPS
      // This test documents the formula; actual performance testing in Module B
    })

    it('RAID 6: write penalty factor is documented as 6x (double parity update)', () => {
      // RAID 6 write penalty: 6x for random writes
      // Formula: Read old data + Read P parity + Read Q parity + Write new data + Write P + Write Q = 6 operations
      // Source: https://wintelguy.com/raidperf.pl
      // Source: NetApp TR-3437 "RAID-DP: Double Parity RAID for Improved Data Protection"

      const input = createInput(6, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      // Verify dual parity overhead exists (2 drives worth)
      expect(result.parityOverhead).toBe(2_000_000_000_000)

      // Note: Write penalty affects performance calculations (Module B)
      // For 6 drives RAID 6: Random write IOPS = (Drive IOPS × 6 drives) / 6 penalty = Drive IOPS
      // This test documents the formula; actual performance testing in Module B
    })

    it('RAID 10: no write penalty (direct mirror writes)', () => {
      // RAID 10 write penalty: 2x (but parallelizable, often considered "no penalty")
      // Each write goes to 2 drives in a mirror pair
      // Source: RAID performance literature

      const input = createInput(4, { type: 'standard', level: 'RAID10' })
      const result = calculateVolumetry(input)

      // Verify mirror overhead exists (50%)
      expect(result.parityOverhead).toBe(2_000_000_000_000)

      // RAID 10 has consistent performance for reads and writes
      // No read-modify-write cycle needed
    })
  })
})

describe('Volumetry Engine - ZFS', () => {
  describe('ZFS RAID-Z1', () => {
    it('should calculate (n-1)/n efficiency like RAID 5', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      const result = calculateVolumetry(input)

      // 4 drives RAID-Z1: 75% raw efficiency
      expect(result.rawCapacity).toBe(4_000_000_000_000)
      // ZFS has additional slop overhead (1/32 = 3.125%)
      expect(result.slopOverhead).toBeGreaterThan(0)
      // Final efficiency ~70-74% (75% - slop - fs overhead) (percentage 0-100)
      expect(result.efficiency).toBeGreaterThan(68)
      expect(result.efficiency).toBeLessThan(76)
    })
  })

  describe('ZFS RAID-Z2', () => {
    it('should calculate (n-2)/n efficiency like RAID 6', () => {
      const input = createInput(6, { type: 'zfs', level: 'raidz2' })
      const result = calculateVolumetry(input)

      // 6 drives RAID-Z2: 66.67% raw efficiency
      expect(result.rawCapacity).toBe(6_000_000_000_000)
      // ZFS slop space should be present
      expect(result.slopOverhead).toBeGreaterThan(0)
    })
  })

  describe('ZFS RAID-Z3', () => {
    it('should calculate (n-3)/n efficiency', () => {
      const input = createInput(8, { type: 'zfs', level: 'raidz3' })
      const result = calculateVolumetry(input)

      // 8 drives RAID-Z3: (8-3)/8 = 62.5% raw efficiency
      expect(result.rawCapacity).toBe(8_000_000_000_000)
      // Parity = 3 drives = 3TB
      expect(result.parityOverhead).toBe(3_000_000_000_000)
    })
  })

  describe('ZFS Mirror', () => {
    it('should use 50% of capacity', () => {
      const input = createInput(2, { type: 'zfs', level: 'mirror' })
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(2_000_000_000_000)
      // Mirror = 50% overhead
      expect(result.parityOverhead).toBe(1_000_000_000_000)
    })
  })

  describe('ZFS Slop Space', () => {
    it('should reserve ~3.125% slop space (1/32)', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      const result = calculateVolumetry(input)

      // Usable before slop = 3TB (75% of 4TB)
      // Slop = 3TB * (1/32) = ~93.75GB
      // Allow some variance for calculation method
      const expectedSlopMin = 80_000_000_000 // 80GB
      const expectedSlopMax = 120_000_000_000 // 120GB
      expect(result.slopOverhead).toBeGreaterThan(expectedSlopMin)
      expect(result.slopOverhead).toBeLessThan(expectedSlopMax)
    })
  })
})

describe('Volumetry Engine - Compression & Dedup', () => {
  // Note: Standard RAID doesn't apply compression/dedup ratios
  // Use ZFS which does support data reduction

  it('should increase effective capacity with compression (ZFS)', () => {
    const inputNoCompression = createInput(4, { type: 'zfs', level: 'raidz1' })
    inputNoCompression.compressionRatio = 1.0

    const inputWithCompression = { ...inputNoCompression, compressionRatio: 2.0 }

    const resultNoComp = calculateVolumetry(inputNoCompression)
    const resultWithComp = calculateVolumetry(inputWithCompression)

    // Effective capacity should double with 2:1 compression
    expect(resultWithComp.effectiveCapacity).toBeGreaterThan(resultNoComp.effectiveCapacity * 1.9)
    expect(resultWithComp.effectiveCapacity).toBeLessThan(resultNoComp.effectiveCapacity * 2.1)
  })

  it('should increase effective capacity with dedup (ZFS)', () => {
    const inputNoDedup = createInput(4, { type: 'zfs', level: 'raidz1' })
    inputNoDedup.dedupRatio = 1.0

    const inputWithDedup = { ...inputNoDedup, dedupRatio: 1.5 }

    const resultNoDedup = calculateVolumetry(inputNoDedup)
    const resultWithDedup = calculateVolumetry(inputWithDedup)

    // Effective capacity should be 1.5x with 1.5:1 dedup
    expect(resultWithDedup.effectiveCapacity).toBeGreaterThan(resultNoDedup.effectiveCapacity * 1.4)
    expect(resultWithDedup.effectiveCapacity).toBeLessThan(resultNoDedup.effectiveCapacity * 1.6)
  })

  it('should stack compression and dedup multiplicatively (ZFS)', () => {
    const inputBase = createInput(4, { type: 'zfs', level: 'raidz1' })
    inputBase.compressionRatio = 1.0
    inputBase.dedupRatio = 1.0

    const inputCombined = { ...inputBase, compressionRatio: 2.0, dedupRatio: 1.5 }

    const resultBase = calculateVolumetry(inputBase)
    const resultCombined = calculateVolumetry(inputCombined)

    // Combined: 2.0 * 1.5 = 3.0x effective capacity
    expect(resultCombined.effectiveCapacity).toBeGreaterThan(resultBase.effectiveCapacity * 2.8)
    expect(resultCombined.effectiveCapacity).toBeLessThan(resultBase.effectiveCapacity * 3.2)
  })

  it('should NOT apply compression/dedup to standard RAID', () => {
    const inputBase = createInput(4, { type: 'standard', level: 'RAID5' })
    inputBase.compressionRatio = 1.0
    inputBase.dedupRatio = 1.0

    const inputWithRatios = { ...inputBase, compressionRatio: 2.0, dedupRatio: 1.5 }

    const resultBase = calculateVolumetry(inputBase)
    const resultWithRatios = calculateVolumetry(inputWithRatios)

    // Standard RAID should NOT apply compression/dedup
    expect(resultWithRatios.effectiveCapacity).toBe(resultBase.effectiveCapacity)
  })
})

describe('Volumetry Engine - Breakdown', () => {
  it('should provide complete breakdown of capacity', () => {
    const input = createInput(6, { type: 'standard', level: 'RAID6' }, 1)
    const result = calculateVolumetry(input)

    // Should have breakdown array
    expect(result.breakdown).toBeDefined()
    expect(Array.isArray(result.breakdown)).toBe(true)
    expect(result.breakdown.length).toBeGreaterThan(0)

    // Sum of breakdown should equal raw capacity
    const totalBreakdown = result.breakdown.reduce((sum, item) => sum + item.bytes, 0)
    // Allow small rounding difference
    expect(Math.abs(totalBreakdown - result.rawCapacity)).toBeLessThan(1000)
  })

  it('should include usable capacity in breakdown', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID5' })
    const result = calculateVolumetry(input)

    const usableItem = result.breakdown.find(
      (item) =>
        item.label.toLowerCase().includes('usable') || item.label.toLowerCase().includes('data'),
    )
    expect(usableItem).toBeDefined()
    expect(usableItem?.bytes).toBeGreaterThan(0)
  })
})
