import { describe, expect, it } from 'vitest'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTier } from '@/types/topology'

const flash: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 6,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}
const archive: PowerScaleTier = {
  nodeModel: 'A200',
  driveSizeTb: 8,
  nodeCount: 12,
  protection: '+2n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}

describe('calculatePowerScaleVolumetry', () => {
  it('sizes a single-tier cluster as that tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash] })
    const t = sizeTier(flash)
    expect(r.rawCapacity).toBe(t?.rawCapacity)
    expect(r.usableCapacity).toBe(t?.usableLessVhs)
  })

  it('sums a heterogeneous cluster tier by tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    const a = sizeTier(flash)
    const b = sizeTier(archive)
    expect(r.rawCapacity).toBeCloseTo((a?.rawCapacity ?? 0) + (b?.rawCapacity ?? 0), -6)
    expect(r.usableCapacity).toBeCloseTo((a?.usableLessVhs ?? 0) + (b?.usableLessVhs ?? 0), -6)
    expect(r.effectiveCapacity).toBeCloseTo(
      (a?.effectiveCapacity ?? 0) + (b?.effectiveCapacity ?? 0),
      -6,
    )
  })

  it('reports cluster efficiency as total usable over total raw, not an average', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    expect(r.efficiency).toBeCloseTo((r.usableCapacity / r.rawCapacity) * 100, 6)
  })

  it('exposes one details row per tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    expect(r.powerScaleDetails?.tiers).toHaveLength(2)
    expect(r.powerScaleDetails?.tiers[1]?.nodeModel).toBe('A200')
  })

  it('drops a tier the catalog cannot size and keeps the rest', () => {
    const r = calculatePowerScaleVolumetry({
      tiers: [flash, { ...archive, nodeModel: 'NOPE' }],
    })
    expect(r.powerScaleDetails?.tiers).toHaveLength(1)
    expect(r.rawCapacity).toBe(sizeTier(flash)?.rawCapacity)
  })

  it('returns a zero state when no tier can be sized', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [{ ...flash, nodeModel: 'NOPE' }] })
    expect(r.rawCapacity).toBe(0)
    expect(r.usableCapacity).toBe(0)
    expect(r.efficiency).toBe(0)
    expect(r.breakdown).toEqual([])
  })

  // The brief's original assertion (`b.category === 'parity'`) does not compile: BreakdownEntry
  // is `{ label, bytes, percent, color }` with no `category` field (see buildBreakdown.ts and
  // src/types/results.ts). Every other platform's breakdown segments are label-only, so this
  // follows that convention: each tier gets a distinct label naming the pool, and the test
  // matches on the shared "Parity/Redundancy" prefix to confirm one segment per tier.
  it('builds one parity breakdown segment per tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    const parity = r.breakdown.filter((b) => b.label.startsWith('Parity/Redundancy'))
    expect(parity).toHaveLength(2)
    expect(parity[0]?.label).toContain('F200')
    expect(parity[1]?.label).toContain('A200')
  })
})
