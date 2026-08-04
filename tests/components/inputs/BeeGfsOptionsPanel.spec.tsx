/**
 * BeeGfsOptionsPanel component tests.
 *
 * Focused on the fsOverheadPercent control added for
 * https://github.com/fjacquet/raidy/issues/78 — unlike chunkSizeKb/numTargets/network
 * (informational-only, see the panel's header doc-comment), this control is wired into
 * getFilesystemOverheadPercent and changes usable capacity, so the test asserts both that it
 * renders and that moving it produces a different usableCapacity from the real engine — a
 * render-only test would miss the exact defect the issue reported.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import type { Mock } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { BeeGfsOptionsPanel } from '@/components/inputs/topology-options/BeeGfsOptionsPanel'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import { createVolumetryInput, TB } from '../../fixtures/vector-harness'

// jsdom does not implement matchMedia; InfoTooltip's touch-device detection needs it (see
// tests/components/outputs/CapacityAct.spec.tsx for the same stub).
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

vi.mock('@/store', () => ({
  useConfigStore: vi.fn(),
}))

// Mock react-i18next with a passthrough translator (key -> key), same idiom as
// tests/components/layout/InputSidebar.spec.tsx, so the test asserts against the stable i18n
// key rather than locale-specific copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
}))

const mockUseConfigStore = useConfigStore as unknown as Mock

function setStore(overrides: Partial<typeof DEFAULT_BEEGFS_OPTIONS> = {}) {
  const setBeeGfsOptions = vi.fn()
  mockUseConfigStore.mockReturnValue({
    beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, ...overrides },
    driveCount: 24,
    serverCount: 2,
    hotSpares: 0,
    setBeeGfsOptions,
  })
  return setBeeGfsOptions
}

describe('BeeGfsOptionsPanel — fsOverheadPercent control', () => {
  it('renders the filesystem overhead slider at the store value', () => {
    setStore({ fsOverheadPercent: 3 })

    render(<BeeGfsOptionsPanel />)

    const slider = screen.getByRole('slider', { name: 'beegfs.fsOverhead' })
    expect(slider).toHaveValue('3')
  })

  it('moving the slider calls setBeeGfsOptions with the new fsOverheadPercent', () => {
    const setBeeGfsOptions = setStore({ fsOverheadPercent: 2 })

    render(<BeeGfsOptionsPanel />)

    const slider = screen.getByRole('slider', { name: 'beegfs.fsOverhead' })
    fireEvent.change(slider, { target: { value: '4' } })

    expect(setBeeGfsOptions).toHaveBeenCalledWith({ fsOverheadPercent: 4 })
  })
})

describe('BeeGFS fsOverheadPercent — reaches usable capacity (the bug this control fixes)', () => {
  it('a value the slider can produce changes usableCapacity from the engine default', () => {
    const raid6 = { type: 'beegfs' as const, level: 'beegfs_raid6' as const }

    const atDefault = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: {
          ...DEFAULT_BEEGFS_OPTIONS,
          drivesPerTarget: 12,
          storageBuddyMirror: false,
        },
      }),
    )
    const atSliderMax = calculateVolumetry(
      createVolumetryInput(24, raid6, {
        serverCount: 2,
        beeGfsOptions: {
          ...DEFAULT_BEEGFS_OPTIONS,
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          fsOverheadPercent: 5, // slider max — matches the Zod schema's max(5) exactly
        },
      }),
    )

    expect(atSliderMax.usableCapacity).toBeLessThan(atDefault.usableCapacity)
    expect(atDefault.usableCapacity / TB).toBeCloseTo(19.6, 4)
    expect(atSliderMax.usableCapacity / TB).toBeCloseTo(19, 4)
  })
})
