/**
 * OneFS stripe geometry per protection level.
 *
 * u  = stripe units placed per node
 * M  = FEC (protection) units in the stripe
 * nf = node failures tolerated
 *
 * Shared by the capacity reference formula, the performance write-penalty model, and the
 * resilience worker's PowerScale node-failure model, so none of the three can disagree about
 * what '+3d:1n1d' means.
 */
import type { PowerScaleProtection } from '@/types/topology'

export interface StripeShape {
  u: number
  M: number
  nf: number
}

export const STRIPE_SHAPES: Record<PowerScaleProtection, StripeShape> = {
  '+1n': { u: 1, M: 1, nf: 1 },
  '+2n': { u: 1, M: 2, nf: 2 },
  '+3n': { u: 1, M: 3, nf: 3 },
  '+4n': { u: 1, M: 4, nf: 4 },
  '+2d:1n': { u: 2, M: 2, nf: 1 },
  '+3d:1n': { u: 3, M: 3, nf: 1 },
  '+3d:1n1d': { u: 2, M: 3, nf: 1 },
  '+4d:1n': { u: 4, M: 4, nf: 1 },
  '+4d:2n': { u: 2, M: 4, nf: 2 },
}

/**
 * True when OneFS falls back to N-way mirroring instead of node-level FEC striping — too few
 * nodes in the pool for the stripe's node-failure tolerance (`nf`) to be worth striping.
 *
 * Shared by the capacity closed form (`onefsFormula.ts`, test-only) and the resilience worker's
 * PowerScale node-failure model (`resilienceWorker.ts`) so the two can never place the boundary
 * in two different spots — see `powerScaleMirrorCopies` for the copy count used once inside it.
 */
export function isPowerScaleMirrorRegion(nf: number, nodeCount: number): boolean {
  return nodeCount < 2 * nf
}

/** Mirror copy count OneFS uses inside the mirror region, capped by the nodes actually available. */
export function powerScaleMirrorCopies(nf: number, nodeCount: number): number {
  return Math.min(nf + 1, nodeCount)
}
