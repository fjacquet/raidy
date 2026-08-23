/**
 * Selecting a platform must write a `Topology` the type union actually accepts.
 *
 * `setTopology({ type, level } as Topology)` used to pair whatever string arrived with whatever
 * type was selected. Nothing checked the pair, so when `PowerScaleTopology` was narrowed to the
 * single literal `'powerscale_onefs'`, picking PowerScale went on writing the retired
 * `'powerscale_n1'` — a value no engine could size — and `tsc` stayed silent. These tests pin the
 * store's contents after a selection, which is the only place that failure was ever visible.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { TopologyPanel } from '@/components/inputs/TopologyPanel'
import {
  defaultTopologyFor,
  TOPOLOGY_LEVELS,
} from '@/components/inputs/topology-options/topologyConstants'
import { useConfigStore } from '@/store'
import type { TopologyType } from '@/types'

beforeEach(() => {
  // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
  useConfigStore.getState().resetToDefaults()
})

describe('TopologyPanel platform selection', () => {
  it('writes the OneFS level when PowerScale is selected', () => {
    render(<TopologyPanel />)
    fireEvent.change(screen.getByRole('combobox', { name: /storage type/i }), {
      target: { value: 'powerscale' },
    })

    expect(useConfigStore.getState().topology).toEqual({
      type: 'powerscale',
      level: 'powerscale_onefs',
    })
  })

  it('offers no protection levels for PowerScale — protection is per node pool', () => {
    expect(TOPOLOGY_LEVELS.powerscale.map((level) => level.value)).toEqual(['powerscale_onefs'])
  })

  it('resolves every platform to a default the dropdown also offers', () => {
    for (const type of Object.keys(TOPOLOGY_LEVELS) as TopologyType[]) {
      const topology = defaultTopologyFor(type)
      expect(topology, `${type} resolves to no topology`).not.toBeNull()
      const offered = (TOPOLOGY_LEVELS[type] as { value: string }[]).map((level) => level.value)
      expect(offered, `${type}'s default is not in its own dropdown`).toContain(topology?.level)
    }
  })

  it('ignores a level the selected platform does not publish', () => {
    const store = useConfigStore.getState()
    store.setTopology({ type: 'powerscale', level: 'powerscale_onefs' })
    render(<TopologyPanel />)

    // A hand-edited option value, or a stale one left by an older build of the app.
    fireEvent.change(screen.getByRole('combobox', { name: /configuration/i }), {
      target: { value: 'powerscale_n1' },
    })
    expect(useConfigStore.getState().topology.level).toBe('powerscale_onefs')
  })
})
