/**
 * Chart capture utilities for PPTX/PDF export.
 * Uses html-to-image to rasterize SVG components into PNG data URLs.
 */
import { toPng } from 'html-to-image'

/**
 * Capture the Sankey diagram as a PNG data URL.
 * Returns null if the element is not mounted in the DOM (e.g. collapsed panel).
 */
export async function captureSankeyDiagram(): Promise<string | null> {
  const el = document.getElementById('sankey-diagram')
  if (!el) return null
  return toPng(el, {
    backgroundColor: '#1A1B2E',
    pixelRatio: 2,
  })
}

/**
 * Capture the performance speedometer as a PNG data URL.
 * Returns null if the element is not mounted in the DOM.
 */
export async function captureSpeedometer(): Promise<string | null> {
  const el = document.getElementById('speedometer-chart')
  if (!el) return null
  return toPng(el, {
    backgroundColor: '#1A1B2E',
    pixelRatio: 2,
  })
}

/**
 * Capture the resilience donut chart as a PNG data URL.
 * Returns null if the element is not mounted in the DOM.
 */
export async function captureDonutChart(): Promise<string | null> {
  const el = document.getElementById('donut-chart')
  if (!el) return null
  return toPng(el, {
    backgroundColor: '#1A1B2E',
    pixelRatio: 2,
  })
}
