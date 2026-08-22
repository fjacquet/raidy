/**
 * Storage-efficiency lookup against Dell's PowerSizer export.
 *
 * Efficiency is a function of (node model, protection, node count). A subset
 * of the keys also depend on drive size; those live in `exceptions` and win.
 * Values are stored as basis points to keep the table integral and compact.
 *
 * Returns `undefined` for any (model, drive size, protection, node count)
 * combination the vendor table does not publish — including a node count
 * below the curve's first entry. Never extrapolate: an unsupported
 * combination must report as "not sizeable", not a guessed value.
 */
import efficiencyData from '@/data/powerscaleEfficiency.json'
import type { PowerScaleProtection } from '@/types/topology'

interface Curve {
  from: number
  bp: number[]
}
interface EfficiencyTable {
  curves: Record<string, Curve>
  exceptions: Record<string, number>
}

const table = efficiencyData as unknown as EfficiencyTable

export function storageEfficiency(
  modelId: string,
  driveSizeTb: number,
  protection: PowerScaleProtection,
  nodeCount: number,
): number | undefined {
  const exception = table.exceptions[`${modelId}|${driveSizeTb}|${protection}|${nodeCount}`]
  if (exception !== undefined) return exception / 10000

  const curve = table.curves[`${modelId}|${protection}`]
  if (!curve) return undefined
  const idx = nodeCount - curve.from
  const value = curve.bp[idx]
  if (idx < 0 || value === undefined) return undefined
  return value / 10000
}
