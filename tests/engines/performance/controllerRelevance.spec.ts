/**
 * The controller selector must be shown only where the bottleneck chain reads it.
 *
 * `calculatePerformance` builds a Controller layer from `CONTROLLER_LIMITS[controller]` for
 * fourteen of the fifteen topology types. vSAN ESA is NVMe-direct: `isNvmeDirect` drops the
 * Controller layer from `layers` entirely and derives `iopsCeiling` from PCIe and network
 * alone, so the selector is inert there.
 *
 * This probe deliberately picks its controller pair from `getControllerOptions(type, level)`
 * rather than hard-coding two PERCs. Topologies constrain which controllers are legal —
 * software-defined platforms accept only HBAs — so a fixed pair would have tested a
 * configuration the app never lets a user reach, and would have "passed" for the wrong reason.
 */

import { describe, expect, it } from 'vitest'
import { getCapabilities } from '@/engines/capabilities'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import {
  CONTROLLER_LIMITS,
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  getControllerOptions,
} from '@/types'
import type { ControllerType, Topology } from '@/types/topology'
import { testSsdNvme } from '../../fixtures/performance-vectors'

/**
 * Drives per node, deliberately high.
 *
 * At a realistic 12 drives/node the media layer binds first on most platforms, so swapping
 * the controller moves nothing and the probe would have concluded "inert" for eight
 * topologies — measuring which layer happens to bind in one fixture, not whether the engine
 * reads the controller at all. At 200 the controller ceiling is reachable, so an unchanged
 * result means the Controller layer is genuinely absent from the chain.
 *
 * Ceph at 12 drives: 8.0M IOPS either way. At 200: 8.0M vs 30M. Same code, opposite verdict.
 */
const PROBE_DRIVES = 200

/** One representative valid config per topology type — mirrors capabilities.spec.ts. */
const REPRESENTATIVE: { topology: Topology; drives: number; servers: number }[] = [
  { topology: { type: 'standard', level: 'RAID5' }, drives: 8, servers: 1 },
  { topology: { type: 'zfs', level: 'raidz2' }, drives: 8, servers: 1 },
  { topology: { type: 's2d', level: 'mirror' }, drives: 12, servers: 4 },
  { topology: { type: 'proprietary', level: 'synology_shr' }, drives: 6, servers: 1 },
  { topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'vsan_osa', level: 'vsan_osa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'ceph', level: 'ceph_replicated_3' }, drives: 12, servers: 4 },
  { topology: { type: 'powerflex', level: 'powerflex_medium_2way' }, drives: 12, servers: 4 },
  { topology: { type: 'powerstore', level: 'powerstore_raid5' }, drives: 12, servers: 2 },
  { topology: { type: 'powerscale', level: 'powerscale_n2_1' }, drives: 12, servers: 4 },
  { topology: { type: 'objectscale', level: 'objectscale_ec_12_4' }, drives: 16, servers: 4 },
  { topology: { type: 'nutanix', level: 'nutanix_rf2' }, drives: 12, servers: 4 },
  { topology: { type: 'powervault', level: 'powervault_raid6' }, drives: 12, servers: 1 },
  { topology: { type: 'longhorn', level: 'longhorn_r3' }, drives: 12, servers: 4 },
  { topology: { type: 'beegfs', level: 'beegfs_raid6' }, drives: 12, servers: 1 },
]

function inputFor(
  topology: Topology,
  drives: number,
  servers: number,
  controller: ControllerType,
): PerformanceInput {
  return {
    drive: testSsdNvme,
    driveCount: drives,
    hotSpares: 0,
    serverCount: servers,
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

/**
 * The weakest and strongest legal controllers for this topology, by IOPS ceiling. Returns
 * null when the topology admits fewer than two distinct ceilings — the probe cannot say
 * anything in that case, and reporting that honestly beats a vacuous assertion.
 */
function weakestAndStrongest(topology: Topology): [ControllerType, ControllerType] | null {
  const valid = getControllerOptions(topology.type, topology.level)
  const sorted = [...valid].sort((a, b) => CONTROLLER_LIMITS[a].iops - CONTROLLER_LIMITS[b].iops)
  const weak = sorted[0]
  const strong = sorted[sorted.length - 1]
  if (!weak || !strong) return null
  if (CONTROLLER_LIMITS[weak].iops === CONTROLLER_LIMITS[strong].iops) return null
  return [weak, strong]
}

describe('honoursController matches the bottleneck chain', () => {
  for (const { topology, servers } of REPRESENTATIVE) {
    const caps = getCapabilities(topology.type)

    it(`${topology.type}: honoursController=${caps.honoursController}`, () => {
      const pair = weakestAndStrongest(topology)
      if (!pair) {
        // powerstore, powerscale and objectscale are appliances with exactly ONE legal
        // controller (APPLIANCE_CONTROLLERS), so there is nothing to compare. That is a
        // limit of the probe, not evidence the flag is wrong — asserting a failure here
        // would blame the map for the fixture's inability to discriminate.
        expect(
          getControllerOptions(topology.type, topology.level).length,
          `${topology.type} should have a single fixed controller if the probe cannot discriminate`,
        ).toBe(1)
        return
      }
      const [weak, strong] = pair

      const slow = calculatePerformance(inputFor(topology, PROBE_DRIVES, servers, weak))
      const fast = calculatePerformance(inputFor(topology, PROBE_DRIVES, servers, strong))

      if (caps.honoursController) {
        expect(fast.maxReadIOPS).toBeGreaterThan(slow.maxReadIOPS)
      } else {
        expect(fast.maxReadIOPS).toBe(slow.maxReadIOPS)
      }
    })
  }
})
