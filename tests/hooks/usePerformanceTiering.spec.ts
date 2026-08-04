/**
 * A BeeGFS configuration with metadata targets must be costed against the storage targets'
 * capacity-tier drive, not the Hardware panel's.
 *
 * `usePerformanceCalc` built its `resolveTiering` options bag without `beeGfsOptions`, so BeeGFS
 * tiering never reached `calculatePerformance` at all. (Before the capacity-tier branch landed in
 * the engine, adding it here would have changed nothing — the engine ignored `tiering` outside
 * its S2D branch.)
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePerformanceCalc } from '@/hooks/usePerformanceCalc'
import { useConfigStore } from '@/store'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_TIERING_CONFIG } from '@/types'

const FAST_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri'
const CAPACITY_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr'

const tiering = {
  ...DEFAULT_TIERING_CONFIG,
  fastTier: { driveId: FAST_DRIVE_ID, driveCount: 2 },
  capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: 6 },
}

function mediaIops(): number {
  const { result } = renderHook(() => usePerformanceCalc())
  const layer = result.current.layers.find((l) => l.name === 'Media (Drives)')
  if (!layer) throw new Error('no media layer in result')
  return layer.iops
}

describe('usePerformanceCalc BeeGFS tiering', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
    const store = useConfigStore.getState()
    store.setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    store.setDriveId(FAST_DRIVE_ID)
    store.setDriveCount(8)
    store.setServerCount(4)
  })

  it('costs the storage targets against the capacity tier when metadata targets are on', () => {
    const untiered = mediaIops()

    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: true,
      tiering,
    })
    const tiered = mediaIops()

    // 6 HDDs/node x 4 nodes at HDD IOPS, versus 8 NVMe/node x 4 nodes at NVMe IOPS.
    expect(tiered).toBeLessThan(untiered)
  })

  it('leaves a BeeGFS configuration without metadata targets unchanged', () => {
    const before = mediaIops()

    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: false,
      tiering,
    })

    expect(mediaIops()).toBe(before)
  })
})
