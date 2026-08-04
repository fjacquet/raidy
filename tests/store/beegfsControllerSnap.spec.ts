/**
 * Switching BeeGFS level must re-snap the controller.
 *
 * BeeGFS's controller class depends on the level, not on the platform, so `setTopology` has to
 * revalidate on a level-only change: leaving an IT-mode HBA selected on a `beegfs_raid6` config
 * feeds the performance engine the HBA's ceiling (up to 10M IOPS on NVMe direct attach) for a
 * target that really sits behind a RAID controller (750k IOPS on a PERC H755) — an optimistic
 * error of the exact kind this branch exists to remove.
 *
 * The second half asserts the same call leaves every other platform's snapping behaviour alone.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'
import type { ControllerType } from '@/types/topology'
import { CONTROLLER_LIMITS } from '@/types/topology'

function setController(controller: ControllerType) {
  useConfigStore.setState({
    controllerOptions: {
      ...useConfigStore.getState().controllerOptions,
      controller,
    },
  })
}

const currentController = () => useConfigStore.getState().controllerOptions.controller
const isHba = () => CONTROLLER_LIMITS[currentController()].isHba

describe('BeeGFS level change re-snaps the controller', () => {
  beforeEach(() => {
    useConfigStore.setState({
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 2,
      controllerOptions: {
        controller: 'software',
        stripeSize: 256,
        readPolicy: 'adaptive',
        writePolicy: 'write-back',
      },
    })
  })

  it('leaves no HBA selected on beegfs_raid6', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raidz2' })
    expect(isHba()).toBe(true)

    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    expect(isHba()).toBe(false)
  })

  it('leaves no HBA selected on beegfs_raid10', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raidz2' })
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid10' })
    expect(isHba()).toBe(false)
  })

  it('snaps to an HBA when moving to beegfs_raidz2 (ZFS needs IT mode)', () => {
    setController('perc_h755')
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raidz2' })
    expect(isHba()).toBe(true)
  })

  it('does not disturb an already-valid controller on a level change', () => {
    setController('perc_h965i')
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    expect(currentController()).toBe('perc_h965i')

    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid10' })
    expect(currentController()).toBe('perc_h965i')
  })

  it('keeps either choice on beegfs_single, whichever side the user came from', () => {
    setController('hba_nvme')
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_single' })
    expect(currentController()).toBe('hba_nvme')

    setController('perc_h755')
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_single' })
    expect(currentController()).toBe('perc_h755')
  })

  it('arriving from an HBA-only platform lands on a RAID controller', () => {
    useConfigStore.getState().setTopology({ type: 'vsan_esa', level: 'vsan_esa_raid5' })
    expect(currentController()).toBe('hba_nvme')

    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    expect(isHba()).toBe(false)
  })

  it('does not change how other platforms snap', () => {
    // ZFS is HBA-only and declares no preferred default: it takes the first HBA in the list.
    setController('perc_h755')
    useConfigStore.getState().setTopology({ type: 'zfs', level: 'raidz2' })
    expect(currentController()).toBe('hba_sas')

    // Standard RAID is RAID-only and takes the first RAID controller.
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    expect(currentController()).toBe('software')

    // A valid controller survives a level change on standard RAID, exactly as before.
    setController('perc_h965i')
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID5' })
    expect(currentController()).toBe('perc_h965i')
  })
})
