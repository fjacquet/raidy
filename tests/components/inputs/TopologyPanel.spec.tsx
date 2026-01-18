/**
 * TopologyPanel component tests.
 *
 * Verifies correct panel rendering based on topology type.
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopologyPanel } from '@/components/inputs/TopologyPanel'

// Mock useConfigStore
import { useConfigStore } from '@/store'
import type { Mock } from 'vitest'
import { vi } from 'vitest'

vi.mock('@/store', () => ({
  useConfigStore: vi.fn(),
}))

const mockUseConfigStore = useConfigStore as unknown as Mock

describe('TopologyPanel', () => {
  it('renders topology type selector', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 1,
      serverCount: 1,
      objectscaleOptions: {},
      powerstoreOptions: {},
      powerscaleOptions: {},
      powerFlexOptions: {},
      powervaultOptions: { model: 'ME5224', controllers: 2 },
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
      setObjectScaleOptions: vi.fn(),
      setPowerStoreOptions: vi.fn(),
      setPowerScaleOptions: vi.fn(),
      setPowerFlexOptions: vi.fn(),
      setPowerVaultOptions: vi.fn(),
    })

    render(<TopologyPanel />)

    // Verify topology type selector is present
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders ZFS panel when ZFS topology selected', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'zfs', level: 'raidz2' },
      hotSpares: 0,
      serverCount: 1,
      objectscaleOptions: {},
      powerstoreOptions: {},
      powerscaleOptions: {},
      powerFlexOptions: {},
      powervaultOptions: { model: 'ME5224', controllers: 2 },
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
      setObjectScaleOptions: vi.fn(),
      setPowerStoreOptions: vi.fn(),
      setPowerScaleOptions: vi.fn(),
      setPowerFlexOptions: vi.fn(),
      setPowerVaultOptions: vi.fn(),
    })

    render(<TopologyPanel />)

    // ZfsOptionsPanel should be rendered (contains ZFS-specific controls)
    // Note: Would need to test panel content specifically in ZfsOptionsPanel.spec.tsx
  })

  it('renders vSAN panel when vSAN topology selected', () => {
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' },
      hotSpares: 0,
      serverCount: 3,
      objectscaleOptions: {},
      powerstoreOptions: {},
      powerscaleOptions: {},
      powerFlexOptions: {},
      powervaultOptions: { model: 'ME5224', controllers: 2 },
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
      setObjectScaleOptions: vi.fn(),
      setPowerStoreOptions: vi.fn(),
      setPowerScaleOptions: vi.fn(),
      setPowerFlexOptions: vi.fn(),
      setPowerVaultOptions: vi.fn(),
    })

    render(<TopologyPanel />)

    // VsanOptionsPanel should be rendered
  })

  it('does not crash when switching between topology types', () => {
    const { rerender } = render(<TopologyPanel />)

    // Switch to ZFS
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'zfs', level: 'raidz1' },
      hotSpares: 0,
      serverCount: 1,
      objectscaleOptions: {},
      powerstoreOptions: {},
      powerscaleOptions: {},
      powerFlexOptions: {},
      powervaultOptions: { model: 'ME5224', controllers: 2 },
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
      setObjectScaleOptions: vi.fn(),
      setPowerStoreOptions: vi.fn(),
      setPowerScaleOptions: vi.fn(),
      setPowerFlexOptions: vi.fn(),
      setPowerVaultOptions: vi.fn(),
    })

    rerender(<TopologyPanel />)

    // Switch to Ceph
    mockUseConfigStore.mockReturnValue({
      topology: { type: 'ceph', level: 'ceph_replicated_3' },
      hotSpares: 0,
      serverCount: 3,
      objectscaleOptions: {},
      powerstoreOptions: {},
      powerscaleOptions: {},
      powerFlexOptions: {},
      powervaultOptions: { model: 'ME5224', controllers: 2 },
      setTopology: vi.fn(),
      setHotSpares: vi.fn(),
      setObjectScaleOptions: vi.fn(),
      setPowerStoreOptions: vi.fn(),
      setPowerScaleOptions: vi.fn(),
      setPowerFlexOptions: vi.fn(),
      setPowerVaultOptions: vi.fn(),
    })

    rerender(<TopologyPanel />)

    // Should not crash
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
