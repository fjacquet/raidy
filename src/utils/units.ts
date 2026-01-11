/**
 * Storage unit conversion utilities.
 *
 * Convention:
 * - Internal: Always store in bytes
 * - Display: Use correct unit labels based on system (TiB vs TB)
 * - Drive specs from manufacturers: Decimal (TB) - they advertise in SI units
 * - OS/filesystem capacity: Binary (TiB) - actual usable space
 */

/** Binary (IEC) units - used for OS/filesystem capacity calculations */
export const BINARY = {
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  PiB: 1024 ** 5,
} as const

/** Decimal (SI) units - used for drive marketing specs */
export const DECIMAL = {
  KB: 1000,
  MB: 1000 ** 2,
  GB: 1000 ** 3,
  TB: 1000 ** 4,
  PB: 1000 ** 5,
} as const

/** Unit system type */
export type UnitSystem = 'binary' | 'decimal'

/**
 * Format bytes to human-readable string with correct unit labels.
 *
 * @param bytes - Value in bytes
 * @param system - 'binary' (TiB/GiB) or 'decimal' (TB/GB)
 * @returns Formatted string with appropriate unit
 *
 * @example
 * formatBytes(1099511627776, 'binary')  // "1.0 TiB"
 * formatBytes(1000000000000, 'decimal') // "1.0 TB"
 */
export function formatBytes(bytes: number, system: UnitSystem = 'binary'): string {
  if (bytes === 0) return '0 B'

  if (system === 'binary') {
    if (bytes >= BINARY.PiB) {
      const value = bytes / BINARY.PiB
      return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} PiB`
    }
    if (bytes >= BINARY.TiB) {
      const value = bytes / BINARY.TiB
      return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} TiB`
    }
    if (bytes >= BINARY.GiB) {
      const value = bytes / BINARY.GiB
      return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} GiB`
    }
    if (bytes >= BINARY.MiB) {
      return `${Math.round(bytes / BINARY.MiB)} MiB`
    }
    return `${Math.round(bytes / BINARY.KiB)} KiB`
  }

  // Decimal (SI) units
  if (bytes >= DECIMAL.PB) {
    const value = bytes / DECIMAL.PB
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} PB`
  }
  if (bytes >= DECIMAL.TB) {
    const value = bytes / DECIMAL.TB
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} TB`
  }
  if (bytes >= DECIMAL.GB) {
    const value = bytes / DECIMAL.GB
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} GB`
  }
  if (bytes >= DECIMAL.MB) {
    return `${Math.round(bytes / DECIMAL.MB)} MB`
  }
  return `${Math.round(bytes / DECIMAL.KB)} KB`
}

/**
 * Convert drive marketing capacity (decimal TB) to actual bytes.
 * Manufacturers advertise drives in decimal TB (1 TB = 10^12 bytes).
 *
 * @param decimalTB - Capacity in decimal terabytes
 * @returns Capacity in bytes
 *
 * @example
 * driveCapacityToBytes(24) // 24000000000000 (24 TB in bytes)
 */
export function driveCapacityToBytes(decimalTB: number): number {
  return decimalTB * DECIMAL.TB
}

/**
 * Convert bytes to decimal TB (for display matching drive specs).
 *
 * @param bytes - Capacity in bytes
 * @returns Capacity in decimal TB
 */
export function bytesToDecimalTB(bytes: number): number {
  return bytes / DECIMAL.TB
}

/**
 * Convert bytes to binary TiB (for OS/filesystem display).
 *
 * @param bytes - Capacity in bytes
 * @returns Capacity in binary TiB
 */
export function bytesToBinaryTiB(bytes: number): number {
  return bytes / BINARY.TiB
}

/**
 * Parse capacity string like "24TB" or "1.92TiB" to bytes.
 * Handles both SI (TB, GB) and IEC (TiB, GiB) units.
 *
 * @param str - Capacity string to parse
 * @returns Capacity in bytes, or 0 if parsing fails
 *
 * @example
 * parseCapacity("24TB")   // 24000000000000 (decimal)
 * parseCapacity("24TiB")  // 26388279066624 (binary)
 * parseCapacity("1.92TB") // 1920000000000
 */
export function parseCapacity(str: string): number {
  const match = str.match(/^([\d.]+)\s*(PiB|PB|TiB|TB|GiB|GB|MiB|MB|KiB|KB|B)?$/i)
  if (!match || !match[1]) return 0

  const value = Number.parseFloat(match[1])
  const unit = (match[2] ?? 'TB').toLowerCase()

  switch (unit) {
    case 'pib':
      return value * BINARY.PiB
    case 'pb':
      return value * DECIMAL.PB
    case 'tib':
      return value * BINARY.TiB
    case 'tb':
      return value * DECIMAL.TB
    case 'gib':
      return value * BINARY.GiB
    case 'gb':
      return value * DECIMAL.GB
    case 'mib':
      return value * BINARY.MiB
    case 'mb':
      return value * DECIMAL.MB
    case 'kib':
      return value * BINARY.KiB
    case 'kb':
      return value * DECIMAL.KB
    case 'b':
      return value
    default:
      return value * DECIMAL.TB // Default to decimal TB
  }
}

/**
 * Get the conversion factor between decimal and binary units.
 * Useful for understanding the difference between advertised and actual capacity.
 *
 * At TB level: 1 TB = 0.909 TiB (about 9.1% less)
 *
 * @param decimalBytes - Value in bytes (from decimal conversion)
 * @param binaryBytes - Value in bytes (from binary conversion)
 * @returns Ratio of decimal to binary
 */
export function getConversionFactor(): number {
  return DECIMAL.TB / BINARY.TiB // ~0.9095
}

/**
 * Format bytes with both unit systems for comparison.
 * Useful for showing users the difference between marketing and actual capacity.
 *
 * @param bytes - Value in bytes
 * @returns Object with both formatted values
 */
export function formatBytesBoth(bytes: number): { binary: string; decimal: string } {
  return {
    binary: formatBytes(bytes, 'binary'),
    decimal: formatBytes(bytes, 'decimal'),
  }
}

/**
 * Convert between unit systems at a specific scale.
 *
 * @param value - Numeric value
 * @param fromUnit - Source unit (e.g., 'TB', 'TiB')
 * @param toUnit - Target unit (e.g., 'TiB', 'TB')
 * @returns Converted value
 */
export function convertUnits(
  value: number,
  fromUnit: keyof typeof BINARY | keyof typeof DECIMAL,
  toUnit: keyof typeof BINARY | keyof typeof DECIMAL,
): number {
  // Convert to bytes first
  let bytes: number
  if (fromUnit in BINARY) {
    bytes = value * BINARY[fromUnit as keyof typeof BINARY]
  } else {
    bytes = value * DECIMAL[fromUnit as keyof typeof DECIMAL]
  }

  // Convert from bytes to target
  if (toUnit in BINARY) {
    return bytes / BINARY[toUnit as keyof typeof BINARY]
  }
  return bytes / DECIMAL[toUnit as keyof typeof DECIMAL]
}
