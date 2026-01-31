/**
 * Cockpit layout tests.
 *
 * Verifies three-view state management and guide toggle behavior.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// biome-ignore lint/correctness/noUnusedImports: React is needed for JSX
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Cockpit } from '@/components/layout/Cockpit'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'nav.configuration': 'Configuration',
        'nav.report': 'Report',
        'nav.guide': 'Guide',
        'app.title': 'Raidy',
        'app.subtitle': 'Storage Sizer',
        'units.label': 'Units',
        'units.binary': 'Binary',
        'units.decimal': 'Decimal',
        'carbon.label': 'CO₂ Region',
        'language.label': 'Language',
      }
      return translations[key] || key
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
}))

// Mock child components to isolate Cockpit logic
vi.mock('@/components/layout/Header', () => ({
  Header: ({ onToggleGuide, isGuideOpen }: { onToggleGuide: () => void; isGuideOpen: boolean }) => (
    <header data-testid="header">
      <button type="button" onClick={onToggleGuide} data-testid="guide-toggle">
        {isGuideOpen ? 'Close Guide' : 'Open Guide'}
      </button>
    </header>
  ),
}))

vi.mock('@/components/layout/InputSidebar', () => ({
  InputSidebar: () => <div data-testid="input-sidebar">Input Sidebar</div>,
}))

vi.mock('@/components/layout/OutputDashboard', () => ({
  OutputDashboard: () => <div data-testid="output-dashboard">Output Dashboard</div>,
}))

vi.mock('@/components/guide', () => ({
  GuideView: () => <div data-testid="guide-view">Guide View</div>,
}))

describe('Cockpit', () => {
  it('renders input sidebar and output dashboard by default', () => {
    render(<Cockpit />)

    expect(screen.getByTestId('input-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('output-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-view')).not.toBeInTheDocument()
  })

  it('shows guide view when guide toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<Cockpit />)

    await user.click(screen.getByTestId('guide-toggle'))

    expect(screen.getByTestId('guide-view')).toBeInTheDocument()
    expect(screen.queryByTestId('input-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('output-dashboard')).not.toBeInTheDocument()
  })

  it('returns to config/report view when guide is toggled off', async () => {
    const user = userEvent.setup()
    render(<Cockpit />)

    // Open guide
    await user.click(screen.getByTestId('guide-toggle'))
    expect(screen.getByTestId('guide-view')).toBeInTheDocument()

    // Close guide
    await user.click(screen.getByTestId('guide-toggle'))
    expect(screen.queryByTestId('guide-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('input-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('output-dashboard')).toBeInTheDocument()
  })

  it('renders mobile navigation with three tabs', () => {
    render(<Cockpit />)

    expect(screen.getByText('Configuration')).toBeInTheDocument()
    expect(screen.getByText('Report')).toBeInTheDocument()
    expect(screen.getByText('Guide')).toBeInTheDocument()
  })

  it('switches to guide view via mobile nav', async () => {
    const user = userEvent.setup()
    render(<Cockpit />)

    await user.click(screen.getByText('Guide'))

    expect(screen.getByTestId('guide-view')).toBeInTheDocument()
    expect(screen.queryByTestId('input-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('output-dashboard')).not.toBeInTheDocument()
  })

  it('guide toggle button text reflects state', async () => {
    const user = userEvent.setup()
    render(<Cockpit />)

    expect(screen.getByTestId('guide-toggle')).toHaveTextContent('Open Guide')

    await user.click(screen.getByTestId('guide-toggle'))
    expect(screen.getByTestId('guide-toggle')).toHaveTextContent('Close Guide')
  })
})
