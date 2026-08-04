/**
 * Fast-tier performance contribution, per platform.
 *
 * `calculatePerformance`'s tiered branch prices the media layer from the CAPACITY tier for
 * every platform except S2D (whose write-back-cache blend lives directly in
 * `src/engines/performance/index.ts`). This table is where a platform's fast tier earns a
 * contribution beyond that capacity-only baseline — reused where the semantics genuinely match
 * an existing model (vSAN OSA reuses S2D's blend), built fresh where they don't (Nutanix's
 * write-only, `randomPercent`-gated split), and deliberately absent where the fast tier
 * structurally cannot serve data I/O (Ceph WAL/DB, BeeGFS metadata targets — see the call site
 * in `index.ts` for why).
 *
 * Adding a fifth platform's fast-tier model is a table entry here, not a new branch in the
 * orchestrator — same pattern as `NETWORK_MODEL_BY_TOPOLOGY` in `./bottleneck-chain.ts`.
 *
 * Sourced from `docs/superpowers/specs/2026-08-04-fast-tier-performance-research.md`.
 */

import type { Drive } from '@/types/drive'
import type { TopologyType, VsanOptions } from '@/types/topology'

/** Inputs a per-platform fast-tier model resolver may need. */
export interface FastTierModelContext {
  /** Fast (cache/OpLog/etc.) tier drive. */
  cacheDrive: Drive
  /** Fast tier drive count, unadjusted for hot spares (spares are a capacity-tier concept). */
  cacheCount: number
  /** Capacity (bulk) tier drive. */
  capacityDrive: Drive
  /** Capacity tier drive count, unadjusted for hot spares. */
  capCount: number
  /** Capacity tier drive count with hot spares subtracted — the population that actually serves I/O. */
  capUsableDrives: number
  /** Working-set slider (0..100); read-side blends default to 20 when absent, matching S2D. */
  workingSetPercent?: number
  /** Random I/O share of the workload (0..100). */
  randomPercent: number
  vsanOptions?: VsanOptions
}

/** Media-layer read/write IOPS and bandwidth a fast-tier model contributes. */
export interface FastTierResult {
  readCapIOPS: number
  writeCapIOPS: number
  readBW: number
  writeBW: number
}

/** Resolves a platform's fast-tier contribution from the tiering/workload context. */
export type FastTierModelResolver = (ctx: FastTierModelContext) => FastTierResult

/** The capacity-tier-only baseline every "no model" and gated-off case falls back to. */
function capacityOnly(p: Drive, capUsableDrives: number): FastTierResult {
  const capDriveIOPS = Math.min(p.performance.iops_read, p.performance.iops_write)
  return {
    readCapIOPS: capDriveIOPS * capUsableDrives,
    writeCapIOPS: capDriveIOPS * capUsableDrives,
    readBW: p.performance.bandwidth_read_mb * capUsableDrives,
    writeBW: p.performance.bandwidth_write_mb * capUsableDrives,
  }
}

/**
 * vSAN OSA disk groups — reuses S2D's write-back-cache blend, gated on `diskGroupMode`.
 *
 * Writes: full write-back absorption by the cache tier in BOTH hybrid and all-flash modes —
 * VMware documents 100% of the cache device dedicated to the write buffer in both disk-group
 * modes (source: VMware Cloud Foundation blog, "Understanding vSAN Architecture: Disk Groups").
 *
 * Reads: hybrid disk groups split the cache device 70% read-cache / 30% write-buffer, targeting
 * a ~90% hit rate, so reads blend cache/capacity by `workingSetPercent` exactly as S2D does.
 * All-flash disk groups dedicate 100% of the cache device to the write buffer and 0% to read
 * cache (the capacity tier is already flash, so a separate read cache is redundant) — an
 * all-flash configuration gets no read-side benefit, so reads stay on the capacity-tier-only path.
 */
function vsanFastTierModel(ctx: FastTierModelContext): FastTierResult {
  const {
    cacheDrive: c,
    cacheCount,
    capacityDrive: p,
    capCount,
    capUsableDrives,
    vsanOptions,
  } = ctx

  const writeCapIOPS = cacheCount * c.performance.iops_write
  const writeBW = cacheCount * c.performance.bandwidth_write_mb

  if (vsanOptions?.diskGroupMode === 'hybrid') {
    const ws = (ctx.workingSetPercent ?? 20) / 100
    const readCapIOPS =
      ws * (cacheCount * c.performance.iops_read) + (1 - ws) * (capCount * p.performance.iops_read)
    const readBW =
      ws * (cacheCount * c.performance.bandwidth_read_mb) +
      (1 - ws) * (capCount * p.performance.bandwidth_read_mb)
    return { readCapIOPS, writeCapIOPS, readBW, writeBW }
  }

  // All-flash: no read cache, so reads reproduce the capacity-only baseline exactly.
  const capacityReads = capacityOnly(p, capUsableDrives)
  return {
    readCapIOPS: capacityReads.readCapIOPS,
    writeCapIOPS,
    readBW: capacityReads.readBW,
    writeBW,
  }
}

/**
 * Nutanix hybrid cluster OpLog — a write-only model split by `randomPercent`, NOT the S2D blend.
 *
 * Writes: the OpLog absorbs random writes (write-back, same treatment as S2D/vSAN's cache tier).
 * Nutanix's own documented routing rule sends writes with more than 1.5MB outstanding straight
 * to the extent store (capacity tier), bypassing OpLog entirely — so the sequential-write share
 * routes to the capacity tier instead. Source: Nutanix Bible, Book of AOS Storage.
 *
 * Reads: no model. ILM tier promotion is touch-count-triggered (3 touches/10min for random I/O,
 * 10 touches/10min for sequential) with no vendor-published hit-rate or working-set percentage
 * to anchor a `workingSetPercent`-style split — leaving reads on the capacity-tier-only path is
 * a deliberate decision, not an omission.
 */
function nutanixFastTierModel(ctx: FastTierModelContext): FastTierResult {
  const { cacheDrive: c, cacheCount, capacityDrive: p, capUsableDrives, randomPercent } = ctx
  const randomRatio = randomPercent / 100
  const sequentialRatio = 1 - randomRatio

  const writeCapIOPS =
    randomRatio * (cacheCount * c.performance.iops_write) +
    sequentialRatio * (capUsableDrives * p.performance.iops_write)
  const writeBW =
    randomRatio * (cacheCount * c.performance.bandwidth_write_mb) +
    sequentialRatio * (capUsableDrives * p.performance.bandwidth_write_mb)

  const capacityReads = capacityOnly(p, capUsableDrives)
  return {
    readCapIOPS: capacityReads.readCapIOPS,
    writeCapIOPS,
    readBW: capacityReads.readBW,
    writeBW,
  }
}

/**
 * Per-platform fast-tier model lookup. Platforms with no entry here (Ceph, BeeGFS) get no
 * fast-tier contribution — see the capacity-only fallback at the `calculatePerformance` call
 * site for why each of those is a deliberate, permanent "no model", not a gap to fill in later.
 */
export const FAST_TIER_MODEL_BY_TOPOLOGY: Partial<Record<TopologyType, FastTierModelResolver>> = {
  vsan_osa: vsanFastTierModel,
  nutanix: nutanixFastTierModel,
}

/** Resolve the fast-tier model for a topology type, or `undefined` if none is defined. */
export function resolveFastTierModel(
  topologyType: TopologyType,
): FastTierModelResolver | undefined {
  return FAST_TIER_MODEL_BY_TOPOLOGY[topologyType]
}
