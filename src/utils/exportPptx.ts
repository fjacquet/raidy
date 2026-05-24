/**
 * PPTX Export utility using pptxgenjs.
 * Generates an in-browser presentation with dark brand styling.
 * No server requests — pptxgenjs runs entirely client-side.
 */
import pptxgen from 'pptxgenjs'

import i18n from '@/i18n'
import type { Drive } from '@/types/drive'
import type { CalculationResults } from '@/types/results'
import type { Topology, ZfsOptions } from '@/types/topology'

import { captureDonutChart, captureSankeyDiagram, captureSpeedometer } from './captureChart'
import type { UnitSystem } from './units'

export interface ExportConfig {
  drive: Drive
  driveCount: number
  topology: Topology
  zfsOptions?: ZfsOptions
  results: CalculationResults
  projectName?: string
  unitSystem?: UnitSystem
}

/** Brand color palette (6-char hex, no '#', required by pptxgenjs). */
export const BRAND = {
  bg: '1A1B2E', // surface-900 — slide background
  panel: '1E2035', // surface-800 — card/panel fills
  border: '272A3D', // surface-700 — subtle borders
  accent: '3D6FCC', // primary-500 — accent blue
  textWhite: 'FFFFFF',
  textMuted: '94A3B8',
  capacity: '4CAF82', // green
  overhead: 'D4A843', // amber
  parity: 'E05C3A', // orange-red
} as const

/** Convert bytes to decimal terabytes (1 TB = 1e12 bytes). */
function bytesToTB(bytes: number): number {
  return bytes / 1e12
}

/** Format IOPS with K/M suffix for compact display. */
function formatIops(iops: number): string {
  if (iops >= 1_000_000) return `${(iops / 1_000_000).toFixed(1)}M`
  if (iops >= 1_000) return `${(iops / 1_000).toFixed(0)}K`
  return iops.toFixed(0)
}

/** Add the thin accent bar at the top of every slide. */
function addAccentBar(slide: pptxgen.Slide, prs: pptxgen): void {
  slide.addShape(prs.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.08,
    fill: { color: BRAND.accent },
    line: { color: BRAND.accent },
  })
}

/** Add a slide heading at the standard position. */
function addSlideHeading(slide: pptxgen.Slide, title: string): void {
  slide.addText(title, {
    x: 0.4,
    y: 0.2,
    w: 12.5,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: BRAND.textWhite,
    fontFace: 'Calibri',
  })
}

/** Add a stacked label+value metric block. */
function addMetricBlock(
  slide: pptxgen.Slide,
  label: string,
  value: string,
  color: string,
  x: number,
  y: number,
  w = 3.5,
): void {
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.35,
    fontSize: 13,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })
  slide.addText(value, {
    x,
    y: y + 0.38,
    w,
    h: 0.6,
    fontSize: 20,
    bold: true,
    color,
    fontFace: 'Calibri',
  })
}

/** Build the title slide (Slide 1). */
function buildTitleSlide(prs: pptxgen, config: ExportConfig): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)

  const topologyLabel = config.topology.type.toUpperCase()
  const levelLabel = 'level' in config.topology ? ` ${config.topology.level}` : ''
  const title = `${topologyLabel}${levelLabel}`
  const driveLabel = config.drive.model
  const date = new Date().toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Main title
  slide.addText(title, {
    x: 1,
    y: 2.2,
    w: 11.33,
    h: 1.2,
    fontSize: 48,
    bold: true,
    color: BRAND.textWhite,
    fontFace: 'Calibri',
    align: 'center',
  })

  // Subtitle — drive model
  slide.addText(driveLabel, {
    x: 1,
    y: 3.5,
    w: 11.33,
    h: 0.7,
    fontSize: 24,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
    align: 'center',
  })

  // Footer — date
  slide.addText(date, {
    x: 1,
    y: 6.8,
    w: 11.33,
    h: 0.4,
    fontSize: 12,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
    align: 'center',
  })
}

/** Build the executive summary slide (Slide 2). */
function buildExecutiveSummarySlide(prs: pptxgen, config: ExportConfig): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.executiveSummary'))

  const vol = config.results.volumetry
  const perf = config.results.performance
  const resilience = config.results.resilience
  const sus = config.results.sustainability

  // Topology label row
  const topologyLabel = config.topology.type.toUpperCase()
  const levelLabel = 'level' in config.topology ? ` ${config.topology.level}` : ''
  slide.addText(`${topologyLabel}${levelLabel}`, {
    x: 0.4,
    y: 0.9,
    w: 12.5,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: BRAND.accent,
    fontFace: 'Calibri',
  })

  // 3-column × 2-row metric grid
  const cols: [number, number, number] = [0.4, 4.6, 9.0]
  const rows: [number, number] = [1.5, 3.6]

  addMetricBlock(
    slide,
    'Usable Capacity',
    `${bytesToTB(vol.usableCapacity).toFixed(1)} TB`,
    BRAND.capacity,
    cols[0],
    rows[0],
    4.0,
  )
  addMetricBlock(
    slide,
    'Read IOPS',
    formatIops(perf.maxReadIOPS),
    BRAND.accent,
    cols[1],
    rows[0],
    4.0,
  )
  addMetricBlock(
    slide,
    'Write IOPS',
    formatIops(perf.maxWriteIOPS),
    BRAND.accent,
    cols[2],
    rows[0],
    4.0,
  )
  addMetricBlock(
    slide,
    'Resilience',
    resilience ? `${resilience.survivalPercent} (${resilience.nines} nines)` : 'N/A',
    BRAND.capacity,
    cols[0],
    rows[1],
    4.0,
  )
  addMetricBlock(
    slide,
    'Annual Energy',
    `${sus.annualEnergyKwh.toFixed(0)} kWh`,
    BRAND.textMuted,
    cols[1],
    rows[1],
    4.0,
  )
  addMetricBlock(
    slide,
    'Annual CO\u2082',
    `${sus.annualCO2Kg.toFixed(0)} kg`,
    BRAND.textMuted,
    cols[2],
    rows[1],
    4.0,
  )
}

/** Build the volumetry detail slide (Slide 3) with embedded Sankey PNG. */
async function buildVolumetrySlide(
  prs: pptxgen,
  config: ExportConfig,
  sankeyDataUrl: string | null,
): Promise<void> {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.volumetry'))

  const vol = config.results.volumetry
  addMetricBlock(
    slide,
    'Raw Capacity',
    `${bytesToTB(vol.rawCapacity).toFixed(1)} TB`,
    BRAND.textMuted,
    0.4,
    1.0,
  )
  addMetricBlock(
    slide,
    'Usable Capacity',
    `${bytesToTB(vol.usableCapacity).toFixed(1)} TB`,
    BRAND.capacity,
    0.4,
    2.2,
  )
  addMetricBlock(
    slide,
    'Effective Capacity',
    `${bytesToTB(vol.effectiveCapacity).toFixed(1)} TB`,
    BRAND.accent,
    0.4,
    3.4,
  )
  addMetricBlock(slide, 'Efficiency', `${vol.efficiency.toFixed(1)}%`, BRAND.overhead, 0.4, 4.6)

  if (sankeyDataUrl) {
    slide.addImage({ data: sankeyDataUrl, x: 4.2, y: 0.8, w: 8.7, h: 6.3 })
  } else {
    slide.addText('Chart not available', {
      x: 4.2,
      y: 3.0,
      w: 8.7,
      h: 0.5,
      fontSize: 14,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/** Build the performance detail slide (Slide 4) with embedded speedometer PNG. */
async function buildPerformanceSlide(
  prs: pptxgen,
  config: ExportConfig,
  speedometerDataUrl: string | null,
): Promise<void> {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.performance'))

  const perf = config.results.performance
  addMetricBlock(slide, 'Read IOPS', formatIops(perf.maxReadIOPS), BRAND.accent, 0.4, 1.0)
  addMetricBlock(slide, 'Write IOPS', formatIops(perf.maxWriteIOPS), BRAND.accent, 0.4, 2.2)
  addMetricBlock(
    slide,
    'Read Throughput',
    `${perf.maxReadThroughputMBs.toFixed(0)} MB/s`,
    BRAND.textMuted,
    0.4,
    3.4,
  )
  addMetricBlock(
    slide,
    'Write Throughput',
    `${perf.maxWriteThroughputMBs.toFixed(0)} MB/s`,
    BRAND.textMuted,
    0.4,
    4.6,
  )

  // Bottleneck description
  slide.addText(perf.bottleneckDescription, {
    x: 0.4,
    y: 5.8,
    w: 3.8,
    h: 0.4,
    fontSize: 12,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
    italic: true,
  })

  if (speedometerDataUrl) {
    slide.addImage({ data: speedometerDataUrl, x: 4.5, y: 0.9, w: 5.5, h: 5.5 })
  } else {
    slide.addText('Chart not available', {
      x: 4.5,
      y: 3.0,
      w: 8.0,
      h: 0.5,
      fontSize: 14,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/** Build the resilience detail slide (Slide 5) with embedded donut chart PNG. */
async function buildResilienceSlide(
  prs: pptxgen,
  config: ExportConfig,
  donutDataUrl: string | null,
): Promise<void> {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.resilience'))

  const resilience = config.results.resilience
  if (!resilience) {
    slide.addText('Resilience simulation not run', {
      x: 4.5,
      y: 3.5,
      w: 4.5,
      h: 0.5,
      fontSize: 16,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
      align: 'center',
    })
    return
  }

  const riskColor =
    resilience.riskLevel === 'low'
      ? BRAND.capacity
      : resilience.riskLevel === 'medium'
        ? BRAND.overhead
        : BRAND.parity

  addMetricBlock(slide, 'Survival Rate', resilience.survivalPercent, BRAND.capacity, 0.4, 1.0)
  addMetricBlock(slide, 'Nines', `${resilience.nines} nines`, BRAND.capacity, 0.4, 2.2)
  addMetricBlock(
    slide,
    'Rebuild Time',
    `${resilience.avgRebuildTimeHours.toFixed(1)} h`,
    BRAND.overhead,
    0.4,
    3.4,
  )
  addMetricBlock(slide, 'Risk Level', resilience.riskLevel.toUpperCase(), riskColor, 0.4, 4.6)

  if (donutDataUrl) {
    slide.addImage({ data: donutDataUrl, x: 4.5, y: 0.9, w: 5.0, h: 5.0 })
  } else {
    slide.addText('Chart not available', {
      x: 4.5,
      y: 3.0,
      w: 8.0,
      h: 0.5,
      fontSize: 14,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/** Build the sustainability detail slide (Slide 6). */
function buildSustainabilitySlide(prs: pptxgen, config: ExportConfig): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.sustainability'))

  const sus = config.results.sustainability
  // Left column (x: 0.4)
  addMetricBlock(
    slide,
    'Total Power',
    `${sus.powerBreakdown.total.toFixed(0)} W`,
    BRAND.accent,
    0.4,
    1.0,
  )
  addMetricBlock(
    slide,
    'Annual Energy',
    `${sus.annualEnergyKwh.toFixed(0)} kWh`,
    BRAND.textMuted,
    0.4,
    2.2,
  )
  addMetricBlock(
    slide,
    'Annual Cost',
    `$${sus.annualEnergyCost.toFixed(0)}`,
    BRAND.overhead,
    0.4,
    3.4,
  )

  // Right column (x: 6.8)
  addMetricBlock(
    slide,
    'Annual CO\u2082',
    `${sus.annualCO2Kg.toFixed(0)} kg`,
    BRAND.textMuted,
    6.8,
    1.0,
  )
  addMetricBlock(
    slide,
    'Drive Power',
    `${sus.powerBreakdown.drives.toFixed(0)} W`,
    BRAND.textMuted,
    6.8,
    2.2,
  )
  addMetricBlock(
    slide,
    'Server Power',
    `${sus.powerBreakdown.servers.toFixed(0)} W`,
    BRAND.textMuted,
    6.8,
    3.4,
  )

  if (sus.flashEndurance) {
    addMetricBlock(
      slide,
      'Drive Endurance',
      `${sus.flashEndurance.expectedLifeYears.toFixed(1)} years`,
      BRAND.capacity,
      0.4,
      5.0,
    )
  }
}

/** Build the bill of materials slide (Slide 7). */
function buildBomSlide(prs: pptxgen, config: ExportConfig): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)
  addSlideHeading(slide, i18n.t('output:pptx.bom'))

  // Drive section label
  slide.addText('Drive', {
    x: 0.4,
    y: 0.9,
    w: 6.0,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })

  const driveRows: Array<{ label: string; value: string }> = [
    { label: 'Model', value: config.drive.model },
    { label: 'Type', value: config.drive.type },
    { label: 'Interface', value: config.drive.interface ?? 'N/A' },
    { label: 'Capacity', value: `${bytesToTB(config.drive.capacity_raw).toFixed(1)} TB` },
    { label: 'Active Power', value: `${config.drive.power.load_watts} W` },
  ]
  if (config.drive.reliability.dwpd > 0) {
    driveRows.push({ label: 'DWPD', value: `${config.drive.reliability.dwpd}` })
  }

  driveRows.forEach((row, i) => {
    const y = 1.3 + i * 0.55
    slide.addText(row.label, {
      x: 0.4,
      y,
      w: 2.5,
      h: 0.4,
      fontSize: 12,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
    })
    slide.addText(row.value, {
      x: 3.0,
      y,
      w: 3.5,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: BRAND.textWhite,
      fontFace: 'Calibri',
    })
  })

  // Configuration section label
  slide.addText('Configuration', {
    x: 7.0,
    y: 0.9,
    w: 6.0,
    h: 0.4,
    fontSize: 14,
    bold: true,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })

  const topLabel = `${config.topology.type.toUpperCase()}${'level' in config.topology ? ` ${config.topology.level}` : ''}`
  const serverCount =
    'serverCount' in config.topology
      ? String((config.topology as { serverCount: number }).serverCount)
      : 'N/A'

  const configRows: Array<{ label: string; value: string }> = [
    { label: 'Topology', value: topLabel },
    { label: 'Drive Count', value: `${config.driveCount}` },
    { label: 'Server Count', value: serverCount },
  ]

  configRows.forEach((row, i) => {
    const y = 1.3 + i * 0.55
    slide.addText(row.label, {
      x: 7.0,
      y,
      w: 2.5,
      h: 0.4,
      fontSize: 12,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
    })
    slide.addText(row.value, {
      x: 9.6,
      y,
      w: 3.5,
      h: 0.4,
      fontSize: 13,
      bold: true,
      color: BRAND.textWhite,
      fontFace: 'Calibri',
    })
  })
}

/**
 * Generate and download a PPTX presentation.
 * Runs entirely in the browser — no server request is made.
 */
export async function exportToPptx(config: ExportConfig): Promise<void> {
  // Capture all charts in parallel before building slides
  const [sankeyDataUrl, speedometerDataUrl, donutDataUrl] = await Promise.all([
    captureSankeyDiagram(),
    captureSpeedometer(),
    captureDonutChart(),
  ])

  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  prs.author = 'Raidy'
  prs.subject = 'Storage Configuration'
  prs.title = config.projectName ?? 'Storage Report'

  buildTitleSlide(prs, config)
  buildExecutiveSummarySlide(prs, config)
  await buildVolumetrySlide(prs, config, sankeyDataUrl)
  await buildPerformanceSlide(prs, config, speedometerDataUrl)
  await buildResilienceSlide(prs, config, donutDataUrl)
  buildSustainabilitySlide(prs, config)
  buildBomSlide(prs, config)

  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `raidy-${safeLabel}.pptx` })
}
