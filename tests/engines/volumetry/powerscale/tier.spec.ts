import { describe, expect, it } from 'vitest'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTier } from '@/types/topology'

const base: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 3,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}

describe('sizeTier', () => {
  it('reproduces a PowerSizer row exactly', () => {
    // Vendor row: F200, 1.92 TB, 3 nodes, +2d:1n -> raw 23.04 TB, usable 15.16 TB
    const r = sizeTier(base)
    expect(r).not.toBeNull()
    expect(r?.rawCapacity).toBeCloseTo(23.04e12, -8)
    expect(r?.usableCapacity ?? 0).toBeGreaterThan(15.1e12)
    expect(r?.usableCapacity ?? 0).toBeLessThan(15.25e12)
  })

  it('applies the per-model data reduction ratio', () => {
    const r = sizeTier(base)
    expect(r?.drr).toBe(2)
    expect(r?.effectiveCapacity).toBeCloseTo((r?.usableLessVhs ?? 0) * 2, -6)
  })

  it('uses a DRR of 1.0 for models without inline reduction', () => {
    const r = sizeTier({
      ...base,
      nodeModel: 'A200',
      driveSizeTb: 8,
      nodeCount: 10,
      protection: '+2n',
    })
    expect(r?.drr).toBe(1)
    expect(r?.effectiveCapacity).toBeCloseTo(r?.usableLessVhs ?? 0, -6)
  })

  it('reserves virtual hot spare drives at the vendor 2.2 multiplier', () => {
    // Workbook: VHS by drives = vhsDriveCount x driveSizeTb x 2.2, on the
    // NOMINAL drive size - not scaled by efficiency or usableFactor.
    const r = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 2, vhsPercent: 0 })
    expect(r?.vhsReserve).toBeCloseTo(2 * 1.92 * 2.2 * 1e12, -6)
    expect(r?.vhsSource).toBe('driveCount')
  })

  it('applies the larger of the two virtual hot spare reserves', () => {
    const byDrives = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 2, vhsPercent: 1 })
    expect(byDrives?.vhsSource).toBe('driveCount')

    const byPercent = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 1, vhsPercent: 25 })
    expect(byPercent?.vhsSource).toBe('percent')
    expect(byPercent?.usableLessVhs ?? 0).toBeCloseTo((byPercent?.usableCapacity ?? 0) * 0.75, -6)
  })

  it('never lets the reserve drive usable capacity negative', () => {
    const r = sizeTier({ ...base, nodeCount: 3, vhsDriveCount: 999 })
    expect(r?.usableLessVhs).toBe(0)
    expect(r?.effectiveCapacity).toBe(0)
  })

  it('returns null for a combination the vendor catalog does not cover', () => {
    expect(sizeTier({ ...base, protection: '+1n', nodeModel: 'A200' })).toBeNull()
    expect(sizeTier({ ...base, nodeModel: 'NOPE' })).toBeNull()
  })
})
