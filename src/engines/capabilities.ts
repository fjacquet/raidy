/**
 * Platform capability map — the single source of truth for which inputs are
 * meaningful per topology type. UI panels consult this to hide no-op controls.
 * The probe suite (tests/engines/capabilities.spec.ts) asserts every flag
 * against actual engine behavior, so this map cannot silently drift.
 */
import type { Topology, TopologyType } from '@/types/topology'

export interface PlatformCapabilities {
  supportsCompression: boolean
  supportsDedup: boolean
  hasServerCount: boolean
  /**
   * True when `getFilesystemOverheadPercent` consults the user's `fsType` instead of
   * returning a platform constant.
   *
   * Exactly two types do: `standard`, via an explicit `case`, and `longhorn`, which has
   * NO case and therefore falls through to the `default` branch. The Longhorn half is
   * easy to miss by reading — the probe in tests/engines/capabilities.spec.ts is what
   * establishes it, and what will catch this flag drifting from the switch.
   */
  honoursFsType: boolean
  /**
   * True when the bottleneck chain includes a Controller layer built from
   * `CONTROLLER_LIMITS[controller]`, so the controller selector can change a result.
   *
   * False only for vSAN ESA, which is NVMe-direct: `isNvmeDirect` drops the Controller
   * layer from `layers` and derives `iopsCeiling` from PCIe and network alone.
   *
   * The probe (tests/engines/performance/controllerRelevance.spec.ts) runs at a
   * deliberately high drive count. At realistic counts the media layer binds first on most
   * platforms, so a small fixture would have shown eight topologies as "inert" — measuring
   * which layer happens to bind rather than whether the controller is read at all.
   */
  honoursController: boolean
}

// WHY THIS TABLE EXISTS
//
// A control that cannot change any number is worse than no control: it invites the user to tune
// something, then ignores them. `AdvancedPanel` consults this map to hide those controls.
//
// `supportsCompression`/`supportsDedup` answer one narrow question — does the *global*
// `VolumetryInput.compressionRatio`/`.dedupRatio` move `effectiveCapacity` for this platform.
// Not "does this platform do compression" (most do). The distinction is the whole point, and the
// per-platform breakdown below is where it is settled.
//
// The values were bootstrapped empirically rather than reasoned out: every flag was set to
// `true`, the probe suite run, and each flag the probe refuted was flipped. That is also how the
// table stays honest — `tests/engines/capabilities.spec.ts` asserts every flag against real
// engine behaviour, so a strategy change that alters what an input does fails the probe rather
// than silently desynchronising the UI. `applyCompressionDedup`
// (src/engines/volumetry/postProcessing/capacityEnhancements.ts) is the source of truth being
// tracked.
//
// Hot spares are deliberately NOT a flag here — see `DISTRIBUTED_SPARE_TOPOLOGIES` in
// src/types/topology.ts for why they cannot be (#130).
//
// powerscale.hasServerCount is false: PowerScale is a cluster of node pools/tiers, each with
// its own node count set in PowerScaleOptionsPanel, so the single shared servers slider in
// HardwarePanel is meaningless for it and stays hidden.
//
// Per platform:
//
// zfs: the ONLY platform whose strategy multiplies usableCapacity by the global ratios directly
// (`if (topology.type === 'zfs') return usableCapacity * compressionRatio * dedupRatio`).
//
// standard: RAID has no compression/dedup step at all — effectiveCapacity === usableCapacity
// unconditionally.
//
// s2d, proprietary (Synology levels — netapp_* levels have their own DRR path, but this
// representative uses synology_shr), powervault: no compression/dedup branch in
// applyCompressionDedup at all — falls through to the final `return usableCapacity` no-op.
//
// vsan_osa, vsan_esa, ceph, powerflex, powerstore, powerscale, objectscale, nutanix: each DOES
// support compression/dedup, but exclusively through its own platform-specific options object
// (powerFlexOptions.compression/.compressionRatio, nutanixOptions.compression/.compressionRatio,
// cephOptions.compression, vsanOptions.compression/.dedup, …) — NOT the global fields. So the
// shared slider is a no-op for them and is hidden; their own options panels carry the real
// controls.
export const PLATFORM_CAPABILITIES: Record<TopologyType, PlatformCapabilities> = {
  standard: {
    supportsCompression: false,
    supportsDedup: false,
    // UI exception: HardwarePanel still shows the slider for RAID50/60 (isRaidGroupMode),
    // where serverCount doubles as the RAID-group count and does affect capacity.
    hasServerCount: false,
    // Explicit `case 'standard'` in getFilesystemOverheadPercent.
    honoursFsType: true,
    honoursController: true,
  },
  zfs: {
    supportsCompression: true,
    supportsDedup: true,
    hasServerCount: false,
    honoursFsType: false,
    honoursController: true,
  },
  s2d: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  proprietary: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: false,
    honoursFsType: false,
    honoursController: true,
  },
  vsan_osa: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  vsan_esa: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    // NVMe-direct: `isNvmeDirect` drops the Controller layer from the bottleneck chain and
    // computes iopsCeiling from PCIe and network alone. The only type where this is false.
    // Flipping it to true fails the probe with "expected 4032512 to be greater than 4032512".
    honoursController: false,
  },
  ceph: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  powerflex: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  powerstore: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  powerscale: {
    supportsCompression: false,
    supportsDedup: false,
    // PowerScale is a cluster of node pools: node counts are per tier, set in
    // PowerScaleOptionsPanel, not the shared HardwarePanel servers slider.
    hasServerCount: false,
    honoursFsType: false,
    honoursController: true,
  },
  objectscale: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  nutanix: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
  powervault: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: false,
    honoursFsType: false,
    honoursController: true,
  },
  longhorn: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    // No `case 'longhorn'` in getFilesystemOverheadPercent — it reaches the `default`
    // branch, which reads the user's fsType exactly like standard RAID does. Flipping
    // this to false makes the probe fail with 2.85 TB vs 2.97 TB (ext4 5% vs xfs 1%).
    honoursFsType: true,
    honoursController: true,
  },
  beegfs: {
    supportsCompression: false,
    supportsDedup: false,
    hasServerCount: true,
    honoursFsType: false,
    honoursController: true,
  },
} as const

export function getCapabilities(type: TopologyType): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[type]
}

export function shouldShowControl(
  control: 'compression' | 'dedup' | 'serverCount' | 'fsType' | 'controller',
  type: TopologyType,
): boolean {
  const caps = getCapabilities(type)
  switch (control) {
    case 'compression':
      return caps.supportsCompression
    case 'dedup':
      return caps.supportsDedup
    case 'serverCount':
      return caps.hasServerCount
    case 'fsType':
      return caps.honoursFsType
    case 'controller':
      return caps.honoursController
  }
}

/**
 * True for standard RAID50/60, where serverCount doubles as the RAID-group
 * count and does affect capacity (see raidStrategy.calculateDataFraction).
 * Single source of truth — HardwarePanel.tsx imports this rather than
 * re-implementing it.
 */
export function isRaidGroupMode(topology: Topology): boolean {
  return (
    topology.type === 'standard' && (topology.level === 'RAID50' || topology.level === 'RAID60')
  )
}

/**
 * Clamps serverCount to 1 for platforms whose servers/nodes slider is hidden
 * (see HardwarePanel.tsx's `showServerCount`), so a stale serverCount left
 * over from switching away from a multi-node platform can't silently scale
 * volumetry/performance/sustainability results for a single-node platform.
 * Non-destructive: the store's serverCount value itself is untouched, so it
 * round-trips unchanged if the user switches back (finding #14).
 */
export function effectiveServerCount(serverCount: number, topology: Topology): number {
  if (shouldShowControl('serverCount', topology.type) || isRaidGroupMode(topology)) {
    return serverCount
  }
  return 1
}
