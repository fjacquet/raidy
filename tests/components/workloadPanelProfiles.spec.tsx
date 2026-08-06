/**
 * The preset grid is topology-dependent: BeeGFS gets HPC/AI profiles, everything else keeps the
 * general-purpose four. The failure this guards is a filter that silently degrades to "show
 * everything" — ten buttons render, the panel still looks plausible, and a BeeGFS user is offered
 * an OLTP preset again.
 *
 * react-i18next is mocked to the identity function (the pattern in GuideView.spec.tsx), so the
 * assertions read on key paths rather than English copy and stay valid if the copy is reworded.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  // `i18n` is included because transitive imports (useFormatBytes, InfoTooltip) read the
  // language off the hook's return value; without it they throw on undefined.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { WorkloadPanel } from '@/components/inputs/WorkloadPanel'
import { useConfigStore } from '@/store'

describe('WorkloadPanel profile grid', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
    useConfigStore.getState().resetToDefaults()
  })

  it('offers the HPC profiles on BeeGFS and none of the general ones', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    render(<WorkloadPanel />)

    expect(screen.getByText('presets.aiTraining')).toBeInTheDocument()
    expect(screen.getByText('presets.aiCheckpointing')).toBeInTheDocument()
    expect(screen.queryByText('presets.database')).not.toBeInTheDocument()
    expect(screen.queryByText('presets.videoStreaming')).not.toBeInTheDocument()
  })

  it('offers the general profiles on standard RAID and none of the HPC ones', () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)

    expect(screen.getByText('presets.database')).toBeInTheDocument()
    expect(screen.getByText('presets.fileServer')).toBeInTheDocument()
    expect(screen.queryByText('presets.aiTraining')).not.toBeInTheDocument()
  })

  it('shows the HPC heading and guidance note only on BeeGFS', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    const { unmount } = render(<WorkloadPanel />)
    expect(screen.getByText('presets.labelHpc')).toBeInTheDocument()
    expect(screen.getByText('presets.hpcGuidance')).toBeInTheDocument()
    unmount()

    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)
    expect(screen.getByText('presets.label')).toBeInTheDocument()
    expect(screen.queryByText('presets.hpcGuidance')).not.toBeInTheDocument()
  })

  it('applies all three values when a profile is clicked', async () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    render(<WorkloadPanel />)

    await userEvent.click(screen.getByText('presets.aiCheckpointing'))

    const state = useConfigStore.getState()
    expect(state.readPercent).toBe(20)
    expect(state.randomPercent).toBe(10)
    expect(state.blockSize).toBe('1M')
  })

  it('leaves the general profiles behaving exactly as before', async () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)

    await userEvent.click(screen.getByText('presets.database'))

    const state = useConfigStore.getState()
    expect(state.readPercent).toBe(70)
    expect(state.randomPercent).toBe(80)
    expect(state.blockSize).toBe('8K')
  })
})
