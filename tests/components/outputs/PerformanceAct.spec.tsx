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
  layers: [
    { name: 'Media', throughputMBs: 1200, iops: 500000, isBottleneck: true, utilization: 100 },
  ],
  bottleneckDescription: 'Media bound',
}

describe('PerformanceAct', () => {
  it('renders performance heading and bottleneck description', () => {
    render(<PerformanceAct performance={performance} />)
    expect(screen.getByText('Media bound')).toBeInTheDocument()
  })
})
