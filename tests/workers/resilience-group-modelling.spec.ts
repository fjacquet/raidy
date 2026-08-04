/**
 * Group-modelling regression tests for issues #70, #67 and #66.
 *
 * See `tests/fixtures/resilience-vectors.ts` for the full narrative and
 * measured before/after numbers (also recorded in CHANGELOG.md).
 */

import * as fc from 'fast-check'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resilienceGroupVectors } from '../fixtures/resilience-vectors'

// ---------------------------------------------------------------------------
// Pure-function property tests: distributeAcrossGroups (#70) doesn't touch
// `self`/postMessage, so it's tested directly without the worker-message
// plumbing used below.
// ---------------------------------------------------------------------------
describe('distributeAcrossGroups (#70)', () => {
  it('every drive is assigned to exactly one group: widths sum to total', async () => {
    const { distributeAcrossGroups } = await import('@/workers/resilienceWorker')

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          expect(widths).toHaveLength(groups)
          expect(widths.reduce((a, b) => a + b, 0)).toBe(total)
        },
      ),
    )
  })

  it('widths differ by at most 1 (remainder spread evenly, not dumped on group 0)', async () => {
    const { distributeAcrossGroups } = await import('@/workers/resilienceWorker')

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 500 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          const max = Math.max(...widths)
          const min = Math.min(...widths)
          expect(max - min).toBeLessThanOrEqual(1)
        },
      ),
    )
  })

  it('the first (total % groups) groups get the extra drive, not group 0 alone', async () => {
    const { distributeAcrossGroups } = await import('@/workers/resilienceWorker')

    const widths = distributeAcrossGroups(11, 3)
    // 11 / 3 = base 3, remainder 2 -> groups [4, 4, 3], not [5, 3, 3] (old
    // behaviour would have silently dropped the 2 remainder drives entirely,
    // and any failure beyond a 3-drive group's capacity landed on group 0).
    expect(widths).toEqual([4, 4, 3])
  })
})

describe('buildGroupPairState (#66)', () => {
  it('each group total pair capacity equals its width', async () => {
    const { buildGroupPairState, distributeAcrossGroups } = await import(
      '@/workers/resilienceWorker'
    )

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          const { pairCapacity, groupPairStart, groupPairCount } = buildGroupPairState(widths)

          for (let g = 0; g < groups; g++) {
            const start = groupPairStart[g] ?? 0
            const count = groupPairCount[g] ?? 0
            let sum = 0
            for (let p = 0; p < count; p++) {
              sum += pairCapacity[start + p] ?? 0
            }
            expect(sum).toBe(widths[g])
          }
        },
      ),
    )
  })

  it('every pair capacity is 1 (unpaired solo drive) or 2 (real mirror pair)', async () => {
    const { buildGroupPairState, distributeAcrossGroups } = await import(
      '@/workers/resilienceWorker'
    )

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          const { pairCapacity } = buildGroupPairState(widths)
          for (const capacity of pairCapacity) {
            expect([1, 2]).toContain(capacity)
          }
        },
      ),
    )
  })

  it('a group has a capacity-1 solo slot iff its width is odd, and at most one', async () => {
    const { buildGroupPairState, distributeAcrossGroups } = await import(
      '@/workers/resilienceWorker'
    )

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          const { pairCapacity, groupPairStart, groupPairCount } = buildGroupPairState(widths)

          for (let g = 0; g < groups; g++) {
            const start = groupPairStart[g] ?? 0
            const count = groupPairCount[g] ?? 0
            const soloSlots = Array.from(
              { length: count },
              (_, p) => pairCapacity[start + p],
            ).filter((c) => c === 1)
            expect(soloSlots.length).toBe((widths[g] ?? 0) % 2 === 1 ? 1 : 0)
          }
        },
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// Worker-level behavioural vectors: run the real Monte Carlo simulation and
// check direction + rough magnitude against tests/fixtures/resilience-vectors.ts.
// ---------------------------------------------------------------------------
const mockPostMessage = vi.fn()
vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  onmessage: null,
})

async function runWorker(payload: Record<string, unknown>) {
  vi.resetModules()
  await import('@/workers/resilienceWorker')
  const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  mockPostMessage.mockClear()
  handler?.({ data: { type: 'START', payload } } as MessageEvent)
  return mockPostMessage.mock.calls.find((c) => c[0].type === 'RESULT')?.[0].payload as {
    survivalRate: number
  }
}

describe('resilience group-modelling vectors (#70, #67, #66)', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  for (const vector of resilienceGroupVectors) {
    // 20,000-iteration Monte Carlo runs comfortably clear vitest's 5000ms default
    // under plain `vitest run`, but v8 coverage instrumentation reliably pushes
    // them past it (see the identical note on the buddy-mirroring drivesPerTarget
    // test in resilience.spec.ts). 30000ms leaves ample margin without touching
    // simulationCount, which these bands rely on for stability.
    it(`${vector.name} [${vector.issue}]`, async () => {
      const result = await runWorker(vector.payload)
      expect(result).toBeDefined()

      if (vector.expectSurvivalAbove !== undefined) {
        expect(result.survivalRate).toBeGreaterThan(vector.expectSurvivalAbove)
      }
      if (vector.expectSurvivalBelow !== undefined) {
        expect(result.survivalRate).toBeLessThan(vector.expectSurvivalBelow)
      }
    }, 30000)
  }
})

describe('beegfs_raid10 per-pair tolerance (#66)', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('a wide 12-drive unmerged target survives many more failures than the old flat-tolerance-1 model would', async () => {
    // Old behaviour: parityPerGroup = 1 (getParityDrives('beegfs_raid10')), so
    // the group died the instant groupFailures > 1, i.e. at the 2nd failure
    // anywhere in the 12-drive target, regardless of which pairs were hit.
    // New behaviour: 12 drives = 6 independent mirror pairs; the target only
    // dies when one specific pair loses both its drives. With elevated AFR
    // over a year, 2+ failures scattered across a 6-pair target are common,
    // but only a fraction of those patterns hit the same pair twice — so
    // survival must be materially higher than what a tolerance-1 counter
    // would produce, without needing to be perfect (URE and correlated
    // failures still apply on top).
    // See the timeout comment above: 30000ms accommodates coverage instrumentation.
    const payload = {
      driveCount: 12,
      serverCount: 1,
      driveCapacityBytes: 4_000_000_000_000,
      rebuildSpeedMBs: 150,
      ureRate: 17 as const, // very low URE: isolate the per-pair tolerance effect
      afrPercent: 8.0,
      simulationCount: 20000,
      raidLevel: 'beegfs_raid10',
    }

    const result = await runWorker(payload)
    expect(result).toBeDefined()
    // A tolerance-1 counter under this AFR/driveCount would sit far below 50%
    // (verified against the pre-fix implementation during development, see
    // CHANGELOG.md). The per-pair model should comfortably clear it.
    expect(result.survivalRate).toBeGreaterThan(0.5)
  }, 30000)
})
