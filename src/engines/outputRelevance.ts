/**
 * Pure output-relevance predicates for the presales narrative dashboard.
 * A KPI tile or section is shown only when meaningful for the current
 * selection. Platform-driven relevance reuses the probe-verified capability
 * flags; data-driven relevance keys off result presence. Not-applicable ->
 * omit; applicable-but-zero -> show. Never hides a genuine zero.
 */
import { getCapabilities } from '@/engines/capabilities'
import type { SustainabilityResult, VolumetryResult } from '@/types/results'
import type { Topology } from '@/types/topology'

export type KpiId = 'usable' | 'effective' | 'efficiency' | 'peakIops' | 'survival' | 'annualEnergy'

export type SectionId =
  | 'capacity'
  | 'performance'
  | 'resilience'
  | 'cost'
  | 'takeaway'
  | 'zfsDetails'
  | 'longhornDetails'
  | 'beegfsDetails'
  | 'backup'
  | 'flashEndurance'

export interface RelevanceContext {
  topology: Topology
  volumetry: VolumetryResult
  sustainability: SustainabilityResult
  hasResilienceResult: boolean
  hasBackup: boolean
}

/** Narrow context for section relevance — acts pass only the fields they hold. */
export interface SectionContext {
  topology?: Topology
  volumetry?: VolumetryResult
  sustainability?: SustainabilityResult
  hasBackup?: boolean
}

/** True when compression/dedup meaningfully changes capacity for this platform. */
function effectiveDiffers(ctx: RelevanceContext): boolean {
  const caps = getCapabilities(ctx.topology.type)
  const supported = caps.supportsCompression || caps.supportsDedup
  return supported && ctx.volumetry.effectiveCapacity !== ctx.volumetry.usableCapacity
}

export function shouldShowKpi(kpi: KpiId, ctx: RelevanceContext): boolean {
  switch (kpi) {
    case 'usable':
    case 'efficiency':
    case 'peakIops':
    case 'annualEnergy':
      return true
    case 'effective':
      return effectiveDiffers(ctx)
    case 'survival':
      return ctx.hasResilienceResult
  }
}

export function shouldShowSection(section: SectionId, ctx: SectionContext): boolean {
  switch (section) {
    case 'capacity':
    case 'performance':
    case 'resilience':
    case 'cost':
    case 'takeaway':
      return true
    case 'zfsDetails':
      return ctx.topology?.type === 'zfs' && ctx.volumetry?.zfsDetails != null
    case 'longhornDetails':
      return ctx.topology?.type === 'longhorn' && ctx.volumetry?.longhornDetails != null
    case 'beegfsDetails':
      return ctx.topology?.type === 'beegfs' && ctx.volumetry?.beeGfsDetails != null
    case 'backup':
      return ctx.hasBackup === true
    case 'flashEndurance':
      return ctx.sustainability?.flashEndurance != null
  }
}
