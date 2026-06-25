/**
 * Tests for topology slice behaviour around vSAN defaults:
 * - vSAN forces hot spares to 0 (distributed slack-space rebuilds, no dedicated spares)
 * - vSAN ESA defaults the controller to the NVMe HBA (no SAS HBA on NVMe-direct hosts)
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('topology slice — vSAN defaults', () => {
  beforeEach(() => {
    // Reset to a known non-vSAN baseline with a non-zero spare count.
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

  it('forces hot spares to 0 when switching to vSAN ESA', () => {
    useConfigStore.getState().setTopology({ type: 'vsan_esa', level: 'vsan_esa_raid5' })
    expect(useConfigStore.getState().hotSpares).toBe(0)
  })

  it('forces hot spares to 0 when switching to vSAN OSA', () => {
    useConfigStore.getState().setTopology({ type: 'vsan_osa', level: 'vsan_osa_raid5' })
    expect(useConfigStore.getState().hotSpares).toBe(0)
  })

  it('defaults the controller to the NVMe HBA for vSAN ESA', () => {
    useConfigStore.getState().setTopology({ type: 'vsan_esa', level: 'vsan_esa_raid5' })
    expect(useConfigStore.getState().controllerOptions.controller).toBe('hba_nvme')
  })

  it('leaves hot spares user-controlled for standard RAID', () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID5' })
    expect(useConfigStore.getState().hotSpares).toBe(2)
  })
})
