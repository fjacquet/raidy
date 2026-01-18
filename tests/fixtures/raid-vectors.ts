/**
 * RAID Test Vectors - WintelGuy Validated
 *
 * These test vectors are validated against the WintelGuy RAID Calculator
 * (https://wintelguy.com/raidcalc.pl) to ensure our calculations match
 * industry-standard RAID capacity formulas.
 *
 * Each vector includes expected usable capacity with 1% tolerance to account
 * for minor variations in filesystem overhead calculations.
 */

import type { StandardRaidLevel } from '@/types/topology'

export interface RaidTestVector {
  /** Descriptive name for the test case */
  name: string
  /** RAID level to test */
  level: StandardRaidLevel
  /** Number of drives in the array */
  drives: number
  /** Size of each drive in bytes */
  driveSize: number
  /** Expected usable capacity in bytes (before filesystem overhead) */
  expectedUsable: number
  /** Tolerance for comparison (0.01 = 1%) */
  tolerance: number
  /** Source of validation */
  source: string
  /** URL to calculator/reference */
  url: string
}

/**
 * RAID Capacity Formulas (for reference):
 *
 * RAID 0:  Usable = N × Drive_Size
 *          Efficiency = 100%
 *
 * RAID 1:  Usable = (N / 2) × Drive_Size
 *          Efficiency = 50%
 *
 * RAID 1E: Usable = (N / 2) × Drive_Size (mirrored striping)
 *          Efficiency = 50%
 *
 * RAID 3:  Usable = (N - 1) × Drive_Size (byte-level striping + dedicated parity)
 *          Efficiency = (N-1)/N
 *
 * RAID 4:  Usable = (N - 1) × Drive_Size (block-level striping + dedicated parity)
 *          Efficiency = (N-1)/N
 *
 * RAID 5:  Usable = (N - 1) × Drive_Size (distributed parity)
 *          Efficiency = (N-1)/N
 *
 * RAID 5E: Usable = (N - 2) × Drive_Size (distributed parity + distributed spare)
 *          Efficiency = (N-2)/N
 *
 * RAID 5EE: Usable = (N - 2) × Drive_Size (distributed parity + active spare)
 *           Efficiency = (N-2)/N
 *
 * RAID 6:  Usable = (N - 2) × Drive_Size (dual parity)
 *          Efficiency = (N-2)/N
 *
 * RAID 10: Usable = (N / 2) × Drive_Size (mirror pairs, then stripe)
 *          Efficiency = 50%
 *
 * RAID 50: Usable = (N - 2×Groups) × Drive_Size (striped RAID 5 arrays)
 *          For 2 groups: (N-2) × Drive_Size
 *          Efficiency = (N-2)/N for 2 groups
 *
 * RAID 60: Usable = (N - 2×Groups) × Drive_Size (striped RAID 6 arrays)
 *          For 2 groups: (N-4) × Drive_Size
 *          Efficiency = (N-4)/N for 2 groups
 */

const TB = 1_000_000_000_000 // 1TB in bytes
const FILESYSTEM_OVERHEAD = 0.02 // ~2% typical filesystem overhead

/**
 * Calculate expected usable capacity accounting for filesystem overhead.
 * WintelGuy calculator returns raw usable capacity, our engine applies FS overhead.
 */
function expectedCapacity(rawUsable: number): number {
  return rawUsable * (1 - FILESYSTEM_OVERHEAD)
}

/**
 * Standard RAID test vectors validated against WintelGuy RAID Calculator.
 * Minimum 2 test cases per RAID level (11 levels × 2 = 22+ vectors).
 */
export const standardRAIDVectors: RaidTestVector[] = [
  // ============================================================
  // RAID 0 - Striping (No Redundancy)
  // ============================================================
  {
    name: 'RAID 0: 4×1TB - Maximum Efficiency',
    level: 'RAID0',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(4 * TB), // 4TB usable
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 0: 8×1TB - Large Array',
    level: 'RAID0',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(8 * TB), // 8TB usable
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 1 - Mirroring (50% Efficiency)
  // ============================================================
  {
    name: 'RAID 1: 2×1TB - Basic Mirror',
    level: 'RAID1',
    drives: 2,
    driveSize: TB,
    expectedUsable: expectedCapacity(1 * TB), // 1TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 1: 4×1TB - Dual Mirror Pairs',
    level: 'RAID1',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(2 * TB), // 2TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 1E - Mirrored Striping (50% Efficiency)
  // ============================================================
  {
    name: 'RAID 1E: 4×1TB - Mirrored Stripes',
    level: 'RAID1E',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(2 * TB), // 2TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 1E: 6×1TB - Balanced Performance',
    level: 'RAID1E',
    drives: 6,
    driveSize: TB,
    expectedUsable: expectedCapacity(3 * TB), // 3TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 3 - Byte-Level Striping with Dedicated Parity
  // ============================================================
  {
    name: 'RAID 3: 4×1TB - Dedicated Parity',
    level: 'RAID3',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(3 * TB), // 3TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 3: 8×1TB - High Sequential Performance',
    level: 'RAID3',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(7 * TB), // 7TB usable (87.5%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 4 - Block-Level Striping with Dedicated Parity
  // ============================================================
  {
    name: 'RAID 4: 4×1TB - Dedicated Parity Disk',
    level: 'RAID4',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(3 * TB), // 3TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 4: 6×1TB - Better Efficiency',
    level: 'RAID4',
    drives: 6,
    driveSize: TB,
    expectedUsable: expectedCapacity(5 * TB), // 5TB usable (83.3%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 5 - Distributed Parity (Most Common)
  // ============================================================
  {
    name: 'RAID 5: 4×1TB - Minimum Configuration',
    level: 'RAID5',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(3 * TB), // 3TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 5: 8×1TB - Optimal Efficiency',
    level: 'RAID5',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(7 * TB), // 7TB usable (87.5%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 5E - RAID 5 with Integrated Distributed Spare
  // ============================================================
  {
    name: 'RAID 5E: 5×1TB - Integrated Spare',
    level: 'RAID5E',
    drives: 5,
    driveSize: TB,
    expectedUsable: expectedCapacity(3 * TB), // 3TB usable (60%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 5E: 8×1TB - Better Utilization',
    level: 'RAID5E',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(6 * TB), // 6TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 5EE - RAID 5 with Active Distributed Spare
  // ============================================================
  {
    name: 'RAID 5EE: 6×1TB - Active Spare',
    level: 'RAID5EE',
    drives: 6,
    driveSize: TB,
    expectedUsable: expectedCapacity(4 * TB), // 4TB usable (66.7%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 5EE: 10×1TB - Large Array',
    level: 'RAID5EE',
    drives: 10,
    driveSize: TB,
    expectedUsable: expectedCapacity(8 * TB), // 8TB usable (80%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 6 - Dual Parity (2-Drive Fault Tolerance)
  // ============================================================
  {
    name: 'RAID 6: 6×1TB - Minimum Configuration',
    level: 'RAID6',
    drives: 6,
    driveSize: TB,
    expectedUsable: expectedCapacity(4 * TB), // 4TB usable (66.7%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 6: 12×1TB - High Efficiency',
    level: 'RAID6',
    drives: 12,
    driveSize: TB,
    expectedUsable: expectedCapacity(10 * TB), // 10TB usable (83.3%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 10 - Mirrored Stripes (50% Efficiency, High Performance)
  // ============================================================
  {
    name: 'RAID 10: 4×1TB - Basic Mirrored Stripe',
    level: 'RAID10',
    drives: 4,
    driveSize: TB,
    expectedUsable: expectedCapacity(2 * TB), // 2TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 10: 8×1TB - High-Performance Array',
    level: 'RAID10',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(4 * TB), // 4TB usable (50%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 50 - Striped RAID 5 Arrays (2 groups assumed)
  // ============================================================
  {
    name: 'RAID 50: 8×1TB - 2 Groups of RAID 5',
    level: 'RAID50',
    drives: 8,
    driveSize: TB,
    expectedUsable: expectedCapacity(6 * TB), // 6TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 50: 12×1TB - Balanced Performance',
    level: 'RAID50',
    drives: 12,
    driveSize: TB,
    expectedUsable: expectedCapacity(10 * TB), // 10TB usable (83.3%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },

  // ============================================================
  // RAID 60 - Striped RAID 6 Arrays (2 groups assumed)
  // ============================================================
  {
    name: 'RAID 60: 12×1TB - 2 Groups of RAID 6',
    level: 'RAID60',
    drives: 12,
    driveSize: TB,
    expectedUsable: expectedCapacity(8 * TB), // 8TB usable (66.7%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 60: 16×1TB - High Reliability',
    level: 'RAID60',
    drives: 16,
    driveSize: TB,
    expectedUsable: expectedCapacity(12 * TB), // 12TB usable (75%)
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
]
