import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricCard, ProgressBar } from '@/components/outputs'

describe('MetricCard', () => {
  it('renders label, value and optional subvalue', () => {
    render(
      <MetricCard label="Usable" subvalue="after compression">
        42 TB
      </MetricCard>,
    )
    expect(screen.getByText('Usable')).toBeInTheDocument()
    expect(screen.getByText('42 TB')).toBeInTheDocument()
    expect(screen.getByText('after compression')).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('renders label and rounded value when showValue', () => {
    render(<ProgressBar label="Drives" value={123.6} max={200} />)
    expect(screen.getByText('Drives')).toBeInTheDocument()
    expect(screen.getByText('124')).toBeInTheDocument()
  })
})
