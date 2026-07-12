import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { CostAct } from '@/components/outputs'
import type { SustainabilityResult } from '@/types/results'

beforeAll(() => {
  // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
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

const sustainability: SustainabilityResult = {
  annualEnergyKwh: 5000,
  annualEnergyCost: 1000,
  annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 },
}

describe('CostAct', () => {
  it('renders total power figure', () => {
    render(<CostAct sustainability={sustainability} />)
    expect(screen.getByText('180')).toBeInTheDocument()
  })
})
