/**
 * `512K` sits between `256K` and `1M` in the block-size enum, and the throughput model must
 * see it that way. The failure this guards is a copy-paste in `BLOCK_SIZE_BYTES` — an entry
 * added with a neighbour's byte count compiles cleanly (the Record is satisfied), renders a
 * `512K` option in the panel, and silently computes a neighbour's numbers.
 *
 * Monotonicity alone would not catch that (a duplicate value is still ordered), so the third
 * `it` block demands a strict difference at some drive count against each neighbour: if `512K`
 * mapped to 262144 (256K's byte count) or 1048576 (1M's byte count), no configuration could
 * produce one.
 *
 * Both strict checks use `testHdd7200` rather than `testSsdNvme`. A saturated drive (NVMe with
 * 750K IOPS but only 6800 MB/s read bandwidth) hides the byte-count difference because both
 * neighbours exceed the drive's bandwidth ceiling at any drive count, collapsing to the same
 * value. `testHdd7200` (150 IOPS, 200 MB/s) does not saturate, so block-size scaling stays
 * visible.
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import { BLOCK_SIZES, type BlockSize } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { Topology } from '@/types/topology'
import { testHdd7200, testSsdNvme } from '../../fixtures/performance-vectors'

const TOPOLOGY: Topology = { type: 'standard', level: 'RAID6' }

function inputFor(
  driveCount: number,
  blockSize: BlockSize,
  drive: Drive = testSsdNvme,
): PerformanceInput {
  return {
    drive,
    driveCount,
    hotSpares: 0,
    serverCount: 1,
    topology: TOPOLOGY,
    controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller: 'perc_h965i' },
    readPercent: 100,
    randomPercent: 100,
    blockSize,
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
  }
}

describe('512K block size', () => {
  it('is offered by the enum, between 256K and 1M', () => {
    expect(BLOCK_SIZES).toContain('512K')
    expect(BLOCK_SIZES.indexOf('256K')).toBeLessThan(BLOCK_SIZES.indexOf('512K'))
    expect(BLOCK_SIZES.indexOf('512K')).toBeLessThan(BLOCK_SIZES.indexOf('1M'))
  })

  it('never reads below 256K or above 1M at the same configuration', () => {
    for (const drives of [1, 4, 24, 96]) {
      const small = calculatePerformance(inputFor(drives, '256K')).maxReadThroughputMBs
      const mid = calculatePerformance(inputFor(drives, '512K')).maxReadThroughputMBs
      const large = calculatePerformance(inputFor(drives, '1M')).maxReadThroughputMBs
      expect(mid).toBeGreaterThanOrEqual(small)
      expect(mid).toBeLessThanOrEqual(large)
    }
  })

  it('is a distinct byte count, not a duplicate of either neighbour', () => {
    const strictlyAbove256K = [8, 24, 96].some(
      (drives) =>
        calculatePerformance(inputFor(drives, '512K', testHdd7200)).maxReadThroughputMBs >
        calculatePerformance(inputFor(drives, '256K', testHdd7200)).maxReadThroughputMBs,
    )
    expect(strictlyAbove256K).toBe(true)

    // At 96 HDDs the IOPS-limited path yields ~7200 MB/s at 512K vs. ~14400 MB/s at 1M, well
    // under the ~19200 MB/s media cap, so a 512K entry copied from 1M's byte count is caught.
    const strictlyBelow1M = [8, 24, 96].some(
      (drives) =>
        calculatePerformance(inputFor(drives, '512K', testHdd7200)).maxReadThroughputMBs <
        calculatePerformance(inputFor(drives, '1M', testHdd7200)).maxReadThroughputMBs,
    )
    expect(strictlyBelow1M).toBe(true)
  })
})
