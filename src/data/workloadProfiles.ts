/**
 * Workload presets, as data.
 *
 * These were four inline `onClick` bodies in WorkloadPanel — Database, File Server, Video
 * Streaming, Backup — and none of them describes a workload BeeGFS is deployed for. A parallel
 * filesystem serves HPC scratch, AI training and checkpointing, genomics and EDA; offering its
 * users an OLTP preset misrepresents the sizing before a single number is computed.
 *
 * So each profile carries a class, each topology declares which classes it serves, and the panel
 * renders the intersection. BeeGFS gets six HPC profiles; every other platform keeps the same
 * four it had, unchanged in both values and order.
 *
 * WHY NOT src/engines/capabilities.ts — the other per-topology map in this codebase. Every flag
 * there is asserted against real engine behaviour by tests/engines/capabilities.spec.ts, which is
 * what stops it drifting. Workload fit is an editorial judgement with no engine behaviour to
 * probe. Parking an unprobeable flag in that file would weaken the invariant that makes it worth
 * trusting.
 *
 * WHY labelKey HOLDS A WHOLE PATH — tests/i18n/orphanKeys.spec.ts scans src/**\/*.{ts,tsx} for
 * literal key substrings, so a literal here is visible to it. A template at the call site
 * (`t(`presets.${id}`)`) would not be, and would need a DYNAMIC_PREFIXES exemption covering the
 * whole subtree — the weaker check.
 *
 * Block sizes: the source recommendations give ranges ("512K to 1M"). `blockSize` is an enum, so
 * each profile takes one value from within its range — the larger end where throughput dominates,
 * the smaller where the pipeline is mixed.
 */

import type { BlockSize } from '@/types/config'
import type { TopologyType } from '@/types/topology'

/** Which audience a profile describes. A platform may serve more than one. */
export type ProfileClass = 'hpc' | 'general'

export interface WorkloadProfile {
  /** Stable identity, used as the React key and in tests. */
  id: string
  /** Full literal i18n path in the `workload` namespace — see the note above. */
  labelKey: string
  class: ProfileClass
  readPercent: number
  randomPercent: number
  blockSize: BlockSize
}

export const WORKLOAD_PROFILES: readonly WorkloadProfile[] = [
  // HPC / AI — from the BeeGFS workload recommendations.
  {
    id: 'aiTraining',
    labelKey: 'presets.aiTraining',
    class: 'hpc',
    readPercent: 70,
    randomPercent: 30,
    blockSize: '512K',
  },
  {
    id: 'aiCheckpointing',
    labelKey: 'presets.aiCheckpointing',
    class: 'hpc',
    readPercent: 20,
    randomPercent: 10,
    blockSize: '1M',
  },
  {
    id: 'hpcScratch',
    labelKey: 'presets.hpcScratch',
    class: 'hpc',
    readPercent: 60,
    randomPercent: 20,
    blockSize: '1M',
  },
  {
    id: 'genomics',
    labelKey: 'presets.genomics',
    class: 'hpc',
    readPercent: 65,
    randomPercent: 40,
    blockSize: '256K',
  },
  {
    id: 'edaCae',
    labelKey: 'presets.edaCae',
    class: 'hpc',
    readPercent: 55,
    randomPercent: 35,
    blockSize: '256K',
  },
  {
    id: 'aiInference',
    labelKey: 'presets.aiInference',
    class: 'hpc',
    readPercent: 80,
    randomPercent: 25,
    blockSize: '512K',
  },

  // General purpose — these four reproduce the previous inline buttons exactly.
  {
    id: 'database',
    labelKey: 'presets.database',
    class: 'general',
    readPercent: 70,
    randomPercent: 80,
    blockSize: '8K',
  },
  {
    id: 'fileServer',
    labelKey: 'presets.fileServer',
    class: 'general',
    readPercent: 90,
    randomPercent: 20,
    blockSize: '128K',
  },
  {
    id: 'videoStreaming',
    labelKey: 'presets.videoStreaming',
    class: 'general',
    readPercent: 95,
    randomPercent: 10,
    blockSize: '1M',
  },
  {
    id: 'backup',
    labelKey: 'presets.backup',
    class: 'general',
    readPercent: 20,
    randomPercent: 5,
    blockSize: '1M',
  },
]

/**
 * Which profile classes each platform serves. Exhaustive over TopologyType — a new platform
 * fails to compile until someone decides which audience it is for.
 *
 * Only BeeGFS is HPC today. Ceph and Longhorn appear in HPC deployments too, but classing either
 * as `['hpc', 'general']` is not a one-line change: `WorkloadPanel.tsx` keys both the "HPC / AI
 * Workload Profile" heading and the guidance paragraph off `isHpcTopology()`, and the guidance
 * string behind the `presets.hpcGuidance` key is BeeGFS-specific ("BeeGFS is generally optimized
 * for…"). A second HPC platform needs its own per-topology guidance key — and the panel wired to
 * pick it — before its class can change; the key name alone hides that this copy isn't generic.
 */
export const TOPOLOGY_PROFILE_CLASSES: Record<TopologyType, readonly ProfileClass[]> = {
  standard: ['general'],
  zfs: ['general'],
  s2d: ['general'],
  proprietary: ['general'],
  vsan_osa: ['general'],
  vsan_esa: ['general'],
  ceph: ['general'],
  powerflex: ['general'],
  powerstore: ['general'],
  powerscale: ['general'],
  objectscale: ['general'],
  nutanix: ['general'],
  powervault: ['general'],
  longhorn: ['general'],
  beegfs: ['hpc'],
}

/** The profiles to offer for a topology, in catalogue order. */
export function profilesForTopology(type: TopologyType): readonly WorkloadProfile[] {
  const classes = TOPOLOGY_PROFILE_CLASSES[type]
  return WORKLOAD_PROFILES.filter((p) => classes.includes(p.class))
}

/** True when the panel should use the HPC heading and show the BeeGFS guidance note. */
export function isHpcTopology(type: TopologyType): boolean {
  return TOPOLOGY_PROFILE_CLASSES[type].includes('hpc')
}
