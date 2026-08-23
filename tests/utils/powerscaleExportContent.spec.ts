/**
 * The dedicated PowerScale export path.
 *
 * Assertions are on the finished, localized cell strings against a REAL engine result, not on
 * shapes: the defect this replaces was a number that looked plausible in a table, and only a
 * literal expected value catches that.
 */
import { rmSync } from 'node:fs'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import common from '@/i18n/locales/en/common.json'
import en from '@/i18n/locales/en/output.json'
import fr from '@/i18n/locales/fr/output.json'
import type { CalculationResults } from '@/types/results'
import type { PowerScaleTier, Topology } from '@/types/topology'
import { exportToPdf } from '@/utils/exportPdf'
import { exportToPptx } from '@/utils/exportPptx'
import { buildPowerScaleExportContent } from '@/utils/powerscaleExportContent'

const TOPOLOGY: Topology = { type: 'powerscale', level: 'powerscale_onefs' }

/**
 * A literal-key lookup over the real locale bundles, with the same `{{name}}` interpolation
 * i18next performs — so the test reads the shipped strings rather than a parallel set of fixtures
 * that could drift from them.
 */
function translator(bundle: Record<string, unknown>) {
  return (key: string, options?: Record<string, string | number>) => {
    if (key === 'common:powerScale.estimateNote') return common.powerScale.estimateNote
    let node: unknown = bundle
    for (const part of key.replace('output:', '').split('.')) {
      node = (node as Record<string, unknown>)[part]
    }
    let text = String(node)
    for (const [name, value] of Object.entries(options ?? {})) {
      text = text.replace(`{{${name}}}`, String(value))
    }
    return text
  }
}

const t = translator(en)

/** VHS from the drive-count formula (2 spares × 1.92 TB × 2.2), DRR 2.0 from the catalog. */
const flash: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 6,
  protection: '+2d:1n',
  vhsDriveCount: 2,
  vhsPercent: 0,
}

/** VHS from the percentage formula (5% of usable), DRR 1.0 from the catalog. */
const archive: PowerScaleTier = {
  nodeModel: 'A200',
  driveSizeTb: 8,
  nodeCount: 12,
  protection: '+2n',
  vhsDriveCount: 0,
  vhsPercent: 5,
}

function build(tiers: PowerScaleTier[], language: 'en' | 'fr' = 'en') {
  const volumetry = calculatePowerScaleVolumetry({ tiers })
  return buildPowerScaleExportContent(volumetry.powerScaleDetails, {
    t: translator(language === 'fr' ? fr : en),
    language,
    unitSystem: 'decimal',
    topology: TOPOLOGY,
  })
}

describe('buildPowerScaleExportContent — pool table', () => {
  it('renders one row per sizeable pool, with the vendor’s own numbers', () => {
    const content = build([flash, archive])

    expect(content.poolTable.rows).toEqual([
      [
        '1',
        'F200 · Gen6.5 All Flash',
        '1.92',
        '6',
        '24',
        '+2d:1n',
        '46.1 TB',
        '29.5 TB',
        '2',
        '58.9 TB',
      ],
      ['2', 'A200 · Gen6 Archive', '8', '12', '180', '+2n', '1.4 PB', '1.1 PB', '1', '1.1 PB'],
    ])
  })

  it('totals only what sums across heterogeneous pools', () => {
    const content = build([flash, archive])

    // Drive size, protection and DRR are per-pool quantities: a cluster figure for any of them
    // would be an invented number, so they carry an em dash rather than an average.
    expect(content.poolTable.totalRow).toEqual([
      '',
      'Cluster total',
      '—',
      '18',
      '204',
      '—',
      '1.5 PB',
      '1.2 PB',
      '—',
      '1.2 PB',
    ])
  })

  it('drops a pool the vendor catalog cannot size rather than inventing a row', () => {
    const content = build([flash, { ...archive, nodeModel: 'NOPE' }])
    expect(content.poolTable.rows).toHaveLength(1)
    expect(content.clusterSummary).toBe('Node pools 1 · Nodes 6 · Drives 24')
  })
})

describe('buildPowerScaleExportContent — derivation table', () => {
  it('shows the vendor protection efficiency and the usable efficiency as separate columns', () => {
    const content = build([flash, archive])

    // F200 +2d:1n at 6 nodes: the vendor publishes 83.3% protection efficiency, but after the
    // filesystem factor and an 18.3%-of-raw VHS reserve the pool delivers 63.9%. Both are true;
    // they are different quantities, and the two column labels say which is which.
    expect(content.derivationTable.columns[2]).toBe('Protection efficiency (vendor)')
    expect(content.derivationTable.columns[8]).toBe('Usable efficiency (after VHS)')
    expect(content.derivationTable.rows[0]).toEqual([
      '1',
      'F200',
      '83.3%',
      '37.9 TB',
      '8.4 TB',
      '18.3%',
      'Drive count',
      '29.5 TB',
      '63.9%',
    ])
    expect(content.derivationTable.rows[1]).toEqual([
      '2',
      'A200',
      '83.3%',
      '1.2 PB',
      '59.4 TB',
      '4.1%',
      'Percentage',
      '1.1 PB',
      '78.4%',
    ])
  })

  it('names which of the two vendor VHS formulas won, per pool', () => {
    const content = build([flash, archive])
    expect(content.derivationTable.rows[0]?.[6]).toBe('Drive count')
    expect(content.derivationTable.rows[1]?.[6]).toBe('Percentage')
  })

  it('sums usable-before-VHS and the reserve, and dashes the vendor efficiency', () => {
    const content = build([flash, archive])
    expect(content.derivationTable.totalRow).toEqual([
      '',
      'Cluster total',
      '—',
      '1.2 PB',
      '67.9 TB',
      '4.6%',
      '—',
      '1.2 PB',
      '78.0%',
    ])
  })

  /**
   * The regression that already shipped once: a one-pool cluster reported 66.7% in the row and
   * 46.3% in the footer, because the row rendered the vendor's protection efficiency while the
   * footer aggregated usable-over-raw. With one pool the two cells are the same quantity, so they
   * must be the same string.
   */
  it('agrees exactly with the cluster row for a single-pool cluster', () => {
    const content = build([flash])
    const row = content.derivationTable.rows[0]
    expect(content.derivationTable.rows).toHaveLength(1)
    expect(row?.[8]).toBe(content.derivationTable.totalRow[8])
    expect(row?.[8]).toBe('63.9%')
    // And the same figure reaches the cluster summary block, from `clusterEfficiency`.
    expect(content.cluster.at(-1)).toEqual({
      label: 'Usable efficiency (after VHS)',
      value: '63.9%',
    })
  })
})

describe('buildPowerScaleExportContent — DRR and the caveat', () => {
  it('shows the ratio actually applied when a pool overrides the catalog default', () => {
    const plain = build([flash])
    expect(plain.poolTable.rows[0]?.[8]).toBe('2')

    // `sizeTier` resolves `drrOverride ?? model.drr` into `PowerScaleTierResult.drr`, so showing
    // that field shows the truth whether or not the operator overrode it.
    const overridden = build([{ ...flash, drrOverride: 1.3 }])
    expect(overridden.poolTable.rows[0]?.[8]).toBe('1.3')
    expect(overridden.poolTable.rows[0]?.[9]).toBe('38.3 TB')
  })

  it('carries the shared caveat line exactly once, and no per-row markers', () => {
    const content = build([flash, archive])
    expect(content.estimateNote).toBe(common.powerScale.estimateNote)
    const cells = [
      ...content.poolTable.rows.flat(),
      ...content.poolTable.totalRow,
      ...content.derivationTable.rows.flat(),
      ...content.derivationTable.totalRow,
      ...content.poolTable.columns,
      ...content.derivationTable.columns,
    ]
    expect(cells.filter((cell) => cell.includes('*'))).toEqual([])
  })
})

describe('buildPowerScaleExportContent — localization', () => {
  it('formats counts with the Swiss apostrophe separator and translates the labels', () => {
    // 90 A200 nodes × 15 drives = 1'350 drives — above the grouping threshold, unlike the
    // small fixtures above.
    const content = build([{ ...archive, nodeCount: 90 }], 'fr')
    expect(content.poolTable.rows[0]?.[4]).toBe("1'350")
    expect(content.clusterSummary).toBe("Pools de nœuds 1 · Nœuds 90 · Disques 1'350")
    expect(content.poolTable.columns[1]).toBe('Modèle de nœud')
    // Technical notation is never translated.
    expect(content.poolTable.rows[0]?.[5]).toBe('+2n')
    expect(content.poolTable.columns[8]).toBe('DRR')
  })

  it('reports an all-unsizeable cluster as zero pools instead of a stale drive model', () => {
    const content = build([{ ...flash, nodeModel: 'NOPE' }])
    expect(content.clusterSummary).toBe('Node pools 0 · Nodes 0 · Drives 0')
    expect(content.poolTable.rows).toEqual([])
    expect(content.poolTable.totalRow[6]).toBe('0 B')
  })
})

/** A full result object for the two exports, with real PowerScale volumetry inside it. */
function results(tiers: PowerScaleTier[]): CalculationResults {
  return {
    volumetry: calculatePowerScaleVolumetry({ tiers }),
    performance: {
      maxReadIOPS: 120_000,
      maxWriteIOPS: 60_000,
      maxReadThroughputMBs: 9000,
      maxWriteThroughputMBs: 4000,
      layers: [],
      bottleneck: { kind: 'none' },
    },
    sustainability: {
      powerBreakdown: { total: 4200, drives: 2600, servers: 1300, cooling: 300 },
      annualEnergyKwh: 36_792,
      annualCO2Kg: 4100,
      annualEnergyCost: 0,
    },
    resilience: null,
    tco: null,
    lastUpdated: 0,
    errors: [],
  } as unknown as CalculationResults
}

describe('the two exports', () => {
  const drive = { model: 'Test 24TB', type: 'HDD', capacity_raw: 24e12 } as never

  /**
   * jsPDF's `save` is an own property of each instance, not of the prototype, so there is nothing
   * to stub — and under Node it really does write the file. The project name below makes the
   * artefact identifiable and this hook removes it, so a test run leaves no PDF in the repo.
   */
  const projectName = 'Raidy Export Spec'
  afterAll(() => rmSync('Raidy_Export_Spec_Report.pdf', { force: true }))

  it('renders a PowerScale deck and report without throwing', async () => {
    // Only the file handoff is stubbed; every layout call underneath runs for real.
    const pptx = await import('pptxgenjs')
    const writeFile = vi
      .spyOn(pptx.default.prototype, 'writeFile')
      .mockResolvedValue('raidy-powerscale.pptx')
    const config = {
      drive,
      driveCount: 12,
      topology: TOPOLOGY,
      results: results([flash, archive]),
      unitSystem: 'decimal' as const,
      language: 'en' as const,
      projectName,
    }

    await exportToPptx(config)
    expect(writeFile).toHaveBeenCalledTimes(1)

    // What is asserted is that every layout call runs: the cluster table, both wide node-pool
    // tables, the performance/power sections beneath them and the closing caveat line.
    expect(() => exportToPdf(config)).not.toThrow()

    writeFile.mockRestore()
  })

  it('leaves the generic path alone for a non-PowerScale platform', () => {
    // A standard RAID6 report still walks the Hardware Configuration + Capacity Analysis blocks
    // the dispatch now sits beside.
    expect(() =>
      exportToPdf({
        drive,
        driveCount: 12,
        topology: { type: 'standard', level: 'RAID6' },
        results: results([flash]),
        unitSystem: 'decimal',
        language: 'en',
        projectName,
      }),
    ).not.toThrow()
  })
})

describe('the cluster summary', () => {
  it('describes node pools rather than the Hardware panel’s untouched drive', () => {
    expect(build([flash, archive]).clusterSummary).toBe('Node pools 2 · Nodes 18 · Drives 204')
  })

  it('lists the cluster figures the report opens with', () => {
    expect(build([flash, archive]).cluster.map((pair) => pair.label)).toEqual([
      'Node pools',
      'Nodes',
      'Drives',
      'Raw',
      'Usable after VHS',
      'Effective',
      'Usable efficiency (after VHS)',
    ])
  })

  it('carries the first-pool scope statement for the performance figures', () => {
    expect(build([flash, archive]).scopeNote).toBe(t('output:powerscale.firstTierOnly'))
  })
})
