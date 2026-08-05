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
import { buildPptxContent, type PptxStat } from './pptxContent'
import type { UnitSystem } from './units'

export interface ExportConfig {
  drive: Drive
  driveCount: number
  /**
   * Effective server/node count (post `effectiveServerCount` clamp — see
   * src/engines/capabilities.ts) — omit or pass 1 for single-node platforms
   * so the exported subtitle doesn't show a stale multi-node count.
   */
  serverCount?: number
  topology: Topology
  zfsOptions?: ZfsOptions
  results: CalculationResults
  projectName?: string
  unitSystem?: UnitSystem
}

/** Standard slide font. */
const FONT = 'Arial'

/** Brand color palette (6-char hex, no '#', required by pptxgenjs). */
const BRAND = {
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

type Brand = Record<keyof typeof BRAND, string>

/** Light-theme palette — white paper + ink text. Accent/semantic colors are
 * shared (they read on both). Selected at export time to match the app theme. */
const BRAND_LIGHT: Brand = {
  ...BRAND,
  bg: 'FFFFFF',
  panel: 'F1F5F9',
  border: 'E2E8F0',
  textWhite: '0F172A', // ink — primary text on light
  textMuted: '475569', // slate-600
}

/** Map a PptxStat semantic role to the active brand color. */
function roleColor(role: PptxStat['role'], palette: Brand): string {
  switch (role) {
    case 'accent':
      return palette.accent
    case 'capacity':
      return palette.capacity
    case 'overhead':
      return palette.overhead
    case 'parity':
      return palette.parity
    case 'muted':
      return palette.textMuted
    default:
      return palette.textWhite
  }
}

/** Add the thin accent bar at the top of the slide. */
function addAccentBar(slide: pptxgen.Slide, prs: pptxgen, palette: Brand): void {
  slide.addShape(prs.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.08,
    fill: { color: palette.accent },
    line: { color: palette.accent },
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
  palette: Brand,
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
      color: palette.textMuted,
      italic: true,
      fontFace: FONT,
      align: 'center',
    })
  }
}

/** A dense "label value · label value" stat line built from text runs. */
function addStatLine(
  slide: pptxgen.Slide,
  stats: PptxStat[],
  x: number,
  y: number,
  w: number,
  palette: Brand,
  fontSize = 11,
): void {
  const runs: pptxgen.TextProps[] = []
  stats.forEach((stat, i) => {
    if (i > 0) {
      runs.push({ text: '   ·   ', options: { color: palette.border, fontFace: FONT, fontSize } })
    }
    runs.push({
      text: `${stat.label} `,
      options: { color: palette.textMuted, fontFace: FONT, fontSize },
    })
    runs.push({
      text: stat.value,
      options: { color: roleColor(stat.role, palette), bold: true, fontFace: FONT, fontSize },
    })
  })
  slide.addText(runs, { x, y, w, h: 0.34, valign: 'middle', fontFace: FONT })
}

/** Build the single dense executive one-pager slide. */
function buildSummarySlide(
  prs: pptxgen,
  config: ExportConfig,
  charts: { sankey: string | null; gauges: (string | null)[] },
  content: ReturnType<typeof buildPptxContent>,
  palette: Brand,
): void {
  const slide = prs.addSlide()
  slide.background = { fill: palette.bg }
  addAccentBar(slide, prs, palette)

  const { resilience } = config.results

  // ── Header ────────────────────────────────────────────────────────────
  slide.addText(content.title, {
    x: 0.4,
    y: 0.12,
    w: 12.6,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: palette.textWhite,
    fontFace: FONT,
  })

  slide.addText(content.subtitle, {
    x: 0.4,
    y: 0.66,
    w: 12.6,
    h: 0.28,
    fontSize: 11,
    color: palette.textMuted,
    fontFace: FONT,
  })

  // ── Top charts: large Sankey (left) + tight 2×2 gauges (right) ────────
  // Shorter charts when resilience is shown, to leave room for its row.
  const chartTop = 1.4
  const chartH = resilience ? 2.7 : 3.2
  const chartBottom = chartTop + chartH

  // Wider Sankey (reads like the web); smaller gauges packed to the right.
  addSectionLabel(slide, i18n.t('output:pptx.volumetry'), palette.capacity, 0.4, 1.0)
  addChartOrFallback(
    slide,
    charts.sankey,
    { x: 0.25, y: chartTop, w: 7.6, h: chartH },
    i18n.t('output:pptx.labels.chartUnavailable'),
    palette,
  )

  addSectionLabel(slide, i18n.t('output:pptx.performance'), palette.accent, 8.0, 1.0)
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
      palette,
    )
  })

  // ── Crystal-clear number lines beneath each chart ─────────────────────
  const nl0 = chartBottom + 0.14
  const nl1 = nl0 + 0.36
  addStatLine(slide, content.volumetryLines[0] ?? [], 0.4, nl0, 7.6, palette)
  addStatLine(slide, content.volumetryLines[1] ?? [], 0.4, nl1, 7.6, palette, 10)
  addStatLine(slide, content.performanceLines[0] ?? [], 8.0, nl0, 5.0, palette)
  addStatLine(slide, content.performanceLines[1] ?? [], 8.0, nl1, 5.0, palette)

  // ── Extras spread to fill the page ────────────────────────────────────
  let y = nl1 + 0.5

  addSectionLabel(slide, i18n.t('output:pptx.sustainability'), palette.overhead, 0.4, y)
  addStatLine(slide, content.energyLine, 0.4, y + 0.33, 12.6, palette)
  y += 0.85

  addSectionLabel(slide, i18n.t('output:pptx.bottleneck'), palette.parity, 0.4, y)
  addStatLine(slide, content.bottleneckLine, 0.4, y + 0.33, 12.6, palette)
  y += 0.85

  // Resilience — only when the simulation has actually been run.
  if (content.resilienceLine) {
    addSectionLabel(slide, i18n.t('output:pptx.resilience'), palette.capacity, 0.4, y)
    addStatLine(slide, content.resilienceLine, 0.4, y + 0.33, 12.6, palette)
  }
}

/**
 * Generate and download a single-slide PPTX summary.
 * Runs entirely in the browser — no server request is made.
 */
export async function exportToPptx(config: ExportConfig): Promise<void> {
  // Follow the app theme: light deck for light mode, dark deck for dark.
  const palette: Brand = document.documentElement.classList.contains('dark') ? BRAND : BRAND_LIGHT

  // Capture the charts in parallel before building the slide.
  const [sankey, gauges] = await Promise.all([captureSankeyDiagram(), capturePerfGauges()])

  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  prs.author = 'Raidy'
  prs.subject = 'Storage Configuration'
  prs.title = config.projectName ?? 'Storage Report'

  const dateLabel = new Date().toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const content = buildPptxContent(config, i18n.t, dateLabel)
  buildSummarySlide(prs, config, { sankey, gauges }, content, palette)

  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `raidy-${safeLabel}.pptx` })
}
