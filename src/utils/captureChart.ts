/**
 * Chart capture utilities for PPTX/PDF export.
 * Uses html-to-image to rasterize SVG components into PNG data URLs.
 */
import { toPng } from 'html-to-image'

/** Capture background matches the active theme so exports aren't dark-on-light. */
function captureBackground(): string {
  return document.documentElement.classList.contains('dark') ? '#1A1B2E' : '#ffffff'
}

/** Rasterize a DOM element (by id) to a PNG data URL, or null if not mounted. */
async function captureById(id: string): Promise<string | null> {
  const el = document.getElementById(id)
  if (!el) return null
  return toPng(el, { backgroundColor: captureBackground(), pixelRatio: 2 })
}

/**
 * Capture the Sankey diagram as a PNG data URL.
 * Returns null if the element is not mounted in the DOM (e.g. collapsed panel).
 */
export function captureSankeyDiagram(): Promise<string | null> {
  return captureById('sankey-diagram')
}

/** Ids of the four performance gauges, in display order (R/W MB/s, R/W IOPS). */
export const GAUGE_IDS = [
  'gauge-read-mbps',
  'gauge-write-mbps',
  'gauge-read-iops',
  'gauge-write-iops',
] as const

/**
 * Capture the four performance gauges individually so they can be laid out in a
 * tight grid in the export (the dashboard's responsive grid spreads them apart).
 * Returns one data URL (or null) per gauge, in GAUGE_IDS order.
 */
export function capturePerfGauges(): Promise<(string | null)[]> {
  return Promise.all(GAUGE_IDS.map(captureById))
}
