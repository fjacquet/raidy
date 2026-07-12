/**
 * InputSidebar tests.
 *
 * Verifies accordion sections render in narrative build order.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputSidebar } from '@/components/layout/InputSidebar'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'nav.configuration': 'Configuration',
        'sections.topology': 'Topology',
        'sections.hardware': 'Hardware',
        'sections.workload': 'Workload',
        'sections.advanced': 'Advanced',
        'sections.driveProperties': 'Drive Properties',
      }
      return translations[key] || key
    },
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}))

// Mock child panels
vi.mock('@/components/inputs', () => ({
  TopologyPanel: () => <div>Topology Panel</div>,
  HardwarePanel: () => <div>Hardware Panel</div>,
  WorkloadPanel: () => <div>Workload Panel</div>,
  AdvancedPanel: () => <div>Advanced Panel</div>,
  DrivePropertiesPanel: () => <div>Drive Properties Panel</div>,
}))

describe('InputSidebar', () => {
  it('renders accordion sections in narrative build order', () => {
    render(<InputSidebar />)
    const headings = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    const topoIdx = headings.findIndex((h) => /topolog/i.test(h ?? ''))
    const hwIdx = headings.findIndex((h) => /hardware/i.test(h ?? ''))
    const wlIdx = headings.findIndex((h) => /workload/i.test(h ?? ''))
    expect(topoIdx).toBeGreaterThanOrEqual(0)
    expect(topoIdx).toBeLessThan(hwIdx)
    expect(hwIdx).toBeLessThan(wlIdx)
  })
})
