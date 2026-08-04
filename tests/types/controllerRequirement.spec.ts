/**
 * The controller/HBA rule is level-aware for BeeGFS, and ONLY for BeeGFS.
 *
 * BeeGFS does not protect data itself: every storage target is a local volume it sees as one
 * block device. So the controller class follows the LOCAL level — RAID6/RAID10 targets sit
 * behind a hardware RAID controller, RAIDz2 needs an IT-mode HBA because ZFS addresses disks
 * directly, and one-drive-per-target works behind either.
 *
 * `requiresHba` / `getControllerOptions` are shared by every platform, so the second half of
 * this file is the regression net for the shared signature change: every other topology's
 * answer must be byte-identical to the pre-change behaviour, with or without a level argument.
 */

import { describe, expect, it } from 'vitest'
import type { ControllerType, TopologyType } from '@/types/topology'
import {
  CONTROLLER_LIMITS,
  getControllerOptions,
  getControllerRequirement,
  HBA_REQUIRED_TOPOLOGIES,
  requiresHba,
} from '@/types/topology'

const ALL_CONTROLLERS = Object.keys(CONTROLLER_LIMITS) as ControllerType[]
const ALL_HBAS = ALL_CONTROLLERS.filter((c) => CONTROLLER_LIMITS[c].isHba)
const ALL_RAID = ALL_CONTROLLERS.filter((c) => !CONTROLLER_LIMITS[c].isHba)

/**
 * Independent re-implementation of the pre-change rule, kept deliberately naive: filter
 * CONTROLLER_LIMITS by `isHba === HBA_REQUIRED_TOPOLOGIES.includes(type)`. Any platform whose
 * list moves is caught by comparing against this rather than against a hand-copied snapshot.
 */
function legacyControllerOptions(type: TopologyType): ControllerType[] {
  const applianceOnly: Partial<Record<TopologyType, ControllerType[]>> = {
    powervault: ['powervault_me5_single', 'powervault_me5_dual'],
    powerstore: ['powerstore_t'],
    powerscale: ['powerscale_node'],
    objectscale: ['objectscale_node'],
  }
  const appliance = applianceOnly[type]
  if (appliance) return appliance
  const needsHba = HBA_REQUIRED_TOPOLOGIES.includes(type)
  return ALL_CONTROLLERS.filter((c) => CONTROLLER_LIMITS[c].isHba === needsHba)
}

describe('getControllerRequirement — BeeGFS is level-aware', () => {
  it('puts a hardware-RAID storage target behind a RAID controller', () => {
    expect(getControllerRequirement('beegfs', 'beegfs_raid6')).toBe('raid')
    expect(getControllerRequirement('beegfs', 'beegfs_raid10')).toBe('raid')
    expect(requiresHba('beegfs', 'beegfs_raid6')).toBe(false)
    expect(requiresHba('beegfs', 'beegfs_raid10')).toBe(false)
  })

  it('requires an IT-mode HBA for a ZFS RAIDz2 target', () => {
    expect(getControllerRequirement('beegfs', 'beegfs_raidz2')).toBe('hba')
    expect(requiresHba('beegfs', 'beegfs_raidz2')).toBe(true)
  })

  it('accepts either for one drive per target', () => {
    expect(getControllerRequirement('beegfs', 'beegfs_single')).toBe('either')
    expect(requiresHba('beegfs', 'beegfs_single')).toBe(false)
  })

  it('falls back to the default level (beegfs_raid6) when no level is supplied', () => {
    expect(getControllerRequirement('beegfs')).toBe('raid')
    expect(getControllerRequirement('beegfs', 'not-a-level')).toBe('raid')
  })

  it('no longer classifies BeeGFS as pure software-defined storage', () => {
    expect(HBA_REQUIRED_TOPOLOGIES).not.toContain('beegfs')
  })
})

describe('getControllerOptions — BeeGFS lists per level', () => {
  it('offers exactly the RAID controllers for beegfs_raid6 and beegfs_raid10', () => {
    expect(getControllerOptions('beegfs', 'beegfs_raid6')).toEqual(ALL_RAID)
    expect(getControllerOptions('beegfs', 'beegfs_raid10')).toEqual(ALL_RAID)
    // The point of the fix: the HBA ceiling is no longer reachable for a hardware-RAID target.
    expect(getControllerOptions('beegfs', 'beegfs_raid6')).not.toContain('hba_nvme')
  })

  it('offers exactly the HBAs for beegfs_raidz2', () => {
    expect(getControllerOptions('beegfs', 'beegfs_raidz2')).toEqual(ALL_HBAS)
  })

  it('offers the union for beegfs_single without duplicates or gaps', () => {
    const union = getControllerOptions('beegfs', 'beegfs_single')
    expect(union).toEqual(ALL_CONTROLLERS)
    expect(new Set(union).size).toBe(union.length)
  })

  it('never returns an empty list for any BeeGFS level', () => {
    for (const level of ['beegfs_raid6', 'beegfs_raid10', 'beegfs_raidz2', 'beegfs_single']) {
      expect(getControllerOptions('beegfs', level).length).toBeGreaterThan(0)
    }
  })

  it('models a beegfs_raid6 node well below the HBA ceiling', () => {
    // The defect this fixes: a PERC H755 is 750k IOPS / 12 GB/s, the cheapest HBA in the list
    // is 2M IOPS / 19.2 GB/s, so HBA-only classification modelled ~2.7x the real IOPS ceiling.
    const raidCeilings = getControllerOptions('beegfs', 'beegfs_raid6').map(
      (c) => CONTROLLER_LIMITS[c],
    )
    expect(CONTROLLER_LIMITS.perc_h755.iops).toBe(750_000)
    expect(CONTROLLER_LIMITS.hba_nvme.iops).toBe(10_000_000)
    expect(raidCeilings.every((spec) => !spec.isHba)).toBe(true)
  })
})

describe('HBA_REQUIRED_TOPOLOGIES table contents are pinned', () => {
  /**
   * Deliberately hand-copied, NOT imported or derived from `HBA_REQUIRED_TOPOLOGIES` or any
   * other table in src/. The whole point of this assertion is to catch drift in the table's
   * *contents* — deleting or adding an entry to `HBA_REQUIRED_TOPOLOGIES` — which a test that
   * re-derives the same table (see `legacyControllerOptions` above) cannot detect, because it
   * shares the defect with the thing it's checking.
   *
   * Updating this literal must be a conscious, reviewed decision made when the table genuinely
   * changes (a platform is added to or removed from HBA-required storage) — do NOT
   * "helpfully" refactor it into `[...HBA_REQUIRED_TOPOLOGIES]` or any other derivation; that
   * silently defeats the guard.
   */
  const EXPECTED_HBA_REQUIRED_TOPOLOGIES: TopologyType[] = [
    'zfs',
    's2d',
    'vsan_osa',
    'vsan_esa',
    'ceph',
    'powerflex',
    'nutanix',
    'longhorn',
  ]

  it('matches the hand-copied expected membership exactly, in any order', () => {
    expect([...HBA_REQUIRED_TOPOLOGIES].sort()).toEqual(
      [...EXPECTED_HBA_REQUIRED_TOPOLOGIES].sort(),
    )
  })
})

describe('every other platform is unchanged by the shared signature change', () => {
  const REGRESSION_NET: TopologyType[] = ['ceph', 'zfs', 'standard', 'vsan_esa']

  it.each(REGRESSION_NET)('%s keeps its exact pre-change controller list', (type) => {
    expect(getControllerOptions(type)).toEqual(legacyControllerOptions(type))
  })

  it.each(REGRESSION_NET)('%s ignores a level argument entirely', (type) => {
    const withoutLevel = getControllerOptions(type)
    expect(getControllerOptions(type, 'beegfs_raid6')).toEqual(withoutLevel)
    expect(getControllerOptions(type, 'beegfs_raidz2')).toEqual(withoutLevel)
    expect(getControllerOptions(type, 'RAID6')).toEqual(withoutLevel)
    expect(requiresHba(type, 'beegfs_raid6')).toBe(requiresHba(type))
  })

  it('holds for every topology type in the union, not just the four named ones', () => {
    // Every member of the TopologyType union except 'beegfs'.
    const allTypes: TopologyType[] = [
      'standard',
      'zfs',
      's2d',
      'proprietary',
      'vsan_osa',
      'vsan_esa',
      'ceph',
      'powerflex',
      'powerstore',
      'powerscale',
      'objectscale',
      'nutanix',
      'powervault',
      'longhorn',
    ]
    for (const type of allTypes) {
      expect(getControllerOptions(type), type).toEqual(legacyControllerOptions(type))
      expect(requiresHba(type), type).toBe(HBA_REQUIRED_TOPOLOGIES.includes(type))
      // Only BeeGFS may ever answer 'either'.
      expect(getControllerRequirement(type), type).not.toBe('either')
    }
  })

  it('leaves appliance controller lists untouched', () => {
    expect(getControllerOptions('powervault')).toEqual([
      'powervault_me5_single',
      'powervault_me5_dual',
    ])
    expect(getControllerOptions('powerstore', 'anything')).toEqual(['powerstore_t'])
  })
})
