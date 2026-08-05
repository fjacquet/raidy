/**
 * Shared fast-tier failure domain (#88).
 *
 * Until this landed, the simulation reported survival as though the fast tier could not fail at
 * all — the one modelled behaviour that erred in the OPTIMISTIC direction. Two vendors document
 * the cascade:
 *
 *  - vSAN OSA: "vSAN interprets the failure of a single flash caching device as a failure of the
 *    entire disk group", cache and capacity devices alike marked degraded.
 *  - Ceph: "a corrupt block.db file will impact all OSDs which are included in that block.db file"
 *    (Red Hat; note the UPSTREAM Ceph docs do not state this — they document provisioning several
 *    db volumes on one SSD without the failure consequence).
 *
 * `Math.random` is replaced by plain assignment, not `vi.spyOn`: a spy records every call and this
 * worker draws millions of randoms per run, which exhausts the heap before any assertion runs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const REAL_RANDOM = Math.random

interface Outcome {
  survivalRate: number
  dualFailureProbability: number
}

async function run(payload: Record<string, unknown>): Promise<Outcome> {
  Math.random = mulberry32(0x5eed)
  vi.resetModules()
  await import('@/workers/resilienceWorker')
  const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  mockPostMessage.mockClear()
  handler?.({ data: { type: 'START', payload } } as MessageEvent)
  const result = mockPostMessage.mock.calls.find((c) => c[0].type === 'RESULT')?.[0]
    .payload as Outcome
  if (!result) throw new Error('worker posted no RESULT')
  return result
}

/** 48 capacity drives behind 8 cache devices — 6 drives per disk group, a realistic vSAN OSA shape. */
const BASE = {
  driveCount: 48,
  serverCount: 4,
  driveCapacityBytes: 8_000_000_000_000,
  rebuildSpeedMBs: 200,
  ureRate: 15,
  afrPercent: 5,
  simulationCount: 20000,
}

const FAST_TIER = { sharedFastTierAfrPercent: 2, fastTierDeviceCount: 8 }

describe('shared fast-tier failure domain (#88)', () => {
  beforeEach(() => mockPostMessage.mockClear())
  afterEach(() => {
    Math.random = REAL_RANDOM
  })

  /**
   * The falsifiability gate the design spec demanded: a zero-AFR cache device must reproduce the
   * pre-#88 numbers EXACTLY, not merely closely. Anything else means the event is coupled to
   * something it should not be — a changed random-draw order, say, which would silently reshuffle
   * every other mechanic in the worker.
   */
  it('a zero-AFR fast tier is bit-for-bit the pre-#88 model', async () => {
    const before = await run({ ...BASE, raidLevel: 'vsan_osa_raid1', mirrorCopies: 2 })
    const zeroAfr = await run({
      ...BASE,
      raidLevel: 'vsan_osa_raid1',
      mirrorCopies: 2,
      sharedFastTierAfrPercent: 0,
      fastTierDeviceCount: 8,
    })
    expect(zeroAfr).toEqual(before)
  }, 60000)

  it('omitting both fields entirely is also the pre-#88 model', async () => {
    const omitted = await run({ ...BASE, raidLevel: 'vsan_osa_raid5' })
    const zeroDevices = await run({
      ...BASE,
      raidLevel: 'vsan_osa_raid5',
      sharedFastTierAfrPercent: 2,
      fastTierDeviceCount: 0,
    })
    expect(zeroDevices).toEqual(omitted)
  }, 60000)

  it('vSAN OSA mirror survives less often once the cache device can fail', async () => {
    const off = await run({ ...BASE, raidLevel: 'vsan_osa_raid1', mirrorCopies: 2 })
    const on = await run({ ...BASE, raidLevel: 'vsan_osa_raid1', mirrorCopies: 2, ...FAST_TIER })
    expect(on.survivalRate).toBeLessThan(off.survivalRate)
  }, 60000)

  it('Ceph replicated survives less often once the block.db device can fail', async () => {
    const off = await run({ ...BASE, raidLevel: 'ceph_replicated_3', mirrorCopies: 3 })
    const on = await run({ ...BASE, raidLevel: 'ceph_replicated_3', mirrorCopies: 3, ...FAST_TIER })
    expect(on.survivalRate).toBeLessThan(off.survivalRate)
  }, 60000)

  /**
   * The mechanism, not just the direction. A cache failure kills six drives *at once*, which is a
   * far worse event than six drives failing independently across a year — so the dual-failure rate
   * must jump by much more than the survival rate drops. Measured: 0.015% → 4.5%, roughly 300x,
   * while survival moves 8 points.
   *
   * Without this assertion the suite would still pass if the blast radius collapsed to a single
   * drive, which would model the cascade as an ordinary failure and miss the entire point.
   */
  it('multiplies correlated (dual) failures, not merely single ones', async () => {
    const off = await run({ ...BASE, raidLevel: 'vsan_osa_raid1', mirrorCopies: 2 })
    const on = await run({ ...BASE, raidLevel: 'vsan_osa_raid1', mirrorCopies: 2, ...FAST_TIER })
    expect(on.dualFailureProbability).toBeGreaterThan(off.dualFailureProbability * 20)
  }, 60000)

  /**
   * A less reliable cache device costs survival. This is what pins that `sharedFastTierAfrPercent`
   * is actually read rather than the event firing at some fixed rate.
   *
   * It replaces a test that asserted "a wider blast radius is worse than a narrow one", which
   * measurement refuted and which is worth recording because it is counter-intuitive: at the same
   * per-device AFR, 16 devices killing 3 drives each gives 0.78 survival while 2 devices killing
   * 24 each gives 0.82. Expected drives lost is identical (48); what differs is the number of
   * independent redundancy-exhausting events, and more-and-smaller wins that race. Device count
   * therefore does NOT map monotonically to harm, and any future assertion about it needs
   * measuring rather than reasoning.
   */
  it('a less reliable cache device costs more survival', async () => {
    const reliable = await run({
      ...BASE,
      raidLevel: 'vsan_osa_raid1',
      mirrorCopies: 2,
      sharedFastTierAfrPercent: 0.5,
      fastTierDeviceCount: 8,
    })
    const flaky = await run({
      ...BASE,
      raidLevel: 'vsan_osa_raid1',
      mirrorCopies: 2,
      sharedFastTierAfrPercent: 4,
      fastTierDeviceCount: 8,
    })
    expect(flaky.survivalRate).toBeLessThan(reliable.survivalRate)
  }, 60000)
})
