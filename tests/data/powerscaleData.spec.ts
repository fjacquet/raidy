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
    // F710 starts at 3 nodes and genuinely carries mirror-fallback rows in the
    // vendor export itself (below +4n's FEC threshold of 2*nf = 8 nodes, OneFS
    // mirrors instead of striping): 3n->1/3, 4n->1/4, 5n..7n->1/5 (5-way
    // mirror, capped by nf+1=5), 8n->(8-4)/8. These are read straight off the
    // sheet, not synthesized.
    expect(efficiency.curves['F710|+4n'].from).toBe(3)
    expect(efficiency.curves['F710|+4n'].bp.slice(0, 6)).toEqual([
      3333, 2500, 2000, 2000, 2000, 5000,
    ])
  })

  it('does not synthesize values below the vendor-observed minimum', () => {
    // A200 is a chassis-based model (4-node minimum, 2-node increment). Its
    // vendor export has no +4n row below 10 nodes at all -- the curve's `from`
    // must be the vendor's own first row, never backfilled down to the
    // model's minNodes (4) via a closed-form guess. §3.2 of the design spec
    // makes the closed form test-only for exactly this reason: it cannot
    // reproduce PowerSizer above the neighborhood split, so it must never be
    // a production data source.
    expect(efficiency.curves['A200|+4n'].from).toBe(10)
    expect(nodes.models.A200.minNodes).toBe(4)
  })

  it('records the drive-size-dependent exceptions', () => {
    // The plan's original example key conflated H710's drive COUNT (15) with
    // a drive SIZE; H710 (Hybrid tier) only ships 2/4/8/12/16/20/24 TB drives.
    expect(efficiency.exceptions['H710|2|+3n|22']).toBe(7250)
    // 230 distinct (model, protection, nodes) keys have drive-size-dependent
    // efficiency; each expands into one entry per drive size at that key.
    expect(Object.keys(efficiency.exceptions)).toHaveLength(1045)
  })

  it('carries the real per-model node-count bounds, not a uniform floor', () => {
    // Chassis-based models (A/H-series) ship in pairs and need a 4-node
    // minimum; single-node F-series models can start at 3.
    expect(nodes.models.A200.minNodes).toBe(4)
    expect(nodes.models.A200.nodeIncrement).toBe(2)
    expect(nodes.models.F200.minNodes).toBe(3)
    expect(nodes.models.F200.nodeIncrement).toBe(1)
    expect(nodes.models.H710.minNodes).toBe(4)
    expect(nodes.models.H710.nodeIncrement).toBe(2)
  })

  it('carries end-of-life dates for the models the EOL sheet covers', () => {
    // 'Isilon A200' in the Hardware EOL sheet maps to catalog id 'A200'
    expect(nodes.models.A200.endOfLife).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('writes canonical numeric drive-size keys', () => {
    // src/data/powerscaleCatalog.ts matches drive sizes numerically as a defensive
    // measure against non-canonical keys (e.g. a future regeneration writing '2.0').
    // This pins down that the current catalog never actually needs that fallback.
    for (const [modelId, model] of Object.entries(nodes.models)) {
      for (const key of Object.keys(model.driveSizes)) {
        expect(`${Number(key)}`, `${modelId} drive-size key`).toBe(key)
      }
    }
  })
})
