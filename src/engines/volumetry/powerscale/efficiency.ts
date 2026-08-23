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

/**
 * Exception key with the drive size resolved against the keys actually present, mirroring
 * `resolveDriveSizeKey` in the catalog module. `2` and `2.0` are the same double but not the same
 * string, so the on-disk formatting is what has to match, not the caller's literal.
 */
function exceptionKey(
  modelId: string,
  driveSizeTb: number,
  protection: PowerScaleProtection,
  nodeCount: number,
): string {
  const exact = `${modelId}|${driveSizeTb}|${protection}|${nodeCount}`
  if (table.exceptions[exact] !== undefined) return exact
  const prefix = `${modelId}|`
  const suffix = `|${protection}|${nodeCount}`
  for (const key of Object.keys(table.exceptions)) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
    const size = key.slice(prefix.length, key.length - suffix.length)
    if (Number(size) === driveSizeTb) return key
  }
  return exact
}

export function storageEfficiency(
  modelId: string,
  driveSizeTb: number,
  protection: PowerScaleProtection,
  nodeCount: number,
): number | undefined {
  // Interpolating `driveSizeTb` would format 2.0 as '2', so a regenerated catalog that wrote the
  // key as '2.0' would silently miss every exception and fall through to the general curve — a
  // plausible wrong number rather than "not sizeable", which is the one outcome this module
  // exists to prevent. Resolve the size against the keys actually present, as the catalog does.
  const exception = table.exceptions[exceptionKey(modelId, driveSizeTb, protection, nodeCount)]
  if (exception !== undefined) return exception / 10000

  const curve = table.curves[`${modelId}|${protection}`]
  if (!curve) return undefined
  const idx = nodeCount - curve.from
  const value = curve.bp[idx]
  if (idx < 0 || value === undefined) return undefined
  return value / 10000
}
