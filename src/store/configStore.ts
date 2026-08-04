/**
 * Main configuration store with URL persistence.
 */

import type { StateCreator } from 'zustand'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { PERSISTED_KEYS, type PersistedKey } from './persistedKeys'
import {
  type AdvancedSlice,
  createAdvancedSlice,
  createHardwareSlice,
  createTopologySlice,
  createWorkloadSlice,
  type HardwareSlice,
  type TopologySlice,
  type WorkloadSlice,
} from './slices'
import { urlHashStorage } from './urlStorage'

/**
 * Drop top-level keys whose value is structurally identical to the default,
 * before compressing for the URL hash. Shared links are dominated by the ~15
 * platform-specific `*Options` objects; most links only touch one platform, so
 * the other 14 default-valued objects would otherwise be serialized verbatim
 * on every share. Omitting them is safe: a key missing entirely from the
 * persisted payload already falls back to the store's own default value via
 * Zustand's persist `merge` (`{ ...currentState, ...persistedState }`), so
 * this is purely a size optimization — it cannot change what a round-trip
 * produces. See docs/ARCHITECTURE.md and task-9-report.md for the measured
 * URL-length impact.
 */
function omitDefaults<T extends Record<string, unknown>>(
  state: T,
  defaults: { [K in keyof T]?: unknown },
): Partial<T> {
  const result: Partial<T> = {}
  for (const key of Object.keys(state) as (keyof T)[]) {
    const value = state[key]
    const fallback = defaults[key]
    // Most persisted keys are primitives; settle those without stringifying. Only the
    // platform-options objects reach the structural comparison. This runs on every
    // persisted state change, i.e. on every keystroke in an input.
    if (value === fallback) continue
    if (value !== null && typeof value === 'object') {
      if (JSON.stringify(value) === JSON.stringify(fallback)) continue
    }
    result[key] = value
  }
  return result
}

// Combined store type
export type ConfigStore = HardwareSlice &
  TopologySlice &
  WorkloadSlice &
  AdvancedSlice & {
    resetToDefaults: () => void
  }

/**
 * The default configuration, taken from the slices themselves rather than restated here.
 *
 * A StateCreator's body builds its initial state eagerly and only closes over `set`/`get` inside
 * its action functions, so invoking one with inert stubs yields the slice's defaults without
 * touching a store. Restating them was a fourth copy of the same field list, and it had already
 * drifted: `performanceThreshold`, `driveConnectivity` and `driveFormFactor` were missing, so
 * `resetToDefaults()` — a merging `set` — silently left all three untouched.
 *
 * Each call re-invokes the creators, so the option objects are fresh: `resetToDefaults()` installs
 * new references rather than sharing the module-level defaults.
 */
const sliceDefaults = <T extends object>(creator: StateCreator<T>): Partial<T> => {
  const noop = (() => undefined) as never
  const raw = creator(noop, noop, noop) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value !== 'function'),
  ) as Partial<T>
}

const getDefaultState = () => ({
  ...sliceDefaults(createHardwareSlice),
  ...sliceDefaults(createTopologySlice),
  ...sliceDefaults(createWorkloadSlice),
  ...sliceDefaults(createAdvancedSlice),
})

/**
 * Frozen snapshot of the defaults, used only as the comparison baseline in `partialize`.
 *
 * `partialize` runs on every persisted state change, so rebuilding the default state — fifteen
 * `DEFAULT_*_OPTIONS` spreads — on each call was pure waste. `resetToDefaults` still calls
 * `getDefaultState()` so it installs fresh objects rather than sharing these references.
 */
const DEFAULT_STATE_BASELINE = getDefaultState()

export const useConfigStore = create<ConfigStore>()(
  persist(
    (...args) => ({
      ...createHardwareSlice(...args),
      ...createTopologySlice(...args),
      ...createWorkloadSlice(...args),
      ...createAdvancedSlice(...args),
      resetToDefaults: () => args[0](getDefaultState()),
    }),
    {
      name: 'raidy',
      storage: createJSONStorage(() => urlHashStorage),
      version: 1,
      partialize: (state) => {
        const persisted = {} as Pick<ConfigStore, PersistedKey>
        for (const key of PERSISTED_KEYS) {
          // Indexed assignment across a union of key types needs the cast; the Pick above is
          // what actually constrains the result.
          ;(persisted as Record<string, unknown>)[key] = state[key]
        }
        return omitDefaults(persisted, DEFAULT_STATE_BASELINE)
      },
    },
  ),
)
