/**
 * PowerSizer conformance gate.
 *
 * Walks every row Dell's sizer produced and asserts our engine reproduces it.
 * Each row is a single-tier cluster with VHS disabled - the configuration the
 * workbook itself sizes. Multi-tier is proven separately by summation.
 *
 * Efficiency is an EXACT match: we ship the vendor's own numbers, so any drift
 * is a regression. Usable is compared relatively, because reconstructing it
 * from a 4-decimal efficiency and a fitted factor cannot beat the workbook's
 * own 2-decimal printing. See the task notes for the measured envelope.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTierResult } from '@/types/results'
import type { PowerScaleProtection, PowerScaleTier } from '@/types/topology'

interface VendorRow {
  model: string
  driveSizeTb: number
  nodes: number
  protection: PowerScaleProtection
  rawTb: number
  usableTb: number
  efficiency: number
}

const TB = 1_000_000_000_000
const __dirname = dirname(fileURLToPath(import.meta.url))

function loadFixture(): VendorRow[] {
  const csv = gunzipSync(
    readFileSync(join(__dirname, '../../../fixtures/powerscale-powersizer.csv.gz')),
  ).toString('utf8')
  return csv
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // `noUncheckedIndexedAccess` makes a plain destructure of `.split(',')` widen every
      // field to `T | undefined`; the fixture's shape is fixed (7 comma-separated columns,
      // verified by the row-count assertion below), so a tuple cast is honest here.
      const [model, driveSizeTb, nodes, protection, rawTb, usableTb, efficiency] = line.split(
        ',',
      ) as [string, string, string, PowerScaleProtection, string, string, string]
      return {
        model,
        driveSizeTb: Number(driveSizeTb),
        nodes: Number(nodes),
        protection: protection as PowerScaleProtection,
        rawTb: Number(rawTb),
        usableTb: Number(usableTb),
        efficiency: Number(efficiency),
      }
    })
}

const rows = loadFixture()

function size(row: VendorRow): PowerScaleTierResult | null {
  return sizeTier({
    nodeModel: row.model,
    driveSizeTb: row.driveSizeTb,
    nodeCount: row.nodes,
    protection: row.protection,
    vhsDriveCount: 0,
    vhsPercent: 0,
  })
}

describe('PowerSizer conformance', () => {
  it('loaded the full vendor export', () => {
    expect(rows).toHaveLength(122828)
  })

  it('can size every row the vendor can size', () => {
    const unsizeable = rows
      .filter((row) => size(row) === null)
      .slice(0, 10)
      .map((r) => `${r.model}/${r.driveSizeTb}/${r.nodes}/${r.protection}`)
    expect(unsizeable).toEqual([])
  })

  it('reproduces storage efficiency exactly', () => {
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t) continue
      // Both sides are the same 4-decimal vendor value; compare as basis points.
      if (Math.round(t.efficiency * 10000) !== Math.round(row.efficiency * 10000)) {
        misses.push(
          `${row.model}/${row.driveSizeTb}/${row.nodes}/${row.protection}: got ${t.efficiency}, want ${row.efficiency}`,
        )
        if (misses.length > 10) break
      }
    }
    expect(misses).toEqual([])
  })

  it('reproduces raw capacity to the workbook precision', () => {
    // The brief's original tolerance (flat +/- 0.005 TB, "2 decimals of TB") holds for the
    // ~121K rows where the vendor's cached "Raw TB" cell has a magnitude under 10,000: at
    // that size 2 decimals and 6 significant figures are the same thing, since raw is always
    // an integer number of drives times rawPerDriveTb (itself a multiple of 0.01).
    //
    // But 1,534 rows (all >= 10,000 TB raw - large node counts on F910/61.44) fail that flat
    // bound by up to 0.48 TB. Investigation (see task-9-report.md) proved this is NOT an
    // engine or extraction defect: for every one of those 1,534 rows, our exact computation
    // rounded to 6 significant figures (`raw.toPrecision(6)`) matches the vendor's cached
    // value bit-for-bit. The vendor's own "Raw TB" cell - read verbatim via openpyxl
    // data_only=True, never touched by our extraction script - simply carries fewer than 2
    // decimals once the integer part grows past 4 digits. Our engine computes the
    // mathematically exact raw capacity; the vendor's own export is the coarser of the two.
    //
    // So the gate accepts either: the original 2-decimal absolute bound (dominant regime,
    // catches any regression in nodes x drivesPerNode x rawPerDrive), or agreement to 6
    // significant figures (the vendor's own ceiling at large magnitudes). Measured max
    // relative error across all 122,828 rows: 0.0000040 (4.0e-6), comfortably inside the
    // 5e-6 (half a ULP at 6 sig figs) used here - never tightened further, and never loosened
    // beyond what the vendor's own cell precision can support.
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t) continue
      const rawTb = t.rawCapacity / TB
      const tolerance = Math.max(0.005, rawTb * 5e-6)
      if (Math.abs(rawTb - row.rawTb) > tolerance) {
        misses.push(`${row.model}/${row.driveSizeTb}/${row.nodes}: raw ${rawTb} != ${row.rawTb}`)
        if (misses.length > 10) break
      }
    }
    expect(misses).toEqual([])
  })

  it('reproduces usable capacity inside the workbook rounding envelope', () => {
    const errors: number[] = []
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t || row.usableTb <= 0) continue
      const rel = Math.abs(t.usableLessVhs / TB - row.usableTb) / row.usableTb
      errors.push(rel)
      if (rel > 0.0006) {
        misses.push(
          `${row.model}/${row.driveSizeTb}/${row.nodes}/${row.protection}: usable ${t.usableLessVhs / TB} != ${row.usableTb} (${(rel * 100).toFixed(4)}%)`,
        )
      }
    }
    expect(misses.slice(0, 10)).toEqual([])

    // The real regression tripwire: the bulk of rows must be far tighter than
    // the outer bound. Measured at authoring time: p99 = 0.008%.
    errors.sort((a, b) => a - b)
    const p99 = errors[Math.floor(errors.length * 0.99)]
    expect(p99).toBeLessThan(0.0001)
  })

  it('sums multi-tier clusters from sampled vendor rows', () => {
    const first = rows[0]
    const middle = rows[Math.floor(rows.length / 2)]
    const last = rows[rows.length - 1]
    if (!first || !middle || !last) throw new Error('fixture too small for a multi-tier sample')
    const picks = [first, middle, last]
    const tiers: PowerScaleTier[] = picks.map((row) => ({
      nodeModel: row.model,
      driveSizeTb: row.driveSizeTb,
      nodeCount: row.nodes,
      protection: row.protection,
      vhsDriveCount: 0,
      vhsPercent: 0,
    }))
    const cluster = calculatePowerScaleVolumetry({ tiers })
    const expectedRaw = tiers.reduce((sum, t) => sum + (sizeTier(t)?.rawCapacity ?? 0), 0)
    const expectedUsable = tiers.reduce((sum, t) => sum + (sizeTier(t)?.usableLessVhs ?? 0), 0)
    expect(cluster.rawCapacity).toBeCloseTo(expectedRaw, -6)
    expect(cluster.usableCapacity).toBeCloseTo(expectedUsable, -6)
  })
})
