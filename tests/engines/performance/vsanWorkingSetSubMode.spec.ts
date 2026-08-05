/**
 * vSAN OSA reads `workingSetPercent` only in hybrid disk-group mode.
 *
 * `vsanFastTierModel` blends the cache and capacity tiers by working set when the disk group
 * is hybrid; the all-flash branch never consults it. So the slider is inert in all-flash mode
 * even though vSAN OSA as a whole honours it — a gate keyed on `diskGroupMode`, not on
 * `topology.type`, which is why it cannot live in PLATFORM_CAPABILITIES.
 *
 * Pinned before the UI gate, so a later refactor cannot quietly make the slider live in
 * all-flash mode (or dead in hybrid) without a test noticing.
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import type { TieredCapacityResult } from '@/engines/shared/tiering'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
} from '@/types'
import type { Topology } from '@/types/topology'
import { testHdd7200, testSsdNvme } from '../../fixtures/performance-vectors'

const TOPOLOGY: Topology = { type: 'vsan_osa', level: 'vsan_osa_raid1' }

/**
 * Hybrid means an HDD capacity tier — that asymmetry IS what the blend models. Building both
 * tiers from the same NVMe makes the hybrid model degenerate and the assertion vacuous; the
 * first draft of this test did exactly that and "proved" the working set inert in hybrid mode
 * as well.
 *
 * `tiering` takes a RESOLVED TieredCapacityResult, and `workingSetPercent` is a separate
 * top-level input — not the TieringConfig shape the UI holds.
 */
function tieringFor(mode: 'hybrid' | 'all-flash'): TieredCapacityResult {
  const capacityDrive = mode === 'hybrid' ? testHdd7200 : testSsdNvme
  return {
    cacheTierCapacity: testSsdNvme.capacity_raw * 8,
    cacheTierDrive: testSsdNvme,
    cacheTierDriveCount: 8,
    capacityTierCapacity: capacityDrive.capacity_raw * 40,
    capacityTierDrive: capacityDrive,
    capacityTierDriveCount: 40,
  }
}

function inputFor(mode: 'hybrid' | 'all-flash', workingSetPercent: number): PerformanceInput {
  return {
    drive: testSsdNvme,
    driveCount: 12,
    hotSpares: 0,
    serverCount: 4,
    topology: TOPOLOGY,
    controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller: 'hba_nvme' },
    readPercent: 100,
    randomPercent: 100,
    blockSize: '4K',
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
    vsanOptions: { ...DEFAULT_VSAN_OPTIONS, diskGroupMode: mode },
    tiering: tieringFor(mode),
    workingSetPercent,
  }
}

describe('vSAN OSA working set is a hybrid-only input', () => {
  it('changes read IOPS in hybrid mode', () => {
    const small = calculatePerformance(inputFor('hybrid', 10))
    const large = calculatePerformance(inputFor('hybrid', 50))
    expect(large.maxReadIOPS).not.toBe(small.maxReadIOPS)
  })

  it('changes nothing in all-flash mode', () => {
    const small = calculatePerformance(inputFor('all-flash', 10))
    const large = calculatePerformance(inputFor('all-flash', 50))
    expect(large.maxReadIOPS).toBe(small.maxReadIOPS)
  })
})
