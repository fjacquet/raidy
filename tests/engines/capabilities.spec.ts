import { describe, expect, it } from 'vitest'
import {
  effectiveServerCount,
  getCapabilities,
  PLATFORM_CAPABILITIES,
  shouldShowControl,
} from '@/engines/capabilities'
import { calculateVolumetry } from '@/engines/volumetry'
import type { Topology, TopologyType } from '@/types/topology'
import { createVolumetryInput } from '../fixtures/vector-harness'

/** One representative valid config per topology type. */
const REPRESENTATIVE: { topology: Topology; drives: number; servers: number }[] = [
  { topology: { type: 'standard', level: 'RAID5' }, drives: 8, servers: 1 },
  { topology: { type: 'zfs', level: 'raidz2' }, drives: 8, servers: 1 },
  { topology: { type: 's2d', level: 'mirror' }, drives: 12, servers: 4 },
  { topology: { type: 'proprietary', level: 'synology_shr' }, drives: 6, servers: 1 },
  { topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'vsan_osa', level: 'vsan_osa_raid5' }, drives: 12, servers: 4 },
  { topology: { type: 'ceph', level: 'ceph_replicated_3' }, drives: 12, servers: 4 },
  { topology: { type: 'powerflex', level: 'powerflex_medium_2way' }, drives: 12, servers: 4 },
  // NOTE: brief placeholder 'powerstore_drr' does not exist in PowerStoreTopology;
  // replaced with the real union member 'powerstore_raid5'.
  { topology: { type: 'powerstore', level: 'powerstore_raid5' }, drives: 12, servers: 2 },
  { topology: { type: 'powerscale', level: 'powerscale_onefs' }, drives: 12, servers: 4 },
  { topology: { type: 'objectscale', level: 'objectscale_ec_12_4' }, drives: 16, servers: 4 },
  { topology: { type: 'nutanix', level: 'nutanix_rf2' }, drives: 12, servers: 4 },
  { topology: { type: 'powervault', level: 'powervault_raid6' }, drives: 12, servers: 1 },
  { topology: { type: 'longhorn', level: 'longhorn_r3' }, drives: 12, servers: 4 },
  { topology: { type: 'beegfs', level: 'beegfs_raid6' }, drives: 12, servers: 1 },
]

const MULTI_NODE_TYPES: TopologyType[] = [
  's2d',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'powerstore',
  'objectscale',
  'nutanix',
  'longhorn',
  'beegfs',
]

describe('capability map matches engine behavior', () => {
  for (const { topology, drives, servers } of REPRESENTATIVE) {
    const caps = getCapabilities(topology.type)

    it(`${topology.type}: supportsCompression=${caps.supportsCompression}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, compressionRatio: 1 }),
      )
      const compressed = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, compressionRatio: 2 }),
      )
      if (caps.supportsCompression) {
        expect(compressed.effectiveCapacity).toBeGreaterThan(base.effectiveCapacity)
      } else {
        expect(compressed.effectiveCapacity).toBe(base.effectiveCapacity)
      }
    })

    it(`${topology.type}: supportsDedup=${caps.supportsDedup}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, dedupRatio: 1 }),
      )
      const deduped = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, dedupRatio: 2 }),
      )
      if (caps.supportsDedup) {
        expect(deduped.effectiveCapacity).toBeGreaterThan(base.effectiveCapacity)
      } else {
        expect(deduped.effectiveCapacity).toBe(base.effectiveCapacity)
      }
    })

    /**
     * Every one of the fifteen types subtracts hot spares in the engine — unconditionally, with
     * no per-platform exception in the *UI-relevance* sense. This is the invariant that forces
     * hot-spare UI relevance to be decided OUTSIDE the capability map (issue #130):
     * `DISTRIBUTED_SPARE_TOPOLOGIES` gates the slider and the three calculation hooks zero
     * `hotSpares` before calling the engine, so a capability flag claiming a platform ignores
     * spares would be refuted right here.
     *
     * Until #130 this assertion was wrapped in `if (caps.supportsHotSpares)`, a flag that was
     * `true` for all fifteen — so the `else` branch had never executed and the test read as
     * though a platform were free to opt out. It is not — with one STRUCTURAL exception added by
     * the PowerScale multi-tier restructuring (2026-08): PowerScale has no single cluster-wide
     * drive count for the generic `VolumetryInput.hotSpares` field to apply to any more. A
     * cluster is 1-8 independently-sized node pools (tiers), each carrying its own Virtual Hot
     * Spare reserve (`PowerScaleTier.vhsDriveCount`/`.vhsPercent` — see `sizeTier`), and
     * `calculatePowerScaleVolumetry` never reads the generic field at all. That is unlike every
     * other exception in this file, which is a UI-visibility decision layered on top of an
     * engine that still honours the input; here the engine itself has nothing to honour. Asserted
     * explicitly below (not skipped), so a future change that wires the generic field back up for
     * PowerScale would be caught either way.
     */
    it(`${topology.type}: the engine subtracts hot spares`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers }),
      )
      const spared = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, hotSpares: 1 }),
      )
      if (topology.type === 'powerscale') {
        expect(spared.usableCapacity).toBe(base.usableCapacity)
        return
      }
      expect(spared.usableCapacity).toBeLessThan(base.usableCapacity)
    })

    /**
     * `drivePopulationFromCatalog` is the flag the Hardware panel uses to decide whether its
     * drive picker is the SOURCE of the population or merely a proxy for the properties a
     * vendor catalog omits. It is not a UI preference: it is probeable, and probed here.
     *
     * Double the drive count. For fourteen types `rawCapacity` doubles with it — the panel's
     * `driveCount` is the population. For PowerScale `calculateVolumetry` short-circuits into
     * `calculatePowerScaleVolumetry(powerscaleOptions)` before `driveCount` is read at all, so
     * raw capacity does not move: the population is the node catalog's, and the selected drive
     * survives only as the media proxy sustainability, TCO, performance and resilience read.
     */
    it(`${topology.type}: drivePopulationFromCatalog=${caps.drivePopulationFromCatalog}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers }),
      )
      const doubled = calculateVolumetry(
        createVolumetryInput(drives * 2, topology, { serverCount: servers }),
      )
      if (caps.drivePopulationFromCatalog) {
        expect(doubled.rawCapacity).toBe(base.rawCapacity)
      } else {
        expect(doubled.rawCapacity).toBeGreaterThan(base.rawCapacity)
      }
    })

    /**
     * `getFilesystemOverheadPercent` switches on `topology.type` and returns a platform
     * constant for thirteen of the fifteen types. Two consult the user's `fsType`:
     * `standard`, via an explicit case, and `longhorn`, which has NO case and so falls
     * through to the `default` branch.
     *
     * That second one is why this probe exists. An earlier draft of the spec claimed
     * `standard` only; gating on that would have hidden the control for Longhorn while
     * the engine kept reading the stored value, silently changing Longhorn's usable
     * capacity. Two careful readings of the code missed it.
     *
     * xfs (1%) vs ext4 (5%) — deliberately chosen because they differ; a pair sharing an
     * overhead constant would make this assertion vacuous.
     */
    it(`${topology.type}: honoursFsType=${caps.honoursFsType}`, () => {
      const xfs = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, fsType: 'xfs' }),
      )
      const ext4 = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, fsType: 'ext4' }),
      )
      if (caps.honoursFsType) {
        expect(ext4.usableCapacity).toBeLessThan(xfs.usableCapacity)
      } else {
        expect(ext4.usableCapacity).toBe(xfs.usableCapacity)
      }
    })
  }
})

describe('hasServerCount is structural (not probed)', () => {
  const allTypes = Object.keys(PLATFORM_CAPABILITIES) as TopologyType[]

  it('is true exactly for multi-node platforms', () => {
    for (const type of allTypes) {
      const expected = MULTI_NODE_TYPES.includes(type)
      expect(getCapabilities(type).hasServerCount, `hasServerCount for ${type}`).toBe(expected)
    }
  })

  it('is false for single-node platforms', () => {
    for (const type of ['standard', 'zfs', 'proprietary', 'powervault'] as TopologyType[]) {
      expect(getCapabilities(type).hasServerCount).toBe(false)
    }
  })

  it('hides the shared servers slider for PowerScale, whose nodes are per tier', () => {
    expect(PLATFORM_CAPABILITIES.powerscale.hasServerCount).toBe(false)
  })

  it('keeps compression and dedup off for PowerScale — DRR is a node-model property', () => {
    expect(PLATFORM_CAPABILITIES.powerscale.supportsCompression).toBe(false)
    expect(PLATFORM_CAPABILITIES.powerscale.supportsDedup).toBe(false)
  })

  it('marks PowerScale — and only PowerScale — as catalog-populated', () => {
    for (const type of allTypes) {
      expect(getCapabilities(type).drivePopulationFromCatalog, `catalog flag for ${type}`).toBe(
        type === 'powerscale',
      )
    }
  })
})

describe('shouldShowControl', () => {
  it('mirrors getCapabilities for each control', () => {
    for (const type of Object.keys(PLATFORM_CAPABILITIES) as TopologyType[]) {
      const caps = getCapabilities(type)
      expect(shouldShowControl('compression', type)).toBe(caps.supportsCompression)
      expect(shouldShowControl('dedup', type)).toBe(caps.supportsDedup)
      expect(shouldShowControl('fsType', type)).toBe(caps.honoursFsType)
      expect(shouldShowControl('controller', type)).toBe(caps.honoursController)
      expect(shouldShowControl('serverCount', type)).toBe(caps.hasServerCount)
    }
  })

  it('returns true for zfs compression (the only platform driven by the global ratio), false for standard', () => {
    expect(shouldShowControl('compression', 'zfs')).toBe(true)
    expect(shouldShowControl('compression', 'standard')).toBe(false)
    expect(shouldShowControl('serverCount', 'standard')).toBe(false)
  })
})

describe('effectiveServerCount (finding #14 — stale serverCount clamp)', () => {
  it('clamps to 1 for single-node platforms whose serverCount slider is hidden', () => {
    expect(effectiveServerCount(8, { type: 'zfs', level: 'raidz2' })).toBe(1)
    expect(effectiveServerCount(8, { type: 'proprietary', level: 'synology_shr' })).toBe(1)
    expect(effectiveServerCount(8, { type: 'powervault', level: 'powervault_raid6' })).toBe(1)
    expect(effectiveServerCount(8, { type: 'standard', level: 'RAID5' })).toBe(1)
  })

  it('preserves serverCount for multi-node platforms', () => {
    expect(effectiveServerCount(8, { type: 'ceph', level: 'ceph_replicated_3' })).toBe(8)
    expect(effectiveServerCount(4, { type: 's2d', level: 'mirror' })).toBe(4)
  })

  it('preserves serverCount for standard RAID50/60, where it doubles as RAID-group count', () => {
    expect(effectiveServerCount(4, { type: 'standard', level: 'RAID50' })).toBe(4)
    expect(effectiveServerCount(4, { type: 'standard', level: 'RAID60' })).toBe(4)
  })
})
