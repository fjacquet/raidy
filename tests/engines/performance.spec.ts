/**
 * Performance Engine Tests
 *
 * Validates RAID write penalties and bottleneck analysis.
 * Reference: CLAUDE.md specifies RAID 5 write penalty = 4, RAID 6 = 6
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import type { Drive } from '@/types/drive'

// Test drive: NVMe SSD for performance testing
const testNvmeDrive: Drive = {
  id: 'test-nvme',
  model: 'Test NVMe 1TB',
  type: 'SSD_NVMe',
  formFactor: '2.5"',
  interface: 'NVMe',
  capacity_raw: 1_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 500_000,
    iops_write: 400_000,
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
    idle_watts: 3,
    load_watts: 8,
  },
  cost_usd: 200,
}

// HDD for comparison
const testHddDrive: Drive = {
  id: 'test-hdd',
  model: 'Test HDD 4TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  rpm: 7200,
  capacity_raw: 4_000_000_000_000,
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

// Helper to create a basic PerformanceInput
function createInput(
  driveCount: number,
  topology: PerformanceInput['topology'],
  drive: Drive = testNvmeDrive,
  randomPercent = 50,
): PerformanceInput {
  return {
    drive,
    driveCount,
    hotSpares: 0,
    serverCount: 1,
    topology,
    controllerOptions: DEFAULT_CONTROLLER_OPTIONS,
    readPercent: 70,
    randomPercent,
    blockSize: '64K',
    networkSpeed: '25GbE',
    pcieGen: 'gen4',
    pcieLanes: 'x8',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
  }
}

describe('Performance Engine - Write Penalties', () => {
  // Note: writePenalty in result is blended based on random vs sequential.
  // Use 100% random to get raw penalty values.

  describe('RAID 0', () => {
    it('should have no write penalty (penalty = 1)', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID0' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 0: No redundancy, no penalty
      expect(result.writePenalty).toBe(1)
    })
  })

  describe('RAID 1 (Mirror)', () => {
    it('should have write penalty of 2', () => {
      const input = createInput(2, { type: 'standard', level: 'RAID1' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 1: Write to both mirrors
      expect(result.writePenalty).toBe(2)
    })
  })

  describe('RAID 5 (Single Parity)', () => {
    it('should have write penalty of 4', () => {
      // Per CLAUDE.md: "RAID 5/6 write penalty: Divide by 4 (R5)"
      const input = createInput(4, { type: 'standard', level: 'RAID5' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 5: Read old data + parity, write new data + parity = 4
      expect(result.writePenalty).toBe(4)
    })
  })

  describe('RAID 6 (Double Parity)', () => {
    it('should have write penalty of 6', () => {
      // Per CLAUDE.md: "RAID 5/6 write penalty: Divide by ... 6 (R6)"
      const input = createInput(6, { type: 'standard', level: 'RAID6' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 6: Read old data + 2 parities, write new data + 2 parities = 6
      expect(result.writePenalty).toBe(6)
    })
  })

  describe('RAID 10 (Mirrored Stripes)', () => {
    it('should have write penalty of 2', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID10' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 10: Mirror penalty only
      expect(result.writePenalty).toBe(2)
    })
  })

  describe('RAID 50', () => {
    it('should have write penalty of 4', () => {
      const input = createInput(8, { type: 'standard', level: 'RAID50' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 50: RAID 5 penalty per group
      expect(result.writePenalty).toBe(4)
    })
  })

  describe('RAID 60', () => {
    it('should have write penalty of 6', () => {
      const input = createInput(12, { type: 'standard', level: 'RAID60' }, testNvmeDrive, 100)
      const result = calculatePerformance(input)

      // RAID 60: RAID 6 penalty per group
      expect(result.writePenalty).toBe(6)
    })
  })
})

describe('Performance Engine - ZFS Write Penalties', () => {
  // Use 100% random to test raw penalty values

  it('should have reduced penalty for RAID-Z1 due to CoW', () => {
    const input = createInput(4, { type: 'zfs', level: 'raidz1' }, testNvmeDrive, 100)
    const result = calculatePerformance(input)

    // ZFS CoW reduces traditional RAID5 penalty from 4 to 2
    expect(result.writePenalty).toBe(2)
  })

  it('should have penalty of 3 for RAID-Z2', () => {
    const input = createInput(6, { type: 'zfs', level: 'raidz2' }, testNvmeDrive, 100)
    const result = calculatePerformance(input)

    expect(result.writePenalty).toBe(3)
  })

  it('should have penalty of 4 for RAID-Z3', () => {
    const input = createInput(8, { type: 'zfs', level: 'raidz3' }, testNvmeDrive, 100)
    const result = calculatePerformance(input)

    expect(result.writePenalty).toBe(4)
  })
})

describe('Performance Engine - Bottleneck Analysis', () => {
  it('should identify bottleneck layers', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID5' })
    const result = calculatePerformance(input)

    // Should have layers for analysis
    expect(result.layers).toBeDefined()
    expect(Array.isArray(result.layers)).toBe(true)
    expect(result.layers.length).toBeGreaterThan(0)

    // Should identify exactly one bottleneck
    const bottlenecks = result.layers.filter((l) => l.isBottleneck)
    expect(bottlenecks.length).toBe(1)
  })

  it('should have bottleneck description', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID5' })
    const result = calculatePerformance(input)

    expect(result.bottleneckDescription).toBeDefined()
    expect(typeof result.bottleneckDescription).toBe('string')
    expect(result.bottleneckDescription.length).toBeGreaterThan(0)
  })
})

describe('Performance Engine - IOPS Calculation', () => {
  it('should calculate read and write IOPS', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID0' })
    const result = calculatePerformance(input)

    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)
  })

  it('should scale read IOPS with drive count (or hit bottleneck)', () => {
    const input4 = createInput(4, { type: 'standard', level: 'RAID0' })
    const input8 = createInput(8, { type: 'standard', level: 'RAID0' })

    const result4 = calculatePerformance(input4)
    const result8 = calculatePerformance(input8)

    // 8 drives should have at least as much read IOPS as 4 drives
    // (May be equal if hitting bottleneck at network/controller level)
    expect(result8.maxReadIOPS).toBeGreaterThanOrEqual(result4.maxReadIOPS)
  })

  it('should apply write penalty to IOPS', () => {
    const inputRaid0 = createInput(4, { type: 'standard', level: 'RAID0' })
    const inputRaid5 = createInput(4, { type: 'standard', level: 'RAID5' })

    const resultRaid0 = calculatePerformance(inputRaid0)
    const resultRaid5 = calculatePerformance(inputRaid5)

    // RAID 5 should have lower write IOPS due to 4x penalty
    // Account for the fact that RAID 5 also has one fewer data drive
    expect(resultRaid5.maxWriteIOPS).toBeLessThan(resultRaid0.maxWriteIOPS)
  })
})

describe('Performance Engine - Throughput Calculation', () => {
  it('should calculate read and write throughput', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID0' })
    const result = calculatePerformance(input)

    expect(result.maxReadThroughputMBs).toBeGreaterThan(0)
    expect(result.maxWriteThroughputMBs).toBeGreaterThan(0)
  })

  it('should scale throughput with drive count (or hit bottleneck)', () => {
    const input4 = createInput(4, { type: 'standard', level: 'RAID0' })
    const input8 = createInput(8, { type: 'standard', level: 'RAID0' })

    const result4 = calculatePerformance(input4)
    const result8 = calculatePerformance(input8)

    // 8 drives should have at least as much throughput as 4 drives
    // (May be equal if hitting bottleneck at network/controller level)
    expect(result8.maxReadThroughputMBs).toBeGreaterThanOrEqual(result4.maxReadThroughputMBs)
  })
})

describe('Performance Engine - XFS Alignment', () => {
  it('should calculate XFS stripe alignment for RAID 5', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID5' })
    const result = calculatePerformance(input)

    // Should have XFS alignment recommendations
    expect(result.xfsAlignment).toBeDefined()
    expect(result.xfsAlignment?.sunit).toBeGreaterThan(0)
    expect(result.xfsAlignment?.swidth).toBeGreaterThan(0)
  })

  it('should have swidth = sunit * data_drives for RAID 5', () => {
    const input = createInput(5, { type: 'standard', level: 'RAID5' })
    const result = calculatePerformance(input)

    // For RAID 5 with 5 drives: 4 data drives
    // swidth should be sunit * 4
    if (result.xfsAlignment) {
      expect(result.xfsAlignment.swidth).toBe(result.xfsAlignment.sunit * 4)
    }
  })
})

describe('Performance Engine - HDD vs SSD', () => {
  it('should show much higher IOPS for NVMe vs HDD', () => {
    const inputNvme = createInput(4, { type: 'standard', level: 'RAID5' }, testNvmeDrive)
    const inputHdd = createInput(4, { type: 'standard', level: 'RAID5' }, testHddDrive)

    const resultNvme = calculatePerformance(inputNvme)
    const resultHdd = calculatePerformance(inputHdd)

    // NVMe should have orders of magnitude more IOPS than HDD
    expect(resultNvme.maxReadIOPS).toBeGreaterThan(resultHdd.maxReadIOPS * 100)
  })
})

describe('Performance Engine - Latency Estimation', () => {
  it('should estimate latency for Ceph', () => {
    const input = createInput(4, { type: 'ceph', level: 'ceph_replicated_3' })
    const result = calculatePerformance(input)

    // Ceph should have latency estimation
    expect(result.estimatedLatencyUs).toBeDefined()
    expect(result.estimatedLatencyUs).toBeGreaterThan(0)
  })
})
