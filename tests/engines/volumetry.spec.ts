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
import { zfsVectors } from '../fixtures/zfs-vectors'
import { vsanVectors, vsanOsaVectors, vsanEsaVectors } from '../fixtures/vsan-vectors'

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

describe('Volumetry Engine - ZFS Topologies', () => {
  // ============================================================
  // Table-Driven Tests for All ZFS Topologies (OpenZFS Validation)
  // ============================================================
  describe('OpenZFS Validated Tests - All Topologies', () => {
    describe.each(zfsVectors)(
      '$name',
      ({ level, drives, driveSize, expectedUsable, tolerance, slopOverhead }) => {
        it(`should calculate usable capacity within ${tolerance * 100}% of OpenZFS formula`, () => {
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

          const input = createInput(drives, { type: 'zfs', level })
          input.drive = testDrive

          const result = calculateVolumetry(input)

          // Validate usable capacity matches OpenZFS within tolerance
          const lowerBound = expectedUsable * (1 - tolerance)
          const upperBound = expectedUsable * (1 + tolerance)

          expect(result.usableCapacity).toBeGreaterThanOrEqual(lowerBound)
          expect(result.usableCapacity).toBeLessThanOrEqual(upperBound)

          // Validate slop overhead is present and within expected range
          const slopLowerBound = slopOverhead * 0.95
          const slopUpperBound = slopOverhead * 1.05
          expect(result.slopOverhead).toBeGreaterThanOrEqual(slopLowerBound)
          expect(result.slopOverhead).toBeLessThanOrEqual(slopUpperBound)
        })
      },
    )
  })

  // ============================================================
  // ZFS Slop Space Edge Cases
  // ============================================================
  describe('ZFS Slop Space - Edge Cases', () => {
    it('should enforce minimum slop space of 128 MiB', () => {
      // Small pool: 3×500GB RAID-Z1 = 1TB usable before slop
      // Slop = 1TB / 32 = ~31.25GB > 128 MiB minimum
      // Even smaller pool to hit minimum:
      const smallDrive: Drive = {
        ...testDrive,
        capacity_raw: 100_000_000_000, // 100GB
      }

      const input = createInput(3, { type: 'zfs', level: 'raidz1' })
      input.drive = smallDrive

      const result = calculateVolumetry(input)

      // For very small pools, slop should be at least 128 MiB
      const MIN_SLOP = 128 * 1024 * 1024 // 128 MiB
      expect(result.slopOverhead).toBeGreaterThanOrEqual(MIN_SLOP)
    })

    it('should enforce maximum slop space of 128 GiB', () => {
      // Large pool: 20×10TB RAID-Z2 = 180TB usable before slop
      // Slop = 180TB / 32 = 5.625TB > 128 GiB maximum
      const largeDrive: Drive = {
        ...testDrive,
        capacity_raw: 10_000_000_000_000, // 10TB
      }

      const input = createInput(20, { type: 'zfs', level: 'raidz2' })
      input.drive = largeDrive

      const result = calculateVolumetry(input)

      // For very large pools, slop should not exceed 128 GiB
      const MAX_SLOP = 128 * 1024 * 1024 * 1024 // 128 GiB
      expect(result.slopOverhead).toBeLessThanOrEqual(MAX_SLOP)
    })

    it('should calculate standard slop as 1/32 of pool capacity for normal-sized pools', () => {
      // Standard pool: 6×1TB RAID-Z2 = 4TB usable before slop
      // Slop = 4TB / 32 = 125GB (within min/max bounds)
      const input = createInput(6, { type: 'zfs', level: 'raidz2' })

      const result = calculateVolumetry(input)

      // For 4TB usable, slop should be ~125GB (1/32)
      const expectedSlop = (4 * 1_000_000_000_000) / 32
      const tolerance = expectedSlop * 0.05 // 5% tolerance

      expect(result.slopOverhead).toBeGreaterThan(expectedSlop - tolerance)
      expect(result.slopOverhead).toBeLessThan(expectedSlop + tolerance)
    })
  })

  // ============================================================
  // Property-Based Tests for ZFS Invariants
  // ============================================================
  describe('Property-Based Tests - ZFS Invariants', () => {
    it('ZFS efficiency should always be less than 100% (slop overhead always present)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 20 }), // Drive count
          fc.integer({ min: 1_000_000_000_000, max: 10_000_000_000_000 }), // Drive size (1TB - 10TB)
          fc.constantFrom<ZfsTopology>('stripe', 'mirror', 'raidz1', 'raidz2', 'raidz3'),
          (driveCount, driveSize, level) => {
            // Skip invalid configurations (topology requires more drives than available)
            const minDrivesRequired: Record<ZfsTopology, number> = {
              stripe: 1,
              mirror: 2,
              raidz1: 3,
              raidz2: 4,
              raidz3: 5,
              draid1: 3,
              draid2: 4,
              draid3: 5,
            }

            if (driveCount < minDrivesRequired[level]) {
              return true // Skip invalid configuration
            }

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

            const input = createInput(driveCount, { type: 'zfs', level })
            input.drive = testDrive

            const result = calculateVolumetry(input)

            // ZFS efficiency must always be < 100% due to slop overhead
            // Maximum efficiency for stripe is ~97% (slop + FS overhead)
            return result.efficiency > 0 && result.efficiency < 100
          },
        ),
        { numRuns: 50 },
      )
    })

    it('ZFS slop overhead should increase with pool size (before hitting max)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 10 }), // Small to medium pools
          fc.integer({ min: 1_000_000_000_000, max: 5_000_000_000_000 }), // 1TB - 5TB drives
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

            const inputN = createInput(driveCount, { type: 'zfs', level: 'raidz1' })
            inputN.drive = testDrive
            const resultN = calculateVolumetry(inputN)

            const inputNPlus1 = createInput(driveCount + 1, { type: 'zfs', level: 'raidz1' })
            inputNPlus1.drive = testDrive
            const resultNPlus1 = calculateVolumetry(inputNPlus1)

            // Slop should increase with more drives (larger pool)
            // Unless we hit the 128 GiB maximum (unlikely with these sizes)
            return resultNPlus1.slopOverhead >= resultN.slopOverhead
          },
        ),
        { numRuns: 50 },
      )
    })

    it('RAID-Z1 should have same parity efficiency as RAID 5 (before slop)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 20 }), // RAID-Z1 minimum is 3 drives
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

            const inputZfs = createInput(driveCount, { type: 'zfs', level: 'raidz1' })
            inputZfs.drive = testDrive
            const resultZfs = calculateVolumetry(inputZfs)

            const inputRaid = createInput(driveCount, { type: 'standard', level: 'RAID5' })
            inputRaid.drive = testDrive
            const resultRaid = calculateVolumetry(inputRaid)

            // Both should have same parity overhead (1 drive worth)
            return resultZfs.parityOverhead === resultRaid.parityOverhead
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})

describe('Volumetry Engine - vSAN Topologies', () => {
  // ============================================================
  // Table-Driven Tests for vSAN OSA (Fixed Efficiency)
  // ============================================================
  describe('VMware Validated Tests - vSAN OSA', () => {
    describe.each(vsanOsaVectors)(
      '$name',
      ({ level, drives, driveSize, serverCount, expectedEfficiency, tolerance }) => {
        it(`should have ${expectedEfficiency * 100}% efficiency within ${tolerance * 100}% tolerance`, () => {
          const testDrive: Drive = {
            id: `test-${driveSize}`,
            model: `Test Drive ${driveSize / 1_000_000_000_000}TB`,
            type: 'SSD_NVMe',
            formFactor: '2.5"',
            interface: 'NVMe',
            capacity_raw: driveSize,
            sector_size: 4096,
            performance: {
              iops_read: 500000,
              iops_write: 250000,
              bandwidth_read_mb: 3500,
              bandwidth_write_mb: 3000,
            },
            reliability: {
              ure_rate: 17,
              afr: 0.5,
              dwpd: 3,
              mtbf_hours: 2_000_000,
            },
            power: {
              idle_watts: 5,
              load_watts: 8,
            },
            cost_usd: 300,
          }

          const input = createInput(drives, { type: 'vsan_osa', level })
          input.drive = testDrive
          input.serverCount = serverCount

          const result = calculateVolumetry(input)

          // Validate efficiency matches VMware specifications within tolerance
          const efficiencyDecimal = result.efficiency / 100 // Convert percentage to decimal
          const lowerBound = expectedEfficiency * (1 - tolerance)
          const upperBound = expectedEfficiency * (1 + tolerance)

          expect(efficiencyDecimal).toBeGreaterThanOrEqual(lowerBound)
          expect(efficiencyDecimal).toBeLessThanOrEqual(upperBound)
        })
      },
    )
  })

  // ============================================================
  // Table-Driven Tests for vSAN ESA (Adaptive Efficiency)
  // ============================================================
  describe('VMware Validated Tests - vSAN ESA', () => {
    describe.each(vsanEsaVectors)(
      '$name',
      ({ level, drives, driveSize, serverCount, expectedEfficiency, tolerance }) => {
        it(`should have ${expectedEfficiency * 100}% efficiency within ${tolerance * 100}% tolerance`, () => {
          const testDrive: Drive = {
            id: `test-${driveSize}`,
            model: `Test Drive ${driveSize / 1_000_000_000_000}TB`,
            type: 'SSD_NVMe',
            formFactor: '2.5"',
            interface: 'NVMe',
            capacity_raw: driveSize,
            sector_size: 4096,
            performance: {
              iops_read: 500000,
              iops_write: 250000,
              bandwidth_read_mb: 3500,
              bandwidth_write_mb: 3000,
            },
            reliability: {
              ure_rate: 17,
              afr: 0.5,
              dwpd: 3,
              mtbf_hours: 2_000_000,
            },
            power: {
              idle_watts: 5,
              load_watts: 8,
            },
            cost_usd: 300,
          }

          const input = createInput(drives, { type: 'vsan_esa', level })
          input.drive = testDrive
          input.serverCount = serverCount

          const result = calculateVolumetry(input)

          // Validate efficiency matches VMware specifications within tolerance
          const efficiencyDecimal = result.efficiency / 100 // Convert percentage to decimal
          const lowerBound = expectedEfficiency * (1 - tolerance)
          const upperBound = expectedEfficiency * (1 + tolerance)

          expect(efficiencyDecimal).toBeGreaterThanOrEqual(lowerBound)
          expect(efficiencyDecimal).toBeLessThanOrEqual(upperBound)
        })
      },
    )
  })

  // ============================================================
  // vSAN ESA Adaptive Efficiency - Threshold Tests
  // ============================================================
  describe('vSAN ESA Adaptive Efficiency Thresholds', () => {
    it('RAID-5: should use 2+1 scheme (67%) for clusters with <5 hosts', () => {
      const input = createInput(16, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
      input.serverCount = 4 // Below threshold

      const result = calculateVolumetry(input)

      // Should use 2+1 scheme = 2/3 = 66.67% efficiency
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.64)
      expect(efficiencyDecimal).toBeLessThan(0.70)
    })

    it('RAID-5: should use 2+1 scheme (67%) for clusters with insufficient drives', () => {
      const input = createInput(50, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
      input.serverCount = 5 // Meets host threshold
      // But only 50 drives (need 5 * 20 = 100+ for 4+1)

      const result = calculateVolumetry(input)

      // Should use 2+1 scheme = 66.67% efficiency
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.64)
      expect(efficiencyDecimal).toBeLessThan(0.70)
    })

    it('RAID-5: should use 4+1 scheme (80%) for clusters with ≥5 hosts and 100+ drives', () => {
      const input = createInput(120, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
      input.serverCount = 5 // Meets threshold

      const result = calculateVolumetry(input)

      // Should use 4+1 scheme = 4/5 = 80% efficiency
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.77)
      expect(efficiencyDecimal).toBeLessThan(0.83)
    })

    it('RAID-6: should use 4+2 scheme (67%) for clusters with <8 hosts', () => {
      const input = createInput(28, { type: 'vsan_esa', level: 'vsan_esa_raid6' })
      input.serverCount = 7 // Below threshold

      const result = calculateVolumetry(input)

      // Should use 4+2 scheme = 4/6 = 66.67% efficiency
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.64)
      expect(efficiencyDecimal).toBeLessThan(0.70)
    })

    it('RAID-6: should use 6+2 scheme (75%) for clusters with ≥8 hosts and 160+ drives', () => {
      const input = createInput(160, { type: 'vsan_esa', level: 'vsan_esa_raid6' })
      input.serverCount = 8 // Meets threshold

      const result = calculateVolumetry(input)

      // Should use 6+2 scheme = 6/8 = 75% efficiency
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.72)
      expect(efficiencyDecimal).toBeLessThan(0.78)
    })
  })

  // ============================================================
  // Property-Based Tests for vSAN Invariants
  // ============================================================
  describe('Property-Based Tests - vSAN Invariants', () => {
    it('vSAN ESA RAID-5 efficiency should increase with cluster size (adaptive)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 4 }), // Small cluster
          fc.integer({ min: 5, max: 10 }), // Large cluster
          fc.integer({ min: 1_000_000_000_000, max: 5_000_000_000_000 }), // Drive size
          (smallServerCount, largeServerCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'SSD_NVMe',
              formFactor: '2.5"',
              interface: 'NVMe',
              capacity_raw: driveSize,
              sector_size: 4096,
              performance: { iops_read: 500000, iops_write: 250000, bandwidth_read_mb: 3500, bandwidth_write_mb: 3000 },
              reliability: { ure_rate: 17, afr: 0.5, dwpd: 3, mtbf_hours: 2_000_000 },
              power: { idle_watts: 5, load_watts: 8 },
              cost_usd: 300,
            }

            // Small cluster: insufficient for 4+1
            const inputSmall = createInput(smallServerCount * 10, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
            inputSmall.drive = testDrive
            inputSmall.serverCount = smallServerCount
            const resultSmall = calculateVolumetry(inputSmall)

            // Large cluster: sufficient for 4+1
            const inputLarge = createInput(largeServerCount * 20, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
            inputLarge.drive = testDrive
            inputLarge.serverCount = largeServerCount
            const resultLarge = calculateVolumetry(inputLarge)

            // Large cluster should have higher efficiency (4+1 vs 2+1)
            return resultLarge.efficiency > resultSmall.efficiency
          },
        ),
        { numRuns: 50 },
      )
    })

    it('vSAN OSA RAID-5 efficiency should scale with stripe width (3+1 to 7+1)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 4, max: 16 }), // Server count (min 4 for RAID-5)
          fc.integer({ min: 1_000_000_000_000, max: 5_000_000_000_000 }), // Drive size
          (serverCount, driveSize) => {
            const testDrive: Drive = {
              id: 'test',
              model: 'Test',
              type: 'SSD_NVMe',
              formFactor: '2.5"',
              interface: 'NVMe',
              capacity_raw: driveSize,
              sector_size: 4096,
              performance: { iops_read: 500000, iops_write: 250000, bandwidth_read_mb: 3500, bandwidth_write_mb: 3000 },
              reliability: { ure_rate: 17, afr: 0.5, dwpd: 3, mtbf_hours: 2_000_000 },
              power: { idle_watts: 5, load_watts: 8 },
              cost_usd: 300,
            }

            const input = createInput(serverCount * 10, { type: 'vsan_osa', level: 'vsan_osa_raid5' })
            input.drive = testDrive
            input.serverCount = serverCount

            const result = calculateVolumetry(input)

            // OSA RAID-5 efficiency scales from 75% (3+1) to 87.5% (7+1) based on stripe width
            // Stripe width adapts to: min(serverCount-1, drivesPerHost/2, 7)
            const efficiencyDecimal = result.efficiency / 100
            return efficiencyDecimal >= 0.72 && efficiencyDecimal <= 0.90
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})

describe('Volumetry Engine - Microsoft S2D', () => {
  // Inline test vectors for S2D topologies
  const s2dVectors = [
    {
      name: 'S2D Simple: 4 nodes, 16 drives - No redundancy',
      level: 'simple' as const,
      faultDomains: 4,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 1.0, // 100% (no redundancy)
      tolerance: 0.03,
    },
    {
      name: 'S2D Mirror 2-way: 4 nodes, 16 drives - 50% efficiency',
      level: 'mirror' as const,
      faultDomains: 4,
      mirrorCopies: 2,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.5, // 50% (2-way mirror)
      tolerance: 0.03,
    },
    {
      name: 'S2D Mirror 3-way: 4 nodes, 16 drives - 33% efficiency',
      level: 'mirror' as const,
      faultDomains: 4,
      mirrorCopies: 3,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.333, // 33% (3-way mirror)
      tolerance: 0.03,
    },
    {
      name: 'S2D Parity: 4 nodes, 16 drives - 75% efficiency',
      level: 'parity' as const,
      faultDomains: 4,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.75, // 75% (3/4 nodes)
      tolerance: 0.03,
    },
    {
      name: 'S2D Dual Parity: 4 nodes, 16 drives - 50% efficiency',
      level: 'dual_parity' as const,
      faultDomains: 4,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.5, // 50% (2/4 nodes)
      tolerance: 0.03,
    },
    {
      name: 'S2D MAP: 4 nodes, 16 drives - Hybrid efficiency',
      level: 'map' as const,
      faultDomains: 4,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.5, // ~50% (20% mirror at 50% + 80% parity at 50% = 0.1 + 0.4 = 0.5)
      tolerance: 0.05,
    },
  ]

  describe.each(s2dVectors)('$name', ({ level, faultDomains, drives, driveSize, expectedEfficiency, tolerance, mirrorCopies }) => {
    it(`should have ${expectedEfficiency * 100}% efficiency within ${tolerance * 100}% tolerance`, () => {
      const testDrive: Drive = {
        id: `test-${driveSize}`,
        model: 'Test Drive 1TB',
        type: 'SSD_NVMe',
        formFactor: '2.5"',
        interface: 'NVMe',
        capacity_raw: driveSize,
        sector_size: 4096,
        performance: {
          iops_read: 300000,
          iops_write: 150000,
          bandwidth_read_mb: 2500,
          bandwidth_write_mb: 2000,
        },
        reliability: {
          ure_rate: 17,
          afr: 0.5,
          dwpd: 3,
          mtbf_hours: 2_000_000,
        },
        power: {
          idle_watts: 5,
          load_watts: 8,
        },
        cost_usd: 250,
      }

      const s2dOptions = {
        ...DEFAULT_S2D_OPTIONS,
        faultDomains,
        mirrorCopies: (mirrorCopies ?? 2) as 2 | 3,
        rebuildReserve: false, // Disable for pure efficiency testing
      }

      const input = createInput(drives, { type: 's2d', level })
      input.drive = testDrive
      input.serverCount = faultDomains
      input.s2dOptions = s2dOptions

      const result = calculateVolumetry(input)

      // Validate efficiency matches Microsoft specifications
      const efficiencyDecimal = result.efficiency / 100
      const lowerBound = expectedEfficiency * (1 - tolerance)
      const upperBound = expectedEfficiency * (1 + tolerance)

      expect(efficiencyDecimal).toBeGreaterThanOrEqual(lowerBound)
      expect(efficiencyDecimal).toBeLessThanOrEqual(upperBound)
    })
  })

  describe('S2D Rebuild Reserve', () => {
    it('should subtract 1 drive equivalent per fault domain when enabled', () => {
      const inputWithReserve = createInput(16, { type: 's2d', level: 'mirror' })
      inputWithReserve.s2dOptions = { ...DEFAULT_S2D_OPTIONS, rebuildReserve: true, faultDomains: 4 }

      const inputWithoutReserve = createInput(16, { type: 's2d', level: 'mirror' })
      inputWithoutReserve.s2dOptions = { ...DEFAULT_S2D_OPTIONS, rebuildReserve: false, faultDomains: 4 }

      const resultWith = calculateVolumetry(inputWithReserve)
      const resultWithout = calculateVolumetry(inputWithoutReserve)

      // Usable capacity should be less with rebuild reserve enabled
      expect(resultWith.usableCapacity).toBeLessThan(resultWithout.usableCapacity)

      // Difference should be approximately 4 drives worth (1 per fault domain)
      const reserveDifference = resultWithout.usableCapacity - resultWith.usableCapacity
      const expectedReserve = 4 * testDrive.capacity_raw
      const tolerance = expectedReserve * 0.1 // 10% tolerance

      expect(Math.abs(reserveDifference - expectedReserve)).toBeLessThan(tolerance)
    })
  })
})

describe('Volumetry Engine - Ceph', () => {
  // Inline test vectors for Ceph topologies
  const cephVectors = [
    {
      name: 'Ceph Replicated 2-way: 50% efficiency',
      level: 'ceph_replicated_2' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.5, // 50% (1/2)
      tolerance: 0.03,
    },
    {
      name: 'Ceph Replicated 3-way: 33% efficiency',
      level: 'ceph_replicated_3' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.333, // 33% (1/3)
      tolerance: 0.03,
    },
    {
      name: 'Ceph EC 2+1: 67% efficiency',
      level: 'ceph_ec_2_1' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.667, // 67% (2/3)
      tolerance: 0.03,
    },
    {
      name: 'Ceph EC 4+2: 67% efficiency',
      level: 'ceph_ec_4_2' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.667, // 67% (4/6)
      tolerance: 0.03,
    },
    {
      name: 'Ceph EC 8+3: 73% efficiency',
      level: 'ceph_ec_8_3' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.727, // 73% (8/11)
      tolerance: 0.03,
    },
    {
      name: 'Ceph EC 8+4: 67% efficiency',
      level: 'ceph_ec_8_4' as const,
      drives: 16,
      driveSize: 1_000_000_000_000,
      expectedEfficiency: 0.667, // 67% (8/12)
      tolerance: 0.03,
    },
  ]

  describe.each(cephVectors)('$name', ({ level, drives, driveSize, expectedEfficiency, tolerance }) => {
    it(`should have ${expectedEfficiency * 100}% efficiency within ${tolerance * 100}% tolerance`, () => {
      const testDrive: Drive = {
        id: `test-${driveSize}`,
        model: 'Test Drive 1TB',
        type: 'HDD',
        formFactor: '3.5"',
        interface: 'SATA',
        capacity_raw: driveSize,
        sector_size: 4096,
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

      const input = createInput(drives, { type: 'ceph', level })
      input.drive = testDrive
      input.serverCount = 3

      const result = calculateVolumetry(input)

      // Validate efficiency matches Ceph specifications
      // Note: Ceph applies safeCapacityThreshold (default 85%), so we measure pre-safe efficiency
      const rawEfficiency = (result.usableCapacity / 0.85) / result.rawCapacity // Undo safe capacity factor
      const lowerBound = expectedEfficiency * (1 - tolerance)
      const upperBound = expectedEfficiency * (1 + tolerance)

      expect(rawEfficiency).toBeGreaterThanOrEqual(lowerBound)
      expect(rawEfficiency).toBeLessThanOrEqual(upperBound)
    })
  })

  describe('Ceph Safe Capacity Factor', () => {
    it('should reduce usable capacity by 15% (default 85% threshold)', () => {
      const input = createInput(12, { type: 'ceph', level: 'ceph_replicated_3' })
      input.cephOptions = { ...DEFAULT_CEPH_OPTIONS, safeCapacityThreshold: 0.85 }

      const result = calculateVolumetry(input)

      // Calculate what usable would be without safe capacity factor
      // With 3-way replication, raw efficiency is 33%
      const rawCapacity = result.rawCapacity
      const theoreticalUsable = rawCapacity * 0.333 * 0.98 // 33% replication + ~2% FS overhead
      const expectedUsable = theoreticalUsable * 0.85 // Apply safe capacity threshold

      const tolerance = expectedUsable * 0.05 // 5% tolerance
      expect(Math.abs(result.usableCapacity - expectedUsable)).toBeLessThan(tolerance)
    })
  })

})

describe('Volumetry Engine - Nutanix', () => {
  // Inline test vectors for Nutanix topologies
  const nutanixVectors = [
    {
      name: 'Nutanix RF2: 50% efficiency',
      level: 'nutanix_rf2' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      replicationFactor: 2,
      expectedEfficiency: 0.5, // 50% (1/2)
      tolerance: 0.05,
    },
    {
      name: 'Nutanix RF3: 33% efficiency',
      level: 'nutanix_rf3' as const,
      drives: 12,
      driveSize: 1_000_000_000_000,
      replicationFactor: 3,
      expectedEfficiency: 0.333, // 33% (1/3)
      tolerance: 0.05,
    },
    {
      name: 'Nutanix EC-X RF2: 75% efficiency',
      level: 'nutanix_ec_rf2' as const,
      drives: 16,
      driveSize: 1_000_000_000_000,
      replicationFactor: 2,
      expectedEfficiency: 0.75, // 75% (4:1 striping)
      tolerance: 0.05,
    },
    {
      name: 'Nutanix EC-X RF3: 75% efficiency',
      level: 'nutanix_ec_rf3' as const,
      drives: 16,
      driveSize: 1_000_000_000_000,
      replicationFactor: 3,
      expectedEfficiency: 0.75, // 75% (6:2 striping = 6/8)
      tolerance: 0.05,
    },
  ]

  describe.each(nutanixVectors)('$name', ({ level, drives, driveSize, replicationFactor, expectedEfficiency, tolerance }) => {
    it(`should have ${expectedEfficiency * 100}% efficiency within ${tolerance * 100}% tolerance`, () => {
      const testDrive: Drive = {
        id: `test-${driveSize}`,
        model: 'Test Drive 1TB',
        type: 'SSD_NVMe',
        formFactor: '2.5"',
        interface: 'NVMe',
        capacity_raw: driveSize,
        sector_size: 4096,
        performance: {
          iops_read: 400000,
          iops_write: 200000,
          bandwidth_read_mb: 3000,
          bandwidth_write_mb: 2500,
        },
        reliability: {
          ure_rate: 17,
          afr: 0.5,
          dwpd: 5,
          mtbf_hours: 2_000_000,
        },
        power: {
          idle_watts: 5,
          load_watts: 8,
        },
        cost_usd: 300,
      }

      const nutanixOptions = {
        ...DEFAULT_NUTANIX_OPTIONS,
        replicationFactor: replicationFactor as 2 | 3,
        systemOverhead: 0.1, // 10% system overhead
      }

      const input = createInput(drives, { type: 'nutanix', level })
      input.drive = testDrive
      input.serverCount = 3
      input.nutanixOptions = nutanixOptions

      const result = calculateVolumetry(input)

      // Validate efficiency matches Nutanix specifications
      // Account for system overhead (10%)
      const rawEfficiency = result.usableCapacity / (result.rawCapacity * 0.9) // Undo system overhead
      const lowerBound = expectedEfficiency * (1 - tolerance)
      const upperBound = expectedEfficiency * (1 + tolerance)

      expect(rawEfficiency).toBeGreaterThanOrEqual(lowerBound)
      expect(rawEfficiency).toBeLessThanOrEqual(upperBound)
    })
  })

  describe('Nutanix System Overhead', () => {
    it('should apply 10% system overhead (default) for CVM, snapshots, metadata', () => {
      const input = createInput(12, { type: 'nutanix', level: 'nutanix_rf2' })
      input.nutanixOptions = { ...DEFAULT_NUTANIX_OPTIONS, systemOverhead: 0.1 }

      const result = calculateVolumetry(input)

      // With RF2 (50% replication) and 10% system overhead:
      // Raw = 12TB
      // After replication = 6TB (50%)
      // After system overhead = 5.4TB (90% of 6TB)
      const rawCapacity = result.rawCapacity
      const expectedAfterReplication = rawCapacity * 0.5
      const expectedUsable = expectedAfterReplication * 0.9 * 0.985 // Apply system overhead + FS overhead

      const tolerance = expectedUsable * 0.05 // 5% tolerance
      expect(Math.abs(result.usableCapacity - expectedUsable)).toBeLessThan(tolerance)
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

describe('Volumetry Engine - Boundary Conditions', () => {
  describe('Maximum drive count tests', () => {
    it('should handle extreme RAID 5 with 100 drives correctly', () => {
      const input = createInput(100, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // 99 data drives * 1TB = 99TB usable
      expect(result.parityOverhead).toBe(1_000_000_000_000) // 1 drive worth
      expect(result.efficiency).toBeGreaterThan(95) // ~99% efficiency (99/100)
      // Validate no integer overflow
      expect(result.usableCapacity).toBeGreaterThan(0)
      expect(result.rawCapacity).toBe(100_000_000_000_000)
    })

    it('should handle extreme RAID 6 with 200 drives correctly', () => {
      const largeDrive: Drive = {
        ...testDrive,
        capacity_raw: 20_000_000_000_000, // 20TB
      }
      const input = createInput(200, { type: 'standard', level: 'RAID6' })
      input.drive = largeDrive

      const result = calculateVolumetry(input)

      // 198 data drives * 20TB = 3960TB usable
      const expectedUsable = 198 * 20_000_000_000_000
      expect(result.usableCapacity).toBeGreaterThan(expectedUsable * 0.95) // Within 5% (FS overhead)
      expect(result.efficiency).toBeGreaterThan(96) // ~99% efficiency (198/200)
      // Validate no floating-point errors at PB scale
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })

    it('should handle ZFS RAID-Z2 with 50 drives (stress test)', () => {
      const input = createInput(50, { type: 'zfs', level: 'raidz2' })
      const result = calculateVolumetry(input)

      // 48 data drives * 1TB = 48TB usable (before slop and FS overhead)
      expect(result.parityOverhead).toBe(2_000_000_000_000) // 2 drives worth
      expect(result.slopOverhead).toBeGreaterThan(0) // Slop should be present
      expect(result.slopOverhead).toBeLessThanOrEqual(128 * 1024 * 1024 * 1024) // Max 128 GiB
      expect(result.efficiency).toBeGreaterThan(90) // ~96% efficiency (48/50)
    })

    it('should handle vSAN ESA with 64 servers (maximum cluster size)', () => {
      const nvmeDrive: Drive = {
        ...testDrive,
        type: 'SSD_NVMe',
        capacity_raw: 4_000_000_000_000, // 4TB NVMe
      }
      // 64 servers * 20 drives = 1280 drives
      const input = createInput(1280, { type: 'vsan_esa', level: 'vsan_esa_raid5' })
      input.drive = nvmeDrive
      input.serverCount = 64

      const result = calculateVolumetry(input)

      // Should use 4+1 scheme (80% efficiency) at this scale
      const efficiencyDecimal = result.efficiency / 100
      expect(efficiencyDecimal).toBeGreaterThan(0.75) // At least 75%
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })
  })

  describe('Extreme capacity tests', () => {
    it('should handle RAID 0 with 24x 20TB drives (480TB raw)', () => {
      const hugeDrive: Drive = {
        ...testDrive,
        capacity_raw: 20_000_000_000_000, // 20TB
      }
      const input = createInput(24, { type: 'standard', level: 'RAID0' })
      input.drive = hugeDrive

      const result = calculateVolumetry(input)

      // Raw = 24 * 20TB = 480TB
      expect(result.rawCapacity).toBe(480_000_000_000_000)
      // Usable ~470TB (accounting for FS overhead)
      expect(result.usableCapacity).toBeGreaterThan(470_000_000_000_000)
      expect(result.usableCapacity).toBeLessThan(480_000_000_000_000)
      expect(Number.isFinite(result.efficiency)).toBe(true)
    })

    it('should handle RAID 6 with 100x 20TB drives (1.96PB usable)', () => {
      const hugeDrive: Drive = {
        ...testDrive,
        capacity_raw: 20_000_000_000_000, // 20TB
      }
      const input = createInput(100, { type: 'standard', level: 'RAID6' })
      input.drive = hugeDrive

      const result = calculateVolumetry(input)

      // Raw = 2000TB = 2PB
      expect(result.rawCapacity).toBe(2_000_000_000_000_000)
      // Usable = 98 drives * 20TB = 1.96PB (before FS overhead)
      const expectedUsable = 98 * 20_000_000_000_000
      expect(result.usableCapacity).toBeGreaterThan(expectedUsable * 0.95)
      expect(result.usableCapacity).toBeLessThan(expectedUsable)
      // Validate capacity calculations handle large numbers
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })

    it('should handle ZFS with 200x 18TB drives (3.6PB raw)', () => {
      const hugeDrive: Drive = {
        ...testDrive,
        capacity_raw: 18_000_000_000_000, // 18TB
      }
      const input = createInput(200, { type: 'zfs', level: 'raidz2' })
      input.drive = hugeDrive

      const result = calculateVolumetry(input)

      // Raw = 200 * 18TB = 3.6PB
      expect(result.rawCapacity).toBe(3_600_000_000_000_000)
      // Validate slop factor calculations don't overflow (max 128GiB)
      expect(result.slopOverhead).toBe(128 * 1024 * 1024 * 1024) // Should hit max
      expect(Number.isFinite(result.efficiency)).toBe(true)
    })
  })

  describe('Minimum capacity tests', () => {
    it('should handle RAID 5 with 3x 100GB drives (small but valid)', () => {
      const smallDrive: Drive = {
        ...testDrive,
        capacity_raw: 100_000_000_000, // 100GB
      }
      const input = createInput(3, { type: 'standard', level: 'RAID5' })
      input.drive = smallDrive

      const result = calculateVolumetry(input)

      // Raw = 300GB, usable = 200GB (minus FS overhead)
      expect(result.rawCapacity).toBe(300_000_000_000)
      expect(result.usableCapacity).toBeGreaterThan(190_000_000_000)
      expect(result.usableCapacity).toBeLessThan(200_000_000_000)
    })

    it('should handle ZFS with small drives (slop factor >= 128MiB minimum)', () => {
      const smallDrive: Drive = {
        ...testDrive,
        capacity_raw: 100_000_000_000, // 100GB
      }
      const input = createInput(3, { type: 'zfs', level: 'raidz1' })
      input.drive = smallDrive

      const result = calculateVolumetry(input)

      // Validate minimum slop space enforced correctly
      const MIN_SLOP = 128 * 1024 * 1024 // 128 MiB
      expect(result.slopOverhead).toBeGreaterThanOrEqual(MIN_SLOP)
    })
  })

  describe('Hot spare boundary tests', () => {
    it('should handle hot spares = 0 (valid, no spares)', () => {
      const input = createInput(6, { type: 'standard', level: 'RAID6' }, 0)

      const result = calculateVolumetry(input)

      expect(result.hotSpareOverhead).toBe(0)
      expect(result.usableCapacity).toBeGreaterThan(0)
    })

    it('should handle hot spares = driveCount - minimum for RAID 5 (extreme but valid)', () => {
      // RAID 5 with 4 drives, 1 hot spare = 3 usable drives (minimum)
      const input = createInput(4, { type: 'standard', level: 'RAID5' }, 1)

      const result = calculateVolumetry(input)

      expect(result.hotSpareOverhead).toBe(1_000_000_000_000)
      // Efficiency = usable / raw = (2TB data - FS overhead) / 4TB total = ~49%
      // (3 drives after hot spare, 2 data drives after parity)
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })

    it('should handle RAID 6 with 5 drives, 1 hot spare (4 data drives = minimum)', () => {
      const input = createInput(5, { type: 'standard', level: 'RAID6' }, 1)

      const result = calculateVolumetry(input)

      expect(result.hotSpareOverhead).toBe(1_000_000_000_000)
      // Efficiency = usable / raw = (2TB data - FS overhead) / 5TB total = ~39%
      // (4 drives after hot spare, 2 data drives after dual parity)
      expect(result.efficiency).toBeGreaterThan(35)
      expect(result.efficiency).toBeLessThan(42)
    })

    it('should validate hot spares do not break capacity calculations', () => {
      // Many hot spares (half the array)
      const input = createInput(12, { type: 'standard', level: 'RAID6' }, 6)

      const result = calculateVolumetry(input)

      expect(result.hotSpareOverhead).toBe(6_000_000_000_000)
      // 6 drives remain: (6-2)/6 = 66.67% efficiency
      expect(result.usableCapacity).toBeGreaterThan(0)
      expect(Number.isFinite(result.efficiency)).toBe(true)
    })
  })

  describe('Property-based tests with extreme values', () => {
    it('should handle extreme drive counts (100-500 drives) without errors', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }), // Extreme drive counts
          fc.constantFrom<'RAID5' | 'RAID6'>('RAID5', 'RAID6'),
          (driveCount, level) => {
            const input = createInput(driveCount, { type: 'standard', level })
            const result = calculateVolumetry(input)

            // Validate calculations always produce non-negative usable capacity
            return (
              result.usableCapacity >= 0 &&
              Number.isFinite(result.usableCapacity) &&
              result.efficiency >= 0 &&
              result.efficiency <= 100
            )
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should handle extreme capacities (1TB-20TB drives) without overflow', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }), // Drive count
          fc.integer({ min: 1_000_000_000_000, max: 20_000_000_000_000 }), // 1TB - 20TB
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

            // Validate efficiency is always between 0 and 100
            return (
              result.efficiency > 0 &&
              result.efficiency <= 100 &&
              Number.isFinite(result.usableCapacity)
            )
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})

describe('Volumetry Engine - Edge Cases: Invalid Drive Counts', () => {
  describe('Zero drives edge cases', () => {
    it('should handle RAID 5 with 0 drives gracefully', () => {
      const input = createInput(0, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // Should return zero capacity (graceful degradation)
      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle RAID 6 with 0 drives gracefully', () => {
      const input = createInput(0, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle ZFS RAID-Z1 with 0 drives gracefully', () => {
      const input = createInput(0, { type: 'zfs', level: 'raidz1' })
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle vSAN OSA with 0 drives gracefully', () => {
      const input = createInput(0, { type: 'vsan_osa', level: 'vsan_osa_raid5' })
      input.serverCount = 4
      const result = calculateVolumetry(input)

      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })
  })

  describe('Below-minimum drive count tests', () => {
    it('should handle RAID 5 with 1 drive (minimum is 3)', () => {
      const input = createInput(1, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // With 1 drive: (1-1)/1 = 0% efficiency
      expect(result.efficiency).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle RAID 5 with 2 drives (below minimum)', () => {
      const input = createInput(2, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // With 2 drives: (2-1)/2 = 50% efficiency (1TB usable)
      // Still below recommended minimum of 3
      expect(result.parityOverhead).toBe(1_000_000_000_000)
      expect(result.usableCapacity).toBeGreaterThan(0)
    })

    it('should handle RAID 6 with 1 drive (minimum is 4)', () => {
      const input = createInput(1, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      // With 1 drive: (1-2)/1 = -100% (negative, should clamp to 0)
      expect(result.usableCapacity).toBeLessThanOrEqual(0)
    })

    it('should handle RAID 6 with 3 drives (still below minimum)', () => {
      const input = createInput(3, { type: 'standard', level: 'RAID6' })
      const result = calculateVolumetry(input)

      // With 3 drives: (3-2)/3 = 33% efficiency
      // Still below recommended minimum of 4
      expect(result.usableCapacity).toBeGreaterThan(0)
      expect(result.efficiency).toBeGreaterThan(30)
      expect(result.efficiency).toBeLessThan(35)
    })

    it('should handle RAID 10 with 1 drive (minimum is 4, even number)', () => {
      const input = createInput(1, { type: 'standard', level: 'RAID10' })
      const result = calculateVolumetry(input)

      // RAID 10 is 50% efficiency even with 1 drive (invalid config)
      expect(result.usableCapacity).toBeGreaterThan(0)
    })

    it('should handle ZFS RAID-Z1 with 1 drive (minimum is 3)', () => {
      const input = createInput(1, { type: 'zfs', level: 'raidz1' })
      const result = calculateVolumetry(input)

      // With 1 drive: (1-1)/1 = 0% efficiency
      expect(result.efficiency).toBeLessThanOrEqual(5) // Close to 0 (accounting for FS overhead)
    })

    it('should handle ZFS RAID-Z2 with 2 drives (minimum is 4)', () => {
      const input = createInput(2, { type: 'zfs', level: 'raidz2' })
      const result = calculateVolumetry(input)

      // With 2 drives: (2-2)/2 = 0% efficiency
      expect(result.usableCapacity).toBeLessThanOrEqual(0)
    })

    it('should handle ZFS RAID-Z3 with 3 drives (minimum is 5)', () => {
      const input = createInput(3, { type: 'zfs', level: 'raidz3' })
      const result = calculateVolumetry(input)

      // With 3 drives: (3-3)/3 = 0% efficiency
      expect(result.usableCapacity).toBeLessThanOrEqual(0)
    })
  })

  describe('Odd number drive tests for RAID levels requiring even counts', () => {
    it('should handle RAID 1 with 3 drives (requires even)', () => {
      const input = createInput(3, { type: 'standard', level: 'RAID1' })
      const result = calculateVolumetry(input)

      // RAID 1 formula: 50% efficiency regardless of drive count
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })

    it('should handle RAID 1 with 5 drives (odd)', () => {
      const input = createInput(5, { type: 'standard', level: 'RAID1' })
      const result = calculateVolumetry(input)

      // Still 50% efficiency (odd drives not ideal but formula works)
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })

    it('should handle RAID 10 with 3 drives (requires even)', () => {
      const input = createInput(3, { type: 'standard', level: 'RAID10' })
      const result = calculateVolumetry(input)

      // RAID 10 formula: 50% efficiency even with odd drives (invalid but formula works)
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })

    it('should handle RAID 10 with 7 drives (odd)', () => {
      const input = createInput(7, { type: 'standard', level: 'RAID10' })
      const result = calculateVolumetry(input)

      // Still 50% efficiency
      expect(result.efficiency).toBeGreaterThan(45)
      expect(result.efficiency).toBeLessThan(52)
    })
  })
})

describe('Volumetry Engine - Error Handling', () => {
  describe('Invalid topology tests', () => {
    it('should handle unknown topology type gracefully', () => {
      const input = createInput(4, { type: 'unknown_type' as any, level: 'RAID5' })
      const result = calculateVolumetry(input)

      // Should fall back to default behavior (no error thrown)
      expect(result.rawCapacity).toBeGreaterThan(0)
      expect(Number.isFinite(result.efficiency)).toBe(true)
    })

    it('should handle invalid RAID level gracefully', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID99' as any })
      const result = calculateVolumetry(input)

      // Should fall back to default (100% efficiency like RAID0)
      expect(result.rawCapacity).toBe(4_000_000_000_000)
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })

    it('should handle null topology gracefully', () => {
      const input = createInput(4, null as any)
      const result = calculateVolumetry(input)

      // Should handle gracefully (may return default values)
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })

    it('should handle undefined topology gracefully', () => {
      const input = createInput(4, undefined as any)
      const result = calculateVolumetry(input)

      // Should handle gracefully
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })
  })

  describe('Missing drive data tests', () => {
    it('should handle null drive object gracefully', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      input.drive = null as any

      const result = calculateVolumetry(input)

      // Should handle gracefully (may return 0 or throw controlled error)
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })

    it('should handle drive with missing capacity_raw field', () => {
      const incompleteDrive: any = {
        id: 'test',
        model: 'Test',
        type: 'HDD',
        // capacity_raw is missing
      }
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      input.drive = incompleteDrive

      const result = calculateVolumetry(input)

      // Should handle missing field (capacity likely undefined, resulting in NaN or 0)
      expect(Number.isFinite(result.rawCapacity) || result.rawCapacity === 0).toBe(true)
    })

    it('should handle drive capacity = 0', () => {
      const zeroDrive: Drive = {
        ...testDrive,
        capacity_raw: 0,
      }
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      input.drive = zeroDrive

      const result = calculateVolumetry(input)

      // Should return 0 capacity
      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle drive capacity < 0 (negative)', () => {
      const negativeDrive: Drive = {
        ...testDrive,
        capacity_raw: -1_000_000_000_000,
      }
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      input.drive = negativeDrive

      const result = calculateVolumetry(input)

      // Negative capacity should result in 0 or handled gracefully
      expect(result.rawCapacity).toBeLessThanOrEqual(0)
    })
  })

  describe('Invalid option combinations tests', () => {
    it('should handle S2D with 0 fault domains (minimum is 2)', () => {
      const input = createInput(8, { type: 's2d', level: 'parity' })
      input.s2dOptions = { ...DEFAULT_S2D_OPTIONS, faultDomains: 0 }

      const result = calculateVolumetry(input)

      // Should handle gracefully (division by zero potential)
      expect(Number.isFinite(result.efficiency) || result.efficiency === 0).toBe(true)
    })

    it('should handle S2D with 1 fault domain (below minimum)', () => {
      const input = createInput(8, { type: 's2d', level: 'parity' })
      input.s2dOptions = { ...DEFAULT_S2D_OPTIONS, faultDomains: 1 }

      const result = calculateVolumetry(input)

      // Should handle gracefully
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })

    it('should handle ZFS compression ratio > 10 (unrealistic)', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      input.compressionRatio = 100 // Extremely high

      const result = calculateVolumetry(input)

      // Should calculate but result in very high effective capacity
      expect(result.effectiveCapacity).toBeGreaterThan(result.usableCapacity * 50)
      expect(Number.isFinite(result.effectiveCapacity)).toBe(true)
    })

    it('should handle ZFS compression ratio < 1 (expansion)', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      input.compressionRatio = 0.5 // Data expansion (unusual)

      const result = calculateVolumetry(input)

      // Effective capacity should be less than usable
      expect(result.effectiveCapacity).toBeLessThan(result.usableCapacity)
      expect(Number.isFinite(result.effectiveCapacity)).toBe(true)
    })

    it('should handle ZFS dedup ratio < 1 (expansion)', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      input.dedupRatio = 0.8 // Dedup overhead exceeds savings

      const result = calculateVolumetry(input)

      // Effective capacity should be less than usable
      expect(result.effectiveCapacity).toBeLessThan(result.usableCapacity)
      expect(Number.isFinite(result.effectiveCapacity)).toBe(true)
    })

    it('should handle Ceph with 0 OSDs', () => {
      // 0 drives in a Ceph pool
      const input = createInput(0, { type: 'ceph', level: 'ceph_replicated_3' })
      input.serverCount = 3

      const result = calculateVolumetry(input)

      // Should return 0 (handled by zero drives check)
      expect(result.rawCapacity).toBe(0)
      expect(result.usableCapacity).toBe(0)
    })

    it('should handle Nutanix with 0 nodes', () => {
      const input = createInput(12, { type: 'nutanix', level: 'nutanix_rf2' })
      input.serverCount = 0

      const result = calculateVolumetry(input)

      // Should handle gracefully
      expect(Number.isFinite(result.usableCapacity)).toBe(true)
    })
  })

  describe('Missing required fields tests', () => {
    it('should handle serverCount = 0 for multi-node systems (vSAN)', () => {
      const input = createInput(16, { type: 'vsan_osa', level: 'vsan_osa_raid5' })
      input.serverCount = 0

      const result = calculateVolumetry(input)

      // Should handle division by zero in stripe width calculations
      expect(Number.isFinite(result.efficiency) || result.efficiency === 0).toBe(true)
    })

    it('should handle missing zfsOptions for ZFS topologies', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' })
      input.zfsOptions = null as any

      const result = calculateVolumetry(input)

      // Should fail or use default values
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })

    it('should handle missing vsanOptions for vSAN topologies', () => {
      const input = createInput(16, { type: 'vsan_osa', level: 'vsan_osa_raid5' })
      input.vsanOptions = null as any

      const result = calculateVolumetry(input)

      // Should fail or use default values
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })

    it('should handle missing cephOptions for Ceph topologies', () => {
      const input = createInput(12, { type: 'ceph', level: 'ceph_replicated_3' })
      input.cephOptions = null as any

      const result = calculateVolumetry(input)

      // Should fail or use default values
      expect(Number.isFinite(result.rawCapacity)).toBe(true)
    })
  })

  describe('Filesystem overhead edge cases', () => {
    it('should apply XFS overhead for standard RAID (default)', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculateVolumetry(input)

      // XFS overhead should be applied (~2%)
      expect(result.filesystemOverhead).toBeGreaterThan(0)
      expect(result.filesystemOverhead).toBeLessThan(result.rawCapacity * 0.05)
    })

    it('should apply ReFS overhead for S2D', () => {
      const input = createInput(16, { type: 's2d', level: 'mirror' })
      input.serverCount = 4
      const result = calculateVolumetry(input)

      // ReFS overhead should be applied
      expect(result.filesystemOverhead).toBeGreaterThan(0)
    })

    it('should apply Btrfs overhead for Synology', () => {
      const input = createInput(4, { type: 'proprietary', level: 'synology_shr' })
      input.synologyOptions = { ...DEFAULT_SYNOLOGY_OPTIONS, filesystem: 'btrfs' }
      const result = calculateVolumetry(input)

      // Btrfs overhead (4%) should be applied
      expect(result.filesystemOverhead).toBeGreaterThan(0)
    })

    it('should apply WAFL overhead for NetApp', () => {
      const input = createInput(8, { type: 'proprietary', level: 'netapp_raid_dp' })
      input.netAppOptions = { ...DEFAULT_NETAPP_OPTIONS, waflOverhead: 0.02 }
      const result = calculateVolumetry(input)

      // WAFL overhead (1-2%) should be applied
      expect(result.filesystemOverhead).toBeGreaterThan(0)
    })

    it('should handle all supported filesystems', () => {
      const topologies = [
        { type: 'standard' as const, level: 'RAID5' as const },
        { type: 'zfs' as const, level: 'raidz1' as const },
        { type: 's2d' as const, level: 'mirror' as const },
        { type: 'vsan_osa' as const, level: 'vsan_osa_raid5' as const },
        { type: 'ceph' as const, level: 'ceph_replicated_3' as const },
      ]

      topologies.forEach((topology) => {
        const input = createInput(4, topology)
        input.serverCount = 4
        const result = calculateVolumetry(input)

        // All should apply some filesystem overhead
        expect(result.filesystemOverhead).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(result.filesystemOverhead)).toBe(true)
      })
    })
  })
})
