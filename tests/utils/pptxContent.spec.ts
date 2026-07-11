import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/output.json'
import type { ExportConfig } from '@/utils/exportPptx'
import { buildPptxContent } from '@/utils/pptxContent'

const t = (key: string) => {
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
      bottleneckDescription: '',
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
  it('resolves every label through t() — no hardcoded English fallbacks', () => {
    const content = buildPptxContent(config, t)
    const allStats = [
      ...content.volumetryLines.flat(),
      ...content.performanceLines.flat(),
      ...content.energyLine,
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
})
