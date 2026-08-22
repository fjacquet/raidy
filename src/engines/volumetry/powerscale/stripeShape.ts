/**
 * OneFS stripe geometry per protection level.
 *
 * u  = stripe units placed per node
 * M  = FEC (protection) units in the stripe
 * nf = node failures tolerated
 *
 * Shared by the capacity reference formula and the performance write-penalty
 * model, so the two can never disagree about what '+3d:1n1d' means.
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
