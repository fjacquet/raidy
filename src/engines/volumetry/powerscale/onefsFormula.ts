/**
 * OneFS FEC stripe model — REFERENCE IMPLEMENTATION, tests only.
 *
 * Production lookups go through `efficiency.ts`, which reads Dell's own
 * numbers. This closed form is kept because it explains them, and because a
 * divergence between the two is the tripwire for a bad data regeneration.
 *
 * It is exact for every drive-level protection at every node count, and for
 * node-level protection below the neighborhood split (~20 nodes). Above that,
 * node pools split into neighborhoods in a way no closed form reproduced —
 * H710 at 22 nodes with +3n is 0.7250, which needs 15.95 data nodes and so
 * admits no integer neighborhood partition. That is why the table ships.
 *
 * Stripe geometry (u/M/nf per protection) lives in `stripeShape.ts` so this
 * formula and the performance write-penalty model can never disagree about
 * what a protection level means.
 */
import type { PowerScaleProtection } from '@/types/topology'
import { STRIPE_SHAPES } from './stripeShape'

/** Maximum protection-group width, by FEC unit count. */
const WIDTH_CAP: Record<number, number> = { 1: 18, 2: 18, 3: 18, 4: 20 }

export const DRIVE_LEVEL_PROTECTIONS: PowerScaleProtection[] = [
  '+2d:1n',
  '+3d:1n',
  '+3d:1n1d',
  '+4d:1n',
  '+4d:2n',
]

export function onefsClosedForm(protection: PowerScaleProtection, nodeCount: number): number {
  const shape = STRIPE_SHAPES[protection]
  if (!shape || nodeCount <= 0) return 0
  const { u, M, nf } = shape
  // Too few nodes for FEC: OneFS mirrors instead, capped by the nodes available.
  if (nodeCount < 2 * nf) return 1 / Math.min(nf + 1, nodeCount)
  const width = Math.min(u * nodeCount, WIDTH_CAP[M] ?? 20)
  return (width - M) / width
}
