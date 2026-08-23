import { describe, expect, it } from 'vitest'
import common from '@/i18n/locales/en/common.json'
import en from '@/i18n/locales/en/output.json'
import type { ExportConfig } from '@/utils/exportPptx'
import { buildPptxContent } from '@/utils/pptxContent'

const t = (key: string) => {
  if (key === 'common:powerScale.estimateNote') return common.powerScale.estimateNote
  const labels = (en.pptx as Record<string, unknown>).labels as Record<string, string>
  const short = key.replace('output:pptx.labels.', '')
  return labels[short] ?? key
}

// Minimal fixture — fill CalculationResults with round numbers (bytes)
const config: ExportConfig = {
  drive: { model: 'Test 1TB' } as ExportConfig['drive'],
  driveCount: 8,
  topology: { type: 'standard', level: 'RAID5' } as ExportConfig['topology'],
  unitSystem: 'binary',
  results: {
    volumetry: {
      rawCapacity: 8e12,
      usableCapacity: 7e12,
      effectiveCapacity: 7e12,
      efficiency: 87.5,
      parityOverhead: 1e12,
      hotSpareOverhead: 0,
      filesystemOverhead: 0.14e12,
      slopOverhead: 0,
      breakdown: [],
    },
    performance: {
      maxReadIOPS: 1200,
      maxWriteIOPS: 800,
      maxReadThroughputMBs: 1600,
      maxWriteThroughputMBs: 1000,
      layers: [],
      bottleneck: { kind: 'none' as const },
    },
    sustainability: {
      powerBreakdown: { total: 120, drives: 80, servers: 30, cooling: 10 },
      annualEnergyKwh: 1051,
      annualCO2Kg: 13,
      annualEnergyCost: 0,
    },
    resilience: null,
    tco: null,
    lastUpdated: 0,
    errors: [],
  } as unknown as ExportConfig['results'],
}

describe('buildPptxContent', () => {
  it('uses binary units (TiB) when unitSystem is binary', () => {
    const content = buildPptxContent(config, t)
    const raw = content.volumetryLines[0]?.find((s) => s.label === 'Raw')
    expect(raw?.value).toContain('TiB')
  })
  it('uses decimal units (TB) when unitSystem is decimal', () => {
    const content = buildPptxContent({ ...config, unitSystem: 'decimal' }, t)
    const raw = content.volumetryLines[0]?.find((s) => s.label === 'Raw')
    expect(raw?.value).toContain('TB')
    expect(raw?.value).not.toContain('TiB')
  })
  it('omits the resilience line when the simulation has not run', () => {
    expect(buildPptxContent(config, t).resilienceLine).toBeNull()
  })
  it('populates the resilience line when the simulation has run', () => {
    const resilience: NonNullable<ExportConfig['results']['resilience']> = {
      survivalRate: 0.99999,
      survivalPercent: '99.999%',
      nines: 5,
      avgRebuildTimeHours: 4.2,
      ureProbability: 0,
      dualFailureProbability: 0,
      riskLevel: 'low',
      recommendations: [],
      oddTargetCountNoBuddyCredit: false,
    }
    const content = buildPptxContent({ ...config, results: { ...config.results, resilience } }, t)
    expect(content.resilienceLine).not.toBeNull()
    const stats = content.resilienceLine ?? []
    for (const s of stats) expect(s.label).not.toMatch(/^output:pptx/)
    const survival = stats.find((s) => s.label === 'Survival')
    expect(survival?.value).toBe('99.999%')
    const risk = stats.find((s) => s.label === 'Risk')
    expect(risk?.value).toBe('LOW')
  })
  it('resolves every label through t() — no hardcoded English fallbacks', () => {
    const content = buildPptxContent(config, t)
    const allStats = [
      ...content.volumetryLines.flat(),
      ...content.performanceLines.flat(),
      ...(content.energyLine ?? []),
      ...content.bottleneckLine,
    ]
    for (const s of allStats) expect(s.label).not.toMatch(/^output:pptx/)
  })
  it('honors unitSystem in second volumetry row (parity/spares/fs) — binary units', () => {
    const content = buildPptxContent(config, t)
    const parity = content.volumetryLines[1]?.find((s) => s.label === 'Parity')
    expect(parity?.value).toMatch(/[TG]iB/)
  })
  it('honors unitSystem in second volumetry row (parity/spares/fs) — decimal units', () => {
    const content = buildPptxContent({ ...config, unitSystem: 'decimal' }, t)
    const parity = content.volumetryLines[1]?.find((s) => s.label === 'Parity')
    expect(parity?.value).toMatch(/[TG]B/)
    expect(parity?.value).not.toContain('iB')
  })
  it('includes a "servers" segment in the subtitle when serverCount > 1 (finding #14/M-1)', () => {
    const content = buildPptxContent({ ...config, serverCount: 4 }, t)
    expect(content.subtitle).toContain('4 servers')
  })
  it('omits the "servers" segment when serverCount is undefined', () => {
    const content = buildPptxContent(config, t)
    expect(content.subtitle).not.toMatch(/\d+ servers/)
  })
  it('omits the "servers" segment when serverCount is 1 (single-node platform)', () => {
    const content = buildPptxContent({ ...config, serverCount: 1 }, t)
    expect(content.subtitle).not.toMatch(/\d+ servers/)
  })
  /**
   * PowerSizer is the rule; raidy is the shortcut. A deck that leaves the app for a customer says
   * so — and says which of its figures are estimates from a reference medium rather than
   * vendor-published values. Same sentence as the Hardware panel's, from the same key.
   */
  it('carries the PowerSizer estimate note for PowerScale', () => {
    const content = buildPptxContent(
      {
        ...config,
        topology: { type: 'powerscale', level: 'powerscale_onefs' } as ExportConfig['topology'],
      },
      t,
    )
    expect(content.estimateNote).toBe(common.powerScale.estimateNote)
    expect(content.estimateNote).toMatch(/PowerSizer/)
  })

  it("carries no estimate note for a platform sized from the user's own drive", () => {
    expect(buildPptxContent(config, t).estimateNote).toBeNull()
  })

  it('formats K-suffix IOPS with one decimal, matching the on-screen gauges (finding #12)', () => {
    const content = buildPptxContent(config, t)
    // maxReadIOPS: 1200 must render as '1.2K' (Speedometer/AnimatedCounter convention),
    // not '1K' — pins the .toFixed(1) fix so a regression to .toFixed(0) fails here.
    const read = content.performanceLines[0]?.find((s) => s.label === 'Max Read')
    expect(read?.value).toContain('1.2K')
    // maxWriteIOPS: 800 is below 1000 — sub-K branch renders the plain integer.
    const write = content.performanceLines[1]?.find((s) => s.label === 'Max Write')
    expect(write?.value).toContain('800')
    expect(write?.value).not.toContain('K')
  })
})
