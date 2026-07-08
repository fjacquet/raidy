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

describe('Volumetry Engine - Longhorn (capacity guardrails)', () => {
  // 18 TB raw, R3, F=0.75 (minAvail 25), S=1.2, G=1.2, xfs 1%
  //   afterParity = 6.0 ; afterFs = 5.94 ; ×0.75 = 4.455 ; ÷1.2 = 3.7125 usable
  //   committed = 3.7125 / 1.2 = 3.09375 ; perNode = 3.7125 / 3 = 1.2375
  const opts = {
    diskMode: 'root' as const,
    minimalAvailablePercent: 25,
    snapshotHeadroom: 1.2,
    growthHeadroom: 1.2,
    overProvisioningPercent: 100,
  }

  it('applies free-space + snapshot reserves to physical usable', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts)
    const result = calculateVolumetry(input)
    expect(result.usableCapacity / 1e12).toBeCloseTo(3.7125, 4)
    expect(result.longhornDetails?.physicalUsable ?? 0).toBeCloseTo(3.7125e12, -8)
  })

  it('reports recommended committed data (÷ growth) and per-node allocation', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts)
    const d = calculateVolumetry(input).longhornDetails
    expect((d?.recommendedCommittedData ?? 0) / 1e12).toBeCloseTo(3.09375, 4)
    expect((d?.perNodeUsable ?? 0) / 1e12).toBeCloseTo(1.2375, 4)
    expect(d?.replicaCount).toBe(3)
    expect(d?.overProvisioningPercent).toBe(100)
  })

  it('R2 usable is exactly 1.5× R3 usable (same inputs)', () => {
    const r2 = calculateVolumetry(
      createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r2' }, 3, opts),
    ).usableCapacity
    const r3 = calculateVolumetry(
      createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts),
    ).usableCapacity
    expect(r2 / r3).toBeCloseTo(1.5, 5)
  })

  it('longhorn_r2 usable capacity matches the hand-computed guardrail formula', () => {
    // 18 TB raw × 1/2 (R2 parity) × 0.99 (xfs) × 0.75 (F, minAvail 25%) × 1/1.2 (S) = 5.56875 TB
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r2' }, 3, opts)
    const result = calculateVolumetry(input)
    expect(result.usableCapacity / 1e12).toBeCloseTo(5.56875, 4)
  })

  it('applies no compression/dedup (effective === usable)', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, opts, 2.0)
    const result = calculateVolumetry(input)
    expect(result.effectiveCapacity).toBe(result.usableCapacity)
  })

  it('returns zero-state when serverCount < replica count', () => {
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 2, opts)
    const result = calculateVolumetry(input)
    expect(result.usableCapacity).toBe(0)
    expect(result.rawCapacity).toBe(18_000_000_000_000)
  })
})

describe('Volumetry Engine - Longhorn (guardrail input clamping)', () => {
  // longhornOptions rides ConfigStateSchema.passthrough() (unvalidated), so a crafted URL
  // could smuggle in out-of-range values. The engine must clamp rather than propagate
  // Infinity/NaN or negative capacity.

  it('clamps minimalAvailablePercent > 100 to a non-negative usable capacity', () => {
    const extreme: LonghornOptions = {
      ...DEFAULT_LONGHORN_OPTIONS,
      minimalAvailablePercent: 150,
      snapshotHeadroom: 1,
    }
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, extreme)
    const result = calculateVolumetry(input)
    expect(Number.isFinite(result.usableCapacity)).toBe(true)
    expect(result.usableCapacity).toBeGreaterThanOrEqual(0)
  })

  it('clamps snapshotHeadroom of 0 to avoid division by zero (finite usable capacity)', () => {
    const extreme: LonghornOptions = {
      ...DEFAULT_LONGHORN_OPTIONS,
      minimalAvailablePercent: 0,
      snapshotHeadroom: 0,
    }
    const input = createLonghornInput(18, { type: 'longhorn', level: 'longhorn_r3' }, 3, extreme)
    const result = calculateVolumetry(input)
    expect(Number.isFinite(result.usableCapacity)).toBe(true)
    expect(result.usableCapacity).toBeGreaterThan(0)
  })
})
