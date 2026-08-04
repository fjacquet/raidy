/**
 * Group-modelling regression tests for issues #70 and #67.
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

describe('resilience group-modelling vectors (#70, #67)', () => {
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
