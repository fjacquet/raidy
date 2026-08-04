/**
 * Main configuration store with URL persistence.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_LONGHORN_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_POWERVAULT_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
} from '@/types'
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

// Default state for reset
const getDefaultState = () => ({
  // Hardware defaults
  driveId: 'ent-hdd-7k2-sata-24tb-cmr',
  driveCount: 12,
  serverCount: 1,
  serverPowerWatts: 400,

  // Topology defaults
  topology: { type: 'standard' as const, level: 'RAID6' as const },
  hotSpares: 1,
  // Options objects are spread from the canonical DEFAULT_*_OPTIONS constants
  // (src/types/topology.ts) — the same ones topologySlice.ts's initial state
  // uses — rather than restated here, so resetToDefaults() and a fresh store
  // can never drift apart again (they previously did on 5 fields: see
  // task-9-report.md).
  zfsOptions: { ...DEFAULT_ZFS_OPTIONS },
  s2dOptions: { ...DEFAULT_S2D_OPTIONS },
  vsanOptions: { ...DEFAULT_VSAN_OPTIONS },
  cephOptions: { ...DEFAULT_CEPH_OPTIONS },
  longhornOptions: { ...DEFAULT_LONGHORN_OPTIONS },
  beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS },
  powerFlexOptions: { ...DEFAULT_POWERFLEX_OPTIONS },
  controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS },
  netAppOptions: { ...DEFAULT_NETAPP_OPTIONS },
  synologyOptions: { ...DEFAULT_SYNOLOGY_OPTIONS },
  nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS },
  objectscaleOptions: { ...DEFAULT_OBJECTSCALE_OPTIONS },
  powerstoreOptions: { ...DEFAULT_POWERSTORE_OPTIONS },
  powerscaleOptions: { ...DEFAULT_POWERSCALE_OPTIONS },
  powervaultOptions: { ...DEFAULT_POWERVAULT_OPTIONS },

  // Workload defaults
  readPercent: 70,
  blockSize: '64K' as const,
  randomPercent: 50,
  datasetSize: 100 * 1024 * 1024 * 1024 * 1024,
  dailyWriteVolume: 1024 * 1024 * 1024 * 1024,

  // Advanced defaults
  compressionRatio: 1.5,
  dedupRatio: 1.0,
  networkSpeed: '25GbE' as const,
  pcieGen: 'gen4' as const,
  pcieLanes: 'x8' as const,
  pue: 1.4,
  carbonRegion: 'switzerland' as const,
  projectYears: 5,
  electricityCostPerKwh: 0.12,
  unitSystem: 'binary' as const,

  // Filesystem defaults
  fsType: 'zfs' as const,
  supportsReflink: true,
  backupRetention: 14,
  dailyChangeRate: 5,
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
