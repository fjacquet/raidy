import { describe, expect, it } from 'vitest'
import { getModel } from '@/data/powerscaleCatalog'
import efficiencyData from '@/data/powerscaleEfficiency.json'
import { storageEfficiency } from '@/engines/volumetry/powerscale/efficiency'
import {
  DRIVE_LEVEL_PROTECTIONS,
  onefsClosedForm,
} from '@/engines/volumetry/powerscale/onefsFormula'
import type { PowerScaleProtection } from '@/types/topology'

interface Curve {
  from: number
  bp: number[]
}
interface EfficiencyTable {
  curves: Record<string, Curve>
  exceptions: Record<string, number>
}
const table = efficiencyData as unknown as EfficiencyTable

describe('storageEfficiency', () => {
  it('reads the vendor table', () => {
    expect(storageEfficiency('A200', 8, '+2n', 20)).toBeCloseTo(0.8, 4)
    expect(storageEfficiency('F200', 1.92, '+2n', 20)).toBeCloseTo(0.8889, 4)
  })

  it('applies mirror fallback values below the FEC threshold', () => {
    // +4n on 5 nodes is 5-way mirroring, not (5-4)/5. Verified vendor rows for
    // F710 +4n: N=3 -> 0.3333, N=4 -> 0.25, N=5..7 -> 0.20, N=8 -> 0.50.
    // Use an F-series model: it starts at 3 nodes, so the vendor actually
    // publishes the mirror-fallback region. A200 starts at 4 nodes and has no
    // +4n rows below 8 at all.
    expect(storageEfficiency('F710', 15.36, '+4n', 5)).toBeCloseTo(0.2, 4)
    expect(storageEfficiency('F710', 15.36, '+4n', 3)).toBeCloseTo(0.3333, 4)
  })

  it('honours drive-size-dependent exceptions', () => {
    // H710 drive sizes are 2/4/8/12/16/20/24 TB - it has no 15.36 TB option.
    expect(storageEfficiency('H710', 2, '+3n', 22)).toBeCloseTo(0.725, 4)
  })

  it('returns undefined for a combination the vendor table does not cover', () => {
    // A200 offers no +1n at any node count, and its minimum is 4 nodes.
    expect(storageEfficiency('A200', 8, '+1n', 3)).toBeUndefined()
    // Below the vendor's first row for the pair: not sizeable, never guessed.
    // A200 publishes no +4n below 8 nodes (spec §10).
    expect(storageEfficiency('A200', 8, '+4n', 5)).toBeUndefined()
    expect(storageEfficiency('NOPE', 8, '+2n', 10)).toBeUndefined()
  })
})

describe('onefsClosedForm (reference implementation)', () => {
  const modelId = 'A200'
  const { nodeIncrement } = getModel(modelId) ?? { nodeIncrement: 1 }

  // The shipped curves carry their last published value forward across node
  // counts the vendor doesn't actually offer -- PowerSizer only steps a
  // model's node count by its `nodeIncrement`. Comparing at every integer
  // node count would fail on those carried-forward entries: A200|+2n starts
  // at 6 nodes and steps by 2, so the table reports 0.6667 at n=7 (carried
  // from n=6) while the closed form correctly computes 0.7143 for 7 nodes.
  // Restricting the comparison to node counts the vendor actually published
  // keeps this a faithful cross-check of the closed form against real data,
  // not an artifact of the table's carry-forward storage encoding. Do not
  // "fix" this by loosening the tolerance or widening the comparison again.
  //
  // Separately, a small number of (model, drive size, protection, node count)
  // combinations are documented drive-size exceptions -- e.g. A200 at 8 TB
  // drives and 38 nodes with '+3d:1n' reports 0.8421, not the curve's 0.8333
  // -- because OneFS occasionally widens a protection group beyond the
  // simple width cap to balance neighborhoods for a specific drive count.
  // Those are real, deliberate departures from the general stripe model this
  // closed form describes, so they're excluded from the cross-check the same
  // way: by construction, not by loosening the comparison.
  const driveSizeTb = 8
  function isPublished(protection: PowerScaleProtection, nodeCount: number): boolean {
    const curve = table.curves[`${modelId}|${protection}`]
    if (!curve) return false
    if ((nodeCount - curve.from) % nodeIncrement !== 0) return false
    const exceptionKey = `${modelId}|${driveSizeTb}|${protection}|${nodeCount}`
    return table.exceptions[exceptionKey] === undefined
  }

  it('matches the table for every drive-level protection', () => {
    for (const p of DRIVE_LEVEL_PROTECTIONS) {
      for (let n = 3; n <= 60; n++) {
        if (!isPublished(p, n)) continue
        const tableValue = storageEfficiency(modelId, driveSizeTb, p, n)
        if (tableValue === undefined) continue
        expect(onefsClosedForm(p, n)).toBeCloseTo(tableValue, 3)
      }
    }
  })

  it('matches the table for node-level protection below the neighborhood split', () => {
    for (let n = 3; n < 20; n++) {
      if (!isPublished('+2n', n)) continue
      const tableValue = storageEfficiency(modelId, driveSizeTb, '+2n', n)
      if (tableValue === undefined) continue
      expect(onefsClosedForm('+2n', n)).toBeCloseTo(tableValue, 3)
    }
  })

  it('reproduces the documented stripe caps', () => {
    expect(onefsClosedForm('+2d:1n', 40)).toBeCloseTo(16 / 18, 4)
    expect(onefsClosedForm('+3d:1n', 40)).toBeCloseTo(15 / 18, 4)
    expect(onefsClosedForm('+4d:1n', 40)).toBeCloseTo(16 / 20, 4)
  })
})
