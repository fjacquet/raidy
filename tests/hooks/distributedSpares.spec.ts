/**
 * Platforms that rebuild from distributed reserve capacity must ignore the hot-spare count.
 *
 * Nine platforms document rebuild from reserved or free capacity rather than from dedicated
 * spare drives, so a "hot spares" input is not a thing their administrator configures:
 *
 *   S2D          reserve capacity is "taken evenly from every drive in the pool"
 *   PowerScale   Virtual Hot Spare — reserved space, not a physical disk
 *   PowerStore   "Dedicated hot spare drives are not required"
 *   PowerFlex    spare capacity spread across all disks
 *   Nutanix      many-to-many rebuild, no single hot-spare destination
 *   Ceph         recovery backfills into free cluster capacity
 *   Longhorn     replicas rebuild onto any node with free space
 *   ObjectScale  erasure-coded fragments re-created on surviving nodes
 *   vSAN         (already present before this change)
 *
 * ObjectScale rests on its erasure-coding architecture rather than a vendor statement — no
 * source says it outright. Recorded as inference in DISTRIBUTED_SPARE_TOPOLOGIES.
 *
 * This drives the REAL hook rather than re-implementing `usesDistributedSpares(...) ? 0 : ...`
 * in the test: the zeroing lives in the hooks, not in `calculateVolumetry`, so a test that
 * called the engine directly would prove nothing about what the app shows. Exact-byte equality,
 * not a relational bound.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useVolumetryCalc } from '@/hooks/useVolumetryCalc'
import { useConfigStore } from '@/store'
import { DISTRIBUTED_SPARE_TOPOLOGIES, usesDistributedSpares } from '@/types'
import type { Topology, TopologyType } from '@/types/topology'

const DISTRIBUTED: Topology[] = [
  { type: 's2d', level: 'mirror' },
  { type: 'vsan_osa', level: 'vsan_osa_raid5' },
  { type: 'vsan_esa', level: 'vsan_esa_raid5' },
  { type: 'ceph', level: 'ceph_replicated_3' },
  { type: 'powerflex', level: 'powerflex_medium_2way' },
  { type: 'powerstore', level: 'powerstore_raid5' },
  { type: 'powerscale', level: 'powerscale_onefs' },
  { type: 'objectscale', level: 'objectscale_ec_12_4' },
  { type: 'nutanix', level: 'nutanix_rf2' },
  { type: 'longhorn', level: 'longhorn_r3' },
]

/** Platforms whose vendors document dedicated spare drives — the control stays. */
const DEDICATED: TopologyType[] = ['standard', 'zfs', 'proprietary', 'powervault', 'beegfs']

function usableWith(topology: Topology, hotSpares: number): number {
  useConfigStore.getState().resetToDefaults()
  const store = useConfigStore.getState()
  store.setTopology(topology)
  store.setDriveCount(12)
  store.setServerCount(4)
  store.setHotSpares(hotSpares)
  const { result } = renderHook(() => useVolumetryCalc())
  return result.current.usableCapacity
}

describe('distributed-spare platforms ignore the hot-spare count', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
  })

  for (const topology of DISTRIBUTED) {
    it(`${topology.type}: two spares change nothing`, () => {
      const bare = usableWith(topology, 0)
      const spared = usableWith(topology, 2)
      expect(bare).toBeGreaterThan(0)
      expect(spared).toBe(bare)
    })
  }

  for (const type of DEDICATED) {
    it(`${type} still honours spares`, () => {
      expect(usesDistributedSpares(type)).toBe(false)
    })
  }

  it('the list holds exactly the ten distributed platforms', () => {
    expect([...DISTRIBUTED_SPARE_TOPOLOGIES].sort()).toEqual(DISTRIBUTED.map((t) => t.type).sort())
  })
})
