/**
 * Pure content builder for the PowerScale export path (deck and report).
 *
 * The generic exports describe one drive model times a count. A PowerScale cluster is 1-8
 * heterogeneous node pools, each with its own node model, drive size, protection, Virtual Hot
 * Spare reserve and data-reduction ratio, so relabelling the generic hardware line was never
 * enough — the document's structure is wrong. This module produces the platform-specific content
 * both documents render.
 *
 * Like `pptxContent.ts` next door it is pure: no `pptxgenjs`/`jsPDF` types, no i18n singleton
 * (the translate function is injected), no `new Date()`. Everything it returns is a finished,
 * locale-formatted string, so the two renderers cannot format the same number differently.
 *
 * ## Two tables, not one row of thirteen columns
 *
 * Thirteen columns do not read on a 13.33" slide at any font size a customer would accept, so the
 * pools are shown twice: a core table (what the cluster holds) and a derivation table (how each
 * pool's usable capacity was arrived at). Both are keyed by the same pool number, and both carry
 * a cluster total, so no required column is dropped.
 *
 * ## The two efficiency columns
 *
 * They are different quantities and must never share a label:
 *
 * - **Protection efficiency (vendor)** — `PowerScaleTierResult.efficiency`, the vendor's own
 *   published figure, applied BEFORE `usableFactor` and before the VHS reserve.
 * - **Usable efficiency (after VHS)** — `usableLessVhs / rawCapacity`, what the pool actually
 *   delivers, and the per-pool form of `clusterEfficiency`.
 *
 * A one-pool cluster once reported 66.7% and 46.3% for the same pool under one heading. The
 * brief calls the second quantity "effective efficiency"; this module labels it *usable*
 * efficiency instead, because the same table already uses "Effective" for the after-DRR capacity
 * and two meanings of "effective" would recreate the defect in a new place.
 *
 * ## Verified against the engine, not assumed
 *
 * `calculatePowerScaleVolumetry` sums `usableLessVhs` (not `usableCapacity`) into `clusterUsable`,
 * and `clusterEfficiency` is `clusterUsable / clusterRaw` — i.e. it is the aggregate of the
 * *usable-after-VHS* quantity, which is why the cluster row sits in the derivation table's
 * "Usable efficiency" column and agrees exactly with a single pool's own cell.
 */

import type { Language } from '@/i18n/config'
import { formatNumber } from '@/i18n/formatters'
import type { PowerScaleCapacityDetails, PowerScaleTierResult } from '@/types/results'
import type { Topology } from '@/types/topology'
import { catalogEstimateNote } from './exportNotes'
import { formatBytes, type UnitSystem } from './units'

/**
 * The translate function both documents inject. Widened past `pptxContent`'s `(key) => string`
 * because the cluster summary interpolates three counts.
 */
export type ExportTranslate = (key: string, options?: Record<string, string | number>) => string

/** A label/value pair, rendered as a stat run in the deck and a two-column row in the report. */
export interface PowerScaleExportPair {
  label: string
  value: string
}

/** A finished table: every cell already localized. `totalRow` has the same arity as `columns`. */
export interface PowerScaleExportTable {
  title: string
  columns: string[]
  rows: string[][]
  totalRow: string[]
}

export interface PowerScaleExportContent {
  /** "Node pools 2 · Nodes 18 · Drives 240" — replaces the generic drive-model hardware line. */
  clusterSummary: string
  /** Cluster-wide figures, for the deck's stat line and the report's cluster table. */
  cluster: PowerScaleExportPair[]
  poolTable: PowerScaleExportTable
  derivationTable: PowerScaleExportTable
  /**
   * Scope, not caveat: the gauges and the survival figure model the first node pool only, while
   * capacity, power and cost cover the whole cluster. Shown once per document, beside the
   * performance figures it qualifies. The same sentence the dashboard shows.
   */
  scopeNote: string
  /** The document's entire caveat budget — one line, near the end. See `exportNotes.ts`. */
  estimateNote: string | null
}

/** Cells that do not sum across heterogeneous pools carry this rather than a fabricated total. */
const DASH = '—'

const ZERO_DETAILS: PowerScaleCapacityDetails = {
  tiers: [],
  clusterRaw: 0,
  clusterUsable: 0,
  clusterEffective: 0,
  clusterEfficiency: 0,
}

function nodeCountOf(tiers: PowerScaleTierResult[]): number {
  return tiers.reduce((sum, tier) => sum + tier.nodeCount, 0)
}

function driveCountOf(tiers: PowerScaleTierResult[]): number {
  return tiers.reduce((sum, tier) => sum + tier.nodeCount * tier.drivesPerNode, 0)
}

/**
 * The hardware line for a PowerScale export.
 *
 * Reached from `buildPptxContent` as well as from the dedicated path, so an export whose cluster
 * has no sizeable pool at all (`powerScaleDetails` absent) still says "Node pools 0" rather than
 * falling back to the Hardware panel's untouched drive model.
 */
export function powerScaleClusterSummary(
  details: PowerScaleCapacityDetails | undefined,
  t: ExportTranslate,
  language: Language,
): string {
  const tiers = details?.tiers ?? []
  return t('output:powerscale.export.clusterSummary', {
    pools: formatNumber(tiers.length, language),
    nodes: formatNumber(nodeCountOf(tiers), language),
    drives: formatNumber(driveCountOf(tiers), language),
  })
}

export interface PowerScaleExportOptions {
  t: ExportTranslate
  language: Language
  unitSystem: UnitSystem
  topology: Topology
}

export function buildPowerScaleExportContent(
  details: PowerScaleCapacityDetails | undefined,
  { t, language, unitSystem, topology }: PowerScaleExportOptions,
): PowerScaleExportContent {
  const d = details ?? ZERO_DETAILS
  const tiers = d.tiers

  const bytes = (value: number) => formatBytes(value, unitSystem)
  const count = (value: number) => formatNumber(value, language)
  const percent = (fraction: number) =>
    `${formatNumber(fraction * 100, language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`
  const ratio = (raw: number, part: number) => (raw > 0 ? part / raw : 0)

  // The vendor's VHS reserve is the LARGER of two formulas; `vhsSource` records which one won,
  // exactly as the vendor's own sheet highlights it. Shown as a column rather than a footnote so
  // a reader can see why one pool reserves far more than its neighbour.
  const vhsBasis = (tier: PowerScaleTierResult) =>
    tier.vhsSource === 'driveCount'
      ? t('output:powerscale.vhsBasis.driveCount')
      : t('output:powerscale.vhsBasis.percent')

  const poolTable: PowerScaleExportTable = {
    title: t('output:powerscale.tableCaption'),
    columns: [
      t('output:powerscale.column.pool'),
      t('output:powerscale.column.nodeModel'),
      t('output:powerscale.column.driveSize'),
      t('output:powerscale.column.nodes'),
      t('output:powerscale.column.drives'),
      t('output:powerscale.column.protection'),
      t('output:powerscale.column.raw'),
      t('output:powerscale.column.usableAfterVhs'),
      t('output:powerscale.column.drr'),
      t('output:powerscale.column.effective'),
    ],
    rows: tiers.map((tier, index) => [
      count(index + 1),
      // Generation and tier ride in the model cell: they qualify the model rather than being an
      // independent axis, and a fourteenth column would not have fitted. Both are catalog product
      // names ("Gen7", "All Flash"), untranslated like the protection notation beside them.
      `${tier.nodeModel} · ${tier.generation} ${tier.tier}`,
      count(tier.driveSizeTb),
      count(tier.nodeCount),
      count(tier.nodeCount * tier.drivesPerNode),
      tier.protection,
      bytes(tier.rawCapacity),
      bytes(tier.usableLessVhs),
      count(tier.drr),
      bytes(tier.effectiveCapacity),
    ]),
    totalRow: [
      '',
      t('output:powerscale.total'),
      DASH,
      count(nodeCountOf(tiers)),
      count(driveCountOf(tiers)),
      DASH,
      bytes(d.clusterRaw),
      bytes(d.clusterUsable),
      // A cluster DRR would be an average of assumptions about different data — meaningless
      // across an all-flash pool and an archive pool, which is why the platform has no
      // cluster-wide reduction field at all.
      DASH,
      bytes(d.clusterEffective),
    ],
  }

  const usableBeforeVhs = tiers.reduce((sum, tier) => sum + tier.usableCapacity, 0)
  const vhsTotal = tiers.reduce((sum, tier) => sum + tier.vhsReserve, 0)

  const derivationTable: PowerScaleExportTable = {
    title: t('output:powerscale.export.derivationTitle'),
    columns: [
      t('output:powerscale.column.pool'),
      t('output:powerscale.column.nodeModel'),
      t('output:powerscale.column.protectionEfficiency'),
      t('output:powerscale.column.usableBeforeVhs'),
      t('output:powerscale.column.vhsReserve'),
      t('output:powerscale.column.vhsPercentOfRaw'),
      t('output:powerscale.column.vhsBasis'),
      t('output:powerscale.column.usableAfterVhs'),
      t('output:powerscale.column.usableEfficiency'),
    ],
    rows: tiers.map((tier, index) => [
      count(index + 1),
      tier.nodeModel,
      percent(tier.efficiency),
      bytes(tier.usableCapacity),
      bytes(tier.vhsReserve),
      percent(ratio(tier.rawCapacity, tier.vhsReserve)),
      vhsBasis(tier),
      bytes(tier.usableLessVhs),
      percent(ratio(tier.rawCapacity, tier.usableLessVhs)),
    ]),
    totalRow: [
      '',
      t('output:powerscale.total'),
      // The vendor publishes protection efficiency per (model, protection, node count). Summing
      // or averaging it across pools would invent a figure the vendor never published.
      DASH,
      bytes(usableBeforeVhs),
      bytes(vhsTotal),
      percent(ratio(d.clusterRaw, vhsTotal)),
      DASH,
      bytes(d.clusterUsable),
      // `clusterEfficiency` IS `clusterUsable / clusterRaw`, so for a one-pool cluster this cell
      // and the single row's own cell are the same number by construction.
      percent(d.clusterEfficiency),
    ],
  }

  return {
    clusterSummary: powerScaleClusterSummary(details, t, language),
    cluster: [
      { label: t('output:powerscale.export.pools'), value: count(tiers.length) },
      { label: t('output:powerscale.column.nodes'), value: count(nodeCountOf(tiers)) },
      { label: t('output:powerscale.column.drives'), value: count(driveCountOf(tiers)) },
      { label: t('output:powerscale.column.raw'), value: bytes(d.clusterRaw) },
      { label: t('output:powerscale.column.usableAfterVhs'), value: bytes(d.clusterUsable) },
      { label: t('output:powerscale.column.effective'), value: bytes(d.clusterEffective) },
      {
        label: t('output:powerscale.column.usableEfficiency'),
        value: percent(d.clusterEfficiency),
      },
    ],
    poolTable,
    derivationTable,
    scopeNote: t('output:powerscale.firstTierOnly'),
    estimateNote: catalogEstimateNote(topology, t),
  }
}
