/**
 * Sizes one PowerScale node pool.
 *
 *   raw       = nodes x drivesPerNode x rawPerDrive
 *   usable    = raw x efficiency x usableFactor
 *   lessVHS   = usable - max(vhsByDriveCount, vhsByPercent)
 *   effective = lessVHS x drr(model)
 *
 * Every factor comes from Dell's PowerSizer export; none is computed here.
 *
 * `sizeTier` returns `null` — never a partial result, never a guessed value —
 * for an unknown model, a drive size that model does not offer, or any
 * (model, protection, nodeCount) the vendor catalog does not publish. The URL
 * schema deliberately does not validate `nodeModel` against the catalog, so
 * this is the layer that decides a configuration is unsizeable.
 */
import { getModel, rawPerDriveBytes, usableFactor } from '@/data/powerscaleCatalog'
import type { PowerScaleTierResult } from '@/types/results'
import type { PowerScaleTier } from '@/types/topology'
import { storageEfficiency } from './efficiency'

/** Decimal TB, the unit the vendor catalog uses. */
const TB = 1_000_000_000_000

export function sizeTier(tier: PowerScaleTier): PowerScaleTierResult | null {
  const model = getModel(tier.nodeModel)
  if (!model) return null

  // Node counts off the model's increment are not sellable, and — more importantly — not
  // published. The efficiency curves are built by carrying the last published value forward over
  // every integer, so an increment-2 model answers for odd counts too: A200 `+2n` returns 0.6667
  // at 7 nodes, the figure Dell publishes for 6. The panel snaps to the increment, but
  // `PowerScaleTierSchema` deliberately accepts any 3..252 on the grounds that THIS function is
  // the gate, so a hand-edited URL reaches it. Rejecting here keeps the promise ADR-0014 makes:
  // a combination the vendor does not publish is not sizeable, never a plausible-looking number.
  if ((tier.nodeCount - model.minNodes) % model.nodeIncrement !== 0) return null

  const efficiency = storageEfficiency(
    tier.nodeModel,
    tier.driveSizeTb,
    tier.protection,
    tier.nodeCount,
  )
  if (efficiency === undefined) return null

  const perDrive = rawPerDriveBytes(tier.nodeModel, tier.driveSizeTb)
  if (perDrive <= 0) return null

  const rawCapacity = tier.nodeCount * model.drivesPerNode * perDrive
  const usableCapacity = rawCapacity * efficiency * usableFactor(tier.nodeModel, tier.driveSizeTb)

  // Virtual Hot Spare, taken verbatim from the workbook (PowerScale Calculator L7/N7/Q7):
  //
  //   VHS by drives  = vhsDriveCount x driveSizeTb x 2.2
  //   VHS by percent = usable x vhsPercent
  //   usable less VHS = usable - (whichever reserve is larger)
  //
  // The 2.2 is a flat vendor constant applied to the NOMINAL drive size. It is
  // deliberately not multiplied by efficiency or usableFactor - the workbook
  // does neither, and "correcting" it to align units would diverge from the
  // source of truth. rawPerDriveBytes is a DIFFERENT quantity (it carries
  // catalog quirks like F210 @ 15.36 TB really being 15) and must not be used
  // for this reserve.
  const vhsByDrives = tier.vhsDriveCount * tier.driveSizeTb * 2.2 * TB
  const vhsByPercent = usableCapacity * (tier.vhsPercent / 100)
  const vhsSource: PowerScaleTierResult['vhsSource'] =
    vhsByDrives >= vhsByPercent ? 'driveCount' : 'percent'
  // The workbook does not clamp usable - VHS at zero, but a reserve larger
  // than the pool must yield 0 usable, not a negative capacity.
  const vhsReserve = Math.min(usableCapacity, Math.max(vhsByDrives, vhsByPercent))
  const usableLessVhs = Math.max(0, usableCapacity - vhsReserve)

  return {
    nodeModel: tier.nodeModel,
    driveSizeTb: tier.driveSizeTb,
    nodeCount: tier.nodeCount,
    protection: tier.protection,
    drivesPerNode: model.drivesPerNode,
    rawCapacity,
    usableCapacity,
    vhsReserve,
    vhsSource,
    usableLessVhs,
    effectiveCapacity: usableLessVhs * model.drr,
    efficiency,
    drr: model.drr,
    generation: model.generation,
    tier: model.tier,
    endOfLife: model.endOfLife,
  }
}
