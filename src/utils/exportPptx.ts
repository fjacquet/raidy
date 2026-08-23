/**
 * PPTX Export utility using pptxgenjs-plus.
 * Single dense executive one-pager: a crystal-clear VOLUME spec and PERFORMANCE
 * maximums on top (a large Sankey + a tight 2×2 of gauges, each with explicit
 * number lines), with energy, bottlenecks, and resilience spread underneath to
 * fill the page. Charts are captured from the DOM via html-to-image. No server
 * requests — pptxgenjs-plus runs entirely client-side.
 */
import pptxgen from 'pptxgenjs-plus'
import { performanceApplies } from '@/engines/outputRelevance'
import i18n from '@/i18n'
import { DEFAULT_LANGUAGE, type Language } from '@/i18n/config'
import type { Drive } from '@/types/drive'
import type { CalculationResults } from '@/types/results'
import type { Topology, ZfsOptions } from '@/types/topology'
import { capturePerfGauges, captureSankeyDiagram } from './captureChart'
import {
  buildPowerScaleExportContent,
  type PowerScaleExportContent,
  type PowerScaleExportTable,
} from './powerscaleExportContent'
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
  /**
   * Locale for number formatting (apostrophe thousands separator in every Swiss locale).
   * Injected rather than read from the i18n singleton so the content builders stay pure.
   */
  language?: Language
}

/** Standard slide font. */
const FONT = 'Arial'

/** Brand color palette (6-char hex, no '#', required by pptxgenjs-plus). */
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
function addAccentBar(slide: pptxgen.PresSlide, prs: pptxgen, palette: Brand): void {
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
  slide: pptxgen.PresSlide,
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
  slide: pptxgen.PresSlide,
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
  slide: pptxgen.PresSlide,
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

/**
 * Column widths in inches, in the same order as the table's own columns.
 *
 * Both sum to 11.9" and sit at x = 0.7 on the 13.33" wide layout, leaving a symmetric margin.
 * Thirteen required columns do not read on one slide at any font size a customer would accept,
 * so `buildPowerScaleExportContent` splits them into two tables of ten and nine and each gets a
 * slide of its own — no required column is dropped.
 */
const POOL_COL_W = [0.5, 2.35, 1.0, 0.7, 0.8, 1.2, 1.5, 1.6, 0.7, 1.55]
const DERIVATION_COL_W = [0.5, 1.5, 1.5, 1.5, 1.35, 1.15, 1.35, 1.5, 1.55]

/** Left edge and width of both node-pool tables, in inches. */
const TABLE_X = 0.7
const TABLE_W = 11.9

/**
 * One node-pool table on its own slide, with the cluster total as the closing row.
 *
 * `footnote` carries the document's single caveat line on the LAST slide only — the deck says it
 * once, near the end, exactly as the report does.
 */
function buildTableSlide(
  prs: pptxgen,
  palette: Brand,
  tables: { table: PowerScaleExportTable; colW: number[] }[],
  footnote: string | null,
): void {
  const slide = prs.addSlide()
  slide.background = { fill: palette.bg }
  addAccentBar(slide, prs, palette)

  // A 16:9 slide is 7.5" tall. One node pool is a three-row table, which at a fixed row height
  // floated in the top-left corner with most of the slide empty — and the deck is the artefact
  // people actually present. So the block is laid out to fill the space: rows grow for small
  // clusters, several tables can share a slide, and at the eight-pool maximum this collapses
  // back to the compact one-table-per-slide layout it started from.
  const bandTop = 0.85
  const bandBottom = footnote ? 6.85 : 7.2
  const titleH = 0.5
  const gap = 0.35
  const totalRows = tables.reduce((n, t) => n + t.table.rows.length + 2, 0)
  const chrome = tables.length * titleH + (tables.length - 1) * gap
  const rowH = Math.min(0.62, Math.max(0.26, (bandBottom - bandTop - chrome) / totalRows))
  const blockH = chrome + rowH * totalRows
  let y = bandTop + Math.max(0, (bandBottom - bandTop - blockH) / 2)

  for (const { table, colW } of tables) {
    slide.addText(table.title, {
      x: 0.4,
      y,
      w: 12.6,
      h: 0.45,
      fontSize: 18,
      bold: true,
      color: palette.textWhite,
      fontFace: FONT,
    })
    y += titleH

    const headerRow: pptxgen.TableRow = table.columns.map((label) => ({
      text: label,
      options: {
        bold: true,
        color: palette.textWhite,
        fill: { color: palette.panel },
        fontSize: 8,
      },
    }))

    const bodyRows: pptxgen.TableRow[] = table.rows.map((row) =>
      row.map((cell) => ({ text: cell, options: { color: palette.textWhite } })),
    )

    const totalRow: pptxgen.TableRow = table.totalRow.map((cell) => ({
      text: cell,
      options: { bold: true, color: palette.textWhite, fill: { color: palette.panel } },
    }))

    slide.addTable([headerRow, ...bodyRows, totalRow], {
      x: TABLE_X,
      y,
      w: TABLE_W,
      colW,
      rowH,
      fontSize: 10,
      fontFace: FONT,
      color: palette.textWhite,
      valign: 'middle',
      border: { type: 'solid', pt: 0.5, color: palette.border },
    })
    y += rowH * (bodyRows.length + 2) + gap
  }

  if (footnote) {
    slide.addText(footnote, {
      x: 0.4,
      y: 7.02,
      w: 12.6,
      h: 0.34,
      fontSize: 8,
      italic: true,
      color: palette.textMuted,
      fontFace: FONT,
    })
  }
}

/** Build the single dense executive one-pager slide. */
function buildSummarySlide(
  prs: pptxgen,
  config: ExportConfig,
  charts: { sankey: string | null; gauges: (string | null)[] },
  content: ReturnType<typeof buildPptxContent>,
  palette: Brand,
  powerScale: PowerScaleExportContent | null,
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
  // The Sankey grows into whatever the omitted sections leave behind. Without the performance
  // column and the energy row there is most of a slide free below it, and a chart floating above
  // half a blank slide reads as a rendering failure rather than as a deliberately short document.
  // Read the predicate, not the emptiness it happens to produce. `bottleneckLine` is
  // `perf.layers.slice(0, 6)`, so an empty array would otherwise mean two different things and a
  // platform whose engine returned no layers would silently lose its row.
  const showPerfChart = performanceApplies(config.topology)
  const chartH = resilience ? 2.7 : showPerfChart ? 3.2 : 4.6
  const chartBottom = chartTop + chartH

  // Wider Sankey (reads like the web); smaller gauges packed to the right.
  // With performance omitted the right-hand column is empty, so the Sankey takes the full width
  // rather than leaving half the slide blank.
  const showPerf = showPerfChart
  addSectionLabel(slide, i18n.t('output:pptx.volumetry'), palette.capacity, 0.4, 1.0)
  addChartOrFallback(
    slide,
    charts.sankey,
    { x: 0.25, y: chartTop, w: showPerf ? 7.6 : 12.75, h: chartH },
    i18n.t('output:pptx.labels.chartUnavailable'),
    palette,
  )

  if (showPerf) {
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
  }

  // ── Crystal-clear number lines beneath each chart ─────────────────────
  const nl0 = chartBottom + 0.14
  const nl1 = nl0 + 0.36
  const statW = showPerf ? 7.6 : 12.6
  addStatLine(slide, content.volumetryLines[0] ?? [], 0.4, nl0, statW, palette)
  addStatLine(slide, content.volumetryLines[1] ?? [], 0.4, nl1, statW, palette, 10)
  if (showPerf) {
    addStatLine(slide, content.performanceLines[0] ?? [], 8.0, nl0, 5.0, palette)
    addStatLine(slide, content.performanceLines[1] ?? [], 8.0, nl1, 5.0, palette)
  }

  // Scope, not caveat: a PowerScale cluster's gauges describe the FIRST node pool, while the
  // capacity beside them covers the whole cluster. Said once, in the right-hand column beside the
  // figures it qualifies — the section labels below start at x 0.4 and stop at 6.4, so this sits
  // in empty space and does not shift the rows underneath.
  if (powerScale?.scopeNote && (showPerf || content.resilienceLine)) {
    slide.addText(powerScale.scopeNote, {
      x: 8.0,
      y: nl1 + 0.34,
      w: 5.0,
      h: 0.34,
      fontSize: 7,
      italic: true,
      color: palette.textMuted,
      fontFace: FONT,
    })
  }

  // ── Extras spread to fill the page ────────────────────────────────────
  let y = nl1 + 0.5

  // Power/CO2 omitted where the vendor publishes none — see `sustainabilityApplies`. The gap is
  // closed rather than left blank: the blocks below simply start higher.
  if (content.energyLine) {
    addSectionLabel(slide, i18n.t('output:pptx.sustainability'), palette.overhead, 0.4, y)
    addStatLine(slide, content.energyLine, 0.4, y + 0.33, 12.6, palette)
    y += 0.85
  }

  if (showPerfChart) {
    addSectionLabel(slide, i18n.t('output:pptx.bottleneck'), palette.parity, 0.4, y)
    addStatLine(slide, content.bottleneckLine, 0.4, y + 0.33, 12.6, palette)
    y += 0.85
  }

  // Resilience — only when the simulation has actually been run.
  if (content.resilienceLine) {
    addSectionLabel(slide, i18n.t('output:pptx.resilience'), palette.capacity, 0.4, y)
    addStatLine(slide, content.resilienceLine, 0.4, y + 0.33, 12.6, palette)
  }

  // Positioning footnote — pinned to the bottom of the 7.5" slide rather than following `y`, so
  // it cannot be pushed off the page by a resilience row. This deck goes to a customer: it says
  // the vendor's sizer remains the reference and which figures here are estimates.
  if (content.estimateNote) {
    slide.addText(content.estimateNote, {
      x: 0.4,
      y: 7.02,
      w: 12.6,
      h: 0.34,
      fontSize: 8,
      italic: true,
      color: palette.textMuted,
      fontFace: FONT,
    })
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
  // Gauges are captured only where the deck will place them — otherwise four DOM captures per
  // export are taken and discarded. See `performanceApplies`.
  const [sankey, gauges] = await Promise.all([
    captureSankeyDiagram(),
    performanceApplies(config.topology) ? capturePerfGauges() : Promise.resolve([]),
  ])

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

  // PowerScale takes a dedicated path: a cluster is 1-8 heterogeneous node pools, so "one drive
  // model × a count" is the wrong shape for the document, not merely the wrong label on a line.
  const powerScale =
    config.topology.type === 'powerscale'
      ? buildPowerScaleExportContent(config.results.volumetry.powerScaleDetails, {
          t: i18n.t,
          language: config.language ?? DEFAULT_LANGUAGE,
          unitSystem: config.unitSystem ?? 'binary',
          topology: config.topology,
        })
      : null

  // The caveat line moves to the last slide when there are more slides after this one, so the
  // deck still says it exactly once, near the end.
  buildSummarySlide(
    prs,
    config,
    { sankey, gauges },
    powerScale ? { ...content, estimateNote: null } : content,
    palette,
    powerScale,
  )

  if (powerScale) {
    // Few pools: both tables share one slide, which fills it and keeps the deck short. Beyond
    // that they need a slide each to stay legible.
    const pool = { table: powerScale.poolTable, colW: POOL_COL_W }
    const derivation = { table: powerScale.derivationTable, colW: DERIVATION_COL_W }
    if (powerScale.poolTable.rows.length <= 4) {
      buildTableSlide(prs, palette, [pool, derivation], powerScale.estimateNote)
    } else {
      buildTableSlide(prs, palette, [pool], null)
      buildTableSlide(prs, palette, [derivation], powerScale.estimateNote)
    }
  }

  // Named after the project, like the PDF's `<Project>_Report.pdf`. Today that is the only
  // benefit: `projectName` is a hardcoded literal at both call sites in `OutputDashboard`, so
  // every deck still downloads under one name and the browser still disambiguates repeats with
  // "(1)". The distinguishing part only starts working once a project-name input exists — the
  // shape is here waiting for it, which is why the platform is kept in the name too.
  const safeProject = (config.projectName || 'Storage Configuration')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `${safeProject || 'Storage_Configuration'}_${safeLabel}.pptx` })
}
