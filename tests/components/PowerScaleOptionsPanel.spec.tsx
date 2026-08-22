/**
 * The PowerScale panel is the only place a user can build a node pool, and the vendor catalog
 * is the only authority on which pools exist. Every test here is about that boundary: the panel
 * must never let the store hold a (model, drive size, node count, protection) tuple Dell's
 * PowerSizer export does not publish, because `sizeTier` answers `null` for such a tuple and the
 * whole dashboard silently degrades to zero.
 *
 * The real `@/i18n` bundle is initialized rather than mocking `t` to the identity function (the
 * pattern in WorkloadPanel.spec.tsx): the assertions below read on accessible names, so a key
 * missing from `en/topology.json` renders its own path and fails the query — one test covering
 * both the wiring and the copy.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { PowerScaleOptionsPanel } from '@/components/inputs/topology-options/PowerScaleOptionsPanel'
import { availableProtections } from '@/data/powerscaleCatalog'
import { useConfigStore } from '@/store'
import type { PowerScaleTier } from '@/types'

function tiers(): PowerScaleTier[] {
  return useConfigStore.getState().powerscaleOptions.tiers
}

function setTiers(list: PowerScaleTier[]): void {
  useConfigStore.setState({ powerscaleOptions: { tiers: list } })
}

/** Every `<option>` on screen whose text is a protection notation. */
function protectionOptions(): (string | null)[] {
  return screen
    .getAllByRole('option')
    .map((o) => o.textContent)
    .filter((text) => text?.startsWith('+') ?? false)
}

beforeEach(() => {
  // jsdom has no matchMedia; InfoTooltip reaches it via useIsTouchDevice.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
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
})

describe('PowerScaleOptionsPanel', () => {
  it('renders one row per node pool', () => {
    render(<PowerScaleOptionsPanel />)
    expect(screen.getAllByRole('combobox', { name: /node model/i })).toHaveLength(1)
  })

  it('adds a node pool up to the eight-tier limit', () => {
    render(<PowerScaleOptionsPanel />)
    const add = screen.getByRole('button', { name: /add node pool/i })
    for (let i = 0; i < 10; i++) fireEvent.click(add)
    expect(tiers()).toHaveLength(8)
  })

  it('will not remove the last node pool', () => {
    render(<PowerScaleOptionsPanel />)
    fireEvent.click(screen.getAllByRole('button', { name: /remove node pool/i })[0] as HTMLElement)
    expect(tiers()).toHaveLength(1)
  })

  it('removes the addressed node pool when more than one exists', () => {
    setTiers([
      { ...(tiers()[0] as PowerScaleTier) },
      { ...(tiers()[0] as PowerScaleTier), nodeModel: 'F900', driveSizeTb: 15.36 },
    ])
    render(<PowerScaleOptionsPanel />)
    fireEvent.click(screen.getAllByRole('button', { name: /remove node pool/i })[0] as HTMLElement)
    expect(tiers()).toHaveLength(1)
    expect(tiers()[0]?.nodeModel).toBe('F900')
  })

  it('reorders node pools without changing their contents', () => {
    setTiers([
      { ...(tiers()[0] as PowerScaleTier) },
      { ...(tiers()[0] as PowerScaleTier), nodeModel: 'F900', driveSizeTb: 15.36 },
    ])
    render(<PowerScaleOptionsPanel />)
    fireEvent.click(
      screen.getAllByRole('button', { name: /move node pool down/i })[0] as HTMLElement,
    )
    expect(tiers().map((t) => t.nodeModel)).toEqual(['F900', 'F210'])
    expect(tiers()[0]?.driveSizeTb).toBe(15.36)
  })

  it('offers only protections valid for the selected combination', () => {
    // F210 @ 1.92 TB publishes all nine protections from three nodes up, so it cannot show a
    // restriction. F200 @ 1.92 TB with three nodes is the vendor's own restricted set:
    // +2d:1n, +3d:1n, +3d:1n1d, +4d:1n — no +1n and no +2n.
    setTiers([{ ...(tiers()[0] as PowerScaleTier), nodeModel: 'F200' }])
    render(<PowerScaleOptionsPanel />)

    const options = protectionOptions()
    expect(options).toContain('+2d:1n')
    expect(options).not.toContain('+1n')
    expect(options).not.toContain('+2n')
  })

  it('widens the protection list when the pool grows past a vendor breakpoint', () => {
    setTiers([{ ...(tiers()[0] as PowerScaleTier), nodeModel: 'F200' }])
    render(<PowerScaleOptionsPanel />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /node count/i }), {
      target: { value: '9' },
    })
    expect(tiers()[0]?.nodeCount).toBe(9)
    // F200 @ 1.92 TB reaches +2n at nine nodes; the still-valid +2d:1n selection is kept.
    expect(protectionOptions()).toContain('+2n')
    expect(tiers()[0]?.protection).toBe('+2d:1n')
  })

  it('clamps node count into the model bounds', () => {
    render(<PowerScaleOptionsPanel />)
    const input = screen.getByRole('spinbutton', { name: /node count/i })
    fireEvent.change(input, { target: { value: '1' } })
    expect(tiers()[0]?.nodeCount).toBeGreaterThanOrEqual(3)
  })

  it('snaps node count to the model increment', () => {
    // A300 is minNodes 4 / increment 2: five nodes is not a configuration Dell publishes.
    setTiers([
      {
        nodeModel: 'A300',
        driveSizeTb: 2,
        nodeCount: 4,
        protection: '+2d:1n',
        vhsDriveCount: 0,
        vhsPercent: 0,
      },
    ])
    render(<PowerScaleOptionsPanel />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /node count/i }), {
      target: { value: '5' },
    })
    expect(tiers()[0]?.nodeCount).toBe(6)
  })

  it('ignores a cleared node-count field instead of storing NaN', () => {
    render(<PowerScaleOptionsPanel />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /node count/i }), {
      target: { value: '' },
    })
    expect(tiers()[0]?.nodeCount).toBe(3)
    expect(Number.isNaN(tiers()[0]?.nodeCount)).toBe(false)
  })

  it('ignores a cleared virtual-hot-spare field instead of storing NaN', () => {
    setTiers([{ ...(tiers()[0] as PowerScaleTier), vhsDriveCount: 2, vhsPercent: 5 }])
    render(<PowerScaleOptionsPanel />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /virtual hot spare \(drives\)/i }), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: /virtual hot spare \(%\)/i }), {
      target: { value: '' },
    })
    expect(Number.isNaN(tiers()[0]?.vhsDriveCount)).toBe(false)
    expect(Number.isNaN(tiers()[0]?.vhsPercent)).toBe(false)
  })

  it('re-resolves a protection the new node count no longer publishes', () => {
    // F900 @ 15.36 TB offers +2n from nine nodes up. At four nodes the vendor set collapses to
    // +3d:1n, +3d:1n1d, +4d:1n, and the suggested level is +3d:1n1d.
    setTiers([
      {
        nodeModel: 'F900',
        driveSizeTb: 15.36,
        nodeCount: 13,
        protection: '+2n',
        vhsDriveCount: 0,
        vhsPercent: 0,
      },
    ])
    render(<PowerScaleOptionsPanel />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /node count/i }), {
      target: { value: '4' },
    })
    expect(tiers()[0]?.nodeCount).toBe(4)
    expect(tiers()[0]?.protection).toBe('+3d:1n1d')
  })

  it('re-derives drive size, node count and protection in one dispatch when the model changes', () => {
    render(<PowerScaleOptionsPanel />)
    // A300 offers neither 1.92 TB drives nor a three-node pool (minNodes 4, increment 2).
    fireEvent.change(screen.getByRole('combobox', { name: /node model/i }), {
      target: { value: 'A300' },
    })

    const tier = tiers()[0] as PowerScaleTier
    expect(tier.nodeModel).toBe('A300')
    expect(tier.driveSizeTb).toBe(2)
    expect(tier.nodeCount).toBe(4)
    expect(availableProtections(tier.nodeModel, tier.driveSizeTb, tier.nodeCount)).toContain(
      tier.protection,
    )
  })

  it('flags a pool the catalog cannot size rather than showing it as valid', () => {
    // Two F210 nodes is below the vendor's three-node floor — reachable from an old shared URL,
    // never from this panel. `sizeTier` returns null for it, so the dashboard shows nothing for
    // this pool; the row has to say so.
    setTiers([{ ...(tiers()[0] as PowerScaleTier), nodeCount: 2 }])
    render(<PowerScaleOptionsPanel />)

    expect(screen.getByText(/cannot be sized/i)).toBeInTheDocument()
  })
})
