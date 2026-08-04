/**
 * AdvancedPanel component tests.
 *
 * Focus: the controller/HBA section has three label states — 'hba', 'raid' and 'either' —
 * driven by getControllerRequirement. See issue #74: the panel used to render only two states,
 * so a topology whose requirement is 'either' (beegfs_single) showed the RAID-only heading,
 * label and hint even though the dropdown offered HBAs and appliance controllers too.
 */

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { AdvancedPanel } from '@/components/inputs/AdvancedPanel'
import { useConfigStore } from '@/store'
import { getControllerRequirement } from '@/types'

vi.mock('@/store', () => ({
  useConfigStore: vi.fn(),
}))

// t() returns the raw key so assertions target exactly the string the component asked for,
// independent of the actual locale copy.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/common/FormControls', () => ({
  Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Select: ({
    value,
    options,
    onChange,
    id,
  }: {
    value: string
    options: Array<{ value: string; label: string }>
    onChange: (v: string) => void
    id?: string
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
  Slider: ({
    value,
    onChange,
    id,
  }: {
    value: number
    onChange: (v: number) => void
    id?: string
  }) => (
    <input id={id} type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} />
  ),
}))

const mockUseConfigStore = useConfigStore as unknown as Mock

function baseStoreState(topology: { type: string; level?: string }) {
  return {
    topology,
    controllerOptions: { controller: 'perc_h755' },
    compressionRatio: 1,
    dedupRatio: 1,
    networkSpeed: '25GbE',
    pcieGen: 'gen4',
    pcieLanes: 'x8',
    pue: 1.2,
    fsType: 'xfs',
    backupRetention: 30,
    dailyChangeRate: 5,
    setControllerOptions: vi.fn(),
    setCompressionRatio: vi.fn(),
    setDedupRatio: vi.fn(),
    setNetworkSpeed: vi.fn(),
    setPcieGen: vi.fn(),
    setPcieLanes: vi.fn(),
    setPue: vi.fn(),
    setFsType: vi.fn(),
    setBackupRetention: vi.fn(),
    setDailyChangeRate: vi.fn(),
    performanceThreshold: 0.8,
    setPerformanceThreshold: vi.fn(),
  }
}

describe('AdvancedPanel — controller requirement label state', () => {
  it('beegfs_single genuinely resolves to the "either" requirement', () => {
    // Verify the premise against the real engine function rather than assuming it.
    expect(getControllerRequirement('beegfs', 'beegfs_single')).toBe('either')
  })

  it('renders the RAID-only labels for a topology requiring "raid"', () => {
    expect(getControllerRequirement('beegfs', 'beegfs_raid6')).toBe('raid')
    mockUseConfigStore.mockReturnValue(baseStoreState({ type: 'beegfs', level: 'beegfs_raid6' }))

    render(<AdvancedPanel />)

    expect(screen.getByText('controller.title')).toBeInTheDocument()
    expect(screen.getByText('controller.model')).toBeInTheDocument()
    expect(screen.getByText('controller.raidHint')).toBeInTheDocument()
    expect(screen.queryByText('controller.eitherTitle')).not.toBeInTheDocument()
  })

  it('renders the HBA-only labels for a topology requiring "hba"', () => {
    expect(getControllerRequirement('beegfs', 'beegfs_raidz2')).toBe('hba')
    mockUseConfigStore.mockReturnValue(baseStoreState({ type: 'beegfs', level: 'beegfs_raidz2' }))

    render(<AdvancedPanel />)

    expect(screen.getByText('pcie.title')).toBeInTheDocument()
    expect(screen.getByText('controller.hbaModel')).toBeInTheDocument()
    expect(screen.getByText('controller.hbaHint')).toBeInTheDocument()
  })

  it('renders the dedicated "either" labels for beegfs_single, not the RAID or HBA state', () => {
    mockUseConfigStore.mockReturnValue(baseStoreState({ type: 'beegfs', level: 'beegfs_single' }))

    render(<AdvancedPanel />)

    expect(screen.getByText('controller.eitherTitle')).toBeInTheDocument()
    expect(screen.getByText('controller.eitherModel')).toBeInTheDocument()
    expect(screen.getByText('controller.eitherHint')).toBeInTheDocument()
    expect(screen.queryByText('controller.title')).not.toBeInTheDocument()
    expect(screen.queryByText('controller.model')).not.toBeInTheDocument()
    expect(screen.queryByText('controller.raidHint')).not.toBeInTheDocument()
    expect(screen.queryByText('pcie.title')).not.toBeInTheDocument()
    expect(screen.queryByText('controller.hbaModel')).not.toBeInTheDocument()
    expect(screen.queryByText('controller.hbaHint')).not.toBeInTheDocument()
  })
})
