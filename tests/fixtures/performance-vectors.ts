/**
 * Performance Test Vectors
 *
 * Industry-validated test drives and RAID performance expectations.
 * Sources:
 * - MassiveGRID: "Understanding RAID Write Penalties"
 *   https://www.massivegrid.com/blog/understanding-raid-write-penalties/
 * - WintelGuy RAID Performance Calculator
 *   https://www.wintellect.com/raid-calculator/
 * - Industry standard formulas from storage vendors
 */

import type { Drive } from '@/types/drive'

/**
 * Test drive: 7200 RPM HDD
 * Typical enterprise HDD specs (e.g., WD Gold, Seagate Exos)
 */
export const testHdd7200: Drive = {
  id: 'test-hdd-7200',
  model: 'Test HDD 7200 RPM 4TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  rpm: 7200,
  capacity_raw: 4_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 150,
    iops_write: 140,
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

/**
 * Test drive: SATA SSD
 * Typical enterprise SATA SSD specs (e.g., Samsung 870 EVO, Crucial MX500)
 */
export const testSsdSata: Drive = {
  id: 'test-ssd-sata',
  model: 'Test SSD SATA 1TB',
  type: 'SSD_SATA',
  formFactor: '2.5"',
  interface: 'SATA',
  capacity_raw: 1_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 95_000,
    iops_write: 85_000,
    bandwidth_read_mb: 550,
    bandwidth_write_mb: 520,
  },
  reliability: {
    ure_rate: 17,
    afr: 0.5,
    dwpd: 1,
    mtbf_hours: 2_000_000,
  },
  power: {
    idle_watts: 2,
    load_watts: 4,
  },
  cost_usd: 150,
}

/**
 * Test drive: NVMe SSD
 * Typical enterprise NVMe SSD specs (e.g., Samsung PM9A3, Intel P5800X)
 */
export const testSsdNvme: Drive = {
  id: 'test-ssd-nvme',
  model: 'Test SSD NVMe 2TB',
  type: 'SSD_NVMe',
  formFactor: '2.5"',
  interface: 'PCIe4',
  capacity_raw: 2_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 750_000,
    iops_write: 150_000,
    bandwidth_read_mb: 6800,
    bandwidth_write_mb: 4000,
  },
  reliability: {
    ure_rate: 17,
    afr: 0.35,
    dwpd: 3,
    mtbf_hours: 2_500_000,
  },
  power: {
    idle_watts: 3,
    load_watts: 8,
  },
  cost_usd: 300,
}

/**
 * Performance test vector definition
 */
export interface PerformanceVector {
  name: string
  driveType: 'HDD' | 'SSD_SATA' | 'SSD_NVMe'
  drive: Drive
  driveCount: number
  raidLevel:
    | 'RAID0'
    | 'RAID1'
    | 'RAID5'
    | 'RAID6'
    | 'RAID10'
    | 'raidz1'
    | 'raidz2'
    | 'mirror'
    | 'stripe'
  expectedReadIOPS: number
  expectedWriteIOPS: number
  expectedWritePenalty: number
  source: string
}

/**
 * Industry-validated performance test vectors
 *
 * Formulas per MassiveGRID and WintelGuy:
 * - RAID 0: Read IOPS = N × drive_iops, Write IOPS = N × drive_iops
 * - RAID 1: Read IOPS = N × drive_iops, Write IOPS = (N × drive_iops) / 2
 * - RAID 5: Read IOPS = N × drive_iops, Write IOPS = ((N-1) × drive_iops) / 4
 * - RAID 6: Read IOPS = N × drive_iops, Write IOPS = ((N-2) × drive_iops) / 6
 * - RAID 10: Read IOPS = N × drive_iops, Write IOPS = (N × drive_iops) / 2
 */
export const performanceVectors: PerformanceVector[] = [
  // RAID 0 - No redundancy, no penalty
  {
    name: 'RAID 0 with 4× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 4,
    raidLevel: 'RAID0',
    expectedReadIOPS: 4 * 150, // 600 IOPS
    expectedWriteIOPS: 4 * 140, // 560 IOPS
    expectedWritePenalty: 1,
    source: 'MassiveGRID - RAID 0 has no write penalty',
  },
  {
    name: 'RAID 0 with 8× SSD SATA',
    driveType: 'SSD_SATA',
    drive: testSsdSata,
    driveCount: 8,
    raidLevel: 'RAID0',
    expectedReadIOPS: 8 * 85_000, // 680,000 IOPS (use write IOPS as minimum)
    expectedWriteIOPS: 8 * 85_000, // 680,000 IOPS
    expectedWritePenalty: 1,
    source: 'MassiveGRID - RAID 0 has no write penalty',
  },

  // RAID 1 - Mirror writes
  {
    name: 'RAID 1 with 2× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 2,
    raidLevel: 'RAID1',
    expectedReadIOPS: 2 * 150, // 300 IOPS (can read from both)
    expectedWriteIOPS: (2 * 140) / 2, // 140 IOPS (write to both mirrors)
    expectedWritePenalty: 2,
    source: 'MassiveGRID - RAID 1 write penalty = 2 (mirror both copies)',
  },
  {
    name: 'RAID 1 with 2× SSD NVMe',
    driveType: 'SSD_NVMe',
    drive: testSsdNvme,
    driveCount: 2,
    raidLevel: 'RAID1',
    expectedReadIOPS: 2 * 150_000, // 300,000 IOPS
    expectedWriteIOPS: (2 * 150_000) / 2, // 150,000 IOPS
    expectedWritePenalty: 2,
    source: 'MassiveGRID - RAID 1 write penalty = 2',
  },

  // RAID 5 - 4× penalty (read old data + parity, write new data + parity)
  {
    name: 'RAID 5 with 4× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 4,
    raidLevel: 'RAID5',
    expectedReadIOPS: 4 * 150, // 600 IOPS
    expectedWriteIOPS: ((4 - 1) * 140) / 4, // 105 IOPS = (3 data drives × 140) / 4
    expectedWritePenalty: 4,
    source: 'MassiveGRID - RAID 5 write penalty = 4 (read old data + parity, write new)',
  },
  {
    name: 'RAID 5 with 8× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 8,
    raidLevel: 'RAID5',
    expectedReadIOPS: 8 * 150, // 1200 IOPS
    expectedWriteIOPS: ((8 - 1) * 140) / 4, // 245 IOPS = (7 data drives × 140) / 4
    expectedWritePenalty: 4,
    source: 'MassiveGRID - More drives increases write IOPS despite penalty',
  },
  {
    name: 'RAID 5 with 12× SSD SATA',
    driveType: 'SSD_SATA',
    drive: testSsdSata,
    driveCount: 12,
    raidLevel: 'RAID5',
    expectedReadIOPS: 12 * 85_000, // 1,020,000 IOPS
    expectedWriteIOPS: ((12 - 1) * 85_000) / 4, // 233,750 IOPS
    expectedWritePenalty: 4,
    source: 'WintelGuy - RAID 5 write IOPS = (N-1) × drive_iops / 4',
  },

  // RAID 6 - 6× penalty (read old data + 2 parities, write new data + 2 parities)
  {
    name: 'RAID 6 with 6× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 6,
    raidLevel: 'RAID6',
    expectedReadIOPS: 6 * 150, // 900 IOPS
    expectedWriteIOPS: ((6 - 2) * 140) / 6, // 93.33 IOPS = (4 data drives × 140) / 6
    expectedWritePenalty: 6,
    source: 'MassiveGRID - RAID 6 write penalty = 6 (double parity overhead)',
  },
  {
    name: 'RAID 6 with 12× SSD SATA',
    driveType: 'SSD_SATA',
    drive: testSsdSata,
    driveCount: 12,
    raidLevel: 'RAID6',
    expectedReadIOPS: 12 * 85_000, // 1,020,000 IOPS
    expectedWriteIOPS: ((12 - 2) * 85_000) / 6, // 141,666.67 IOPS
    expectedWritePenalty: 6,
    source: 'WintelGuy - RAID 6 write IOPS = (N-2) × drive_iops / 6',
  },

  // RAID 10 - 2× penalty (mirror writes)
  {
    name: 'RAID 10 with 4× HDD (7200 RPM)',
    driveType: 'HDD',
    drive: testHdd7200,
    driveCount: 4,
    raidLevel: 'RAID10',
    expectedReadIOPS: 4 * 150, // 600 IOPS
    expectedWriteIOPS: (4 * 140) / 2, // 280 IOPS
    expectedWritePenalty: 2,
    source: 'MassiveGRID - RAID 10 write penalty = 2 (mirror only)',
  },
  {
    name: 'RAID 10 with 8× SSD NVMe',
    driveType: 'SSD_NVMe',
    drive: testSsdNvme,
    driveCount: 8,
    raidLevel: 'RAID10',
    expectedReadIOPS: 8 * 150_000, // 1,200,000 IOPS
    expectedWriteIOPS: (8 * 150_000) / 2, // 600,000 IOPS
    expectedWritePenalty: 2,
    source: 'MassiveGRID - RAID 10 combines RAID 0 striping with RAID 1 mirroring',
  },

  // ZFS - Copy-on-Write reduces penalties
  {
    name: 'ZFS RAID-Z1 with 4× SSD SATA',
    driveType: 'SSD_SATA',
    drive: testSsdSata,
    driveCount: 4,
    raidLevel: 'raidz1',
    expectedReadIOPS: 4 * 85_000, // 340,000 IOPS
    expectedWriteIOPS: ((4 - 1) * 85_000) / 2, // 127,500 IOPS (CoW reduces penalty from 4 to 2)
    expectedWritePenalty: 2,
    source: 'ZFS CoW reduces RAID 5-like penalty from 4 to 2',
  },
  {
    name: 'ZFS RAID-Z2 with 6× SSD SATA',
    driveType: 'SSD_SATA',
    drive: testSsdSata,
    driveCount: 6,
    raidLevel: 'raidz2',
    expectedReadIOPS: 6 * 85_000, // 510,000 IOPS
    expectedWriteIOPS: ((6 - 2) * 85_000) / 3, // 113,333.33 IOPS (CoW reduces penalty from 6 to 3)
    expectedWritePenalty: 3,
    source: 'ZFS CoW reduces RAID 6-like penalty from 6 to 3',
  },
  {
    name: 'ZFS Mirror with 2× SSD NVMe',
    driveType: 'SSD_NVMe',
    drive: testSsdNvme,
    driveCount: 2,
    raidLevel: 'mirror',
    expectedReadIOPS: 2 * 150_000, // 300,000 IOPS
    expectedWriteIOPS: (2 * 150_000) / 2, // 150,000 IOPS
    expectedWritePenalty: 2,
    source: 'ZFS Mirror behaves like RAID 1',
  },
  {
    name: 'ZFS Stripe with 4× SSD NVMe',
    driveType: 'SSD_NVMe',
    drive: testSsdNvme,
    driveCount: 4,
    raidLevel: 'stripe',
    expectedReadIOPS: 4 * 150_000, // 600,000 IOPS
    expectedWriteIOPS: 4 * 150_000, // 600,000 IOPS
    expectedWritePenalty: 1,
    source: 'ZFS Stripe behaves like RAID 0',
  },
]

/**
 * Get test drive by type
 */
export function getTestDrive(type: 'HDD' | 'SSD_SATA' | 'SSD_NVMe'): Drive {
  switch (type) {
    case 'HDD':
      return testHdd7200
    case 'SSD_SATA':
      return testSsdSata
    case 'SSD_NVMe':
      return testSsdNvme
  }
}
