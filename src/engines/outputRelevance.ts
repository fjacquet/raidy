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

/**
 * True when the generic backup estimator (`usable × dailyChangeRate% × retentionDays`) is
 * offered for this platform — one predicate for BOTH the Advanced panel's two backup inputs and
 * the dashboard's backup card, so the pair cannot drift into the state this branch has already
 * had to fix twice: a live output computed from an input the user cannot see.
 *
 * False for PowerScale alone. A OneFS cluster is sized against the vendor's node catalog, and
 * its data protection is sized by the backup product, not by a change-rate slider on the array
 * — so the two inputs are hidden there, and this is what keeps the card hidden with them.
 *
 * NOT a `PlatformCapabilities` flag: the backup engine reads `dailyChangeRate` and
 * `backupRetention` for every platform including PowerScale, so no probe against engine
 * behaviour could establish it. It is a product-scope decision and lives here, in the
 * relevance layer, where scope decisions belong.
 */
export function backupApplies(topology: Topology): boolean {
  return topology.type !== 'powerscale'
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
      // Opt-in on the topology: a caller that omits it gets no card, rather than one that
      // silently escapes the `backupApplies` guard because `undefined !== 'powerscale'`.
      return ctx.hasBackup === true && ctx.topology != null && backupApplies(ctx.topology)
    case 'flashEndurance':
      return ctx.sustainability?.flashEndurance != null
  }
}
