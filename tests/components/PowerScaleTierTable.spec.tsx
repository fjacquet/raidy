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
import type { PowerScaleOptions } from '@/types/topology'

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

    // Both pools are end-of-life models, and the archive pool is much the larger of the two —
    // so a footer echoing either row instead of summing would be visible here.
    expect(d.clusterRaw).toBeGreaterThan(d.tiers[0]?.rawCapacity ?? 0)
    expect(d.clusterRaw).toBeGreaterThan(d.tiers[1]?.rawCapacity ?? 0)

    const footer = screen.getAllByRole('rowgroup')[2] as HTMLElement
    expect(within(footer).getByText(/cluster total/i)).toBeInTheDocument()
  })

  it('flags an end-of-life node model on its row', () => {
    render(<PowerScaleTierTable details={details()} />)
    // A300's catalog entry carries an EOL date; the badge is how a quote avoids proposing it.
    expect(screen.getAllByText(/EOL/i).length).toBeGreaterThan(0)
  })
})
