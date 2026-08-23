/**
 * PowerScale's Hardware panel: a media proxy line, not a drive configurator.
 *
 * A PowerScale cluster is not configured by picking a SATA drive — its populations, capacities
 * and efficiencies come from the vendor node catalog (ADR-0014), so the connectivity filter,
 * form-factor filter and drive-model dropdown read as nonsense next to it.
 *
 * But the catalog publishes no power, no reliability and no price, so the selected drive is
 * still read for real by sustainability, TCO, performance and resilience. Hiding the picker
 * outright would freeze those live outputs on an invisible value — the exact defect this branch
 * has already had to fix twice. So the picker is collapsed behind a labelled disclosure and
 * stays reachable. These tests hold both halves of that: hidden by default, and still there.
 *
 * The line itself is one matter-of-fact sentence. The caveat about which figures are estimates
 * is spent once, in the exports (tests/utils/exportNotes.spec.ts) — not stacked here.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { HardwarePanel } from '@/components/inputs/HardwarePanel'
import { useConfigStore } from '@/store'

/** A drive whose model name is unmistakable in the rendered proxy line. */
const DRIVE_ID = 'ent-nvme-pcie4-6400gb-u3-mu'

function selectPowerScale(): void {
  const store = useConfigStore.getState()
  store.setTopology({ type: 'powerscale', level: 'powerscale_onefs' })
  store.setDriveId(DRIVE_ID)
  useConfigStore.setState({
    powerscaleOptions: {
      tiers: [
        {
          nodeModel: 'F210',
          driveSizeTb: 1.92,
          nodeCount: 3,
          protection: '+2d:1n',
          vhsDriveCount: 0,
          vhsPercent: 0,
        },
      ],
    },
  })
}

describe('HardwarePanel media proxy (PowerScale)', () => {
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

  it('collapses the picker to one proxy line naming the selected medium', () => {
    selectPowerScale()
    render(<HardwarePanel />)

    // The proxy line names the medium and says what it stands in for, in one sentence.
    expect(
      screen.getByText(/Reference medium:.*used for power, reliability and price/i),
    ).toBeInTheDocument()

    // The three drive-shopping controls are gone.
    expect(screen.queryByLabelText(/Drive Model/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Form Factor/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Drive Connectivity')).not.toBeInTheDocument()
  })

  /** The panel is not the place for the export's caveat — one line, no stacked disclaimer. */
  it('does not stack a second explanatory sentence on the proxy line', () => {
    selectPowerScale()
    render(<HardwarePanel />)
    expect(screen.queryByText(/PowerSizer/i)).not.toBeInTheDocument()
  })

  it('keeps the picker reachable through the disclosure', async () => {
    const user = userEvent.setup()
    selectPowerScale()
    render(<HardwarePanel />)

    await user.click(screen.getByRole('button', { name: /Change reference medium/i }))

    // Every control the collapsed line replaced is back, and steerable.
    expect(screen.getByLabelText(/Drive Model/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Form Factor/i)).toBeInTheDocument()
    expect(screen.getByText('Drive Connectivity')).toBeInTheDocument()
  })

  /**
   * `serverPowerWatts` is multiplied by the cluster's node count in the sustainability engine
   * (11 nodes really is x11), so the label must not read as a whole-cluster figure.
   */
  it('keeps the server-power input, relabelled per node', () => {
    selectPowerScale()
    render(<HardwarePanel />)
    expect(screen.getByLabelText(/Node Power \(W\)/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Server Power \(W\)/i)).not.toBeInTheDocument()
  })

  it('still says where the drive count comes from', () => {
    selectPowerScale()
    render(<HardwarePanel />)
    expect(screen.getByText(/Drive count comes from the node pools/i)).toBeInTheDocument()
  })

  /** The branch is PowerScale-only: every other platform keeps the panel it had. */
  it('leaves a non-PowerScale platform untouched', () => {
    const store = useConfigStore.getState()
    store.setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    store.setDriveId(DRIVE_ID)
    render(<HardwarePanel />)

    expect(screen.getByLabelText(/Drive Model/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Form Factor/i)).toBeInTheDocument()
    expect(screen.getByText('Drive Connectivity')).toBeInTheDocument()
    expect(screen.getByLabelText(/Server Power \(W\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/Reference medium:/i)).not.toBeInTheDocument()
  })
})
