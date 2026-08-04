/**
 * A tiered S2D / vSAN OSA / Ceph / Nutanix configuration must simulate the CAPACITY tier —
 * its drive count, capacity, URE rate and AFR — not the Hardware panel's drive.
 *
 * Volumetry already resolves this through `resolveTiering`; resilience did not, so the two
 * panels described different clusters. Fast-tier failure semantics (a vSAN cache device taking
 * down its whole disk group, a Ceph WAL/DB NVMe taking out every OSD it serves) remain
 * deliberately unmodelled — see the design spec.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useResilience } from '@/hooks/useResilience'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
} from '@/types'
import type { Topology } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'
import { installMockWorker } from '../fixtures/mock-worker'
import { buildTieringConfig, capacityDrive, fastDrive } from '../fixtures/tiering-fixtures'

/** 2 fast + 6 capacity drives per node. */
const tiering = buildTieringConfig(2, 6)

let posted: SimulationInput[] = []
let uninstall: () => void

beforeEach(() => {
  ;({ posted, uninstall } = installMockWorker())
})

afterEach(() => {
  uninstall()
})

type PlatformCase = {
  name: string
  topology: Topology
  /** Options bag passed to useResilience with tiering ON. */
  tiered: Record<string, unknown>
  /** Same bag with the platform's tiering toggle OFF. */
  untiered: Record<string, unknown>
}

const SERVER_COUNT = 4
const DRIVE_COUNT = 8

const CASES: PlatformCase[] = [
  {
    name: 'S2D',
    topology: { type: 's2d', level: 'mirror' },
    tiered: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: true, tieringConfig: tiering } },
    untiered: {
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: false, tieringConfig: tiering },
    },
  },
  {
    name: 'vSAN OSA',
    topology: { type: 'vsan_osa', level: 'vsan_osa_raid1' },
    tiered: { vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering } },
    untiered: { vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering: undefined } },
  },
  {
    name: 'Ceph',
    topology: { type: 'ceph', level: 'ceph_replicated_3' },
    tiered: { cephOptions: { ...DEFAULT_CEPH_OPTIONS, walDbOffload: true, tiering } },
    untiered: { cephOptions: { ...DEFAULT_CEPH_OPTIONS, walDbOffload: false, tiering } },
  },
  {
    name: 'Nutanix',
    topology: { type: 'nutanix', level: 'nutanix_rf2' },
    tiered: { nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS, clusterType: 'hybrid', tiering } },
    untiered: { nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS, clusterType: 'all-flash', tiering } },
  },
]

function runWith(topology: Topology, extra: Record<string, unknown>): SimulationInput {
  const { result } = renderHook(() =>
    useResilience({
      drive: fastDrive,
      driveCount: DRIVE_COUNT,
      serverCount: SERVER_COUNT,
      hotSpares: 0,
      topology,
      simulationCount: 10,
      autoRun: false,
      ...extra,
    }),
  )
  act(() => {
    result.current.runSimulation()
  })
  const input = posted[0]
  if (!input) throw new Error('no simulation input was posted')
  return input
}

describe('useResilience tiered simulation scope', () => {
  it('premise: the fast and capacity drives differ in every simulated characteristic', () => {
    expect(fastDrive).toBeDefined()
    expect(capacityDrive).toBeDefined()
    expect(fastDrive.capacity_raw).not.toBe(capacityDrive.capacity_raw)
    expect(fastDrive.reliability.ure_rate).not.toBe(capacityDrive.reliability.ure_rate)
    expect(fastDrive.reliability.afr).not.toBe(capacityDrive.reliability.afr)
  })

  for (const platform of CASES) {
    describe(platform.name, () => {
      it('simulates the capacity tier, not the Hardware panel drive', () => {
        const input = runWith(platform.topology, platform.tiered)

        // 6 capacity drives per node x 4 nodes
        expect(input.driveCount).toBe(24)
        expect(input.driveCapacityBytes).toBe(capacityDrive.capacity_raw)
        expect(input.ureRate).toBe(capacityDrive.reliability.ure_rate)
        expect(input.afrPercent).toBe(capacityDrive.reliability.afr)

        // NOT the Hardware panel's drive
        expect(input.driveCapacityBytes).not.toBe(fastDrive.capacity_raw)
        expect(input.driveCount).not.toBe(DRIVE_COUNT * SERVER_COUNT)

        // Fault groups stay the nodes, unlike BeeGFS's storage targets
        expect(input.serverCount).toBe(SERVER_COUNT)
      })

      it('leaves an untiered configuration on the naive path, unchanged', () => {
        const input = runWith(platform.topology, platform.untiered)

        expect(input.driveCount).toBe(DRIVE_COUNT * SERVER_COUNT)
        expect(input.driveCapacityBytes).toBe(fastDrive.capacity_raw)
        expect(input.ureRate).toBe(fastDrive.reliability.ure_rate)
        expect(input.afrPercent).toBe(fastDrive.reliability.afr)
        expect(input.serverCount).toBe(SERVER_COUNT)
      })
    })
  }
})
