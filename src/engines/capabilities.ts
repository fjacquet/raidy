/**
 * Platform capability map — the single source of truth for which inputs are
 * meaningful per topology type. UI panels consult this to hide no-op controls.
 * The probe suite (tests/engines/capabilities.spec.ts) asserts every flag
 * against actual engine behavior, so this map cannot silently drift.
 */
import type { TopologyType } from '@/types/topology'

export interface PlatformCapabilities {
  supportsCompression: boolean
  supportsDedup: boolean
  supportsHotSpares: boolean
  hasServerCount: boolean
}

// Bootstrapped empirically (Step 3 of the task-15 brief): every flag was set to
// `true`, the probe suite run, and flags the probe refuted were flipped. See
// `applyCompressionDedup` in src/engines/volumetry/postProcessing/capacityEnhancements.ts —
// it is the sole source of truth this map must track.
//
// IMPORTANT: `supportsCompression`/`supportsDedup` here describe whether the
// *global* compressionRatio/dedupRatio inputs (VolumetryInput.compressionRatio /
// .dedupRatio) move effectiveCapacity for that platform — this is what the
// probe exercises via createVolumetryInput's top-level overrides.
//
// ZFS is the ONLY platform whose engine strategy multiplies usableCapacity by
// the global compressionRatio/dedupRatio directly (see applyCompressionDedup:
// `if (topology.type === 'zfs') return usableCapacity * compressionRatio * dedupRatio`).
//
// standard: RAID has no compression/dedup step at all — effectiveCapacity ===
// usableCapacity unconditionally (see the "Standard RAID has no
// compression/deduplication" comment in applyCompressionDedup).
//
// s2d, proprietary (Synology levels — netapp_* levels have their own DRR
// path, but this representative uses synology_shr), powervault: no
// compression/dedup branch in applyCompressionDedup at all — falls through to
// the final `return usableCapacity` no-op.
//
// vsan_osa, vsan_esa, ceph, powerflex, powerstore, powerscale, objectscale,
// nutanix: each DOES support compression/dedup, but exclusively through its
// own platform-specific options object (e.g. powerFlexOptions.compression /
// .compressionRatio, nutanixOptions.compression / .compressionRatio,
// cephOptions.compression, vsanOptions.compression / .dedup, etc.) — NOT the
// global compressionRatio/dedupRatio fields the probe drives. With
// createVolumetryInput's DEFAULT_*_OPTIONS (compression/dedup toggles off, or
// gated by their own ratio field untouched by the probe), the global knob is
// a no-op for these platforms. This is a real UI finding for Task 16: any
// generic compression/dedup slider tied to the global store fields is a
// no-op for every platform except zfs — these platforms need their
// platform-specific options panels instead, not the shared slider.
export const PLATFORM_CAPABILITIES: Record<TopologyType, PlatformCapabilities> = {
  standard: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: false,
  },
  zfs: {
    supportsCompression: true,
    supportsDedup: true,
    supportsHotSpares: true,
    hasServerCount: false,
  },
  s2d: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  proprietary: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: false,
  },
  vsan_osa: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  vsan_esa: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  ceph: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  powerflex: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  powerstore: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  powerscale: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  objectscale: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  nutanix: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
  powervault: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: false,
  },
  longhorn: {
    supportsCompression: false,
    supportsDedup: false,
    supportsHotSpares: true,
    hasServerCount: true,
  },
} as const

export function getCapabilities(type: TopologyType): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[type]
}

export function shouldShowControl(
  control: 'compression' | 'dedup' | 'hotSpares' | 'serverCount',
  type: TopologyType,
): boolean {
  const caps = getCapabilities(type)
  switch (control) {
    case 'compression':
      return caps.supportsCompression
    case 'dedup':
      return caps.supportsDedup
    case 'hotSpares':
      return caps.supportsHotSpares
    case 'serverCount':
      return caps.hasServerCount
  }
}
