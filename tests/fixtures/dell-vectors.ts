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

/**
 * Dell Sizer end-to-end reference vector for PowerStore 5200Q.
 *
 * Reference: Dell Sizer PPTX — PowerStore 5200Q, 35x30.72TB NVMe QLC, RAID(16+2)
 * Raw: 977.89 TiB = 35 * 30.72TB / (1024^4/1e12) = 35 * 30_720_000_000_000 bytes
 * Dell Sizer Usable: 801.57 TiB
 *
 * Calculation chain:
 *   rawBytes = 35 * 30_720_000_000_000 = 1_075_200_000_000_000
 *   dataFraction (16+2 DRE, >=20 drives) = 16/18 = 0.88889
 *   capacityAfterParity = 1_075_200_000_000_000 * (16/18) = 955_733_333_333_333
 *   systemOverhead (5%) = 955_733_333_333_333 * 0.05 = 47_786_666_666_667
 *   snapshotReserve (0% for this test) = 0
 *   afterOverheads = 955_733_333_333_333 - 47_786_666_666_667 = 907_946_666_666_666
 *   Dell Sizer usable = 801.57 TiB = 881_326_213_857_689 bytes (approx)
 *   Tolerance: 2% (accounts for FS overhead and model-specific variation)
 */
export interface DellPowerstore5200QVector {
  name: string
  driveCount: number
  driveCapacityBytes: number
  raidLevel: 'powerstore_raid6'
  systemOverheadPercent: number
  snapshotReservePercent: number
  expectedUsableTiB: number
  expectedRawTiB: number
  tolerance: number
  source: string
}

export const dellPowerstore5200QVector: DellPowerstore5200QVector = {
  name: 'PowerStore 5200Q 35x30.72TB NVMe RAID(16+2) — Dell Sizer reference',
  driveCount: 35,
  driveCapacityBytes: 30_720_000_000_000, // 30.72 TB
  raidLevel: 'powerstore_raid6',
  systemOverheadPercent: 5,
  snapshotReservePercent: 0, // Isolate system overhead from snapshot reserve
  expectedUsableTiB: 801.57,
  expectedRawTiB: 977.89,
  tolerance: 0.02, // 2% tolerance (accounts for FS overhead differences)
  source: 'Dell Sizer PPTX: PowerStore 5200Q 35x30.72TB NVMe QLC RAID(16+2)',
}

/**
 * Dell OneFS reference vectors for PowerScale N+x protection.
 *
 * REMOVED (2026-08-22, PowerScale multi-tier restructuring): these vectors validated the old
 * drive-count/node-count "N+x" formula (N/(N+M)) that `calculateVolumetry` no longer reaches for
 * `type: 'powerscale'` — it now branches unconditionally to the tier-based
 * `calculatePowerScaleVolumetry` sub-engine (see `src/engines/volumetry/index.ts` and
 * `src/engines/volumetry/powerscale/`). `dellStrategy.calculateDataFraction`'s N+x formulas
 * still exist in dell.ts pending removal in a later task; see
 * `tests/engines/volumetry.spec.ts`'s "PowerScale OneFS (multi-tier cluster)" describe block for
 * the one remaining direct unit test of that dead path, and
 * `tests/engines/volumetry/powerscale/{tier,cluster}.spec.ts` for the vendor-verified reference
 * vectors covering the current model.
 */

/**
 * Dell PowerFlex reference vectors for EC/mirror data fraction validation.
 *
 * PowerFlex protection formulas:
 * - 2-way mirror: k/(k+m) where m=k → 50%
 * - 3-way mirror: k/(k+m) where m=2k → 33.33%
 * - EC k+m: k/(k+m) — standard erasure coding math
 *
 * Reference: Dell PowerFlex documentation, standard EC math
 */
export interface DellPowerflexVector {
  name: string
  level:
    | 'powerflex_medium_2way'
    | 'powerflex_fine_2way'
    | 'powerflex_medium_3way'
    | 'powerflex_ec_4_1'
    | 'powerflex_ec_4_2'
    | 'powerflex_ec_8_2'
    | 'powerflex_ec_12_4'
  driveCount: number
  expectedDataFraction: number // decimal (0-1)
  expectedEfficiency: number // percentage (0-100)
  tolerance: number
  source: string
}

export const dellPowerflexVectors: DellPowerflexVector[] = [
  {
    name: 'PowerFlex 2-way mirror medium granularity (50%)',
    level: 'powerflex_medium_2way',
    driveCount: 12,
    expectedDataFraction: 0.5,
    expectedEfficiency: 50.0,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: 2-way mirror k/(k+m) where m=k',
  },
  {
    name: 'PowerFlex 2-way mirror fine granularity (50%)',
    level: 'powerflex_fine_2way',
    driveCount: 12,
    expectedDataFraction: 0.5,
    expectedEfficiency: 50.0,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: Fine Granularity 2-way mirror',
  },
  {
    name: 'PowerFlex 3-way mirror medium granularity (33.33%)',
    level: 'powerflex_medium_3way',
    driveCount: 18,
    expectedDataFraction: 1 / 3,
    expectedEfficiency: 33.33,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: 3-way mirror 1/3 efficiency',
  },
  {
    name: 'PowerFlex EC 4+1 (80%)',
    level: 'powerflex_ec_4_1',
    driveCount: 10,
    expectedDataFraction: 4 / 5,
    expectedEfficiency: 80.0,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: EC 4+1 = 4/(4+1) = 80%',
  },
  {
    name: 'PowerFlex EC 4+2 (66.67%)',
    level: 'powerflex_ec_4_2',
    driveCount: 12,
    expectedDataFraction: 4 / 6,
    expectedEfficiency: 66.67,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: EC 4+2 = 4/(4+2) = 66.67%',
  },
  {
    name: 'PowerFlex EC 8+2 (80%)',
    level: 'powerflex_ec_8_2',
    driveCount: 16,
    expectedDataFraction: 8 / 10,
    expectedEfficiency: 80.0,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: EC 8+2 = 8/(8+2) = 80%',
  },
  {
    name: 'PowerFlex EC 12+4 (75%)',
    level: 'powerflex_ec_12_4',
    driveCount: 24,
    expectedDataFraction: 12 / 16,
    expectedEfficiency: 75.0,
    tolerance: 0.001,
    source: 'Dell PowerFlex documentation: EC 12+4 = 12/(12+4) = 75%',
  },
]

/**
 * Dell ObjectScale reference vectors for EC/mirror data fraction validation.
 *
 * ObjectScale protection formulas:
 * - EC k+m: k/(k+m) — standard erasure coding math
 * - Triple mirror: 1/3 — always 33.33%
 *
 * Reference: Dell ObjectScale documentation, standard EC math
 */
export interface DellObjectscaleVector {
  name: string
  level:
    | 'objectscale_ec_12_4'
    | 'objectscale_ec_10_2'
    | 'objectscale_ec_24_4'
    | 'objectscale_mirror_3'
  driveCount: number
  expectedDataFraction: number // decimal (0-1)
  expectedEfficiency: number // percentage (0-100)
  tolerance: number
  source: string
}

export const dellObjectscaleVectors: DellObjectscaleVector[] = [
  {
    name: 'ObjectScale EC 12+4 (75%)',
    level: 'objectscale_ec_12_4',
    driveCount: 16,
    expectedDataFraction: 12 / 16,
    expectedEfficiency: 75.0,
    tolerance: 0.001,
    source: 'Dell ObjectScale documentation: EC 12+4 = 12/(12+4) = 75%',
  },
  {
    name: 'ObjectScale EC 10+2 (83.33%)',
    level: 'objectscale_ec_10_2',
    driveCount: 12,
    expectedDataFraction: 10 / 12,
    expectedEfficiency: 83.33,
    tolerance: 0.001,
    source: 'Dell ObjectScale documentation: EC 10+2 = 10/(10+2) = 83.33%',
  },
  {
    name: 'ObjectScale EC 24+4 (85.71%)',
    level: 'objectscale_ec_24_4',
    driveCount: 28,
    expectedDataFraction: 24 / 28,
    expectedEfficiency: 85.71,
    tolerance: 0.001,
    source: 'Dell ObjectScale documentation: EC 24+4 = 24/(24+4) = 85.71%',
  },
  {
    name: 'ObjectScale mirror-3 (33.33%)',
    level: 'objectscale_mirror_3',
    driveCount: 6,
    expectedDataFraction: 1 / 3,
    expectedEfficiency: 33.33,
    tolerance: 0.001,
    source: 'Dell ObjectScale documentation: Triple mirror = 1/3 = 33.33%',
  },
]
