import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeadlineBand } from '@/components/outputs'
import type { PerformanceResult, SustainabilityResult, VolumetryResult } from '@/types/results'

const volumetry: VolumetryResult = {
  rawCapacity: 1e12,
  parityOverhead: 1e11,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 9e11,
  effectiveCapacity: 9e11,
  efficiency: 90,
  breakdown: [],
}
const performance: PerformanceResult = {
  maxReadThroughputMBs: 1200,
  maxWriteThroughputMBs: 800,
  maxReadIOPS: 500000,
  maxWriteIOPS: 300000,
  layers: [],
  bottleneckDescription: '',
}
const sustainability: SustainabilityResult = {
  annualEnergyKwh: 5000,
  annualEnergyCost: 1000,
  annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 },
}

describe('HeadlineBand', () => {
  it('omits the effective tile for RAID (effective === usable)', () => {
    render(
      <HeadlineBand
        volumetry={volumetry}
        performance={performance}
        resilience={null}
        sustainability={sustainability}
        topology={{ type: 'standard', level: 'RAID5' }}
        onRunSurvival={vi.fn()}
      />,
    )
    expect(screen.queryByText('Effective')).not.toBeInTheDocument()
    expect(screen.getByText('Usable')).toBeInTheDocument()
  })

  it('shows a run-survival affordance when no simulation result', () => {
    render(
      <HeadlineBand
        volumetry={volumetry}
        performance={performance}
        resilience={null}
        sustainability={sustainability}
        topology={{ type: 'standard', level: 'RAID5' }}
        onRunSurvival={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /run survival/i })).toBeInTheDocument()
  })
})
