import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { CapacityAct } from '@/components/outputs'
import type { VolumetryResult } from '@/types/results'

beforeAll(() => {
  // jsdom does not implement matchMedia; CapacityAct's responsive hooks need it.
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
})

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
})
