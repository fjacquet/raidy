/**
 * The Advanced panel for PowerScale.
 *
 * Two of its inputs go, and two stay, on the same rule: an input stays visible when it moves a
 * number the dashboard still shows.
 *
 * - PUE stays: `coolingPower = itLoad x (pue - 1)`, and cooling is on the Cost act.
 * - The performance threshold stays: it draws the operational-capacity marker.
 * - `backupRetention` and `dailyChangeRate` go — and the backup card goes with them, asserted in
 *   tests/engines/outputRelevance.spec.ts. Hiding the inputs alone would leave a live figure
 *   computed from values the user cannot see, which is the defect this branch has fixed twice.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AdvancedPanel } from '@/components/inputs/AdvancedPanel'
import { useConfigStore } from '@/store'

describe('AdvancedPanel (PowerScale)', () => {
  beforeEach(() => {
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
    useConfigStore.getState().resetToDefaults()
  })

  it('hides the two backup inputs', () => {
    useConfigStore.getState().setTopology({ type: 'powerscale', level: 'powerscale_onefs' })
    render(<AdvancedPanel />)

    expect(screen.queryByLabelText(/Backup Retention/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Daily Change Rate/i)).not.toBeInTheDocument()
  })

  it('keeps PUE and the performance threshold, which still move shown figures', () => {
    useConfigStore.getState().setTopology({ type: 'powerscale', level: 'powerscale_onefs' })
    render(<AdvancedPanel />)

    expect(screen.getByLabelText(/PUE/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Performance Threshold/i)).toBeInTheDocument()
  })

  /**
   * PowerScale hides the filesystem selector too (`honoursFsType: false`), so the whole
   * "Filesystem & Backup" block would otherwise render as an empty titled section.
   */
  it('drops the Filesystem & Backup heading when it would have no controls left', () => {
    useConfigStore.getState().setTopology({ type: 'powerscale', level: 'powerscale_onefs' })
    render(<AdvancedPanel />)
    expect(screen.queryByText(/Filesystem & Backup/i)).not.toBeInTheDocument()
  })

  it('leaves a non-PowerScale platform untouched', () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<AdvancedPanel />)

    expect(screen.getByLabelText(/Backup Retention/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Daily Change Rate/i)).toBeInTheDocument()
    expect(screen.getByText(/Filesystem & Backup/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/PUE/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Performance Threshold/i)).toBeInTheDocument()
  })
})
