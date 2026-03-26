/**
 * Unit Conversion Utilities Tests
 *
 * Validates all exported functions from src/utils/units.ts:
 * formatBytes, driveCapacityToBytes, bytesToDecimalTB, bytesToBinaryTiB,
 * parseCapacity, getConversionFactor, formatBytesBoth, convertUnits.
 *
 * Reference: Phase 13 Plan 01 Task 1 — raise test coverage to >= 75%.
 */

import {
  BINARY,
  bytesToBinaryTiB,
  bytesToDecimalTB,
  convertUnits,
  DECIMAL,
  driveCapacityToBytes,
  formatBytes,
  formatBytesBoth,
  getConversionFactor,
  parseCapacity,
} from '@utils/units'
import { describe, expect, it } from 'vitest'

describe('units.ts', () => {
  describe('BINARY and DECIMAL constants', () => {
    it('BINARY.KiB equals 1024', () => {
      expect(BINARY.KiB).toBe(1024)
    })

    it('BINARY.MiB equals 1024^2', () => {
      expect(BINARY.MiB).toBe(1024 ** 2)
    })

    it('BINARY.GiB equals 1024^3', () => {
      expect(BINARY.GiB).toBe(1024 ** 3)
    })

    it('BINARY.TiB equals 1024^4', () => {
      expect(BINARY.TiB).toBe(1024 ** 4)
    })

    it('BINARY.PiB equals 1024^5', () => {
      expect(BINARY.PiB).toBe(1024 ** 5)
    })

    it('DECIMAL.KB equals 1000', () => {
      expect(DECIMAL.KB).toBe(1000)
    })

    it('DECIMAL.MB equals 1000^2', () => {
      expect(DECIMAL.MB).toBe(1000 ** 2)
    })

    it('DECIMAL.GB equals 1000^3', () => {
      expect(DECIMAL.GB).toBe(1000 ** 3)
    })

    it('DECIMAL.TB equals 1e12', () => {
      expect(DECIMAL.TB).toBe(1e12)
    })

    it('DECIMAL.PB equals 1e15', () => {
      expect(DECIMAL.PB).toBe(1e15)
    })
  })

  describe('formatBytes', () => {
    it('returns "0 B" for zero bytes', () => {
      expect(formatBytes(0, 'binary')).toBe('0 B')
    })

    it('defaults to binary system when no system specified', () => {
      expect(formatBytes(BINARY.TiB)).toBe('1.0 TiB')
    })

    // Binary system tests
    it('formats PiB correctly (binary)', () => {
      expect(formatBytes(BINARY.PiB, 'binary')).toBe('1.0 PiB')
    })

    it('formats TiB correctly (binary)', () => {
      expect(formatBytes(BINARY.TiB, 'binary')).toBe('1.0 TiB')
    })

    it('formats GiB correctly (binary)', () => {
      expect(formatBytes(BINARY.GiB, 'binary')).toBe('1.0 GiB')
    })

    it('formats MiB correctly (binary)', () => {
      const result = formatBytes(BINARY.MiB, 'binary')
      expect(result).toContain('MiB')
    })

    it('formats KiB correctly (binary)', () => {
      const result = formatBytes(1024, 'binary')
      expect(result).toContain('KiB')
    })

    it('uses toFixed(0) for values >= 100 (binary TiB)', () => {
      expect(formatBytes(200 * BINARY.TiB, 'binary')).toBe('200 TiB')
    })

    it('uses toFixed(0) for values >= 100 (binary PiB)', () => {
      expect(formatBytes(200 * BINARY.PiB, 'binary')).toBe('200 PiB')
    })

    it('uses toFixed(0) for values >= 100 (binary GiB)', () => {
      expect(formatBytes(200 * BINARY.GiB, 'binary')).toBe('200 GiB')
    })

    // Decimal system tests
    it('formats PB correctly (decimal)', () => {
      expect(formatBytes(DECIMAL.PB, 'decimal')).toBe('1.0 PB')
    })

    it('formats TB correctly (decimal)', () => {
      expect(formatBytes(DECIMAL.TB, 'decimal')).toBe('1.0 TB')
    })

    it('formats GB correctly (decimal)', () => {
      expect(formatBytes(DECIMAL.GB, 'decimal')).toBe('1.0 GB')
    })

    it('formats MB correctly (decimal)', () => {
      const result = formatBytes(DECIMAL.MB, 'decimal')
      expect(result).toContain('MB')
    })

    it('formats KB correctly (decimal)', () => {
      const result = formatBytes(1000, 'decimal')
      expect(result).toContain('KB')
    })

    it('uses toFixed(0) for values >= 100 (decimal TB)', () => {
      expect(formatBytes(200 * DECIMAL.TB, 'decimal')).toBe('200 TB')
    })

    it('uses toFixed(0) for values >= 100 (decimal PB)', () => {
      expect(formatBytes(200 * DECIMAL.PB, 'decimal')).toBe('200 PB')
    })

    it('uses toFixed(0) for values >= 100 (decimal GB)', () => {
      expect(formatBytes(200 * DECIMAL.GB, 'decimal')).toBe('200 GB')
    })
  })

  describe('driveCapacityToBytes', () => {
    it('converts 1 TB to 1e12 bytes', () => {
      expect(driveCapacityToBytes(1)).toBe(1_000_000_000_000)
    })

    it('converts 3.84 TB to 3.84e12 bytes', () => {
      expect(driveCapacityToBytes(3.84)).toBe(3_840_000_000_000)
    })

    it('converts 24 TB to 24e12 bytes', () => {
      expect(driveCapacityToBytes(24)).toBe(24_000_000_000_000)
    })
  })

  describe('bytesToDecimalTB', () => {
    it('converts 1e12 bytes to 1 TB', () => {
      expect(bytesToDecimalTB(1_000_000_000_000)).toBe(1)
    })

    it('round-trips with driveCapacityToBytes', () => {
      const original = 3.84
      expect(bytesToDecimalTB(driveCapacityToBytes(original))).toBeCloseTo(original)
    })
  })

  describe('bytesToBinaryTiB', () => {
    it('converts 1024^4 bytes to 1 TiB', () => {
      expect(bytesToBinaryTiB(BINARY.TiB)).toBe(1)
    })

    it('returns correct value for a known drive capacity', () => {
      // 1 TB decimal = ~0.9095 TiB
      const bytes = driveCapacityToBytes(1)
      expect(bytesToBinaryTiB(bytes)).toBeCloseTo(0.9095, 3)
    })
  })

  describe('parseCapacity', () => {
    it('parses TB values', () => {
      expect(parseCapacity('24TB')).toBe(24_000_000_000_000)
    })

    it('parses TiB values', () => {
      expect(parseCapacity('24TiB')).toBe(24 * 1024 ** 4)
    })

    it('parses decimal TB values', () => {
      expect(parseCapacity('1.92TB')).toBe(1_920_000_000_000)
    })

    it('parses GB values', () => {
      expect(parseCapacity('100GB')).toBe(100_000_000_000)
    })

    it('parses GiB values', () => {
      expect(parseCapacity('100GiB')).toBe(100 * 1024 ** 3)
    })

    it('parses MiB values', () => {
      expect(parseCapacity('512MiB')).toBe(512 * 1024 ** 2)
    })

    it('parses MB values', () => {
      expect(parseCapacity('512MB')).toBe(512_000_000)
    })

    it('parses PiB values', () => {
      expect(parseCapacity('1PiB')).toBe(1024 ** 5)
    })

    it('parses PB values', () => {
      expect(parseCapacity('1PB')).toBe(1000 ** 5)
    })

    it('parses KiB values', () => {
      expect(parseCapacity('1KiB')).toBe(1024)
    })

    it('parses KB values', () => {
      expect(parseCapacity('1KB')).toBe(1000)
    })

    it('parses B values', () => {
      expect(parseCapacity('1024B')).toBe(1024)
    })

    it('returns 0 for invalid input', () => {
      expect(parseCapacity('invalid')).toBe(0)
    })

    it('defaults to TB when no unit specified', () => {
      expect(parseCapacity('100')).toBe(100 * 1000 ** 4)
    })

    it('handles case-insensitive units (lowercase tb)', () => {
      expect(parseCapacity('24tb')).toBe(24_000_000_000_000)
    })

    it('handles case-insensitive units (mixed case Tib)', () => {
      expect(parseCapacity('24Tib')).toBe(24 * 1024 ** 4)
    })
  })

  describe('getConversionFactor', () => {
    it('returns the ratio of DECIMAL.TB to BINARY.TiB', () => {
      expect(getConversionFactor()).toBe(DECIMAL.TB / BINARY.TiB)
    })

    it('returns approximately 0.9095', () => {
      expect(getConversionFactor()).toBeCloseTo(0.9095, 3)
    })
  })

  describe('formatBytesBoth', () => {
    it('returns an object with binary and decimal keys', () => {
      const result = formatBytesBoth(DECIMAL.TB)
      expect(result).toHaveProperty('binary')
      expect(result).toHaveProperty('decimal')
    })

    it('formats binary value correctly', () => {
      const result = formatBytesBoth(BINARY.TiB)
      expect(result.binary).toBe('1.0 TiB')
    })

    it('formats decimal value correctly', () => {
      const result = formatBytesBoth(DECIMAL.TB)
      expect(result.decimal).toBe('1.0 TB')
    })
  })

  describe('convertUnits', () => {
    it('converts TiB to GiB (binary-to-binary)', () => {
      expect(convertUnits(1, 'TiB', 'GiB')).toBe(1024)
    })

    it('converts TB to GB (decimal-to-decimal)', () => {
      expect(convertUnits(1, 'TB', 'GB')).toBe(1000)
    })

    it('converts TB to TiB (cross-system)', () => {
      expect(convertUnits(1, 'TB', 'TiB')).toBeCloseTo(0.9095, 3)
    })

    it('converts GiB to MiB (binary-to-binary)', () => {
      expect(convertUnits(1, 'GiB', 'MiB')).toBe(1024)
    })

    it('converts PB to TB (decimal-to-decimal)', () => {
      expect(convertUnits(1, 'PB', 'TB')).toBe(1000)
    })

    it('converts KiB to B via bytes (binary)', () => {
      // 1 KiB -> bytes -> B should equal 1024
      expect(convertUnits(1, 'KiB', 'KiB')).toBe(1)
    })
  })
})
