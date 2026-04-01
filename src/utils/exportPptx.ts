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

import { captureSankeyDiagram } from './captureChart'
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

/** Build the capacity summary slide (Slide 2) with embedded Sankey PNG. */
async function buildCapacitySlide(
  prs: pptxgen,
  config: ExportConfig,
  sankeyDataUrl: string | null,
): Promise<void> {
  const slide = prs.addSlide()
  slide.background = { fill: BRAND.bg }
  addAccentBar(slide, prs)

  // Slide heading
  slide.addText('Capacity Summary', {
    x: 0.4,
    y: 0.2,
    w: 12.5,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: BRAND.textWhite,
    fontFace: 'Calibri',
  })

  // Key numbers (left column)
  const vol = config.results.volumetry
  const driveCapacityTB = bytesToTB(config.drive.capacity_raw)
  const rows: Array<{ label: string; value: string; color: string }> = [
    {
      label: 'Raw Capacity',
      value: `${bytesToTB(vol.rawCapacity).toFixed(1)} TB`,
      color: BRAND.textMuted,
    },
    {
      label: 'Usable Capacity',
      value: `${bytesToTB(vol.usableCapacity).toFixed(1)} TB`,
      color: BRAND.capacity,
    },
    {
      label: 'Effective Capacity',
      value: `${bytesToTB(vol.effectiveCapacity).toFixed(1)} TB`,
      color: BRAND.accent,
    },
    {
      label: 'Drives',
      value: `${config.driveCount} × ${driveCapacityTB.toFixed(1)} TB`,
      color: BRAND.textMuted,
    },
  ]

  rows.forEach((row, i) => {
    const y = 1.0 + i * 1.1
    slide.addText(row.label, {
      x: 0.4,
      y,
      w: 3.5,
      h: 0.4,
      fontSize: 13,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
    })
    slide.addText(row.value, {
      x: 0.4,
      y: y + 0.4,
      w: 3.5,
      h: 0.55,
      fontSize: 20,
      bold: true,
      color: row.color,
      fontFace: 'Calibri',
    })
  })

  // Sankey image (right column)
  if (sankeyDataUrl) {
    slide.addImage({
      data: sankeyDataUrl,
      x: 4.2,
      y: 0.8,
      w: 8.7,
      h: 6.3,
    })
  } else {
    slide.addText('Chart not available', {
      x: 4.2,
      y: 3,
      w: 8.7,
      h: 0.5,
      fontSize: 14,
      color: BRAND.textMuted,
      fontFace: 'Calibri',
      align: 'center',
    })
  }
}

/**
 * Generate and download a PPTX presentation.
 * Runs entirely in the browser — no server request is made.
 */
export async function exportToPptx(config: ExportConfig): Promise<void> {
  // Capture chart before building slides (DOM must be mounted)
  const sankeyDataUrl = await captureSankeyDiagram()

  const prs = new pptxgen()
  prs.layout = 'LAYOUT_WIDE' // 13.33" × 7.5"
  prs.author = 'Raidy'
  prs.subject = 'Storage Configuration'
  prs.title = config.projectName ?? 'Storage Report'

  buildTitleSlide(prs, config)
  await buildCapacitySlide(prs, config, sankeyDataUrl)

  const safeLabel = (config.topology.type ?? 'storage').replace(/[^a-z0-9]/gi, '-')
  await prs.writeFile({ fileName: `raidy-${safeLabel}.pptx` })
}
