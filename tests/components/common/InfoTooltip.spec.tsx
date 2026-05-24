/**
 * InfoTooltip component tests.
 *
 * Verifies tooltip rendering, hover/click interactions, and ARIA attributes.
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InfoTooltip } from '@/components/common/InfoTooltip'

// Use vi.hoisted so the variable is available before vi.mock hoisting
const mockTouch = vi.hoisted(() => ({ value: false }))

vi.mock('@/hooks', () => ({
  useIsTouchDevice: () => mockTouch.value,
}))

describe('InfoTooltip', () => {
  it('renders help button with accessible label', () => {
    mockTouch.value = false
    render(<InfoTooltip content="Test tooltip content" />)

    const button = screen.getByRole('button', { name: /help/i })
    expect(button).toBeInTheDocument()
  })

  it('does not show tooltip content by default', () => {
    mockTouch.value = false
    render(<InfoTooltip content="Test tooltip content" />)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on hover (desktop)', async () => {
    mockTouch.value = false
    const user = userEvent.setup()

    render(<InfoTooltip content="Hover tooltip text" />)

    const button = screen.getByRole('button', { name: /help/i })
    await user.hover(button)

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Hover tooltip text')).toBeInTheDocument()
  })

  it('hides tooltip on unhover (desktop)', async () => {
    mockTouch.value = false
    const user = userEvent.setup()

    render(<InfoTooltip content="Hover tooltip text" />)

    const button = screen.getByRole('button', { name: /help/i })
    await user.hover(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    await user.unhover(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on click (touch device)', async () => {
    mockTouch.value = true
    const user = userEvent.setup()

    render(<InfoTooltip content="Tap tooltip text" />)

    const button = screen.getByRole('button', { name: /help/i })
    await user.click(button)

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Tap tooltip text')).toBeInTheDocument()
  })

  it('toggles tooltip on repeated clicks (touch device)', async () => {
    mockTouch.value = true
    const user = userEvent.setup()

    render(<InfoTooltip content="Toggle tooltip" />)

    const button = screen.getByRole('button', { name: /help/i })

    // First click opens
    await user.click(button)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    // Second click closes
    await user.click(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip on focus (keyboard accessibility)', () => {
    mockTouch.value = false
    render(<InfoTooltip content="Focus tooltip text" />)

    const button = screen.getByRole('button', { name: /help/i })
    act(() => {
      button.focus()
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('hides tooltip on blur', () => {
    mockTouch.value = false
    render(<InfoTooltip content="Blur tooltip text" />)

    const button = screen.getByRole('button', { name: /help/i })
    act(() => {
      button.focus()
    })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    act(() => {
      button.blur()
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('sets aria-describedby when tooltip is open', async () => {
    mockTouch.value = false
    const user = userEvent.setup()

    render(<InfoTooltip content="Aria tooltip" />)

    const button = screen.getByRole('button', { name: /help/i })

    // Before hover: no aria-describedby
    expect(button).not.toHaveAttribute('aria-describedby')

    // After hover: aria-describedby points to tooltip
    await user.hover(button)
    const tooltip = screen.getByRole('tooltip')
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id)
  })
})
