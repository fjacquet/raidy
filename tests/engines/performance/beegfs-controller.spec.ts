/**
 * The bottleneck chain's Controller layer must use the RAID controller ceiling for a
 * hardware-RAID BeeGFS storage target.
 *
 * This is an end-to-end pin over the whole path the defect ran through: the store snaps the
 * controller on `setTopology`, `getControllerOptions` decides what it may snap to, and the
 * performance engine reads `CONTROLLER_LIMITS[controllerOptions.controller]` for the Controller
 * layer. Classifying BeeGFS as pure SDS made the store snap to an HBA, so a RAID6 node was
 * modelled at up to 10M IOPS / 64 GB/s instead of a PERC H755's 750k IOPS / 12 GB/s.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import { useConfigStore } from '@/store'
import {
  CONTROLLER_LIMITS,
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import type { ControllerType, Topology } from '@/types/topology'
import { testSsdNvme } from '../../fixtures/performance-vectors'

function inputFor(topology: Topology, controller: ControllerType): PerformanceInput {
  return {
    drive: testSsdNvme,
    driveCount: 48,
    hotSpares: 0,
    serverCount: 1,
    topology,
    controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller },
    readPercent: 70,
    randomPercent: 100,
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

function controllerLayer(input: PerformanceInput) {
  const layer = calculatePerformance(input).layers.find(
    (l) => l.name === CONTROLLER_LIMITS[input.controllerOptions.controller].name,
  )
  expect(layer, 'Controller layer not found').toBeDefined()
  return layer as NonNullable<typeof layer>
}

describe('BeeGFS Controller layer ceiling', () => {
  beforeEach(() => {
    useConfigStore.setState({
      topology: { type: 'standard', level: 'RAID6' },
      controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller: 'hba_nvme' },
    })
  })

  it('models beegfs_raid6 at the RAID controller ceiling, not the HBA ceiling', () => {
    // Arrive from an HBA — the pre-fix store would have kept it.
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    const snapped = useConfigStore.getState().controllerOptions.controller
    expect(CONTROLLER_LIMITS[snapped].isHba).toBe(false)

    const topology: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const layer = controllerLayer(inputFor(topology, snapped))

    expect(layer.iops).toBe(CONTROLLER_LIMITS[snapped].iops)
    expect(layer.throughputMBs).toBe(CONTROLLER_LIMITS[snapped].throughputMBs)
    // Strictly below what the HBA-only classification produced.
    expect(layer.iops).toBeLessThan(CONTROLLER_LIMITS.hba_nvme.iops)
    expect(layer.throughputMBs).toBeLessThan(CONTROLLER_LIMITS.hba_nvme.throughputMBs)
  })

  it('models a PERC H755 BeeGFS RAID6 target at exactly its published ceiling', () => {
    const layer = controllerLayer(inputFor({ type: 'beegfs', level: 'beegfs_raid6' }, 'perc_h755'))
    expect(layer.iops).toBe(750_000)
    expect(layer.throughputMBs).toBe(12_000)
  })

  it('still models beegfs_raidz2 at the HBA ceiling — ZFS needs IT mode', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raidz2' })
    const snapped = useConfigStore.getState().controllerOptions.controller
    expect(CONTROLLER_LIMITS[snapped].isHba).toBe(true)

    const layer = controllerLayer(inputFor({ type: 'beegfs', level: 'beegfs_raidz2' }, snapped))
    expect(layer.iops).toBe(CONTROLLER_LIMITS[snapped].iops)
  })

  it('lowers the modelled ceiling relative to the pre-fix HBA classification', () => {
    const topology: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const raid = controllerLayer(inputFor(topology, 'perc_h755'))
    const preFixHba = controllerLayer(inputFor(topology, 'hba_nvme'))

    // ~2.7x IOPS and ~1.6x throughput against the cheapest HBA; far more against NVMe direct.
    expect(preFixHba.iops / raid.iops).toBeGreaterThan(2.7)
    expect(preFixHba.throughputMBs / raid.throughputMBs).toBeGreaterThan(1.6)
  })
})
