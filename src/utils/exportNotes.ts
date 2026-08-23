/**
 * The one caveat a customer-facing export carries.
 *
 * raidy is a quick sizing tool, not a vendor compliance artifact, so the caveat budget for a
 * whole document is one short line at the end: capacity and efficiency are the vendor's own
 * published figures, power/reliability/price/data-reduction are estimates, and the vendor's
 * sizer is where a firm quote comes from. No per-section notes and no per-row markers — a
 * figure that is an estimate is labelled once and shown, never suppressed.
 */
import type { Topology } from '@/types/topology'

/**
 * The export caveat for a catalog-sized platform, or `null` when the platform's figures all come
 * from the user's own hardware selection and there is nothing to say.
 *
 * Keyed off `powerscale` rather than `PlatformCapabilities.drivePopulationFromCatalog` on
 * purpose: the sentence names a specific vendor sizing tool, so a second catalog-backed platform
 * must bring its own sentence rather than silently inheriting this one.
 *
 * `t` is injected (never the i18n singleton) so this stays a pure function of its inputs, matching
 * `buildPptxContent` next door. The key is fully namespaced because the two callers reach it from
 * different default namespaces, and the deck and the report must show the SAME line.
 */
export function catalogEstimateNote(topology: Topology, t: (key: string) => string): string | null {
  return topology.type === 'powerscale' ? t('common:powerScale.estimateNote') : null
}
