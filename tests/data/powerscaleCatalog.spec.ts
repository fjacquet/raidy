import { describe, expect, it } from 'vitest'
import {
  availableProtections,
  getModel,
  listDriveSizes,
  listModels,
  rawPerDriveBytes,
  resolveDriveSizeKey,
  suggestedProtection,
  usableFactor,
} from '@/data/powerscaleCatalog'

describe('powerscaleCatalog', () => {
  it('lists all 22 models', () => {
    expect(listModels()).toHaveLength(22)
  })

  it('exposes model metadata', () => {
    const m = getModel('F710')
    expect(m?.generation).toBe('Gen7')
    expect(m?.tier).toBe('All Flash')
    expect(m?.drivesPerNode).toBe(10)
    expect(m?.drr).toBe(2)
  })

  it('returns undefined for an unknown model rather than throwing', () => {
    expect(getModel('NOPE')).toBeUndefined()
  })

  it('lists drive sizes ascending', () => {
    const sizes = listDriveSizes('F710')
    expect(sizes.length).toBeGreaterThan(0)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes)
  })

  it('converts raw drive capacity to decimal bytes, honouring catalog quirks', () => {
    expect(rawPerDriveBytes('F710', 15.36)).toBe(15_360_000_000_000)
    // F710 @ 61.44 TB is sized as 61 TB by PowerSizer
    expect(rawPerDriveBytes('F710', 61.44)).toBe(61_000_000_000_000)
  })

  it('returns the per-drive usable factor', () => {
    expect(usableFactor('F710', 15.36)).toBeCloseTo(0.9916, 3)
  })

  it('gates protections by node count', () => {
    const at3 = availableProtections('F200', 1.92, 3)
    const at30 = availableProtections('F200', 1.92, 30)
    expect(at3.length).toBeGreaterThan(0)
    expect(at30.length).toBeGreaterThanOrEqual(at3.length)
    expect(at30).toContain('+2d:1n')
  })

  it('returns PowerSizer suggested protection', () => {
    expect(suggestedProtection('F200', 1.92, 3)).toBe('+2d:1n')
  })

  it('returns an empty protection list for an unknown combination', () => {
    expect(availableProtections('F200', 999, 3)).toEqual([])
  })

  it('resolves a drive size whose on-disk key is formatted differently', () => {
    // A regenerated catalog could write '2.0'; string-identity lookup would miss it.
    expect(resolveDriveSizeKey({ '2.0': {} }, 2)).toBe('2.0')
    expect(resolveDriveSizeKey({ '15.360': {} }, 15.36)).toBe('15.360')
    expect(resolveDriveSizeKey({ '2': {} }, 2)).toBe('2')
    expect(resolveDriveSizeKey({ '2': {} }, 2.5)).toBeUndefined()
    expect(resolveDriveSizeKey({}, 2)).toBeUndefined()
  })

  it('reports a genuinely absent drive size as empty, not a false match', () => {
    expect(availableProtections('A200', 2.5, 10)).toEqual([])
  })

  it('rawPerDriveBytes falls back to 0 for unknown model or drive size', () => {
    expect(rawPerDriveBytes('NOPE', 15.36)).toBe(0)
    expect(rawPerDriveBytes('F710', 999)).toBe(0)
  })

  it('usableFactor falls back to 1 for unknown model or drive size', () => {
    expect(usableFactor('NOPE', 15.36)).toBe(1)
    expect(usableFactor('F710', 999)).toBe(1)
  })
})
