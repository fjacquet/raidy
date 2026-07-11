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
  { topology: { type: 'powerscale', level: 'powerscale_n2_1' }, drives: 12, servers: 4 },
  { topology: { type: 'objectscale', level: 'objectscale_ec_12_4' }, drives: 16, servers: 4 },
  { topology: { type: 'nutanix', level: 'nutanix_rf2' }, drives: 12, servers: 4 },
  { topology: { type: 'powervault', level: 'powervault_raid6' }, drives: 12, servers: 1 },
  { topology: { type: 'longhorn', level: 'longhorn_r3' }, drives: 12, servers: 4 },
]

const MULTI_NODE_TYPES: TopologyType[] = [
  's2d',
  'vsan_osa',
  'vsan_esa',
  'ceph',
  'powerflex',
  'powerstore',
  'powerscale',
  'objectscale',
  'nutanix',
  'longhorn',
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

    it(`${topology.type}: supportsHotSpares=${caps.supportsHotSpares}`, () => {
      const base = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers }),
      )
      const spared = calculateVolumetry(
        createVolumetryInput(drives, topology, { serverCount: servers, hotSpares: 1 }),
      )
      if (caps.supportsHotSpares) {
        expect(spared.usableCapacity).toBeLessThan(base.usableCapacity)
      } else {
        expect(spared.usableCapacity).toBe(base.usableCapacity)
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
})

describe('shouldShowControl', () => {
  it('mirrors getCapabilities for each control', () => {
    for (const type of Object.keys(PLATFORM_CAPABILITIES) as TopologyType[]) {
      const caps = getCapabilities(type)
      expect(shouldShowControl('compression', type)).toBe(caps.supportsCompression)
      expect(shouldShowControl('dedup', type)).toBe(caps.supportsDedup)
      expect(shouldShowControl('hotSpares', type)).toBe(caps.supportsHotSpares)
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
