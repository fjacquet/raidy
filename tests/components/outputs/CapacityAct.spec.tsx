import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CapacityAct } from '@/components/outputs'
import type { VolumetryResult } from '@/types/results'

beforeAll(() => {
  // jsdom does not implement ResizeObserver; SankeyDiagram (desktop branch) needs it.
  window.ResizeObserver =
    window.ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
})

// jsdom does not implement matchMedia; CapacityAct's responsive hooks (useIsDesktop /
// useIsMobile) need it. Make the mock query-aware so tests can drive isDesktop true or
// false: useIsDesktop() queries '(min-width: …)', useIsMobile() queries '(max-width: …)'.
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

const volumetry: VolumetryResult = {
  rawCapacity: 1e12,
  parityOverhead: 1e11,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 9e11,
  effectiveCapacity: 9e11,
  efficiency: 90,
  breakdown: [{ label: 'Usable', bytes: 9e11, percent: 90, color: '#3b82f6' }],
}

describe('CapacityAct', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it('renders the capacity heading and usable metric', () => {
    render(
      <CapacityAct
        volumetry={volumetry}
        backup={undefined}
        topology={{ type: 'standard', level: 'RAID5' }}
        operationalLimit={null}
        performanceThreshold={1}
      />,
    )
    expect(screen.getByRole('heading', { name: /capacity overview/i })).toBeInTheDocument()
    expect(screen.getAllByText(/usable capacity/i).length).toBeGreaterThan(0)
  })

  it('renders the mobile breakdown list when isDesktop is false', () => {
    mockMatchMedia(false)
    render(
      <CapacityAct
        volumetry={volumetry}
        backup={undefined}
        topology={{ type: 'standard', level: 'RAID5' }}
        operationalLimit={null}
        performanceThreshold={1}
      />,
    )
    // CapacityBreakdownList is the mobile-only branch, identified by its unique aria-label.
    expect(screen.getByLabelText('Capacity breakdown')).toBeInTheDocument()
  })

  it('renders the desktop Sankey + MetricCard grid when isDesktop is true', () => {
    mockMatchMedia(true)
    render(
      <CapacityAct
        volumetry={volumetry}
        backup={undefined}
        topology={{ type: 'standard', level: 'RAID5' }}
        operationalLimit={null}
        performanceThreshold={1}
      />,
    )
    // "Raw Capacity" is the MetricCard label rendered only in the desktop grid
    // (CapacityAct.tsx renders it inside `isDesktop ? … : …`); it never appears in the
    // mobile CapacityBreakdownList branch, so this assertion regresses if the desktop
    // branch stops rendering.
    expect(screen.getAllByText(/raw capacity/i).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Capacity breakdown')).not.toBeInTheDocument()
  })
})
