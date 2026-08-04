/**
 * Controller-compatibility validation is level-aware for BeeGFS.
 *
 * The store snaps the controller on `setTopology`, so a mismatched pair is normally
 * unreachable — but a hand-crafted or pre-existing shared URL can still load one, and a
 * hardware-RAID BeeGFS target modelled behind an HBA inherits the HBA's much higher ceiling.
 * These tests pin both directions and confirm no other platform's alerts moved.
 */

import { describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import type { Drive } from '@/types/drive'
import type { ControllerType, Topology } from '@/types/topology'
import { type ValidationInput, validateConfiguration } from '@/utils/validators'

const drives = drivesData as Record<string, Drive>
const testHdd = drives['ent-hdd-7k2-sata-18tb-cmr'] as Drive

function input(topology: Topology, controller: ControllerType): ValidationInput {
  return {
    drive: testHdd,
    driveCount: 12,
    topology,
    serverCount: 4,
    controller,
    ramPerNodeGb: 64,
  }
}

const codes = (topology: Topology, controller: ControllerType) =>
  validateConfiguration(input(topology, controller)).map((a) => a.code)

describe('BeeGFS controller compatibility', () => {
  it('rejects an HBA on beegfs_raid6 — a hardware RAID target belongs behind a RAID controller', () => {
    const alerts = validateConfiguration(
      input({ type: 'beegfs', level: 'beegfs_raid6' }, 'hba_nvme'),
    )
    const alert = alerts.find((a) => a.code === 'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('error')
    expect(alert?.message).toContain('beegfs_raid6')
  })

  it('rejects an HBA on beegfs_raid10', () => {
    expect(codes({ type: 'beegfs', level: 'beegfs_raid10' }, 'lsi_9500')).toContain(
      'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER',
    )
  })

  it('accepts a RAID controller on beegfs_raid6 and beegfs_raid10', () => {
    expect(codes({ type: 'beegfs', level: 'beegfs_raid6' }, 'perc_h755')).not.toContain(
      'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER',
    )
    expect(codes({ type: 'beegfs', level: 'beegfs_raid6' }, 'perc_h755')).not.toContain(
      'RAID_CONTROLLER_INCOMPATIBLE',
    )
    expect(codes({ type: 'beegfs', level: 'beegfs_raid10' }, 'perc_h965i')).not.toContain(
      'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER',
    )
  })

  it('rejects a RAID controller on beegfs_raidz2 — ZFS needs direct disk access', () => {
    const alerts = validateConfiguration(
      input({ type: 'beegfs', level: 'beegfs_raidz2' }, 'perc_h755'),
    )
    const alert = alerts.find((a) => a.code === 'RAID_CONTROLLER_INCOMPATIBLE')
    expect(alert).toBeDefined()
    expect(alert?.severity).toBe('error')
  })

  it('accepts an HBA on beegfs_raidz2', () => {
    expect(codes({ type: 'beegfs', level: 'beegfs_raidz2' }, 'lsi_9500')).not.toContain(
      'RAID_CONTROLLER_INCOMPATIBLE',
    )
  })

  it('accepts either controller class on beegfs_single', () => {
    for (const controller of ['hba_nvme', 'perc_h755'] as ControllerType[]) {
      const found = codes({ type: 'beegfs', level: 'beegfs_single' }, controller)
      expect(found).not.toContain('RAID_CONTROLLER_INCOMPATIBLE')
      expect(found).not.toContain('BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER')
    }
  })

  it('never fires the BeeGFS-specific alert for another platform', () => {
    const others: Topology[] = [
      { type: 'standard', level: 'RAID6' },
      { type: 'zfs', level: 'raidz2' },
      { type: 'ceph', level: 'ceph_replicated_3' },
      { type: 'vsan_esa', level: 'vsan_esa_raid5' },
    ]
    for (const topology of others) {
      for (const controller of ['hba_nvme', 'perc_h755'] as ControllerType[]) {
        expect(codes(topology, controller), `${topology.type}/${controller}`).not.toContain(
          'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER',
        )
      }
    }
  })

  it('leaves the pre-existing HBA/RAID verdicts for other platforms unchanged', () => {
    // ZFS + hardware RAID still errors; standard RAID + HBA is still only informational.
    expect(codes({ type: 'zfs', level: 'raidz1' }, 'perc_h755')).toContain(
      'RAID_CONTROLLER_INCOMPATIBLE',
    )
    expect(codes({ type: 'standard', level: 'RAID5' }, 'lsi_9500')).toContain(
      'HBA_WITH_STANDARD_RAID',
    )
    expect(codes({ type: 'standard', level: 'RAID5' }, 'perc_h755')).not.toContain(
      'HBA_WITH_STANDARD_RAID',
    )
  })
})
