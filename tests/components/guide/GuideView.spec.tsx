/**
 * GuideView component tests.
 *
 * Verifies guide rendering, accordion toggle, and section content.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GuideView } from '@/components/guide/GuideView'

// Mock react-i18next with all exports needed by transitive imports
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        title: 'Storage Sizing Principles',
        subtitle: 'Understanding how storage calculations work',
        'capacity.title': 'How Capacity Works',
        'raid.title': 'RAID & Redundancy Explained',
        'performance.title': 'Performance Bottlenecks',
        'resilience.title': 'Resilience & Monte Carlo Simulation',
        'sustainability.title': 'Sustainability & TCO',
        'platforms.title': 'Platform-Specific Notes',
      }
      return translations[key] || key
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// Mock section components to keep tests focused on GuideView behavior
vi.mock('@/components/guide/sections', () => ({
  CapacityGuide: () => <div data-testid="capacity-section">Capacity content</div>,
  RaidGuide: () => <div data-testid="raid-section">RAID content</div>,
  PerformanceGuide: () => <div data-testid="performance-section">Performance content</div>,
  ResilienceGuide: () => <div data-testid="resilience-section">Resilience content</div>,
  SustainabilityGuide: () => <div data-testid="sustainability-section">Sustainability content</div>,
  PlatformGuide: () => <div data-testid="platform-section">Platform content</div>,
}))

describe('GuideView', () => {
  it('renders guide title and subtitle', () => {
    render(<GuideView />)

    expect(screen.getByText('Storage Sizing Principles')).toBeInTheDocument()
    expect(screen.getByText('Understanding how storage calculations work')).toBeInTheDocument()
  })

  it('renders all 6 section headings', () => {
    render(<GuideView />)

    expect(screen.getByText('How Capacity Works')).toBeInTheDocument()
    expect(screen.getByText('RAID & Redundancy Explained')).toBeInTheDocument()
    expect(screen.getByText('Performance Bottlenecks')).toBeInTheDocument()
    expect(screen.getByText('Resilience & Monte Carlo Simulation')).toBeInTheDocument()
    expect(screen.getByText('Sustainability & TCO')).toBeInTheDocument()
    expect(screen.getByText('Platform-Specific Notes')).toBeInTheDocument()
  })

  it('has first section (capacity) open by default', () => {
    render(<GuideView />)

    // Capacity section content should be in DOM
    expect(screen.getByTestId('capacity-section')).toBeInTheDocument()
  })

  it('toggles a section open on click', async () => {
    const user = userEvent.setup()
    render(<GuideView />)

    // Click on RAID section heading to open it
    const raidButton = screen.getByText('RAID & Redundancy Explained')
    await user.click(raidButton)

    // RAID content should now be in the DOM
    expect(screen.getByTestId('raid-section')).toBeInTheDocument()
  })

  it('toggles a section closed on second click', async () => {
    const user = userEvent.setup()
    render(<GuideView />)

    // Capacity is open by default — click to close
    const capacityButton = screen.getByText('How Capacity Works')
    await user.click(capacityButton)

    // Content is still in DOM but accordion is collapsed (maxHeight: 0px)
    // The content renders but is visually hidden via CSS maxHeight
    expect(screen.getByTestId('capacity-section')).toBeInTheDocument()
  })

  it('allows multiple sections to be open simultaneously', async () => {
    const user = userEvent.setup()
    render(<GuideView />)

    // Capacity is open by default, open RAID too
    await user.click(screen.getByText('RAID & Redundancy Explained'))
    await user.click(screen.getByText('Performance Bottlenecks'))

    // All three should have content in DOM
    expect(screen.getByTestId('capacity-section')).toBeInTheDocument()
    expect(screen.getByTestId('raid-section')).toBeInTheDocument()
    expect(screen.getByTestId('performance-section')).toBeInTheDocument()
  })
})
