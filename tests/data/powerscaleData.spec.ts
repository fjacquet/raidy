import { describe, expect, it } from 'vitest'
import efficiency from '@/data/powerscaleEfficiency.json'
import nodes from '@/data/powerscaleNodes.json'

describe('PowerScale generated data', () => {
  it('covers all 22 node models', () => {
    expect(Object.keys(nodes.models)).toHaveLength(22)
    expect(nodes.models).toHaveProperty('F710')
    expect(nodes.models).toHaveProperty('A2000')
  })

  it('records the vendor row count it was derived from', () => {
    expect(nodes.rowCount).toBe(122828)
  })

  it('carries per-model DRR from the workbook', () => {
    expect(nodes.models.A200.drr).toBe(1)
    expect(nodes.models.H710.drr).toBe(1.6)
    expect(nodes.models.F710.drr).toBe(2)
  })

  it('applies the two raw-capacity catalog quirks', () => {
    expect(nodes.models.F210.driveSizes['15.36'].rawPerDriveTb).toBe(15)
    expect(nodes.models.F710.driveSizes['61.44'].rawPerDriveTb).toBe(61)
  })

  it('has an efficiency curve per (model, protection) pair present in the source', () => {
    // A200's floor is 4 nodes (its own Minimum Node Count, chassis-quantized).
    // +4n's FEC threshold is 2*nf = 8 nodes, so both ends of the curve are the
    // mirror-fallback branch: 4 nodes = 1/4, 5 nodes = 1/5 (5-way mirror).
    expect(efficiency.curves['A200|+4n'].from).toBe(4)
    expect(efficiency.curves['A200|+4n'].bp[0]).toBe(2500)
    expect(efficiency.curves['A200|+4n'].bp[1]).toBe(2000)
    expect(efficiency.curves['A200|+2d:1n'].from).toBe(4)
  })

  it('records the drive-size-dependent exceptions', () => {
    expect(efficiency.exceptions['H710|2|+3n|22']).toBe(7250)
  })

  it('carries end-of-life dates for the models the EOL sheet covers', () => {
    // 'Isilon A200' in the Hardware EOL sheet maps to catalog id 'A200'
    expect(nodes.models.A200.endOfLife).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
