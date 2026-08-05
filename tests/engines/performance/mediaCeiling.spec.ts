/**
 * The dashboard gauges measure achieved performance against the DRIVES' own ceiling, and
 * `mediaCeilingMBs` / `mediaCeilingIOPS` are what they scale by.
 *
 * Two ceilings were rejected before this one, and both failure modes are worth pinning:
 *
 *  - A FIXED scale saturates. 50,000 MB/s and 2,000,000 IOPS predated the PERC13 recalibration
 *    (#84, controller limits up 3.4-4.7x); an 8-node NVMe cluster reports 225,600 MB/s and
 *    38.4M IOPS, so all four needles pinned and the arcs conveyed nothing.
 *  - The BOTTLENECK is degenerate. `maxReadThroughputMBs` is
 *    `Math.min(effectiveReadThroughput, minThroughput)`, so a gauge scaled to the bottleneck
 *    reads exactly 100% whenever the infrastructure binds — which is most of the time.
 *
 * Against the media ceiling the reading means something in both directions: below 100% the
 * chain is throttling drives the user paid for; at 100% the drives themselves are the limit.
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
import type { ControllerType, Topology } from '@/types/topology'
import { testSsdNvme } from '../../fixtures/performance-vectors'

const TOPOLOGY: Topology = { type: 'standard', level: 'RAID6' }

function inputFor(driveCount: number, controller: ControllerType): PerformanceInput {
  return {
    drive: testSsdNvme,
    driveCount,
    hotSpares: 0,
    serverCount: 1,
    topology: TOPOLOGY,
    controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller },
    readPercent: 100,
    randomPercent: 0,
    blockSize: '64K',
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
  }
}

describe('media ceiling drives the gauge scale', () => {
  it('is never below the achieved throughput, so a gauge cannot exceed full', () => {
    for (const drives of [4, 24, 96]) {
      const r = calculatePerformance(inputFor(drives, 'perc_h965i'))
      expect(r.mediaCeilingMBs).toBeGreaterThanOrEqual(r.maxReadThroughputMBs)
      expect(r.mediaCeilingIOPS).toBeGreaterThanOrEqual(r.maxReadIOPS)
    }
  })

  it('grows with the drive count — it describes the media, not the chain', () => {
    const small = calculatePerformance(inputFor(4, 'perc_h965i'))
    const large = calculatePerformance(inputFor(96, 'perc_h965i'))
    expect(large.mediaCeilingMBs).toBeGreaterThan(small.mediaCeilingMBs)
    expect(large.mediaCeilingIOPS).toBeGreaterThan(small.mediaCeilingIOPS)
  })

  /**
   * The reading that makes the gauge worth drawing: swapping to a weaker controller must not
   * move the ceiling, only the achieved figure — so the needle falls and the user can see the
   * chain, not the drives, is the constraint.
   */
  it('is unchanged by a weaker controller, while the achieved figure drops', () => {
    const strong = calculatePerformance(inputFor(96, 'perc_h975i'))
    const weak = calculatePerformance(inputFor(96, 'perc_h755'))

    expect(weak.mediaCeilingMBs).toBe(strong.mediaCeilingMBs)
    expect(weak.maxReadThroughputMBs).toBeLessThan(strong.maxReadThroughputMBs)

    const weakFill = weak.maxReadThroughputMBs / weak.mediaCeilingMBs
    const strongFill = strong.maxReadThroughputMBs / strong.mediaCeilingMBs
    expect(weakFill).toBeLessThan(strongFill)
  })
})
