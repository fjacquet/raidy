/**
 * A tiered BeeGFS configuration with metadata targets must cost drive power against the
 * capacity tier's drive and count, not the Hardware panel's.
 *
 * `useSustainabilityCalc` built its `resolveTiering` options bag without `beeGfsOptions`
 * (mirroring the bug `usePerformanceCalc` had before it was fixed), so BeeGFS tiering never
 * reached `calculateSustainability` at all — a tiered BeeGFS configuration's power, CO2, TCO
 * and flash endurance were still computed from the Hardware-panel drive.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSustainabilityCalc } from '@/hooks/useSustainabilityCalc'
import { useConfigStore } from '@/store'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import { buildTieringConfig, FAST_DRIVE_ID } from '../fixtures/tiering-fixtures'

// power = idle_watts * 0.3 + load_watts * 0.7 (see calculatePower in src/engines/sustainability/index.ts)
const FAST_DRIVE_AVG_WATTS = 2.5 * 0.3 + 6 * 0.7 // 4.95 W
const CAPACITY_DRIVE_AVG_WATTS = 5.4 * 0.3 + 8.1 * 0.7 // 7.29 W

const FAST_TIER_COUNT_PER_NODE = 2
const CAPACITY_TIER_COUNT_PER_NODE = 6
const SERVER_COUNT = 4

const tiering = buildTieringConfig(FAST_TIER_COUNT_PER_NODE, CAPACITY_TIER_COUNT_PER_NODE)

function drivePowerWatts(): number {
  const { result } = renderHook(() => useSustainabilityCalc(0))
  return result.current.powerBreakdown.drives
}

describe('useSustainabilityCalc BeeGFS tiering', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
    const store = useConfigStore.getState()
    store.setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    store.setDriveId(FAST_DRIVE_ID)
    store.setDriveCount(8)
    store.setServerCount(SERVER_COUNT)
  })

  it('costs drive power against the capacity tier when metadata targets are on', () => {
    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: true,
      tiering,
    })

    const expectedWatts =
      FAST_DRIVE_AVG_WATTS * FAST_TIER_COUNT_PER_NODE * SERVER_COUNT +
      CAPACITY_DRIVE_AVG_WATTS * CAPACITY_TIER_COUNT_PER_NODE * SERVER_COUNT

    expect(drivePowerWatts()).toBeCloseTo(expectedWatts, 6)
  })

  it('leaves a BeeGFS configuration without metadata targets unchanged', () => {
    const before = drivePowerWatts()

    useConfigStore.getState().setBeeGfsOptions({
      ...DEFAULT_BEEGFS_OPTIONS,
      metadataTargets: false,
      tiering,
    })

    expect(drivePowerWatts()).toBe(before)
  })
})
