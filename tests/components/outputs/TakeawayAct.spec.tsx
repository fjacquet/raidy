import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TakeawayAct } from '@/components/outputs'

describe('TakeawayAct', () => {
  it('disables export buttons when no drive selected', () => {
    render(
      <TakeawayAct
        topology={{ type: 'standard', level: 'RAID5' }}
        zfsOptions={undefined}
        performance={{
          maxReadThroughputMBs: 0,
          maxWriteThroughputMBs: 0,
          sustainedWriteThroughputMBs: 0,
          maxReadIOPS: 0,
          maxWriteIOPS: 0,
          sustainedWriteIOPS: 0,
          mediaCeilingMBs: 0,
          mediaCeilingIOPS: 0,
          layers: [],
          bottleneck: { kind: 'none' as const },
        }}
        selectedDrive={null}
        exportError={false}
        onExportPdf={vi.fn()}
        onExportPptx={vi.fn()}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
  })
})
