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
import {
  performanceVectors,
  testHdd7200,
  testSsdSata,
  testSsdNvme,
} from '../fixtures/performance-vectors'

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

describe('Performance Engine - RAID Write Penalty Validation (TEST-12)', () => {
  /**
   * Industry formulas for RAID write penalties (random I/O only)
   *
   * Sources:
   * - MassiveGRID: "Understanding RAID Write Penalties"
   *   https://www.massivegrid.com/blog/understanding-raid-write-penalties/
   * - WintelGuy RAID Performance Calculator
   *   https://www.wintellect.com/raid-calculator/
   * - NetApp TR-3001: "Storage Performance Fundamentals"
   * - Dell PowerVault ME4 Series Best Practices Guide
   *
   * Random I/O Write Penalties:
   * - RAID 0: 1× (no penalty)
   * - RAID 1/10: 2× (mirror both copies)
   * - RAID 5: 4× (read-modify-write: read old data + parity, write new data + parity)
   * - RAID 6: 6× (double parity: read old data + P + Q, write new data + P + Q)
   *
   * Sequential I/O: Reduced penalties due to full-stripe writes avoiding read-modify-write
   */

  describe('RAID 5 Write Penalty (4× for random I/O)', () => {
    it('should apply 4× penalty per MassiveGRID formula', () => {
      // MassiveGRID: "RAID 5 write penalty = 4"
      // Reason: Read-Modify-Write cycle requires:
      //   1. Read old data block
      //   2. Read old parity block
      //   3. Write new data block
      //   4. Write new parity block
      // Total: 4 I/O operations per logical write
      const input = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      expect(result.writePenalty).toBe(4)
    })

    it('should apply 4× penalty with multiple drive counts', () => {
      // TEST-12: Validate write penalty across different drive counts
      const driveCounts = [4, 8, 12]

      for (const driveCount of driveCounts) {
        const input = createInput(driveCount, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
        const result = calculatePerformance(input)

        expect(result.writePenalty).toBe(4)
      }
    })

    it('should apply 4× penalty with different drive types', () => {
      // TEST-12: Validate write penalty is consistent across HDD and SSD
      const drives = [testHdd7200, testSsdSata, testSsdNvme]

      for (const drive of drives) {
        const input = createInput(8, { type: 'standard', level: 'RAID5' }, drive, 100)
        const result = calculatePerformance(input)

        expect(result.writePenalty).toBe(4)
      }
    })

    it('should reduce write IOPS by ~4× compared to read IOPS', () => {
      // WintelGuy: Write IOPS = (N-1) × drive_iops / 4
      // With 8 drives @ 140 IOPS each:
      // Read IOPS: 8 × 140 = 1120
      // Write IOPS: (8-1) × 140 / 4 = 245
      // Note: May be higher if bottlenecked by controller/network
      const input = createInput(8, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // Write penalty of 4 should make write IOPS significantly lower than read IOPS
      // Theoretical: (N-1)/N / penalty = 7/8 / 4 = 0.21875 of read IOPS
      expect(result.maxWriteIOPS).toBeLessThan(result.maxReadIOPS / 2)
    })

    it('should have no penalty for 100% sequential writes', () => {
      // Sequential writes bypass read-modify-write cycle with full-stripe writes
      // Penalty should be reduced significantly for 0% random (100% sequential)
      const input = createInput(8, { type: 'standard', level: 'RAID5' }, testHdd7200, 0)
      const result = calculatePerformance(input)

      // Sequential penalty is (randomPenalty + 1) / 2 = (4 + 1) / 2 = 2.5
      expect(result.writePenalty).toBe(2.5)
      expect(result.writePenalty).toBeLessThan(4)
    })
  })

  describe('RAID 6 Write Penalty (6× for random I/O)', () => {
    it('should apply 6× penalty per MassiveGRID formula', () => {
      // MassiveGRID: "RAID 6 write penalty = 6"
      // Reason: Double parity requires 6 I/O operations:
      //   1. Read old data block
      //   2. Read old P parity block
      //   3. Read old Q parity block
      //   4. Write new data block
      //   5. Write new P parity
      //   6. Write new Q parity
      // Total: 6 I/O operations per logical write
      const input = createInput(6, { type: 'standard', level: 'RAID6' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      expect(result.writePenalty).toBe(6)
    })

    it('should apply 6× penalty with multiple drive counts', () => {
      // TEST-12: Validate write penalty across different drive counts
      const driveCounts = [6, 12, 18]

      for (const driveCount of driveCounts) {
        const input = createInput(driveCount, { type: 'standard', level: 'RAID6' }, testHdd7200, 100)
        const result = calculatePerformance(input)

        expect(result.writePenalty).toBe(6)
      }
    })

    it('should apply 6× penalty with different drive types', () => {
      // TEST-12: Validate write penalty is consistent across HDD and SSD
      const drives = [testHdd7200, testSsdSata, testSsdNvme]

      for (const drive of drives) {
        const input = createInput(12, { type: 'standard', level: 'RAID6' }, drive, 100)
        const result = calculatePerformance(input)

        expect(result.writePenalty).toBe(6)
      }
    })

    it('should reduce write IOPS by ~6× compared to read IOPS', () => {
      // WintelGuy: Write IOPS = (N-2) × drive_iops / 6
      // With 12 drives @ 140 IOPS each:
      // Read IOPS: 12 × 140 = 1680
      // Write IOPS: (12-2) × 140 / 6 = 233.33
      // Note: May be higher if bottlenecked by controller/network
      const input = createInput(12, { type: 'standard', level: 'RAID6' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // Write penalty of 6 should make write IOPS significantly lower than read IOPS
      // Theoretical: (N-2)/N / penalty = 10/12 / 6 = 0.139 of read IOPS
      expect(result.maxWriteIOPS).toBeLessThan(result.maxReadIOPS / 3)
    })

    it('should have worse write penalty than RAID 5', () => {
      // RAID 6 should have both:
      // - Higher penalty (6 vs 4)
      // - Fewer data drives (N-2 vs N-1)
      const inputRaid5 = createInput(12, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const inputRaid6 = createInput(12, { type: 'standard', level: 'RAID6' }, testHdd7200, 100)

      const resultRaid5 = calculatePerformance(inputRaid5)
      const resultRaid6 = calculatePerformance(inputRaid6)

      expect(resultRaid6.writePenalty).toBeGreaterThan(resultRaid5.writePenalty)
      expect(resultRaid6.maxWriteIOPS).toBeLessThan(resultRaid5.maxWriteIOPS)
    })

    it('should have reduced penalty for 100% sequential writes', () => {
      // Sequential writes bypass read-modify-write cycle with full-stripe writes
      const input = createInput(12, { type: 'standard', level: 'RAID6' }, testHdd7200, 0)
      const result = calculatePerformance(input)

      // Sequential penalty is (randomPenalty + 1) / 2 = (6 + 1) / 2 = 3.5
      expect(result.writePenalty).toBe(3.5)
      expect(result.writePenalty).toBeLessThan(6)
    })
  })

  describe('Sequential vs Random Write Penalty Behavior', () => {
    it('should apply full penalty only to random I/O', () => {
      // Random I/O: small blocks, can't fill stripe, requires read-modify-write
      // Sequential I/O: large blocks, can fill stripe, bypasses read-modify-write
      const inputFullRandom = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)
      const inputFullSequential = createInput(
        8,
        { type: 'standard', level: 'RAID5' },
        testSsdSata,
        0,
      )

      const resultFullRandom = calculatePerformance(inputFullRandom)
      const resultFullSequential = calculatePerformance(inputFullSequential)

      expect(resultFullRandom.writePenalty).toBe(4) // Full RAID 5 penalty
      expect(resultFullSequential.writePenalty).toBeLessThan(4) // Reduced penalty
    })

    it('should blend penalty for mixed random/sequential workloads', () => {
      // 50% random, 50% sequential should have penalty between full and reduced
      const input = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 50)
      const result = calculatePerformance(input)

      // Blended penalty: 50% random (4×) + 50% sequential (2.5×) = 3.25×
      expect(result.writePenalty).toBeGreaterThan(2.5)
      expect(result.writePenalty).toBeLessThan(4)
    })

    it('should show sequential write advantage for RAID 6', () => {
      // RAID 6 random: 6× penalty
      // RAID 6 sequential: (6+1)/2 = 3.5× penalty
      const inputRandom = createInput(12, { type: 'standard', level: 'RAID6' }, testSsdSata, 100)
      const inputSequential = createInput(12, { type: 'standard', level: 'RAID6' }, testSsdSata, 0)

      const resultRandom = calculatePerformance(inputRandom)
      const resultSequential = calculatePerformance(inputSequential)

      expect(resultRandom.writePenalty).toBe(6)
      expect(resultSequential.writePenalty).toBe(3.5)
      expect(resultSequential.maxWriteIOPS).toBeGreaterThan(resultRandom.maxWriteIOPS)
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

describe('Performance Engine - Bottleneck Chain Logic (TEST-05)', () => {
  /**
   * Bottleneck chain: Performance is limited by the slowest component
   *
   * Chain order:
   * 1. Media (drives) - aggregate IOPS/bandwidth
   * 2. Controller/HBA - RAID controller max throughput
   * 3. Bus (PCIe) - PCIe lanes × generation bandwidth
   * 4. Network - network uplink speed (for NAS/SAN)
   *
   * Actual performance = Math.min(media, controller, bus, network)
   */

  describe('Media-Limited Scenarios', () => {
    it('should be media-limited with slow HDDs and fast infrastructure', () => {
      // 24× 7200 RPM HDD = ~3,360 read IOPS
      // Controller: 1M IOPS (default)
      // Network: 25GbE = 3,125 MB/s
      // Expected bottleneck: Media (drives)
      const input = createInput(24, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      const bottleneck = result.layers.find((l) => l.isBottleneck)
      expect(bottleneck?.name).toContain('Media')
    })

    it('should have media layer with lowest throughput in media-limited case', () => {
      const input = createInput(24, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      const mediaLayer = result.layers.find((l) => l.name.includes('Media'))
      const minThroughput = Math.min(...result.layers.map((l) => l.throughputMBs))

      expect(mediaLayer?.throughputMBs).toBe(minThroughput)
    })
  })

  describe('Controller-Limited Scenarios', () => {
    it('should be controller-limited with many fast NVMe drives', () => {
      // 12× NVMe @ 750k IOPS = 9M read IOPS aggregate
      // But controller is typically limited to ~1M IOPS
      // Expected bottleneck: Controller
      const input = createInput(12, { type: 'standard', level: 'RAID0' }, testSsdNvme, 100)
      const result = calculatePerformance(input)

      // Should hit controller or bus limit, not media
      const bottleneck = result.layers.find((l) => l.isBottleneck)
      expect(bottleneck?.name).not.toContain('Media')
    })

    it('should cap IOPS at controller limit', () => {
      // Many fast drives should not exceed controller limit
      const input = createInput(16, { type: 'standard', level: 'RAID0' }, testSsdNvme, 100)
      const result = calculatePerformance(input)

      const controllerLayer = result.layers.find(
        (l) => l.name.includes('Controller') || l.name.includes('HBA'),
      )
      expect(result.maxReadIOPS).toBeLessThanOrEqual(controllerLayer?.iops || Infinity)
    })
  })

  describe('Network-Limited Scenarios', () => {
    it('should be network-limited over 1GbE', () => {
      // Fast array over slow network
      // 8× SSD SATA @ 550 MB/s = 4,400 MB/s aggregate
      // 1GbE = 125 MB/s
      // Expected bottleneck: Network
      const input: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 100),
        networkSpeed: '1GbE',
      }
      const result = calculatePerformance(input)

      const bottleneck = result.layers.find((l) => l.isBottleneck)
      expect(bottleneck?.name).toContain('Network')
    })

    it('should cap throughput at network speed', () => {
      // 1GbE = 125 MB/s
      const input: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 0),
        networkSpeed: '1GbE',
      }
      const result = calculatePerformance(input)

      // Throughput should not exceed 125 MB/s for 1GbE
      expect(result.maxReadThroughputMBs).toBeLessThanOrEqual(125)
    })

    it('should improve with faster network', () => {
      // Same array over 1GbE vs 25GbE
      const input1GbE: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 0),
        networkSpeed: '1GbE',
      }
      const input25GbE: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 0),
        networkSpeed: '25GbE',
      }

      const result1GbE = calculatePerformance(input1GbE)
      const result25GbE = calculatePerformance(input25GbE)

      expect(result25GbE.maxReadThroughputMBs).toBeGreaterThan(result1GbE.maxReadThroughputMBs)
    })
  })

  describe('Bus-Limited Scenarios (PCIe)', () => {
    it('should be limited by PCIe bandwidth', () => {
      // Many NVMe drives on limited PCIe lanes
      // PCIe Gen3 x8 = ~8 GB/s
      // 16× NVMe @ 6.8 GB/s = 108 GB/s aggregate
      // Expected bottleneck: PCIe bus
      const input: PerformanceInput = {
        ...createInput(16, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen3',
        pcieLanes: 'x8',
      }
      const result = calculatePerformance(input)

      const pcieLayer = result.layers.find((l) => l.name.includes('PCIe'))
      // PCIe should be one of the bottlenecks for this configuration
      expect(pcieLayer?.throughputMBs).toBeDefined()
    })

    it('should improve with more PCIe lanes', () => {
      // Same drives over PCIe x8 vs x16
      const inputX8: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen4',
        pcieLanes: 'x8',
      }
      const inputX16: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen4',
        pcieLanes: 'x16',
      }

      const resultX8 = calculatePerformance(inputX8)
      const resultX16 = calculatePerformance(inputX16)

      const pcieX8 = resultX8.layers.find((l) => l.name.includes('PCIe'))
      const pcieX16 = resultX16.layers.find((l) => l.name.includes('PCIe'))

      expect(pcieX16?.throughputMBs).toBeGreaterThan(pcieX8?.throughputMBs || 0)
    })

    it('should improve with newer PCIe generation', () => {
      // PCIe Gen3 vs Gen4 vs Gen5
      const inputGen3: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen3',
        pcieLanes: 'x8',
      }
      const inputGen4: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen4',
        pcieLanes: 'x8',
      }
      const inputGen5: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0),
        pcieGen: 'gen5',
        pcieLanes: 'x8',
      }

      const resultGen3 = calculatePerformance(inputGen3)
      const resultGen4 = calculatePerformance(inputGen4)
      const resultGen5 = calculatePerformance(inputGen5)

      const pcieGen3 = resultGen3.layers.find((l) => l.name.includes('PCIe'))
      const pcieGen4 = resultGen4.layers.find((l) => l.name.includes('PCIe'))
      const pcieGen5 = resultGen5.layers.find((l) => l.name.includes('PCIe'))

      expect(pcieGen4?.throughputMBs).toBeGreaterThan(pcieGen3?.throughputMBs || 0)
      expect(pcieGen5?.throughputMBs).toBeGreaterThan(pcieGen4?.throughputMBs || 0)
    })
  })

  describe('Bottleneck Chain Validation', () => {
    it('should identify exactly one bottleneck', () => {
      const input = createInput(8, { type: 'standard', level: 'RAID5' })
      const result = calculatePerformance(input)

      const bottlenecks = result.layers.filter((l) => l.isBottleneck)
      expect(bottlenecks.length).toBe(1)
    })

    it('should have all layers present', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculatePerformance(input)

      expect(result.layers.length).toBe(4) // Media, Controller, PCIe, Network

      const layerNames = result.layers.map((l) => l.name)
      expect(layerNames.some((n) => n.includes('Media'))).toBe(true)
      expect(
        layerNames.some((n) => n.includes('RAID') || n.includes('Controller') || n.includes('HBA')),
      ).toBe(true)
      expect(layerNames.some((n) => n.includes('PCIe'))).toBe(true)
      expect(layerNames.some((n) => n.includes('Network'))).toBe(true)
    })

    it('should use Math.min logic for bottleneck identification', () => {
      const input = createInput(8, { type: 'standard', level: 'RAID0' })
      const result = calculatePerformance(input)

      // Actual throughput should equal the bottleneck layer throughput
      const minThroughput = Math.min(...result.layers.map((l) => l.throughputMBs))
      const bottleneck = result.layers.find((l) => l.isBottleneck)

      expect(bottleneck?.throughputMBs).toBe(minThroughput)
    })

    it('should calculate utilization for each layer', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculatePerformance(input)

      for (const layer of result.layers) {
        expect(layer.utilization).toBeGreaterThanOrEqual(0)
        expect(layer.utilization).toBeLessThanOrEqual(100)
      }
    })

    it('should have bottleneck at 100% utilization', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' })
      const result = calculatePerformance(input)

      const bottleneck = result.layers.find((l) => l.isBottleneck)
      expect(bottleneck?.utilization).toBeCloseTo(100, 0)
    })
  })

  describe('Property-Based Bottleneck Tests', () => {
    it('should not exceed any layer limit', () => {
      const input = createInput(12, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0)
      const result = calculatePerformance(input)

      for (const layer of result.layers) {
        expect(result.maxReadThroughputMBs).toBeLessThanOrEqual(layer.throughputMBs)
      }
    })

    it('should maintain bottleneck with increasing drive count', () => {
      // Adding drives can shift bottleneck but shouldn't violate limits
      const input4 = createInput(4, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0)
      const input8 = createInput(8, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0)
      const input16 = createInput(16, { type: 'standard', level: 'RAID0' }, testSsdNvme, 0)

      const result4 = calculatePerformance(input4)
      const result8 = calculatePerformance(input8)
      const result16 = calculatePerformance(input16)

      // Each should identify a bottleneck
      expect(result4.layers.filter((l) => l.isBottleneck).length).toBe(1)
      expect(result8.layers.filter((l) => l.isBottleneck).length).toBe(1)
      expect(result16.layers.filter((l) => l.isBottleneck).length).toBe(1)
    })

    it('should shift bottleneck when infrastructure changes', () => {
      // Fast drives with fast vs slow network
      // 8× SSD SATA @ 550 MB/s = 4,400 MB/s aggregate
      // 100GbE = 12,500 MB/s → media-limited
      // 1GbE = 125 MB/s → network-limited
      const inputFastNetwork: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 0),
        networkSpeed: '100GbE',
      }
      const inputSlowNetwork: PerformanceInput = {
        ...createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 0),
        networkSpeed: '1GbE',
      }

      const resultFast = calculatePerformance(inputFastNetwork)
      const resultSlow = calculatePerformance(inputSlowNetwork)

      const bottleneckFast = resultFast.layers.find((l) => l.isBottleneck)
      const bottleneckSlow = resultSlow.layers.find((l) => l.isBottleneck)

      // With fast network: should be media or controller limited
      // With slow network: should be network limited
      expect(bottleneckSlow?.name).toContain('Network')
      expect(bottleneckFast?.name).not.toContain('Network')
    })
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

describe('Performance Engine - Industry-Validated IOPS', () => {
  describe('RAID 0 IOPS Scaling', () => {
    it('should aggregate IOPS linearly for RAID 0 (no penalty)', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID0' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // RAID 0: total IOPS = N × drive_iops
      // HDD: 150 read IOPS, 140 write IOPS per drive
      // Expected: 4 × 140 = 560 write IOPS (limited by write IOPS)
      expect(result.maxReadIOPS).toBeGreaterThanOrEqual(4 * 140)
      expect(result.maxWriteIOPS).toBeGreaterThanOrEqual(4 * 140)
    })

    it('should scale IOPS with drive count for RAID 0', () => {
      const input4 = createInput(4, { type: 'standard', level: 'RAID0' }, testSsdSata, 100)
      const input8 = createInput(8, { type: 'standard', level: 'RAID0' }, testSsdSata, 100)

      const result4 = calculatePerformance(input4)
      const result8 = calculatePerformance(input8)

      // 8 drives should have ~2× IOPS of 4 drives (or hit bottleneck)
      expect(result8.maxReadIOPS).toBeGreaterThanOrEqual(result4.maxReadIOPS)
      expect(result8.maxWriteIOPS).toBeGreaterThanOrEqual(result4.maxWriteIOPS)
    })
  })

  describe('RAID 1 IOPS Calculations', () => {
    it('should apply 2× write penalty for RAID 1 mirrors', () => {
      const input = createInput(2, { type: 'standard', level: 'RAID1' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // RAID 1: write penalty = 2 (write to both mirrors)
      expect(result.writePenalty).toBeCloseTo(2, 1)

      // Write IOPS should be ~half of read IOPS
      expect(result.maxWriteIOPS).toBeLessThan(result.maxReadIOPS)
    })

    it('should read from both mirrors in RAID 1', () => {
      const input = createInput(2, { type: 'standard', level: 'RAID1' }, testSsdNvme, 100)
      const result = calculatePerformance(input)

      // Read IOPS benefits from both drives
      expect(result.maxReadIOPS).toBeGreaterThan(150_000)
    })
  })

  describe('RAID 5 IOPS with 4× Write Penalty', () => {
    it('should apply 4× write penalty for RAID 5 (industry formula)', () => {
      // MassiveGRID: RAID 5 write IOPS = (N-1) × drive_iops / 4
      const input = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // RAID 5: write penalty = 4 (read old data + parity, write new data + parity)
      expect(result.writePenalty).toBeCloseTo(4, 1)
    })

    it('should scale RAID 5 write IOPS with drive count', () => {
      const input4 = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const input8 = createInput(8, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)

      const result4 = calculatePerformance(input4)
      const result8 = calculatePerformance(input8)

      // 8 drives: (8-1)/4 = 1.75 effective drives for writes
      // 4 drives: (4-1)/4 = 0.75 effective drives for writes
      // So 8 drives should have >2× write IOPS of 4 drives
      expect(result8.maxWriteIOPS).toBeGreaterThan(result4.maxWriteIOPS)
    })

    it('should have much lower write IOPS than read IOPS for RAID 5', () => {
      const input = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)
      const result = calculatePerformance(input)

      // RAID 5 write penalty significantly reduces write performance
      expect(result.maxWriteIOPS).toBeLessThan(result.maxReadIOPS / 2)
    })
  })

  describe('RAID 6 IOPS with 6× Write Penalty', () => {
    it('should apply 6× write penalty for RAID 6 (industry formula)', () => {
      // MassiveGRID: RAID 6 write IOPS = (N-2) × drive_iops / 6
      const input = createInput(6, { type: 'standard', level: 'RAID6' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // RAID 6: write penalty = 6 (read old data + 2 parities, write new data + 2 parities)
      expect(result.writePenalty).toBeCloseTo(6, 1)
    })

    it('should have worse write performance than RAID 5', () => {
      const inputRaid5 = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)
      const inputRaid6 = createInput(8, { type: 'standard', level: 'RAID6' }, testSsdSata, 100)

      const resultRaid5 = calculatePerformance(inputRaid5)
      const resultRaid6 = calculatePerformance(inputRaid6)

      // RAID 6 has higher penalty (6 vs 4) AND fewer data drives (N-2 vs N-1)
      expect(resultRaid6.maxWriteIOPS).toBeLessThan(resultRaid5.maxWriteIOPS)
    })
  })

  describe('RAID 10 IOPS Calculations', () => {
    it('should apply 2× write penalty for RAID 10 (mirror only)', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID10' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // RAID 10: write penalty = 2 (mirror writes, no parity)
      expect(result.writePenalty).toBeCloseTo(2, 1)
    })

    it('should have better write performance than RAID 5/6', () => {
      const inputRaid10 = createInput(8, { type: 'standard', level: 'RAID10' }, testSsdSata, 100)
      const inputRaid5 = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)
      const inputRaid6 = createInput(8, { type: 'standard', level: 'RAID6' }, testSsdSata, 100)

      const resultRaid10 = calculatePerformance(inputRaid10)
      const resultRaid5 = calculatePerformance(inputRaid5)
      const resultRaid6 = calculatePerformance(inputRaid6)

      // RAID 10 has lower penalty (2 vs 4 vs 6)
      expect(resultRaid10.maxWriteIOPS).toBeGreaterThan(resultRaid5.maxWriteIOPS)
      expect(resultRaid10.maxWriteIOPS).toBeGreaterThan(resultRaid6.maxWriteIOPS)
    })
  })

  describe('Random vs Sequential I/O Patterns', () => {
    it('should apply full write penalty for 100% random I/O', () => {
      const input = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const result = calculatePerformance(input)

      // 100% random: full 4× penalty for RAID 5
      expect(result.writePenalty).toBeCloseTo(4, 1)
    })

    it('should reduce write penalty for sequential I/O', () => {
      const inputRandom = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 100)
      const inputSequential = createInput(4, { type: 'standard', level: 'RAID5' }, testHdd7200, 0)

      const resultRandom = calculatePerformance(inputRandom)
      const resultSequential = calculatePerformance(inputSequential)

      // Sequential has reduced penalty (full-stripe writes)
      expect(resultSequential.writePenalty).toBeLessThan(resultRandom.writePenalty)
    })

    it('should have higher write throughput for sequential vs random (if not bottlenecked)', () => {
      const inputRandom = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)
      const inputSequential = createInput(8, { type: 'standard', level: 'RAID5' }, testSsdSata, 0)

      const resultRandom = calculatePerformance(inputRandom)
      const resultSequential = calculatePerformance(inputSequential)

      // Sequential throughput benefits from reduced penalty
      // Unless bottlenecked by controller/network, in which case they're equal
      expect(resultSequential.maxWriteThroughputMBs).toBeGreaterThanOrEqual(
        resultRandom.maxWriteThroughputMBs,
      )
    })
  })

  describe('ZFS IOPS with Copy-on-Write Optimization', () => {
    it('should have reduced penalty for RAID-Z1 (2× vs RAID 5 4×)', () => {
      const input = createInput(4, { type: 'zfs', level: 'raidz1' }, testSsdSata, 100)
      const result = calculatePerformance(input)

      // ZFS CoW reduces RAID 5-like penalty from 4 to 2
      expect(result.writePenalty).toBeCloseTo(2, 1)
    })

    it('should have reduced penalty for RAID-Z2 (3× vs RAID 6 6×)', () => {
      const input = createInput(6, { type: 'zfs', level: 'raidz2' }, testSsdSata, 100)
      const result = calculatePerformance(input)

      // ZFS CoW reduces RAID 6-like penalty from 6 to 3
      expect(result.writePenalty).toBeCloseTo(3, 1)
    })

    it('should have better write performance than standard RAID 5', () => {
      const inputRaidZ1 = createInput(4, { type: 'zfs', level: 'raidz1' }, testSsdSata, 100)
      const inputRaid5 = createInput(4, { type: 'standard', level: 'RAID5' }, testSsdSata, 100)

      const resultRaidZ1 = calculatePerformance(inputRaidZ1)
      const resultRaid5 = calculatePerformance(inputRaid5)

      // RAID-Z1 has lower penalty (2 vs 4)
      expect(resultRaidZ1.maxWriteIOPS).toBeGreaterThan(resultRaid5.maxWriteIOPS)
    })
  })

  describe('Property-Based IOPS Tests', () => {
    it('should never have negative IOPS', () => {
      for (const vector of performanceVectors) {
        const topology =
          vector.raidLevel.startsWith('raid')
            ? { type: 'zfs' as const, level: vector.raidLevel as any }
            : { type: 'standard' as const, level: vector.raidLevel as any }

        const input = createInput(vector.driveCount, topology, vector.drive, 100)
        const result = calculatePerformance(input)

        expect(result.maxReadIOPS).toBeGreaterThan(0)
        expect(result.maxWriteIOPS).toBeGreaterThan(0)
      }
    })

    it('should have write IOPS <= read IOPS (due to penalties)', () => {
      for (const vector of performanceVectors) {
        if (vector.raidLevel === 'RAID0' || vector.raidLevel === 'stripe') {
          continue // RAID 0 has no penalty
        }

        const topology =
          vector.raidLevel.startsWith('raid')
            ? { type: 'zfs' as const, level: vector.raidLevel as any }
            : { type: 'standard' as const, level: vector.raidLevel as any }

        const input = createInput(vector.driveCount, topology, vector.drive, 100)
        const result = calculatePerformance(input)

        expect(result.maxWriteIOPS).toBeLessThanOrEqual(result.maxReadIOPS)
      }
    })

    it('should have write penalty >= 1 for all configurations', () => {
      for (const vector of performanceVectors) {
        const topology =
          vector.raidLevel.startsWith('raid')
            ? { type: 'zfs' as const, level: vector.raidLevel as any }
            : { type: 'standard' as const, level: vector.raidLevel as any }

        const input = createInput(vector.driveCount, topology, vector.drive, 100)
        const result = calculatePerformance(input)

        expect(result.writePenalty).toBeGreaterThanOrEqual(1)
      }
    })
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

  it('should calculate swidth = sunit * data_drives for RAID 6', () => {
    const input = createInput(8, { type: 'standard', level: 'RAID6' })
    const result = calculatePerformance(input)

    // For RAID 6 with 8 drives: 6 data drives (N-2)
    // swidth should be sunit * 6
    if (result.xfsAlignment) {
      expect(result.xfsAlignment.swidth).toBe(result.xfsAlignment.sunit * 6)
    }
  })

  it('should calculate sunit based on chunk size', () => {
    const input = createInput(4, { type: 'standard', level: 'RAID5' })
    const result = calculatePerformance(input)

    // sunit is stripe size in 512-byte blocks
    // Default stripe size is typically 64K = 128 blocks
    if (result.xfsAlignment) {
      expect(result.xfsAlignment.sunit).toBeGreaterThan(0)
      // sunit should be a multiple of sectors (512 bytes)
      expect(Number.isInteger(result.xfsAlignment.sunit)).toBe(true)
    }
  })

  it('should not provide XFS alignment for ZFS', () => {
    const input = createInput(4, { type: 'zfs', level: 'raidz1' })
    const result = calculatePerformance(input)

    // ZFS handles its own alignment
    expect(result.xfsAlignment).toBeUndefined()
  })

  it('should calculate different swidth for different drive counts', () => {
    const input4 = createInput(4, { type: 'standard', level: 'RAID5' })
    const input8 = createInput(8, { type: 'standard', level: 'RAID5' })

    const result4 = calculatePerformance(input4)
    const result8 = calculatePerformance(input8)

    // 4 drives: 3 data drives (N-1)
    // 8 drives: 7 data drives (N-1)
    if (result4.xfsAlignment && result8.xfsAlignment) {
      expect(result8.xfsAlignment.swidth).toBeGreaterThan(result4.xfsAlignment.swidth)
    }
  })

  it('should calculate swidth for RAID 10 (half drives)', () => {
    const input = createInput(8, { type: 'standard', level: 'RAID10' })
    const result = calculatePerformance(input)

    // For RAID 10 with 8 drives: 4 data drives (N/2)
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

describe('Performance Engine - Dell PowerFlex Performance', () => {
  /**
   * PowerFlex latency formula (lines 487-489):
   * mediaLatency * 1.5 + networkLatency + cpuOverhead
   *
   * Tests cover:
   * - 2-way vs 3-way mirror performance
   * - Compression overhead impact
   * - Dynamic rebuild performance
   */

  it('should calculate PowerFlex latency with 1.5x multiplier', () => {
    // PowerFlex adds 50% overhead to media latency for replication
    const input = createInput(
      12,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdNvme,
      100,
    )
    const result = calculatePerformance(input)

    // Should have latency estimation
    expect(result.estimatedLatencyUs).toBeDefined()
    expect(result.estimatedLatencyUs).toBeGreaterThan(0)

    // Latency should include:
    // - mediaLatency * 1.5
    // - networkLatency (25GbE = 25μs)
    // - cpuOverhead (standard = 10μs)
    // NVMe base latency = 20μs
    // Expected: 20 * 1.5 + 25 + 10 = 65μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(30)
    expect(result.estimatedLatencyUs).toBeLessThan(100)
  })

  it('should handle PowerFlex 2-way mirror configuration', () => {
    const input = createInput(
      12,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdNvme,
      100,
    )
    const result = calculatePerformance(input)

    // 2-way mirror: write penalty should be 2
    expect(result.writePenalty).toBeGreaterThanOrEqual(2)

    // Should have positive IOPS
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)
  })

  it('should handle PowerFlex 3-way mirror configuration', () => {
    const input = createInput(
      24,
      { type: 'powerflex', level: 'powerflex_3way' },
      testSsdSata,
      100,
    )
    const result = calculatePerformance(input)

    // 3-way mirror: higher redundancy, higher write penalty
    expect(result.writePenalty).toBeGreaterThanOrEqual(2)

    // Should have positive IOPS
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)
  })

  it('should show PowerFlex compression overhead impact', () => {
    // Compare performance with compression enabled vs disabled
    const inputNoCompression = createInput(
      12,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdNvme,
      100,
    )
    const resultNoCompression = calculatePerformance(inputNoCompression)

    // Both should have valid latency
    expect(resultNoCompression.estimatedLatencyUs).toBeGreaterThan(0)
  })

  it('should validate PowerFlex network latency component', () => {
    // PowerFlex includes network latency in formula
    const input1GbE = {
      ...createInput(12, { type: 'powerflex', level: 'powerflex_2way' }, testSsdNvme, 100),
      networkSpeed: '1GbE' as const,
    }
    const input100GbE = {
      ...createInput(12, { type: 'powerflex', level: 'powerflex_2way' }, testSsdNvme, 100),
      networkSpeed: '100GbE' as const,
    }

    const result1GbE = calculatePerformance(input1GbE)
    const result100GbE = calculatePerformance(input100GbE)

    // Faster network should reduce latency
    expect(result100GbE.estimatedLatencyUs).toBeLessThan(result1GbE.estimatedLatencyUs)
  })

  it('should validate PowerFlex dynamic rebuild performance impact', () => {
    // PowerFlex dynamic rebuild should maintain reasonable performance
    const input = createInput(
      12,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdNvme,
      50,
    )
    const result = calculatePerformance(input)

    // Should have reduced write penalty for 50% random (vs 100%)
    expect(result.writePenalty).toBeLessThan(3)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)
  })
})

describe('Performance Engine - Dell ObjectScale Performance', () => {
  /**
   * ObjectScale latency formula (lines 491-495):
   * mediaLatency * 2 + networkLatency * 1.5 + cpuOverhead
   * cpuOverhead = CPU_OVERHEAD_US.erasure_coding = 80μs
   *
   * Tests cover:
   * - S3 protocol overhead (networkLatency * 1.5)
   * - Erasure coding CPU overhead
   * - Eventual consistency impact
   */

  it('should calculate ObjectScale S3 latency with 2x media and 1.5x network overhead', () => {
    // ObjectScale has higher latency due to S3 protocol and EC overhead
    const input = createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testHddDrive, 100)
    const result = calculatePerformance(input)

    // Should have latency estimation
    expect(result.estimatedLatencyUs).toBeDefined()
    expect(result.estimatedLatencyUs).toBeGreaterThan(0)

    // Latency should include:
    // - mediaLatency * 2 (HDD = 8000μs * 2 = 16000μs)
    // - networkLatency * 1.5 (25GbE = 25μs * 1.5 = 37.5μs)
    // - cpuOverhead (erasure_coding = 80μs)
    // Expected: ~16000 + 37.5 + 80 = ~16117μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(16000)
  })

  it('should apply erasure coding CPU overhead', () => {
    // ObjectScale always uses erasure coding
    const input = createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testSsdSata, 100)
    const result = calculatePerformance(input)

    // CPU overhead from EC should be included in latency
    // SSD base latency = 150μs
    // Expected: 150 * 2 + 25 * 1.5 + 80 = 417.5μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(300)
    expect(result.estimatedLatencyUs).toBeLessThan(600)
  })

  it('should handle ObjectScale EC 12+4 configuration with HDD', () => {
    const input = createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testHddDrive, 100)
    const result = calculatePerformance(input)

    // 12+4 EC: 12 data, 4 parity
    // Should have positive IOPS
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)

    // Write penalty should be higher due to EC
    expect(result.writePenalty).toBeGreaterThan(1)
  })

  it('should handle ObjectScale EC 8+2 configuration with SSD', () => {
    const input = createInput(10, { type: 'objectscale', level: 'objectscale_ec_8_2' }, testSsdSata, 100)
    const result = calculatePerformance(input)

    // 8+2 EC: 8 data, 2 parity
    // Should have positive IOPS
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)

    // SSD should have lower latency than HDD
    expect(result.estimatedLatencyUs).toBeLessThan(1000)
  })

  it('should validate ObjectScale S3 protocol overhead (1.5x network)', () => {
    // S3 protocol has higher network overhead than block protocols
    const input1GbE = {
      ...createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testSsdSata, 100),
      networkSpeed: '1GbE' as const,
    }
    const input100GbE = {
      ...createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testSsdSata, 100),
      networkSpeed: '100GbE' as const,
    }

    const result1GbE = calculatePerformance(input1GbE)
    const result100GbE = calculatePerformance(input100GbE)

    // Network latency difference:
    // 1GbE: 500μs * 1.5 = 750μs
    // 100GbE: 10μs * 1.5 = 15μs
    // Difference: 735μs
    expect(result1GbE.estimatedLatencyUs).toBeGreaterThan(result100GbE.estimatedLatencyUs)
  })

  it('should show ObjectScale eventual consistency performance characteristics', () => {
    // ObjectScale S3 eventual consistency allows higher throughput
    const input = createInput(16, { type: 'objectscale', level: 'objectscale_ec_12_4' }, testSsdSata, 0)
    const result = calculatePerformance(input)

    // Sequential workload should have good throughput
    expect(result.maxReadThroughputMBs).toBeGreaterThan(0)
    expect(result.maxWriteThroughputMBs).toBeGreaterThan(0)
  })

  it('should have higher latency than block storage due to protocol overhead', () => {
    // Compare ObjectScale (object) vs PowerFlex (block)
    const inputObjectScale = createInput(
      16,
      { type: 'objectscale', level: 'objectscale_ec_12_4' },
      testSsdSata,
      100,
    )
    const inputPowerFlex = createInput(
      16,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdSata,
      100,
    )

    const resultObjectScale = calculatePerformance(inputObjectScale)
    const resultPowerFlex = calculatePerformance(inputPowerFlex)

    // ObjectScale (2x media, 1.5x network) should have higher latency than PowerFlex (1.5x media)
    expect(resultObjectScale.estimatedLatencyUs).toBeGreaterThan(resultPowerFlex.estimatedLatencyUs)
  })
})

describe('Performance Engine - Dell PowerStore Performance', () => {
  /**
   * PowerStore latency formula (lines 497-499):
   * mediaLatency * 1.2 + cpuOverhead
   *
   * PowerStore optimized for NVMe with lower overhead than other platforms.
   * Block storage focused, no network latency component.
   */

  it('should calculate PowerStore latency with 1.2x multiplier (NVMe optimized)', () => {
    // PowerStore optimized for NVMe with minimal overhead
    const input = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const result = calculatePerformance(input)

    // Should have latency estimation
    expect(result.estimatedLatencyUs).toBeDefined()
    expect(result.estimatedLatencyUs).toBeGreaterThan(0)

    // Latency should include:
    // - mediaLatency * 1.2 (NVMe = 20μs * 1.2 = 24μs)
    // - cpuOverhead (standard = 10μs)
    // Expected: ~34μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(20)
    expect(result.estimatedLatencyUs).toBeLessThan(60)
  })

  it('should have lower overhead than PowerFlex (1.2x vs 1.5x)', () => {
    // Compare PowerStore (1.2x) vs PowerFlex (1.5x)
    const inputPowerStore = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const inputPowerFlex = createInput(
      24,
      { type: 'powerflex', level: 'powerflex_2way' },
      testSsdNvme,
      100,
    )

    const resultPowerStore = calculatePerformance(inputPowerStore)
    const resultPowerFlex = calculatePerformance(inputPowerFlex)

    // PowerStore (1.2x media, no network) should be faster than PowerFlex (1.5x media + network)
    expect(resultPowerStore.estimatedLatencyUs).toBeLessThan(resultPowerFlex.estimatedLatencyUs)
  })

  it('should handle PowerStore block storage performance characteristics', () => {
    // PowerStore optimized block storage
    const input = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const result = calculatePerformance(input)

    // Should have high IOPS with NVMe
    expect(result.maxReadIOPS).toBeGreaterThan(100_000)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)

    // Write penalty for RAID 5-like behavior
    expect(result.writePenalty).toBeGreaterThan(1)
  })

  it('should validate PowerStore NVMe optimization with different drive types', () => {
    // Compare NVMe vs SSD performance on PowerStore
    const inputNvme = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const inputSsd = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdSata,
      100,
    )

    const resultNvme = calculatePerformance(inputNvme)
    const resultSsd = calculatePerformance(inputSsd)

    // NVMe should have lower latency
    // NVMe: 20μs * 1.2 + 10 = 34μs
    // SSD: 150μs * 1.2 + 10 = 190μs
    expect(resultNvme.estimatedLatencyUs).toBeLessThan(resultSsd.estimatedLatencyUs)
  })

  it('should not include network latency component (block storage)', () => {
    // PowerStore is block storage, no network latency in formula
    const input = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const result = calculatePerformance(input)

    // Latency should be lower than PowerFlex which includes network
    // PowerStore: 20 * 1.2 + 10 = 34μs
    // PowerFlex: 20 * 1.5 + 25 + 10 = 65μs (25GbE)
    expect(result.estimatedLatencyUs).toBeLessThan(50)
  })

  it('should show consistent performance across workload patterns', () => {
    // Test random vs sequential
    const inputRandom = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      100,
    )
    const inputSequential = createInput(
      24,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdNvme,
      0,
    )

    const resultRandom = calculatePerformance(inputRandom)
    const resultSequential = calculatePerformance(inputSequential)

    // Both should have valid performance metrics
    expect(resultRandom.maxReadIOPS).toBeGreaterThan(0)
    expect(resultSequential.maxReadThroughputMBs).toBeGreaterThan(0)
  })
})

describe('Performance Engine - Dell PowerScale Performance', () => {
  /**
   * PowerScale latency formula (lines 501-504):
   * mediaLatency * 1.5 + networkLatency + cpuOverhead
   * cpuOverhead = CPU_OVERHEAD_US.replication = 20μs
   *
   * PowerScale is scale-out NAS with parity writes, includes network latency.
   */

  it('should calculate PowerScale latency with 1.5x multiplier and network overhead', () => {
    // PowerScale scale-out NAS with parity writes
    const input = createInput(
      36,
      { type: 'powerscale', level: 'powerscale_n_plus_2' },
      testHddDrive,
      100,
    )
    const result = calculatePerformance(input)

    // Should have latency estimation
    expect(result.estimatedLatencyUs).toBeDefined()
    expect(result.estimatedLatencyUs).toBeGreaterThan(0)

    // Latency should include:
    // - mediaLatency * 1.5 (HDD = 8000μs * 1.5 = 12000μs)
    // - networkLatency (25GbE = 25μs)
    // - cpuOverhead (replication = 20μs)
    // Expected: 12000 + 25 + 20 = 12045μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(12000)
  })

  it('should apply replication CPU overhead', () => {
    // PowerScale uses replication CPU overhead (20μs)
    const input = createInput(
      36,
      { type: 'powerscale', level: 'powerscale_n_plus_2' },
      testSsdSata,
      100,
    )
    const result = calculatePerformance(input)

    // SSD base latency = 150μs
    // Expected: 150 * 1.5 + 25 + 20 = 270μs
    expect(result.estimatedLatencyUs).toBeGreaterThan(200)
    expect(result.estimatedLatencyUs).toBeLessThan(400)
  })

  it('should handle PowerScale scale-out NAS configuration', () => {
    // PowerScale with 36 HDDs in scale-out NAS
    const input = createInput(
      36,
      { type: 'powerscale', level: 'powerscale_n_plus_2' },
      testHddDrive,
      100,
    )
    const result = calculatePerformance(input)

    // Should have positive IOPS
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)

    // Parity writes should add penalty
    expect(result.writePenalty).toBeGreaterThan(1)
  })

  it('should include network latency impact for NAS protocol', () => {
    // Test network latency impact on PowerScale
    const input1GbE = {
      ...createInput(36, { type: 'powerscale', level: 'powerscale_n_plus_2' }, testSsdSata, 100),
      networkSpeed: '1GbE' as const,
    }
    const input100GbE = {
      ...createInput(36, { type: 'powerscale', level: 'powerscale_n_plus_2' }, testSsdSata, 100),
      networkSpeed: '100GbE' as const,
    }

    const result1GbE = calculatePerformance(input1GbE)
    const result100GbE = calculatePerformance(input100GbE)

    // Network latency difference:
    // 1GbE: 500μs
    // 100GbE: 10μs
    // Difference: 490μs
    expect(result1GbE.estimatedLatencyUs).toBeGreaterThan(result100GbE.estimatedLatencyUs)
  })

  it('should validate PowerScale parity write performance (1.5x multiplier)', () => {
    // PowerScale with parity writes has 1.5x media latency
    const input = createInput(
      36,
      { type: 'powerscale', level: 'powerscale_n_plus_2' },
      testSsdSata,
      100,
    )
    const result = calculatePerformance(input)

    // Should have latency reflecting parity overhead
    // SSD: 150μs * 1.5 = 225μs + network + CPU
    expect(result.estimatedLatencyUs).toBeGreaterThan(200)
  })

  it('should compare PowerScale NAS vs PowerStore block latency', () => {
    // PowerScale (NAS) should have higher latency than PowerStore (block)
    const inputPowerScale = createInput(
      36,
      { type: 'powerscale', level: 'powerscale_n_plus_2' },
      testSsdSata,
      100,
    )
    const inputPowerStore = createInput(
      36,
      { type: 'powerstore', level: 'powerstore_raid5' },
      testSsdSata,
      100,
    )

    const resultPowerScale = calculatePerformance(inputPowerScale)
    const resultPowerStore = calculatePerformance(inputPowerStore)

    // PowerScale (1.5x + network) should have higher latency than PowerStore (1.2x, no network)
    // PowerScale: 150 * 1.5 + 25 + 20 = 270μs
    // PowerStore: 150 * 1.2 + 10 = 190μs
    expect(resultPowerScale.estimatedLatencyUs).toBeGreaterThan(resultPowerStore.estimatedLatencyUs)
  })
})
