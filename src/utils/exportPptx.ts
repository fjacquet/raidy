/**
 * PPTX Export utility using pptxgenjs.
 * Single dense executive one-pager: a crystal-clear VOLUME spec and PERFORMANCE
 * maximums on top (a large Sankey + a tight 2×2 of gauges, each with explicit
 * number lines), with energy, bottlenecks, and resilience spread underneath to
 * fill the page. Charts are captured from the DOM via html-to-image. No server
 * requests — pptxgenjs runs entirely client-side.
 */
import pptxgen from 'pptxgenjs'

import i18n from '@/i18n'
import type { Drive } from '@/types/drive'
import type { CalculationResults } from '@/types/results'
import type { Topology, ZfsOptions } from '@/types/topology'

import { capturePerfGauges, captureSankeyDiagram } from './captureChart'
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

/** Standard slide font. */
const FONT = 'Arial'

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
  w = 6.0,
): void {
  slide.addText(title.toUpperCase(), {
    x,
    y,
    w,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color,
    charSpacing: 1,
    fontFace: FONT,
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
  } else if (fallback) {
    slide.addText(fallback, {
      x: box.x,
      y: box.y + box.h / 2 - 0.25,
      w: box.w,
      h: 0.5,
      fontSize: 11,
      color: BRAND.textMuted,
      italic: true,
      fontFace: FONT,
      align: 'center',
    })
  }
}

/** A dense "label value · label value" stat line built from text runs. */
type StatRun = { label: string; value: string; color: string }
function addStatLine(
  slide: pptxgen.Slide,
  stats: StatRun[],
  x: number,
  y: number,
  w: number,
  fontSize = 11,
): void {
  const runs: pptxgen.TextProps[] = []
  stats.forEach((stat, i) => {
    if (i > 0) {
      runs.push({ text: '   ·   ', options: { color: BRAND.border, fontFace: FONT, fontSize } })
    }
    runs.push({
      text: `${stat.label} `,
      options: { color: BRAND.textMuted, fontFace: FONT, fontSize },
    })
    runs.push({
      text: stat.value,
      options: { color: stat.color, bold: true, fontFace: FONT, fontSize },
    })
  })
  slide.addText(runs, { x, y, w, h: 0.34, valign: 'middle', fontFace: FONT })
}

/** Build the single dense executive one-pager slide. */
function buildSummarySlide(
  prs: pptxgen,
  config: ExportConfig,
  charts: { sankey: string | null; gauges: (string | null)[] },
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
    y: 0.12,
    w: 12.6,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: BRAND.textWhite,
    fontFace: FONT,
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
    y: 0.66,
    w: 12.6,
    h: 0.28,
    fontSize: 11,
    color: BRAND.textMuted,
    fontFace: FONT,
  })

  // ── Top charts: large Sankey (left) + tight 2×2 gauges (right) ────────
  // Shorter charts when resilience is shown, to leave room for its row.
  const chartTop = 1.4
  const chartH = resilience ? 2.7 : 3.2
  const chartBottom = chartTop + chartH

  // Wider Sankey (reads like the web); smaller gauges packed to the right.
  addSectionLabel(slide, i18n.t('output:pptx.volumetry'), BRAND.capacity, 0.4, 1.0)
  addChartOrFallback(
    slide,
    charts.sankey,
    { x: 0.25, y: chartTop, w: 7.6, h: chartH },
    'Capacity chart unavailable',
  )

  addSectionLabel(slide, i18n.t('output:pptx.performance'), BRAND.accent, 8.0, 1.0)
  const gaugeColX: [number, number] = [8.0, 10.5]
  const gaugeRowY: [number, number] = [chartTop + 0.1, chartTop + chartH / 2 + 0.05]
  const gaugeW = 2.45
  const gaugeH = chartH / 2 - 0.35
  charts.gauges.forEach((gauge, i) => {
    const col = i % 2
    const row = i < 2 ? 0 : 1
    addChartOrFallback(
      slide,
      gauge,
      { x: gaugeColX[col] ?? 8.0, y: gaugeRowY[row] ?? chartTop, w: gaugeW, h: gaugeH },
      '',
    )
  })

  // ── Crystal-clear number lines beneath each chart ─────────────────────
  const nl0 = chartBottom + 0.14
  const nl1 = nl0 + 0.36
  addStatLine(
    slide,
    [
      {
        label: 'Raw',
        value: `${bytesToTB(vol.rawCapacity).toFixed(1)} TB`,
        color: BRAND.textWhite,
      },
      {
        label: 'Usable',
        value: `${bytesToTB(vol.usableCapacity).toFixed(1)} TB`,
        color: BRAND.capacity,
      },
      {
        label: 'Effective',
        value: `${bytesToTB(vol.effectiveCapacity).toFixed(1)} TB`,
        color: BRAND.accent,
      },
      { label: 'Efficiency', value: `${vol.efficiency.toFixed(1)}%`, color: BRAND.overhead },
    ],
    0.4,
    nl0,
    7.6,
  )
  addStatLine(
    slide,
    [
      {
        label: 'Parity',
        value: `${bytesToTB(vol.parityOverhead).toFixed(1)} TB`,
        color: BRAND.parity,
      },
      {
        label: 'Spares',
        value: `${bytesToTB(vol.hotSpareOverhead).toFixed(1)} TB`,
        color: BRAND.overhead,
      },
      {
        label: 'FS',
        value: `${bytesToTB(vol.filesystemOverhead).toFixed(1)} TB`,
        color: BRAND.textMuted,
      },
    ],
    0.4,
    nl1,
    7.6,
    10,
  )
  addStatLine(
    slide,
    [
      { label: 'Max Read', value: `${formatIops(perf.maxReadIOPS)} IOPS`, color: BRAND.accent },
      { label: '/', value: `${perf.maxReadThroughputMBs.toFixed(0)} MB/s`, color: BRAND.textWhite },
    ],
    8.0,
    nl0,
    5.0,
  )
  addStatLine(
    slide,
    [
      { label: 'Max Write', value: `${formatIops(perf.maxWriteIOPS)} IOPS`, color: BRAND.accent },
      {
        label: '/',
        value: `${perf.maxWriteThroughputMBs.toFixed(0)} MB/s`,
        color: BRAND.textWhite,
      },
    ],
    8.0,
    nl1,
    5.0,
  )

  // ── Extras spread to fill the page ────────────────────────────────────
  let y = nl1 + 0.5

  addSectionLabel(slide, i18n.t('output:pptx.sustainability'), BRAND.overhead, 0.4, y)
  const energyStats: StatRun[] = [
    { label: 'Total', value: `${sus.powerBreakdown.total.toFixed(0)} W`, color: BRAND.accent },
    { label: 'Drives', value: `${sus.powerBreakdown.drives.toFixed(0)} W`, color: BRAND.textMuted },
    {
      label: 'Servers',
      value: `${sus.powerBreakdown.servers.toFixed(0)} W`,
      color: BRAND.textMuted,
    },
    {
      label: 'Cooling',
      value: `${sus.powerBreakdown.cooling.toFixed(0)} W`,
      color: BRAND.textMuted,
    },
    { label: 'Energy', value: `${sus.annualEnergyKwh.toFixed(0)} kWh/yr`, color: BRAND.textWhite },
    { label: 'CO₂', value: `${sus.annualCO2Kg.toFixed(0)} kg/yr`, color: BRAND.textWhite },
  ]
  if (sus.flashEndurance) {
    energyStats.push({
      label: 'Endurance',
      value: `${sus.flashEndurance.expectedLifeYears.toFixed(1)} yr`,
      color: BRAND.capacity,
    })
  }
  addStatLine(slide, energyStats, 0.4, y + 0.33, 12.6)
  y += 0.85

  addSectionLabel(slide, i18n.t('output:pptx.bottleneck'), BRAND.parity, 0.4, y)
  const layerStats: StatRun[] = perf.layers.slice(0, 6).map((layer) => ({
    label: layer.name.replace(/\s*\(.*\)\s*$/, ''),
    value: `${layer.throughputMBs.toFixed(0)} MB/s`,
    color: layer.isBottleneck ? BRAND.parity : BRAND.textWhite,
  }))
  addStatLine(slide, layerStats, 0.4, y + 0.33, 12.6)
  y += 0.85

  // Resilience — only when the simulation has actually been run.
  if (resilience) {
    addSectionLabel(slide, i18n.t('output:pptx.resilience'), BRAND.capacity, 0.4, y)
    addStatLine(
      slide,
      [
        { label: 'Survival', value: resilience.survivalPercent, color: BRAND.capacity },
        { label: 'Durability', value: `${resilience.nines} nines`, color: BRAND.capacity },
        {
          label: 'Rebuild',
          value: `${resilience.avgRebuildTimeHours.toFixed(1)} h`,
          color: BRAND.textMuted,
        },
        { label: 'Risk', value: resilience.riskLevel.toUpperCase(), color: BRAND.overhead },
      ],
      0.4,
      y + 0.33,
      12.6,
    )
  }
}

/**
 * Generate and download a single-slide PPTX summary.
 * Runs entirely in the browser — no server request is made.
 */
export async function exportToPptx(config: ExportConfig): Promise<void> {
  // Capture the charts in parallel before building the slide.
  const [sankey, gauges] = await Promise.all([captureSankeyDiagram(), capturePerfGauges()])

  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  prs.author = 'Raidy'
  prs.subject = 'Storage Configuration'
  prs.title = config.projectName ?? 'Storage Report'

  buildSummarySlide(prs, config, { sankey, gauges })

  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `raidy-${safeLabel}.pptx` })
}
