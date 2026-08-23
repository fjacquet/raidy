/**
 * The per-node-pool table is the only place a heterogeneous cluster stops being one averaged
 * number. Two claims are worth pinning: every sizeable pool gets its own row, and the footer is
 * the cluster sum rather than the last row repeated.
 *
 * The details object comes from the real engine, not a hand-written fixture, so the table cannot
 * pass while displaying fields the orchestrator has stopped producing.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { PowerScaleTierTable } from '@/components/outputs/PowerScaleTierTable'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import { useConfigStore } from '@/store'
import type { PowerScaleOptions } from '@/types/topology'
import { formatBytes } from '@/utils'

/** One pool with a Virtual Hot Spare reserve — VHS is what made the two efficiencies diverge. */
const ONE_POOL_WITH_VHS = {
  nodeModel: 'F210',
  driveSizeTb: 1.92,
  nodeCount: 3,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 30,
} as const

const TWO_POOLS: PowerScaleOptions = {
  tiers: [
    {
      nodeModel: 'F210',
      driveSizeTb: 1.92,
      nodeCount: 3,
      protection: '+2d:1n',
      vhsDriveCount: 0,
      vhsPercent: 0,
    },
    {
      nodeModel: 'A300',
      driveSizeTb: 8,
      nodeCount: 4,
      protection: '+2d:1n',
      vhsDriveCount: 0,
      vhsPercent: 0,
    },
  ],
}

function details() {
  const result = calculatePowerScaleVolumetry(TWO_POOLS)
  if (!result.powerScaleDetails) throw new Error('engine produced no PowerScale details')
  return result.powerScaleDetails
}

describe('PowerScaleTierTable', () => {
  it('renders one row per sizeable node pool', () => {
    const d = details()
    render(<PowerScaleTierTable details={d} />)

    const body = screen.getAllByRole('rowgroup')[1] as HTMLElement
    expect(within(body).getAllByRole('row')).toHaveLength(2)
    expect(within(body).getByText('F210')).toBeInTheDocument()
    expect(within(body).getByText('A300')).toBeInTheDocument()
  })

  it('totals the cluster in the footer rather than repeating a pool', () => {
    const d = details()
    render(<PowerScaleTierTable details={d} />)

    // Assert what is RENDERED, not the engine object the table was handed. The previous version of
    // this test compared `d.clusterRaw` against `d.tiers[n].rawCapacity` — both fields of an object
    // the component never touches — so a footer printing `tiers[0].rawCapacity` passed it unchanged
    // while claiming to pin the sum. The archive pool is much the larger, so echoing either row
    // instead of summing is visible in the rendered cell.
    const footer = screen.getAllByRole('rowgroup')[2] as HTMLElement
    expect(within(footer).getByText(/cluster total/i)).toBeInTheDocument()

    // Same formatter the component reaches through `useFormatBytes()`, at the store default.
    const rendered = (bytes: number) => formatBytes(bytes, useConfigStore.getState().unitSystem)
    expect(within(footer).getByText(rendered(d.clusterRaw))).toBeInTheDocument()
    for (const tier of d.tiers) {
      expect(within(footer).queryByText(rendered(tier.rawCapacity))).not.toBeInTheDocument()
    }
  })

  it('reports the same efficiency in the row and the footer for a single pool', () => {
    // The regression this pins actually shipped: rows rendered the vendor PROTECTION efficiency
    // (applied before `usableFactor` and before VHS) while the footer rendered
    // `sum(usableLessVhs)/sum(raw)`. One pool therefore read 66.7% in its row and 66.1% one line
    // below — and 46.3% below it once VHS was configured. With a single pool the two must agree
    // exactly, whatever the shared definition is.
    const result = calculatePowerScaleVolumetry({ tiers: [ONE_POOL_WITH_VHS] })
    const d = result.powerScaleDetails
    if (!d) throw new Error('engine produced no PowerScale details')
    render(<PowerScaleTierTable details={d} />)

    const body = screen.getAllByRole('rowgroup')[1] as HTMLElement
    const footer = screen.getAllByRole('rowgroup')[2] as HTMLElement
    const pct = /^\d+([.,]\d+)?%$/
    const rowPct = within(body)
      .getAllByText(pct)
      .map((el) => el.textContent)
    const footPct = within(footer)
      .getAllByText(pct)
      .map((el) => el.textContent)

    expect(rowPct).toHaveLength(1)
    expect(footPct).toHaveLength(1)
    expect(rowPct[0]).toBe(footPct[0])
  })

  it('flags an end-of-life node model on its row', () => {
    render(<PowerScaleTierTable details={details()} />)
    // A300's catalog entry carries an EOL date; F210's does not. Asserting EXACTLY one badge is
    // the difference between pinning that and passing on an unconditionally-rendered badge.
    expect(screen.getAllByText(/EOL/i)).toHaveLength(1)
  })
})
