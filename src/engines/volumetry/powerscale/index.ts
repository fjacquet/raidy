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
import type { PowerScaleOptions } from '@/types/topology'
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
