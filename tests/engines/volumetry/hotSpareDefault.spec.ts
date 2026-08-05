/**
 * The store defaults `hotSpares` to 0, and these are the figures that follow.
 *
 * A hot spare is a deliberate design choice, not something a sizing tool should assume. The
 * previous default of 1 silently reduced usable capacity on first load for every platform that
 * honours spares — the user saw a smaller number than their hardware gives, without having
 * asked for a spare.
 *
 * Pinned to exact byte values, NOT relational bounds. The 45x tiered-cache error (#111) shipped
 * for months and survived 1,391 tests because every S2D and vSAN assertion used
 * `toBeGreaterThan`. A figure this project publishes gets an exact expectation.
 *
 * `driveCount` here is the CLUSTER TOTAL and `hotSpares` is already multiplied by the server
 * count — the shape `useVolumetryCalc` passes (`totalDriveCount` / `totalHotSpares`), not the
 * per-node values the store holds.
 */

import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import type { Topology } from '@/types/topology'
import { createVolumetryInput } from '../../fixtures/vector-harness'

interface Vector {
  label: string
  topology: Topology
  /** Cluster-total drive count. */
  drives: number
  servers: number
  /** Usable bytes with the OLD default of one spare per node — recorded for the CHANGELOG. */
  usableWithOneSparePerNode: number
  /** Usable bytes with the NEW default of zero. */
  usableWithNoSpares: number
}

const VECTORS: Vector[] = [
  {
    label: 'standard RAID6, 8 drives',
    topology: { type: 'standard', level: 'RAID6' },
    drives: 8,
    servers: 1,
    usableWithOneSparePerNode: 4_950_000_000_000,
    usableWithNoSpares: 5_940_000_000_000,
  },
  {
    label: 'ZFS raidz2, 8 drives',
    topology: { type: 'zfs', level: 'raidz2' },
    drives: 8,
    servers: 1,
    usableWithOneSparePerNode: 4_813_935_436_062.72,
    usableWithNoSpares: 5_803_935_436_062.72,
  },
  {
    /**
     * BeeGFS moves furthest — 33%, not the ~20% the block platforms show. Four spares across
     * four nodes leave 44 drives, and 44 does not divide by a 12-drive storage target: three
     * targets form and eight drives are stranded, contributing nothing. The spares cost a whole
     * target's worth of capacity on top of themselves.
     */
    label: 'BeeGFS raid6, 48 drives (12 x 4 nodes)',
    topology: { type: 'beegfs', level: 'beegfs_raid6' },
    drives: 48,
    servers: 4,
    usableWithOneSparePerNode: 29_400_000_000_000,
    usableWithNoSpares: 39_200_000_000_000,
  },
]

describe('hotSpares defaults to 0', () => {
  it('the store ships no hot spare', () => {
    useConfigStore.getState().resetToDefaults()
    expect(useConfigStore.getState().hotSpares).toBe(0)
  })

  for (const v of VECTORS) {
    it(`${v.label}: ${v.usableWithOneSparePerNode} -> ${v.usableWithNoSpares} bytes`, () => {
      const spared = calculateVolumetry(
        createVolumetryInput(v.drives, v.topology, {
          serverCount: v.servers,
          hotSpares: v.servers,
        }),
      )
      const bare = calculateVolumetry(
        createVolumetryInput(v.drives, v.topology, { serverCount: v.servers, hotSpares: 0 }),
      )

      expect(spared.usableCapacity).toBe(v.usableWithOneSparePerNode)
      expect(bare.usableCapacity).toBe(v.usableWithNoSpares)
    })
  }
})
