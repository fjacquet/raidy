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
/**
 * Whether power, CO2 and cost figures belong in a document for this platform.
 *
 * False for PowerScale alone, and this one is not a matter of taste. The vendor catalog publishes
 * capacity and efficiency; it publishes NO power, price or reliability data. So those figures are
 * derived from whichever generic drive sits in the (hidden) Hardware panel plus a generic default
 * watts-per-node — demonstrably so: on an unchanged 3-node F210 cluster, switching the reference
 * medium from a 24 TB SATA HDD to a 1.92 TB NVMe moved drive power from 87 W to 107 W. A figure
 * that answers to hardware which is not in the cluster does not belong beside capacity numbers
 * that match the vendor's table exactly; on a customer deliverable the two read as equally solid.
 *
 * Same shape and same reasoning as `backupApplies`: one predicate, consulted by the exports, so
 * the decision cannot drift between the PDF and the PPTX.
 *
 * NOTE: the on-screen Power & Sustainability card is deliberately NOT gated on this. Those same
 * figures stay visible while configuring, where they are a rough order of magnitude and the user
 * can see and change the medium they come from. The line drawn here is about what leaves the app.
 */
export function sustainabilityApplies(topology: Topology): boolean {
  return topology.type !== 'powerscale'
}

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
