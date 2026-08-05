/**
 * Replacement-sourcing delay (#93): a configuration with no dedicated hot spare cannot start
 * rebuilding the instant a drive fails — someone has to notice the alert, source a replacement
 * and install it first. `resilienceWorker.ts` models that as `REPLACEMENT_DELAY_DAYS = 1`
 * whenever `hasHotSpare` is false.
 *
 * The CHANGELOG records before/after survival vectors measured with `tsx` outside the test
 * harness. Those numbers are evidence but not a gate: nothing in CI would notice if the
 * mechanism stopped working. This file is the gate.
 *
 * `Math.random` is replaced with a seeded mulberry32 PRNG re-seeded before every run, so two
 * runs that follow the same code path consume the same stream and are exactly comparable.
 * AFR is stressed well above real-world rates for the same reason
 * `resilience-analytic.spec.ts` does it: at ~1% AFR the baseline dual-failure probability sits
 * far below the Monte Carlo noise floor, and no feasible iteration count would resolve a
 * one-day shift in the exposure window.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Deterministic PRNG — same seed, same stream. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mockPostMessage = vi.fn()
vi.stubGlobal('self', { postMessage: mockPostMessage, onmessage: null })

/**
 * 4 TB at 100 MB/s rebuilds in ~11.1 h, so `Math.ceil(11.1 / 24)` is a ONE-day rebuild. That
 * is deliberate: it is the case where a naive implementation of the delay collapses to nothing
 * (see the ordering test below).
 */
const BASE_PAYLOAD = {
  driveCount: 8,
  serverCount: 1,
  driveCapacityBytes: 4_000_000_000_000,
  rebuildSpeedMBs: 100,
  ureRate: 15,
  afrPercent: 20,
  simulationCount: 20000,
  raidLevel: 'RAID6',
}

const REAL_RANDOM = Math.random

async function runWorker(payload: Record<string, unknown>): Promise<number> {
  // Re-seed per run: both runs must see an identical random stream to be comparable.
  //
  // Plain assignment, NOT `vi.spyOn(Math, 'random')`. A spy records every call's arguments and
  // return value, and this worker draws millions of randoms per run — the `mock.calls` array
  // alone exhausts the 4 GB heap and the fork dies with "Ineffective mark-compacts near heap
  // limit" before a single assertion runs.
  Math.random = mulberry32(0x5eed)
  vi.resetModules()
  await import('@/workers/resilienceWorker')
  const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  mockPostMessage.mockClear()
  handler?.({ data: { type: 'START', payload } } as MessageEvent)
  const result = mockPostMessage.mock.calls.find((c) => c[0].type === 'RESULT')?.[0].payload as
    | { survivalRate: number }
    | undefined
  if (!result) throw new Error('worker posted no RESULT')
  return result.survivalRate
}

describe('replacement-sourcing delay (#93)', () => {
  beforeEach(() => mockPostMessage.mockClear())
  afterEach(() => {
    Math.random = REAL_RANDOM
  })

  /**
   * `hasHotSpare` is optional and defaults to `true`. Every caller that predates #93 — the
   * analytic cross-check, the group-modelling vectors, the worker's own unit tests — omits it,
   * and all of them assert against the pre-#93 model. If the default ever flipped, those suites
   * would start measuring a different model while still passing their wide bands.
   */
  it('omitting hasHotSpare is exactly the immediate-rebuild path, not merely close to it', async () => {
    const omitted = await runWorker(BASE_PAYLOAD)
    const explicit = await runWorker({ ...BASE_PAYLOAD, hasHotSpare: true })
    expect(omitted).toBe(explicit)
  }, 30000)

  it('a spare-free configuration survives strictly less often than a spared one', async () => {
    const spared = await runWorker({ ...BASE_PAYLOAD, hasHotSpare: true })
    const spareFree = await runWorker({ ...BASE_PAYLOAD, hasHotSpare: false })
    expect(spareFree).toBeLessThan(spared)
  }, 30000)

  /**
   * The ordering guard, and the reason this file exists.
   *
   * The delay countdown and the rebuild countdown are chained with `else if`, not two
   * independent `if`s. With independent `if`s and this payload — a 1-day delay followed by a
   * 1-day rebuild — both counters would reach zero on the same iteration as the triggering
   * failure, reproducing the immediate-rebuild timeline exactly. The fix would still be present
   * in the source, fully commented, and would do nothing.
   *
   * Verified by mutation: rewriting the `else if` as an independent `if` makes both this test
   * and the direction test above fail with spared and spare-free landing on the *identical*
   * survival rate (0.9992 vs 0.9992) rather than merely close ones — the signature of a
   * timeline that collapsed rather than one that merely shifted. The default-preservation test
   * still passes under that mutation, since it never exercises the spare-free path.
   *
   * The assertion is `not.toBe` rather than a survival band because what must be pinned is that
   * the two timelines differ at all; the magnitude is already covered above.
   */
  it('survives a rebuild short enough for the delay to collapse into it', async () => {
    const spared = await runWorker({ ...BASE_PAYLOAD, hasHotSpare: true })
    const spareFree = await runWorker({ ...BASE_PAYLOAD, hasHotSpare: false })
    expect(spareFree).not.toBe(spared)
  }, 30000)
})
