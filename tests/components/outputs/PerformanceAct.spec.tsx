import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { PerformanceAct } from '@/components/outputs'
import type { PerformanceResult } from '@/types/results'

beforeAll(() => {
  // jsdom does not implement matchMedia; PerformanceAct's useIsMobile hook needs it.
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

const performance: PerformanceResult = {
  maxReadThroughputMBs: 1200,
  maxWriteThroughputMBs: 800,
  sustainedWriteThroughputMBs: 800,
  maxReadIOPS: 500000,
  maxWriteIOPS: 300000,
  sustainedWriteIOPS: 300000,
  mediaCeilingMBs: 0,
  mediaCeilingIOPS: 0,
  layers: [
    { name: 'Media', throughputMBs: 1200, iops: 500000, isBottleneck: true, utilization: 100 },
  ],
  bottleneck: { kind: 'layer' as const, layerName: 'Media (Drives)', throughputMBs: 1000 },
}

describe('PerformanceAct', () => {
  /**
   * The bottleneck sentence is composed at render since #139 — the engine reports the layer, the
   * component writes the prose through i18n. This asserts the layer name survives into the
   * output, which is the part that carries information; the surrounding wording belongs to the
   * locale files and is covered by the i18n parity and orphan-key tests.
   *
   * It replaces an assertion on the literal `'Media bound'`, which only ever matched because the
   * fixture put that exact English string in the field the component printed verbatim.
   */
  it('renders the bottleneck layer in the composed sentence', () => {
    render(<PerformanceAct performance={performance} />)
    expect(screen.getByText(/Media \(Drives\)/)).toBeInTheDocument()
  })
})
