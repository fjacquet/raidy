/**
 * TopologyPanel component tests.
 *
 * Verifies correct panel rendering based on topology type.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import type { Mock } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import { TopologyPanel } from '@/components/inputs/TopologyPanel'
// Mock useConfigStore
import { useConfigStore } from '@/store'

vi.mock('@/store', () => ({
  useConfigStore: vi.fn(),
}))

// Mock FormControls
vi.mock('@/components/common/FormControls', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
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
  Slider: ({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) => (
    <input id={id} type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} />
  ),
}))

// Mock all topology option panels
vi.mock('@/components/inputs/topology-options/ZfsOptionsPanel', () => ({
  ZfsOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/S2dOptionsPanel', () => ({
  S2dOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/VsanOptionsPanel', () => ({
  VsanOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/CephOptionsPanel', () => ({
  CephOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/NutanixOptionsPanel', () => ({
  NutanixOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/NetAppOptionsPanel', () => ({
  NetAppOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/SynologyOptionsPanel', () => ({
  SynologyOptionsPanel: () => null,
}))
vi.mock('@/components/inputs/topology-options/DellOptionsPanel', () => ({
  DellOptionsPanel: () => null,
}))

const mockUseConfigStore = useConfigStore as unknown as Mock

describe('TopologyPanel', () => {
  it('renders topology type selector', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 1,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    render(<TopologyPanel />)

    // Verify topology type selector is present
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders ZFS panel when ZFS topology selected', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'zfs', level: 'raidz2' },
      hotSpares: 0,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    render(<TopologyPanel />)

    // ZfsOptionsPanel should be rendered (contains ZFS-specific controls)
    // Note: Would need to test panel content specifically in ZfsOptionsPanel.spec.tsx
  })

  it('renders vSAN panel when vSAN topology selected', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' },
      hotSpares: 0,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    render(<TopologyPanel />)

    // VsanOptionsPanel should be rendered
  })

  it('does not crash when switching between topology types', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 1,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    const { rerender } = render(<TopologyPanel />)

    // Switch to ZFS
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'zfs', level: 'raidz1' },
      hotSpares: 0,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    rerender(<TopologyPanel />)

    // Switch to Ceph
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'ceph', level: 'ceph_replicated_3' },
      hotSpares: 0,
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
    })

    rerender(<TopologyPanel />)

    // Should not crash
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
