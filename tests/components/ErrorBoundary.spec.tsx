/**
 * Error Boundary Tests
 *
 * Tests error handling and recovery functionality.
 * Reference: Plan 03-03 - Validation enforcement and error handling.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '@/components/ErrorBoundary'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'errors.calculationError.title': 'Calculation Error',
        'errors.calculationError.message':
          'An error occurred while calculating storage configuration.',
        'errors.calculationError.resetButton': 'Reset Configuration',
      }
      return translations[key] || key
    },
  }),
}))

// Component that throws error for testing
function ThrowError(): never {
  throw new Error('Test calculation error')
}

// Normal component for testing no-error case
function NormalComponent() {
  return <div>Normal content</div>
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    // Reset location mock before each test
    vi.stubGlobal('location', {
      hash: '',
      reload: vi.fn(),
    })
  })

  it('catches calculation errors and shows fallback UI', () => {
    // Suppress error console output during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>,
    )

    // Verify fallback UI is shown
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/calculation error/i)).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('does not show error.message to user', () => {
    // Suppress error console output during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>,
    )

    // Verify technical error message is NOT visible
    expect(screen.queryByText('Test calculation error')).not.toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('shows reset button in fallback UI', () => {
    // Suppress error console output during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: /reset configuration/i })).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('clears URL hash and reloads on reset', async () => {
    // Suppress error console output during test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const reloadMock = vi.fn()
    vi.stubGlobal('location', { hash: '#config=test', reload: reloadMock })

    const user = userEvent.setup()

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>,
    )

    const resetButton = screen.getByRole('button', { name: /reset configuration/i })
    await user.click(resetButton)

    expect(window.location.hash).toBe('')
    expect(reloadMock).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('renders children when no error', () => {
    render(
      <AppErrorBoundary>
        <NormalComponent />
      </AppErrorBoundary>,
    )

    expect(screen.getByText('Normal content')).toBeInTheDocument()
  })

  it('logs error to console for debugging', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <ThrowError />
      </AppErrorBoundary>,
    )

    // Verify console.error was called (for developer debugging)
    expect(consoleSpy).toHaveBeenCalled()
    // Check that one of the console.error calls contains our custom message
    const callsWithOurMessage = consoleSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Calculation engine error')),
    )
    expect(callsWithOurMessage.length).toBeGreaterThan(0)

    consoleSpy.mockRestore()
  })
})
