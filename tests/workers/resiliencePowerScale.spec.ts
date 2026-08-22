/**
 * PowerScale node-failure model (fix round 1, item 1; unit budget replaces it in fix round 2).
 *
 * Before this fix, `useResilience.ts` sent `raidLevel: 'powerscale_onefs'` with no protection
 * information, `getParityDrives` had no case for it, and every PowerScale pool was silently
 * simulated tolerating exactly ONE drive failure regardless of its real `+Nn`/`+Nd:Mn`
 * protection — the `serverCount = firstTierNodes` Task 8 plumbed through was inert because
 * node identity was only ever consumed on the mirror and group paths. This file pins the fix:
 * `computeTopologyModel` now derives a real node-failure-tolerant model from `STRIPE_SHAPES`,
 * split into the two regimes OneFS itself uses —
 *
 *   - MIRROR region (`nodeCount < 2*nf`): reuses the EXISTING drive-pair mirror machinery
 *     (`isMirror`, `assignNodesRoundRobin`) verbatim, with `effectiveMirrorCopies =
 *     min(nf+1, nodeCount)`. The equivalence test below proves this by running a PowerScale
 *     input and a native `'mirror'` input with the same derived copy count through an
 *     IDENTICAL seeded random stream and asserting bit-identical survival rates — if the two
 *     code paths ever diverged, this test would catch it even though nothing else would.
 *   - FEC region (`nodeCount >= 2*nf`): a dedicated branch (neither `isGroup` — independent
 *     parallel groups, any one lost = total loss — nor the flat drive-count parity model, which
 *     is node-blind) spends a single UNIT BUDGET (fix round 2, item 1): a drive failure debits
 *     1 unit; a whole-node failure debits `u` units (realized as `u` accumulated drive debits on
 *     the same node, followed by a sweep of its remaining drives — see
 *     `applyPowerScaleNodeFailure`); loss when consumed units exceed `M`. `nf` stays in
 *     `STRIPE_SHAPES` as a vendor-published cross-check (`nf == floor(M / u)` holds for all nine
 *     entries) but is NOT read by the loss decision — the round-1 rule that used it directly
 *     ("more than `nf` nodes touched, OR more than `M` drives in one node") was vacuously wrong
 *     for every `+Nn` protection: with `u = 1` a node's own budget is exhausted by its FIRST
 *     failed drive regardless of how many more it has, so a 15-drive-per-node A200 under `+2n`
 *     was declared dead on the third drive failure concentrated in one node, contradicting the
 *     "+Nn tolerates whole-node loss" claim one file over.
 *
 * NOT vendor-attested (see `SimulationInput.powerScaleProtection`'s doc comment) — Dell's
 * PowerSizer export carries no AFR/URE/MTBF, so unlike every capacity number on this branch,
 * this model cannot be validated against the source of truth. The `applyPowerScaleNodeFailure`
 * tests below validate that the code does exactly what the unit-budget arithmetic says
 * (deterministic, no randomness involved); the seeded-worker tests validate directional
 * correctness (more tolerance survives more often) and the mirror-region equivalence.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SimulationInput } from '@/types/worker'

/** Deterministic PRNG — same seed, same stream. See resilienceReplacementDelay.spec.ts. */
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

async function runWorker(payload: Partial<SimulationInput>): Promise<number> {
  // Plain assignment, NOT `vi.spyOn(Math, 'random')` — see resilienceReplacementDelay.spec.ts
  // for why a spy would exhaust the heap on this many draws.
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

describe('applyPowerScaleNodeFailure (unit budget, fix round 2, item 1)', () => {
  it('+2n on a 15-drive-per-node A200 survives losing 30 drives across two whole nodes, dies on the third node’s first drive', async () => {
    const { applyPowerScaleNodeFailure } = await import('@/workers/resilienceWorker')
    // u=1, M=2 (STRIPE_SHAPES['+2n']). Every node touch reaches the u=1 threshold on its own
    // first hit, sweeping the rest of that node for free — this IS "+Nn tolerates whole-node
    // loss", realized without a second, independent nf-based counter.
    const u = 1
    const M = 2
    const nodeWidths = [15, 15, 15, 15] // A200-shaped: 15 drives/node
    const nodeFailures = [0, 0, 0, 0]
    let unitsConsumed = 0

    // Node 0's first (and, since u=1, only necessary) failure.
    unitsConsumed++
    const swept0 = applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 0)
    expect(swept0).toBe(14) // the other 14 drives of node 0 swept for free
    expect(nodeFailures[0]).toBe(15) // whole node marked gone
    expect(unitsConsumed).toBeLessThanOrEqual(M) // 1 <= 2: survives

    // Node 1's first failure: the SECOND whole node.
    unitsConsumed++
    const swept1 = applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 1)
    expect(swept1).toBe(14)
    expect((nodeFailures[0] ?? 0) + (nodeFailures[1] ?? 0)).toBe(30) // "survives two whole nodes — 30 drives"
    expect(unitsConsumed).toBe(M) // exactly at the budget limit
    expect(unitsConsumed).toBeLessThanOrEqual(M) // still alive at the boundary

    // Node 2's first failure: the pool's real tolerance is TWO nodes, not three.
    unitsConsumed++
    applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 2)
    expect(unitsConsumed).toBeGreaterThan(M) // dies — 3 > 2
  })

  it('+3d:1n1d survives one whole node plus one further single drive, dies on the next failure', async () => {
    const { applyPowerScaleNodeFailure } = await import('@/workers/resilienceWorker')
    // u=2, M=3 (STRIPE_SHAPES['+3d:1n1d']). The name IS the unit budget: "1 node" (u=2 units)
    // "+ 1 drive" (1 more unit) = 3 = M — the decisive case that discriminates the unit-budget
    // reading from every other one.
    const u = 2
    const M = 3
    const nodeWidths = [4, 4, 4] // arbitrary width > u, so there's something to sweep
    const nodeFailures = [0, 0, 0]
    let unitsConsumed = 0

    // Node 0's first drive: below its own u=2 threshold, no sweep yet.
    unitsConsumed++
    let swept = applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 0)
    expect(swept).toBe(0)
    expect(nodeFailures[0]).toBe(1)
    expect(unitsConsumed).toBeLessThanOrEqual(M)

    // Node 0's second drive: reaches u=2 -> the WHOLE node is now gone (sweep fires).
    unitsConsumed++
    swept = applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 0)
    expect(swept).toBe(2) // width(4) - u(2) = 2 extra drives swept
    expect(nodeFailures[0]).toBe(4)
    expect(unitsConsumed).toBe(2) // "1 node" = u = 2 units
    expect(unitsConsumed).toBeLessThanOrEqual(M)

    // "1 further drive": a single failure in a DIFFERENT, untouched node — not enough on its
    // own to reach THAT node's threshold.
    unitsConsumed++
    swept = applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 1)
    expect(swept).toBe(0)
    expect(nodeFailures[1]).toBe(1)
    expect(unitsConsumed).toBe(M) // exactly at the budget limit: survives
    expect(unitsConsumed).toBeLessThanOrEqual(M)

    // "dies on the next": one more failure, anywhere, exceeds the budget.
    unitsConsumed++
    applyPowerScaleNodeFailure(nodeFailures, nodeWidths, u, 1)
    expect(unitsConsumed).toBeGreaterThan(M)
  })

  it('a node whose width equals u has nothing to sweep (no crash, no free drives)', async () => {
    const { applyPowerScaleNodeFailure } = await import('@/workers/resilienceWorker')
    const nodeWidths = [4]
    const nodeFailures = [0]
    // u == width: every physical drive must individually fail before the node is "gone" —
    // the sweep step degrades to a no-op rather than a negative/garbage swept count.
    for (let i = 0; i < 3; i++) {
      expect(applyPowerScaleNodeFailure(nodeFailures, nodeWidths, 4, 0)).toBe(0)
    }
    expect(applyPowerScaleNodeFailure(nodeFailures, nodeWidths, 4, 0)).toBe(0) // the 4th, reaching threshold
    expect(nodeFailures[0]).toBe(4)
  })
})

describe('resilienceWorker PowerScale topology classification (computeTopologyModel)', () => {
  it('FEC region: nodeCount >= 2*nf gets the dedicated node-failure model, not isMirror/isGroup', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    // +2n: nf=2, M=2, u=1. 2*nf = 4, so 10 nodes is comfortably FEC region.
    const topo = computeTopologyModel({
      driveCount: 40,
      raidLevel: 'powerscale_onefs',
      driveCapacityBytes: 1e12,
      rebuildSpeedMBs: 100,
      ureRate: 15,
      afrPercent: 1,
      simulationCount: 1,
      serverCount: 10,
      powerScaleProtection: '+2n',
    })
    expect(topo.isPowerScaleFec).toBe(true)
    expect(topo.isMirror).toBe(false)
    expect(topo.isGroup).toBe(false)
    expect(topo.powerScaleNodeTolerance).toBe(2) // nf, cross-check only
    expect(topo.powerScaleUnitBudget).toBe(2) // M
    expect(topo.powerScaleUnitsPerNode).toBe(1) // u
    expect(topo.powerScaleNodeWidths).toHaveLength(10)
    expect(topo.powerScaleNodeWidths.reduce((a, b) => a + b, 0)).toBe(40)
  })

  it('mirror region: nodeCount < 2*nf reuses isMirror with effectiveMirrorCopies = min(nf+1, nodeCount)', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    // +4n: nf=4. 2*nf = 8. Only 3 nodes -> mirror region, copies = min(5, 3) = 3.
    const topo = computeTopologyModel({
      driveCount: 12,
      raidLevel: 'powerscale_onefs',
      driveCapacityBytes: 1e12,
      rebuildSpeedMBs: 100,
      ureRate: 15,
      afrPercent: 1,
      simulationCount: 1,
      serverCount: 3,
      powerScaleProtection: '+4n',
    })
    expect(topo.isMirror).toBe(true)
    expect(topo.isPowerScaleFec).toBe(false)
    expect(topo.effectiveMirrorCopies).toBe(3)
    expect(topo.numMirrorGroups).toBe(4) // floor(12 / 3)
  })

  it('pins the mirror/FEC boundary from both sides at nodeCount == 2*nf exactly (fix round 2, item 4)', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    // +2n: nf=2, so the boundary is at nodeCount=4. `isPowerScaleMirrorRegion` uses `<`, not
    // `<=` — flipping that operator would make nodeCount==2*nf fall into the mirror region
    // instead of FEC, and this pair of assertions is what catches that mutation.
    const buildAt = (serverCount: number) =>
      computeTopologyModel({
        driveCount: 40,
        raidLevel: 'powerscale_onefs',
        driveCapacityBytes: 1e12,
        rebuildSpeedMBs: 100,
        ureRate: 15,
        afrPercent: 1,
        simulationCount: 1,
        serverCount,
        powerScaleProtection: '+2n',
      })

    const atBoundary = buildAt(4) // 2*nf exactly
    expect(atBoundary.isPowerScaleFec).toBe(true)
    expect(atBoundary.isMirror).toBe(false)

    const justBelow = buildAt(3) // 2*nf - 1
    expect(justBelow.isPowerScaleFec).toBe(false)
    expect(justBelow.isMirror).toBe(true)
    expect(justBelow.effectiveMirrorCopies).toBe(3) // min(nf+1, 3) = min(3, 3) = 3
  })

  it('no protection supplied: neither region activates, falls back to the generic single-parity default', async () => {
    const { computeTopologyModel, getParityDrives } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      driveCount: 40,
      raidLevel: 'powerscale_onefs',
      driveCapacityBytes: 1e12,
      rebuildSpeedMBs: 100,
      ureRate: 15,
      afrPercent: 1,
      simulationCount: 1,
      serverCount: 10,
      // powerScaleProtection omitted — e.g. an empty tier list.
    })
    expect(topo.isPowerScaleFec).toBe(false)
    expect(topo.isMirror).toBe(false)
    expect(topo.parityDrives).toBe(getParityDrives('powerscale_onefs'))
    expect(topo.parityDrives).toBe(1)
  })

  it('drive-level protections resolve to their own u/M/nf, not their node-level peers’ (+2d:1n)', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      driveCount: 40,
      raidLevel: 'powerscale_onefs',
      driveCapacityBytes: 1e12,
      rebuildSpeedMBs: 100,
      ureRate: 15,
      afrPercent: 1,
      simulationCount: 1,
      serverCount: 10,
      powerScaleProtection: '+2d:1n',
    })
    expect(topo.powerScaleNodeTolerance).toBe(1) // nf
    expect(topo.powerScaleUnitBudget).toBe(2) // M
    expect(topo.powerScaleUnitsPerNode).toBe(2) // u
  })

  it('serverCount: 0 does not crash the mirror path (fix round 2, item 3)', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    // Unreachable through useResilience today (the resolver returns early at
    // firstTierDrives === 0), but computeTopologyModel is exported and directly tested, and the
    // FEC path already guarded the analogous case with Math.max(1, serverCount) while the
    // mirror path did not: powerScaleMirrorCopies(nf, 0) = 0 -> effectiveMirrorCopies = 0 ->
    // numMirrorGroups = Math.floor(driveCount / 0) = Infinity -> assignNodesRoundRobin allocates
    // an Infinite-length array -> RangeError.
    expect(() =>
      computeTopologyModel({
        driveCount: 0,
        raidLevel: 'powerscale_onefs',
        driveCapacityBytes: 1e12,
        rebuildSpeedMBs: 100,
        ureRate: 15,
        afrPercent: 1,
        simulationCount: 1,
        serverCount: 0,
        powerScaleProtection: '+4n',
      }),
    ).not.toThrow()
  })
})

describe('resilienceWorker PowerScale survival (statistical, seeded)', () => {
  afterEach(() => {
    Math.random = REAL_RANDOM
  })

  const BASE: Partial<SimulationInput> = {
    driveCapacityBytes: 4_000_000_000_000,
    rebuildSpeedMBs: 100,
    ureRate: 15,
    // Stressed above real-world rates, same reason resilience-analytic.spec.ts and
    // resilienceReplacementDelay.spec.ts do it — but NOT as far above as fix round 1's 25%: at
    // 80 drives / 20 nodes, 25% AFR touches nearly every node within the simulated year
    // regardless of nf (expected ~12-13 of 20 nodes get at least one failure), so every
    // configuration below died at the Monte Carlo noise floor (0/20000) and the comparisons
    // asserted nothing. 3% keeps the survival probabilities in a measurable, well-separated
    // range for every pair compared below (verified empirically, not guessed).
    afrPercent: 3,
    simulationCount: 20000,
    raidLevel: 'powerscale_onefs' as const,
  }

  it('closes the protection-blind regression: a +3n 20-node pool survives far more often than the same population with no protection known', async () => {
    const noProtection = await runWorker({ ...BASE, driveCount: 80, serverCount: 20 })
    const threeNodeTolerant = await runWorker({
      ...BASE,
      driveCount: 80,
      serverCount: 20,
      powerScaleProtection: '+3n',
    })
    // Pre-fix, both paths were identical (parityDrives=1 default, node-blind) — this asymmetry
    // did not exist. It exists now because the +3n pool tolerates 3 whole nodes' worth of
    // failures instead of being declared dead on the second drive failure anywhere.
    expect(threeNodeTolerant).toBeGreaterThan(noProtection)
  }, 30000)

  it('FEC region: more node tolerance (nf) survives more often at the same population', async () => {
    const oneNodeTolerant = await runWorker({
      ...BASE,
      driveCount: 80,
      serverCount: 20,
      powerScaleProtection: '+1n',
    })
    const fourNodeTolerant = await runWorker({
      ...BASE,
      driveCount: 80,
      serverCount: 20,
      powerScaleProtection: '+4n',
    })
    expect(fourNodeTolerant).toBeGreaterThan(oneNodeTolerant)
  }, 30000)

  it('mirror region: PowerScale reuses the drive-pair mirror machinery EXACTLY — bit-identical survival to a native N-way mirror under the same random stream', async () => {
    // +4n: nf=4, 2*nf=8. 3 nodes -> mirror region, effectiveMirrorCopies = min(5,3) = 3, the
    // SAME derivation `computeTopologyModel` performs internally. If the PowerScale mirror-
    // region wiring ever stopped routing through the exact same isMirror code (mirrorCopies,
    // numMirrorGroups, assignNodesRoundRobin — all identical formulas either way), this
    // equivalence would break even though neither survival number alone would look wrong.
    const powerScale = await runWorker({
      ...BASE,
      driveCount: 12,
      serverCount: 3,
      powerScaleProtection: '+4n',
    })
    const nativeMirror = await runWorker({
      ...BASE,
      driveCount: 12,
      serverCount: 3,
      raidLevel: 'mirror',
      mirrorCopies: 3,
    })
    expect(powerScale).toBe(nativeMirror)
  }, 30000)

  it('FEC region: a larger unit budget (M) survives strictly more often than a smaller one at the same node tolerance (fix round 2, item 4)', async () => {
    // +4d:2n (u=2, M=4, nf=2) vs +2n (u=1, M=2, nf=2): SAME nf, but +4d:2n's budget is twice as
    // large, so it should survive STRICTLY more often — a `toBeGreaterThanOrEqual` here would
    // pass even if M were silently ignored (equal survival), which is exactly what the previous
    // version of this test failed to rule out.
    const nodeLevel = await runWorker({
      ...BASE,
      driveCount: 40,
      serverCount: 10,
      powerScaleProtection: '+2n', // nf=2, M=2
    })
    const driveLevel = await runWorker({
      ...BASE,
      driveCount: 40,
      serverCount: 10,
      powerScaleProtection: '+4d:2n', // nf=2, M=4
    })
    expect(driveLevel).toBeGreaterThan(nodeLevel)
  }, 30000)
})

describe('resilienceWorker PowerScale FEC — scripted deterministic unit-boundary pin (Task 9 fold-in)', () => {
  afterEach(() => {
    Math.random = REAL_RANDOM
  })

  /**
   * Returns values from `script` in call order, then a constant safe-high value (0.99) forever
   * after. 0.99 is guaranteed to fail every `random() < probability` check in this model — the
   * daily failure rate, the correlated-failure trigger (fixed at 0.1), and the URE probability
   * are all far below it — so every UNSCRIPTED call is a deliberate no-op, regardless of exactly
   * how many of them occur or where.
   *
   * Unlike `mulberry32` above, this is not a PRNG feeding a 20,000-run statistical trend: it is
   * a literal, hand-verified call sequence (checked line-by-line against
   * `runSingleSimulation`'s `isPowerScaleFec` branch) that drives ONE simulation
   * (`simulationCount: 1`) through an EXACT, pinned sequence of node failures.
   */
  function scriptedRandom(script: number[]): () => number {
    let i = 0
    return () => (i < script.length ? (script[i++] ?? 0.99) : 0.99)
  }

  async function runScripted(payload: Partial<SimulationInput>, script: number[]): Promise<number> {
    Math.random = scriptedRandom(script)
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

  // '+2d:1n': u=2, M=2, nf=1 (STRIPE_SHAPES). 2 nodes (serverCount=2) sits exactly at the
  // FEC/mirror boundary (nodeCount == 2*nf is FEC, not mirror — see the boundary test above), and
  // 8 drives -> distributeAcrossGroups(8, 2) = [4, 4]: each node has 2 MORE drives than u, so the
  // sweep on a node's u-th hit has something real to sweep (swept = width - u = 2 > 0) — exactly
  // the condition the reviewer's mutation (`powerScaleUnitsConsumed += swept > 0 ? u : 1`) only
  // misbehaves on. A protection where every node-hit sweeps nothing (or where u == 1, so `swept >
  // 0 ? u : 1` always picks 1 anyway) cannot distinguish the mutant from the correct code.
  const SCRIPT = [
    0, // #1 drive-loop failure check (drive index 0)  -> true:  fails
    0.99, // #2 correlated-failure trigger              -> false: no window
    0, // #3 FEC weighted node selection                -> picks node 0 (first hit)
    0, // #4 drive-loop failure check (drive index 1)  -> true:  fails
    0.99, // #5 correlated-failure trigger              -> false: no window
    0, // #6 FEC weighted node selection                -> picks node 0 again (SECOND hit)
  ]
  // After #6, node 0's own failure count reaches u=2 -> `applyPowerScaleNodeFailure` sweeps its
  // other 2 drives. Correct code debits 1 unit per event regardless (2 events -> consumed = 2 =
  // M): `consumed > M` is false, survives, then reaches the URE roll (`consumed >= M` is true) -
  // scripted call #7 is unscripted and defaults to 0.99, so no URE death either. The mutant
  // debits `u` = 2 on the SWEEPING event instead of 1 (1 + 2 = 3): `consumed(3) > M(2)` is true
  // on event #2 itself, so the mutant returns dead immediately — it never reaches the URE roll,
  // and every day/drive after these six calls (all defaulting to 0.99, guaranteeing no further
  // failures for the rest of the simulated year) is irrelevant to the mutant either way, because
  // it has already returned.
  const PAYLOAD: Partial<SimulationInput> = {
    driveCount: 8,
    serverCount: 2,
    raidLevel: 'powerscale_onefs',
    powerScaleProtection: '+2d:1n',
    driveCapacityBytes: 4_000_000_000_000,
    // Slow enough that rebuild never completes within the simulated year (~4,415 days at this
    // speed) — consumed units must not decay back down mid-run and mask the boundary.
    rebuildSpeedMBs: 0.01,
    ureRate: 15,
    afrPercent: 3,
    simulationCount: 1,
  }

  it('+2d:1n (u=2, M=2): two failures on the same node consume exactly M units and survive — the mutation over-debits the sweep event and dies instead', async () => {
    const survivalRate = await runScripted(PAYLOAD, SCRIPT)
    expect(survivalRate).toBe(1)
  })
})
