import { describe, expect, it } from 'vitest'
import { calculateVolumetry, type VolumetryInput } from '@/engines/volumetry'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_LONGHORN_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_POWERVAULT_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
  type LonghornOptions,
  type Topology,
} from '@/types'
import type { Drive } from '@/types/drive'

const testDrive: Drive = {
  id: 'test-1tb',
  model: 'Test Drive 1TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  capacity_raw: 1_000_000_000_000,
  sector_size: 512,
  performance: { iops_read: 150, iops_write: 150, bandwidth_read_mb: 200, bandwidth_write_mb: 200 },
  reliability: { ure_rate: 14, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
  power: { idle_watts: 5, load_watts: 10 },
  cost_usd: 100,
}

function createLonghornInput(
  driveCount: number,
  topology: Topology,
  serverCount: number,
  longhornOptions: LonghornOptions,
  compressionRatio = 1.0,
): VolumetryInput {
  return {
    drive: testDrive,
    driveCount,
    hotSpares: 0,
    serverCount,
    topology,
    zfsOptions: DEFAULT_ZFS_OPTIONS,
    s2dOptions: DEFAULT_S2D_OPTIONS,
    vsanOptions: DEFAULT_VSAN_OPTIONS,
    objectscaleOptions: DEFAULT_OBJECTSCALE_OPTIONS,
    powerstoreOptions: DEFAULT_POWERSTORE_OPTIONS,
    powerscaleOptions: DEFAULT_POWERSCALE_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    netAppOptions: DEFAULT_NETAPP_OPTIONS,
    synologyOptions: DEFAULT_SYNOLOGY_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    powervaultOptions: DEFAULT_POWERVAULT_OPTIONS,
    longhornOptions,
    compressionRatio,
    dedupRatio: 1.0,
    fsType: 'xfs', // xfs = 1% overhead (FILESYSTEM_OVERHEAD.xfs = 0.01)
  }
}

describe('Volumetry Engine - Longhorn (recognition)', () => {
  it('longhorn_r3 yields ~1/3 efficiency (parity only, guardrails neutral)', () => {
    const neutral: LonghornOptions = {
      ...DEFAULT_LONGHORN_OPTIONS,
      minimalAvailablePercent: 0, // F = 1
      snapshotHeadroom: 1, // S = 1
    }
    // 18 drives × 1 TB = 18 TB raw; R3 → 6 TB after parity; ×0.99 xfs = 5.94 TB
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, neutral)
    const result = calculateVolumetry(input)
    expect(result.rawCapacity).toBe(18_000_000_000_000)
    expect(result.usableCapacity / 1e12).toBeCloseTo(5.94, 4)
  })
})
