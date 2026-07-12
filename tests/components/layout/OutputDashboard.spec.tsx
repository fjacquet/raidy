/**
 * OutputDashboard composition smoke test.
 *
 * Verifies the presales guided-narrative layout (Approach B): the headline band
 * KPI strip renders above the narrative acts, and the Capacity/Performance/
 * Resilience acts render with their real headings for the default RAID config.
 * Uses the real store (useConfigStore) and real hooks — no store mocking.
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { OutputDashboard } from '@/components/layout/OutputDashboard'

beforeAll(() => {
  // jsdom does not implement ResizeObserver; SankeyDiagram (desktop branch of
  // CapacityAct) needs it.
  window.ResizeObserver =
    window.ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
})

// jsdom does not implement matchMedia; the acts' responsive hooks (useIsDesktop /
// useIsMobile), used by OutputDashboard and CapacityAct/PerformanceAct, need it.
function mockMatchMedia(isDesktop: boolean) {
  window.matchMedia = (query: string) => ({
    matches: query.includes('min-width') ? isDesktop : !isDesktop,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

describe('OutputDashboard', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it('renders the headline band KPI strip above the narrative acts', () => {
    render(<OutputDashboard />)

    // Headline band: KPI label and "run survival" CTA (no resilience result yet).
    expect(screen.getByText(/^peak iops$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run survival/i })).toBeInTheDocument()

    // Narrative acts: real section headings for the default RAID topology.
    expect(screen.getByRole('heading', { name: /capacity overview/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^performance$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /data resilience/i })).toBeInTheDocument()
  })
})
