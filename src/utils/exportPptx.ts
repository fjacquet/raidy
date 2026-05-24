/**
 * PPTX Export utility using pptxgenjs.
 * Generates a single-slide, in-browser executive one-pager with the Sankey,
 * speedometers, and resilience donut plus a compact metric grid. Charts are
 * captured from the DOM via html-to-image. No server requests — pptxgenjs runs
 * entirely client-side.
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

/** Add the thin accent bar at the top of the slide. */
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

/** A small uppercase section label. */
function addSectionLabel(
  slide: pptxgen.Slide,
  title: string,
  color: string,
  x: number,
  y: number,
): void {
  slide.addText(title.toUpperCase(), {
    x,
    y,
    w: 6.0,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color,
    charSpacing: 1,
    fontFace: 'Calibri',
  })
}

/** Place a captured chart image (aspect-preserving), or a muted fallback note. */
function addChartOrFallback(
  slide: pptxgen.Slide,
  dataUrl: string | null,
  box: { x: number; y: number; w: number; h: number },
  fallback: string,
): void {
  if (dataUrl) {
    slide.addImage({ data: dataUrl, sizing: { type: 'contain', w: box.w, h: box.h }, ...box })
  } else {
    slide.addText(fallback, {
      x: box.x,
      y: box.y + box.h / 2 - 0.25,
      w: box.w,
      h: 0.5,
      fontSize: 12,
      color: BRAND.textMuted,
      italic: true,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/** A compact label-over-value metric for the bottom grid. */
function addCompactMetric(
  slide: pptxgen.Slide,
  label: string,
  value: string,
  color: string,
  x: number,
  y: number,
): void {
  slide.addText(label, {
    x,
    y,
    w: 2.3,
    h: 0.26,
    fontSize: 10,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })
  slide.addText(value, {
    x,
    y: y + 0.28,
    w: 2.3,
    h: 0.4,
    fontSize: 15,
    bold: true,
    color,
    fontFace: 'Calibri',
  })
}

/** Build the single executive one-pager slide (charts + metric grid). */
function buildSummarySlide(
  prs: pptxgen,
  config: ExportConfig,
  charts: { sankey: string | null; speedometer: string | null; donut: string | null },
): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)

  const { volumetry: vol, performance: perf, resilience, sustainability: sus } = config.results

  // ── Header ────────────────────────────────────────────────────────────
  const topologyLabel = config.topology.type.toUpperCase()
  const levelLabel = 'level' in config.topology ? ` ${config.topology.level}` : ''
  slide.addText(`${topologyLabel}${levelLabel}`, {
    x: 0.4,
    y: 0.16,
    w: 9.0,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: BRAND.textWhite,
    fontFace: 'Calibri',
  })

  const date = new Date().toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const serverCount =
    'serverCount' in config.topology
      ? String((config.topology as { serverCount: number }).serverCount)
      : null
  const subParts = [
    config.drive.model,
    `${config.driveCount} drives`,
    serverCount ? `${serverCount} servers` : null,
    date,
  ].filter(Boolean)
  slide.addText(subParts.join('  ·  '), {
    x: 0.4,
    y: 0.68,
    w: 12.5,
    h: 0.28,
    fontSize: 10.5,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })

  // ── Top row: Sankey (capacity) + Speedometers (performance) ───────────
  addSectionLabel(slide, i18n.t('output:pptx.volumetry'), BRAND.capacity, 0.35, 1.0)
  addChartOrFallback(
    slide,
    charts.sankey,
    { x: 0.35, y: 1.32, w: 6.7, h: 2.7 },
    'Capacity chart unavailable',
  )

  addSectionLabel(slide, i18n.t('output:pptx.performance'), BRAND.accent, 7.2, 1.0)
  addChartOrFallback(
    slide,
    charts.speedometer,
    { x: 7.2, y: 1.32, w: 5.8, h: 2.7 },
    'Performance chart unavailable',
  )

  // ── Bottom row: Resilience donut + key-metric grid ────────────────────
  addSectionLabel(slide, i18n.t('output:pptx.resilience'), BRAND.capacity, 0.35, 4.1)
  addChartOrFallback(
    slide,
    charts.donut,
    { x: 0.35, y: 4.4, w: 2.9, h: 2.5 },
    'Resilience simulation not run',
  )

  addSectionLabel(slide, i18n.t('output:pptx.executiveSummary'), BRAND.textMuted, 3.7, 4.1)
  const mcolX: [number, number, number, number] = [3.7, 6.05, 8.4, 10.75]
  const mrowY: [number, number] = [4.45, 5.7]
  // Row 1
  addCompactMetric(
    slide,
    'Usable Capacity',
    `${bytesToTB(vol.usableCapacity).toFixed(1)} TB`,
    BRAND.capacity,
    mcolX[0],
    mrowY[0],
  )
  addCompactMetric(
    slide,
    'Efficiency',
    `${vol.efficiency.toFixed(1)}%`,
    BRAND.overhead,
    mcolX[1],
    mrowY[0],
  )
  addCompactMetric(
    slide,
    'Read IOPS',
    formatIops(perf.maxReadIOPS),
    BRAND.accent,
    mcolX[2],
    mrowY[0],
  )
  addCompactMetric(
    slide,
    'Write IOPS',
    formatIops(perf.maxWriteIOPS),
    BRAND.accent,
    mcolX[3],
    mrowY[0],
  )
  // Row 2
  addCompactMetric(
    slide,
    'Total Power',
    `${sus.powerBreakdown.total.toFixed(0)} W`,
    BRAND.accent,
    mcolX[0],
    mrowY[1],
  )
  addCompactMetric(
    slide,
    'Annual Energy',
    `${sus.annualEnergyKwh.toFixed(0)} kWh`,
    BRAND.textMuted,
    mcolX[1],
    mrowY[1],
  )
  addCompactMetric(
    slide,
    'Annual CO₂',
    `${sus.annualCO2Kg.toFixed(0)} kg`,
    BRAND.textMuted,
    mcolX[2],
    mrowY[1],
  )
  const resilienceValue = resilience
    ? `${resilience.survivalPercent} · ${resilience.nines} nines`
    : '—'
  addCompactMetric(slide, 'Survival', resilienceValue, BRAND.capacity, mcolX[3], mrowY[1])

  // ── Footer: bottleneck ────────────────────────────────────────────────
  slide.addText(perf.bottleneckDescription, {
    x: 3.7,
    y: 6.8,
    w: 9.3,
    h: 0.35,
    fontSize: 10,
    italic: true,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })
}

/**
 * Generate and download a single-slide PPTX summary.
 * Runs entirely in the browser — no server request is made.
 */
export async function exportToPptx(config: ExportConfig): Promise<void> {
  // Capture all charts in parallel before building the slide.
  const [sankey, speedometer, donut] = await Promise.all([
    captureSankeyDiagram(),
    captureSpeedometer(),
    captureDonutChart(),
  ])

  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  prs.author = 'Raidy'
  prs.subject = 'Storage Configuration'
  prs.title = config.projectName ?? 'Storage Report'

  buildSummarySlide(prs, config, { sankey, speedometer, donut })

  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `raidy-${safeLabel}.pptx` })
}
