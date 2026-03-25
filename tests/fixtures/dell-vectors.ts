/**
 * Dell Sizer reference vectors for PowerVault ADAPT.
 *
 * ADAPT formula: ((N - 2) / N) * stripe_efficiency
 *   - For N <= 18 drives: stripe_efficiency = 8/10 = 0.80 (8+2 stripe)
 *   - For N > 18 drives: stripe_efficiency = 16/18 = 0.8889 (16+2 stripe)
 *
 * Reference: Dell MidRange Sizer ME5224, Dell ME5 Admin Guide
 * Unit note: Dell Sizer outputs TB (10^12 bytes). Raidy uses bytes internally.
 */

export interface DellAdaptVector {
  name: string
  driveCount: number
  driveCapacityBytes: number // in bytes (base-10 TB * 1e12)
  expectedEfficiency: number // percentage (0-100), before FS overhead
  expectedUsableBytes: number // in bytes, before FS overhead
  tolerance: number // fractional tolerance (e.g., 0.01 = 1%)
  source: string
}

export const dellAdaptVectors: DellAdaptVector[] = [
  {
    name: 'ME5224 12x3.84TB ADAPT 8+2 (Dell Sizer reference)',
    driveCount: 12,
    driveCapacityBytes: 3_840_000_000_000, // 3.84 TB
    // ((12-2)/12) * (8/10) = (10/12) * 0.80 = 0.6667 = 66.67%
    expectedEfficiency: 66.67,
    // 12 * 3.84TB * 0.6667 = 30.72 TB = 30_720_000_000_000 bytes
    expectedUsableBytes: 30_720_000_000_000,
    tolerance: 0.01,
    source: 'Dell MidRange Sizer: ME5224 12x3.84TB SSD ADAPT -> 27.93 TiB usable',
  },
  {
    name: 'PowerVault 18 drives ADAPT 8+2',
    driveCount: 18,
    driveCapacityBytes: 1_000_000_000_000, // 1 TB (testDrive)
    // ((18-2)/18) * (8/10) = (16/18) * 0.80 = 0.7111 = 71.11%
    expectedEfficiency: 71.11,
    expectedUsableBytes: 12_800_000_000_000, // 18 * 1TB * 0.7111
    tolerance: 0.01,
    source: 'Dell ME5 Admin Guide: 8+2 stripe for <=18 drives',
  },
  {
    name: 'PowerVault 24 drives ADAPT 16+2',
    driveCount: 24,
    driveCapacityBytes: 1_000_000_000_000, // 1 TB (testDrive)
    // ((24-2)/24) * (16/18) = (22/24) * 0.8889 = 0.8148 = 81.48%
    expectedEfficiency: 81.48,
    expectedUsableBytes: 19_556_000_000_000, // 24 * 1TB * 0.8148
    tolerance: 0.01,
    source: 'Dell ME5 Admin Guide: 16+2 stripe for >18 drives',
  },
  {
    name: 'PowerVault 36 drives ADAPT 16+2',
    driveCount: 36,
    driveCapacityBytes: 1_000_000_000_000, // 1 TB (testDrive)
    // ((36-2)/36) * (16/18) = (34/36) * 0.8889 = 0.8395 = 83.95%
    expectedEfficiency: 83.95,
    expectedUsableBytes: 30_222_000_000_000, // 36 * 1TB * 0.8395
    tolerance: 0.01,
    source: 'Dell ME5 Admin Guide: 16+2 stripe for >18 drives',
  },
]

/**
 * Dell KB 000188491 reference vectors for PowerStore DRE geometry.
 *
 * PowerStore uses Drive Rebuild Efficiency (DRE) with drive-count-aware stripe widths:
 * - RAID-6: <8 drives uses 4+2 (66.67%), 8-19 drives uses 8+2 (80%), >=20 drives uses 16+2 (88.89%)
 * - RAID-5: <10 drives uses 4+1 (80%), >=10 drives uses 8+1 (88.89%)
 *
 * Reference: Dell KB 000188491, PowerStore 5200Q (35x30.72TB NVMe, RAID(16+2))
 */
export interface DellPowerstoreVector {
  name: string
  driveCount: number
  raidLevel: 'powerstore_raid5' | 'powerstore_raid6'
  driveCapacityBytes: number
  expectedEfficiency: number // percentage (0-100)
  expectedDataFraction: number // decimal (0-1), the raw return from calculateDataFraction
  tolerance: number
  source: string
}

export const dellPowerstoreVectors: DellPowerstoreVector[] = [
  // RAID-6 DRE geometry (Dell KB 000188491)
  {
    name: 'PowerStore RAID-6 6 drives — 4+2 DRE (66.67%)',
    driveCount: 6,
    raidLevel: 'powerstore_raid6',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 66.67,
    expectedDataFraction: 4 / 6, // 0.6667
    tolerance: 0.001,
    source: 'Dell KB 000188491: <8 drives uses 4+2 DRE geometry',
  },
  {
    name: 'PowerStore RAID-6 12 drives — 8+2 DRE (80%)',
    driveCount: 12,
    raidLevel: 'powerstore_raid6',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 80.0,
    expectedDataFraction: 8 / 10, // 0.80
    tolerance: 0.001,
    source: 'Dell KB 000188491: 8-19 drives uses 8+2 DRE geometry',
  },
  {
    name: 'PowerStore RAID-6 20 drives — 16+2 DRE (88.89%)',
    driveCount: 20,
    raidLevel: 'powerstore_raid6',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 88.89,
    expectedDataFraction: 16 / 18, // 0.8889
    tolerance: 0.001,
    source: 'Dell KB 000188491: >=20 drives uses 16+2 DRE geometry',
  },
  {
    name: 'PowerStore RAID-6 35 drives — 16+2 DRE (88.89%)',
    driveCount: 35,
    raidLevel: 'powerstore_raid6',
    driveCapacityBytes: 30_720_000_000_000, // 30.72 TB NVMe
    expectedEfficiency: 88.89,
    expectedDataFraction: 16 / 18, // 0.8889
    tolerance: 0.001,
    source: 'Dell KB 000188491: >=20 drives uses 16+2 DRE geometry (PowerStore 5200Q reference)',
  },
  // RAID-5 DRE geometry (Dell KB 000188491)
  {
    name: 'PowerStore RAID-5 8 drives — 4+1 DRE (80%)',
    driveCount: 8,
    raidLevel: 'powerstore_raid5',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 80.0,
    expectedDataFraction: 4 / 5, // 0.80
    tolerance: 0.001,
    source: 'Dell KB 000188491: <10 drives uses 4+1 DRE geometry',
  },
  {
    name: 'PowerStore RAID-5 10 drives — 8+1 DRE (88.89%)',
    driveCount: 10,
    raidLevel: 'powerstore_raid5',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 88.89,
    expectedDataFraction: 8 / 9, // 0.8889
    tolerance: 0.001,
    source: 'Dell KB 000188491: >=10 drives uses 8+1 DRE geometry',
  },
  {
    name: 'PowerStore RAID-5 20 drives — 8+1 DRE (88.89%)',
    driveCount: 20,
    raidLevel: 'powerstore_raid5',
    driveCapacityBytes: 1_000_000_000_000,
    expectedEfficiency: 88.89,
    expectedDataFraction: 8 / 9, // 0.8889
    tolerance: 0.001,
    source: 'Dell KB 000188491: >=10 drives uses 8+1 DRE geometry',
  },
]
