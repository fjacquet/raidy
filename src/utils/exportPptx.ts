/**
 * PPTX Export utility using pptxgenjs.
 * Generates a single dense executive one-pager that mirrors the dashboard:
 * Sankey + performance gauges on top; power, backup, bottleneck, and the
 * resilience donut across the bottom. Charts are captured from the DOM via
 * html-to-image. No server requests — pptxgenjs runs entirely client-side.
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
  w = 3.0,
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
      fontSize: 11,
      color: BRAND.textMuted,
      italic: true,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/** A compact single-line "label  value" row for the bottom data columns. */
function addRow(
  slide: pptxgen.Slide,
  label: string,
  value: string,
  color: string,
  x: number,
  y: number,
  colW: number,
): void {
  const labelW = colW * 0.56
  slide.addText(label, {
    x,
    y,
    w: labelW,
    h: 0.32,
    fontSize: 9.5,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
    valign: 'middle',
  })
  slide.addText(value, {
    x: x + labelW,
    y,
    w: colW - labelW,
    h: 0.32,
    fontSize: 10.5,
    bold: true,
    color,
    fontFace: 'Calibri',
    valign: 'middle',
  })
}

/** Build the single dense executive one-pager slide. */
function buildSummarySlide(
  prs: pptxgen,
  config: ExportConfig,
  charts: { sankey: string | null; speedometer: string | null; donut: string | null },
): void {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)

  const { volumetry: vol, performance: perf, resilience, sustainability: sus } = config.results
  const backup = config.results.backup

  // ── Header (topology + drive + counts + headline capacity numbers) ────
  const topologyLabel = config.topology.type.toUpperCase()
  const levelLabel = 'level' in config.topology ? ` ${config.topology.level}` : ''
  slide.addText(`${topologyLabel}${levelLabel}`, {
    x: 0.4,
    y: 0.14,
    w: 9.0,
    h: 0.48,
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
    `${bytesToTB(vol.usableCapacity).toFixed(1)} TB usable`,
    `${vol.efficiency.toFixed(1)}% efficiency`,
  ].filter(Boolean)
  slide.addText(subParts.join('  ·  '), {
    x: 0.4,
    y: 0.64,
    w: 12.6,
    h: 0.28,
    fontSize: 10.5,
    color: BRAND.textMuted,
    fontFace: 'Calibri',
  })

  // ── Top row: Sankey (capacity) + performance gauges ───────────────────
  addSectionLabel(slide, i18n.t('output:pptx.volumetry'), BRAND.capacity, 0.35, 0.98)
  addChartOrFallback(
    slide,
    charts.sankey,
    { x: 0.35, y: 1.28, w: 6.6, h: 2.6 },
    'Capacity chart unavailable',
  )

  addSectionLabel(slide, i18n.t('output:pptx.performance'), BRAND.accent, 7.1, 0.98)
  addChartOrFallback(
    slide,
    charts.speedometer,
    { x: 7.1, y: 1.28, w: 5.9, h: 2.6 },
    'Performance chart unavailable',
  )

  // ── Bottom row: four data columns ─────────────────────────────────────
  const colW = 3.0
  const cols: [number, number, number, number] = [0.35, 3.55, 6.7, 9.9]
  const labelY = 4.15
  const rowStart = 4.55
  const pitch = 0.4
  const rowY = (i: number): number => rowStart + i * pitch

  // Col 1 — Sustainability (energy + power breakdown)
  addSectionLabel(
    slide,
    i18n.t('output:pptx.sustainability'),
    BRAND.overhead,
    cols[0],
    labelY,
    colW,
  )
  addRow(
    slide,
    'Total Power',
    `${sus.powerBreakdown.total.toFixed(0)} W`,
    BRAND.accent,
    cols[0],
    rowY(0),
    colW,
  )
  addRow(
    slide,
    'Annual Energy',
    `${sus.annualEnergyKwh.toFixed(0)} kWh`,
    BRAND.textWhite,
    cols[0],
    rowY(1),
    colW,
  )
  addRow(
    slide,
    'Annual CO₂',
    `${sus.annualCO2Kg.toFixed(0)} kg`,
    BRAND.textWhite,
    cols[0],
    rowY(2),
    colW,
  )
  addRow(
    slide,
    'Drives',
    `${sus.powerBreakdown.drives.toFixed(0)} W`,
    BRAND.textMuted,
    cols[0],
    rowY(3),
    colW,
  )
  addRow(
    slide,
    'Servers',
    `${sus.powerBreakdown.servers.toFixed(0)} W`,
    BRAND.textMuted,
    cols[0],
    rowY(4),
    colW,
  )
  addRow(
    slide,
    'Cooling',
    `${sus.powerBreakdown.cooling.toFixed(0)} W`,
    BRAND.textMuted,
    cols[0],
    rowY(5),
    colW,
  )
  if (sus.flashEndurance) {
    addRow(
      slide,
      'Endurance',
      `${sus.flashEndurance.expectedLifeYears.toFixed(1)} yr`,
      BRAND.capacity,
      cols[0],
      rowY(6),
      colW,
    )
  }

  // Col 2 — Backup
  addSectionLabel(slide, i18n.t('output:pptx.backup'), BRAND.accent, cols[1], labelY, colW)
  if (backup) {
    addRow(
      slide,
      'Total Backup',
      `${bytesToTB(backup.totalRaw).toFixed(1)} TB`,
      BRAND.accent,
      cols[1],
      rowY(0),
      colW,
    )
    addRow(
      slide,
      'Daily Change',
      `${bytesToTB(backup.dailyChange).toFixed(1)} TB`,
      BRAND.textWhite,
      cols[1],
      rowY(1),
      colW,
    )
    addRow(
      slide,
      'Incremental',
      `${bytesToTB(backup.incrementalRaw).toFixed(1)} TB`,
      BRAND.textWhite,
      cols[1],
      rowY(2),
      colW,
    )
    addRow(
      slide,
      'Retention',
      `${backup.retentionDays} days`,
      BRAND.textMuted,
      cols[1],
      rowY(3),
      colW,
    )
    addRow(
      slide,
      'Change Rate',
      `${backup.changeRatePercent}%`,
      BRAND.textMuted,
      cols[1],
      rowY(4),
      colW,
    )
  } else {
    addRow(slide, 'Backup', 'Not configured', BRAND.textMuted, cols[1], rowY(0), colW)
  }

  // Col 3 — Bottleneck chain (Media → Controller → PCIe → Network)
  addSectionLabel(slide, i18n.t('output:pptx.bottleneck'), BRAND.parity, cols[2], labelY, colW)
  perf.layers.slice(0, 7).forEach((layer, i) => {
    const name = layer.name.replace(/\s*\(.*\)\s*$/, '') // drop parenthetical detail
    addRow(
      slide,
      layer.isBottleneck ? `▶ ${name}` : name,
      `${layer.throughputMBs.toFixed(0)} MB/s`,
      layer.isBottleneck ? BRAND.parity : BRAND.textMuted,
      cols[2],
      rowY(i),
      colW,
    )
  })

  // Col 4 — Resilience donut (or text fallback)
  addSectionLabel(
    slide,
    i18n.t('output:pptx.resilience'),
    BRAND.capacity,
    cols[3],
    labelY,
    colW + 0.3,
  )
  if (charts.donut) {
    addChartOrFallback(slide, charts.donut, { x: cols[3], y: 4.5, w: 3.3, h: 2.5 }, '')
  } else if (resilience) {
    addRow(slide, 'Survival', resilience.survivalPercent, BRAND.capacity, cols[3], rowY(0), colW)
    addRow(slide, 'Durability', `${resilience.nines} nines`, BRAND.capacity, cols[3], rowY(1), colW)
    addRow(
      slide,
      'Risk',
      resilience.riskLevel.toUpperCase(),
      BRAND.overhead,
      cols[3],
      rowY(2),
      colW,
    )
  } else {
    slide.addText('Simulation not run', {
      x: cols[3],
      y: rowY(0),
      w: colW + 0.3,
      h: 0.32,
      fontSize: 10,
      italic: true,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
    })
  }
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
