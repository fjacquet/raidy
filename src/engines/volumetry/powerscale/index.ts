/**
 * PowerScale cluster volumetry.
 *
 * A cluster is 1-8 node pools (tiers), each sized independently against Dell's
 * PowerSizer export and then summed. Tiers are genuinely independent: OneFS
 * protection, stripe width and neighborhood splitting are all per node pool.
 *
 * PowerScale does not go through the generic drive-centric path in
 * `../index.ts` — there is no single drive, no single count and no single
 * efficiency to feed it.
 *
 * A tier the catalog cannot size (unknown model, unpublished
 * model/drive-size/protection/node-count combination) is dropped rather than
 * failing the whole cluster — see `sizeTier`'s doc comment. A cluster where
 * NO tier can be sized returns the zero state, not a throw and not a partial
 * result built from an empty tier list. Cluster efficiency is always
 * `Σ usable / Σ raw`, never an average of per-tier efficiencies, which would
 * be wrong whenever pools differ in size.
 */
import type { PowerScaleTierResult, VolumetryResult } from '@/types/results'
import type { PowerScaleOptions, PowerScaleTier } from '@/types/topology'
import { buildPowerScaleBreakdown } from '../breakdown/buildBreakdown'
import { sizeTier } from './tier'

const ZERO_STATE: VolumetryResult = {
  rawCapacity: 0,
  parityOverhead: 0,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 0,
  effectiveCapacity: 0,
  efficiency: 0,
  breakdown: [],
}

export function calculatePowerScaleVolumetry(options: PowerScaleOptions): VolumetryResult {
  const tiers = options.tiers.map(sizeTier).filter((t): t is PowerScaleTierResult => t !== null)

  if (tiers.length === 0) return { ...ZERO_STATE }

  const rawCapacity = tiers.reduce((sum, t) => sum + t.rawCapacity, 0)
  const usableCapacity = tiers.reduce((sum, t) => sum + t.usableLessVhs, 0)
  const effectiveCapacity = tiers.reduce((sum, t) => sum + t.effectiveCapacity, 0)
  const parityOverhead = tiers.reduce((sum, t) => sum + (t.rawCapacity - t.usableCapacity), 0)
  const hotSpareOverhead = tiers.reduce((sum, t) => sum + t.vhsReserve, 0)

  return {
    rawCapacity,
    parityOverhead,
    hotSpareOverhead,
    filesystemOverhead: 0,
    slopOverhead: 0,
    usableCapacity,
    effectiveCapacity,
    efficiency: rawCapacity > 0 ? (usableCapacity / rawCapacity) * 100 : 0,
    breakdown: buildPowerScaleBreakdown(tiers, usableCapacity),
    powerScaleDetails: {
      tiers,
      clusterRaw: rawCapacity,
      clusterUsable: usableCapacity,
      clusterEffective: effectiveCapacity,
      clusterEfficiency: rawCapacity > 0 ? usableCapacity / rawCapacity : 0,
    },
  }
}

/** Return shape of {@link powerScaleDriveTotals} — the contract three engines depend on. */
export interface PowerScaleDriveTotals {
  firstTierDrives: number
  firstTierNodes: number
  firstTierSpareDrives: number
  /**
   * The tier `firstTier*`/`firstTierDrives` etc. were derived from — the first tier that
   * `sizeTier` can actually size, which is not necessarily the literal `options.tiers[0]` (a
   * leading tier naming an unknown model, or an unpublished protection/node-count combination,
   * is skipped). `undefined` when no tier in the list is sizeable.
   *
   * Read this for anything that needs the SAME tier's own fields (protection, model, node
   * count) — indexing `options.tiers[0]` independently can silently point at a DIFFERENT tier
   * than the one these totals describe when an earlier tier is unsizeable.
   */
  firstTier: PowerScaleTier | undefined
  clusterDrives: number
  clusterNodes: number
}

/**
 * Drive and node populations for the engines that do not compute capacity.
 *
 * Performance and resilience use the FIRST tier: both are per-node-pool
 * physical phenomena, and raidy cannot express a workload spread across
 * heterogeneous pools. Sustainability uses the cluster totals: power and TCO
 * are additive.
 *
 * A tier is included here under EXACTLY the same rule `calculatePowerScaleVolumetry` uses to
 * include it in capacity — `sizeTier(tier) !== null` — not merely "the model name resolves".
 * `sizeTier` also rejects an unpublished protection/node-count combination and a zero per-drive
 * capacity; checking `getModel` alone let such a tier contribute its full drive count to power,
 * CO2 and TCO while contributing 0 TB to capacity (and let it become the "first tier" for
 * performance/resilience), the exact "confidently wrong on a dashboard that looks correct"
 * failure this module exists to prevent. Reusing `sizeTier`'s own result also means
 * `drivesPerNode` comes from the SAME lookup as the rest of the tier's numbers, not a second,
 * independent `getModel` call that could in principle disagree.
 */
export function powerScaleDriveTotals(options: PowerScaleOptions): PowerScaleDriveTotals {
  let clusterDrives = 0
  let clusterNodes = 0
  let firstTierDrives = 0
  let firstTierNodes = 0
  let firstTierSpareDrives = 0
  let firstTier: PowerScaleTier | undefined
  let seenFirst = false

  for (const tier of options.tiers) {
    const sized = sizeTier(tier)
    // A tier `sizeTier` cannot size (unknown model, unpublished protection/node-count
    // combination, zero per-drive capacity) contributes nothing; counting its nodes with a
    // fabricated drive count would understate density everywhere downstream.
    if (!sized) continue
    const drives = tier.nodeCount * sized.drivesPerNode
    clusterDrives += drives
    clusterNodes += tier.nodeCount
    if (!seenFirst) {
      firstTierDrives = drives
      firstTierNodes = tier.nodeCount
      firstTierSpareDrives = tier.vhsDriveCount
      firstTier = tier
      seenFirst = true
    }
  }

  return {
    firstTierDrives,
    firstTierNodes,
    firstTierSpareDrives,
    firstTier,
    clusterDrives,
    clusterNodes,
  }
}
