import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ResilienceAct } from '@/components/outputs'

beforeAll(() => {
  // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
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

describe('ResilienceAct', () => {
  it('renders the run affordance when no result yet', () => {
    render(
      <ResilienceAct
        result={null}
        progress={{ completed: 0, total: 0, percent: 0, isRunning: false }}
        isRunning={false}
        runSimulation={vi.fn()}
        isMobile={false}
      />,
    )
    expect(screen.getByRole('button', { name: /run simulation/i })).toBeInTheDocument()
  })
})
