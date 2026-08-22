/**
 * Typed accessors over the generated PowerScale vendor data.
 *
 * This is the ONLY module that knows the on-disk shape of
 * `powerscaleNodes.json`, and the only place TB (the vendor's unit) becomes
 * bytes (raidy's unit).
 *
 * Data is derived from Dell's PowerSizer via
 * `scripts/build-powerscale-catalog.mjs`. See
 * docs/superpowers/specs/2026-08-22-powerscale-onefs-design.md.
 */
import nodesData from '@/data/powerscaleNodes.json'
import type { PowerScaleProtection } from '@/types/topology'

const TB = 1_000_000_000_000

export type PowerScaleGeneration = 'Gen6' | 'Gen6.5' | 'Gen7'
export type PowerScaleNodeTier = 'All Flash' | 'Hybrid' | 'Archive'

export interface PowerScaleModel {
  id: string
  generation: PowerScaleGeneration
  tier: PowerScaleNodeTier
  drivesPerNode: number
  minNodes: number
  maxNodes: number
  nodeIncrement: number
  drr: number
  driveSizesTb: number[]
  /** ISO date from the workbook's Hardware EOL sheet; absent when not listed. */
  endOfLife?: string
}

interface RawDriveSize {
  rawPerDriveTb: number
  usableFactor: number
}
interface RawModel {
  generation: PowerScaleGeneration
  tier: PowerScaleNodeTier
  drivesPerNode: number
  minNodes: number
  maxNodes: number
  nodeIncrement: number
  drr: number
  endOfLife?: string
  driveSizes: Record<string, RawDriveSize>
}
interface RawCatalog {
  models: Record<string, RawModel>
  availability: Record<string, { a: [number, number][]; s: [number, string][] }>
  protectionSets: string[][]
}

const catalog = nodesData as unknown as RawCatalog

const MODELS: PowerScaleModel[] = Object.entries(catalog.models)
  .map(([id, m]) => ({
    id,
    generation: m.generation,
    tier: m.tier,
    drivesPerNode: m.drivesPerNode,
    minNodes: m.minNodes,
    maxNodes: m.maxNodes,
    nodeIncrement: m.nodeIncrement,
    drr: m.drr,
    endOfLife: m.endOfLife,
    driveSizesTb: Object.keys(m.driveSizes)
      .map(Number)
      .sort((a, b) => a - b),
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

const BY_ID = new Map(MODELS.map((m) => [m.id, m]))

export function listModels(): PowerScaleModel[] {
  return MODELS
}

export function getModel(id: string): PowerScaleModel | undefined {
  return BY_ID.get(id)
}

export function listDriveSizes(modelId: string): number[] {
  return BY_ID.get(modelId)?.driveSizesTb ?? []
}

/**
 * Resolves `driveSizeTb` to the on-disk decimal-string key for `modelId`'s
 * drive sizes ('15.36', '2', ...), matching numerically rather than by
 * string identity — the workbook's formatting is not a contract callers
 * should have to replicate.
 */
function resolveDriveSizeKey(modelId: string, driveSizeTb: number): string | undefined {
  const model = catalog.models[modelId]
  if (!model) return undefined
  return Object.keys(model.driveSizes).find((k) => Number(k) === driveSizeTb)
}

function driveSizeEntry(modelId: string, driveSizeTb: number): RawDriveSize | undefined {
  const key = resolveDriveSizeKey(modelId, driveSizeTb)
  return key === undefined ? undefined : catalog.models[modelId]?.driveSizes[key]
}

function availabilityEntry(modelId: string, driveSizeTb: number) {
  const key = resolveDriveSizeKey(modelId, driveSizeTb)
  return key === undefined ? undefined : catalog.availability[`${modelId}|${key}`]
}

export function rawPerDriveBytes(modelId: string, driveSizeTb: number): number {
  const entry = driveSizeEntry(modelId, driveSizeTb)
  return entry === undefined ? 0 : Math.round(entry.rawPerDriveTb * TB)
}

export function usableFactor(modelId: string, driveSizeTb: number): number {
  return driveSizeEntry(modelId, driveSizeTb)?.usableFactor ?? 1
}

/** Value of a run-length series at `nodeCount`, or undefined below its first breakpoint. */
function rleAt<T>(runs: [number, T][], nodeCount: number): T | undefined {
  let found: T | undefined
  for (const [from, value] of runs) {
    if (from > nodeCount) break
    found = value
  }
  return found
}

export function availableProtections(
  modelId: string,
  driveSizeTb: number,
  nodeCount: number,
): PowerScaleProtection[] {
  const entry = availabilityEntry(modelId, driveSizeTb)
  if (!entry) return []
  const idx = rleAt(entry.a, nodeCount)
  if (idx === undefined) return []
  return (catalog.protectionSets[idx] ?? []) as PowerScaleProtection[]
}

export function suggestedProtection(
  modelId: string,
  driveSizeTb: number,
  nodeCount: number,
): PowerScaleProtection | undefined {
  const entry = availabilityEntry(modelId, driveSizeTb)
  if (!entry) return undefined
  return rleAt(entry.s, nodeCount) as PowerScaleProtection | undefined
}
