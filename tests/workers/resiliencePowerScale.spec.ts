/**
 * PowerScale node-failure model (fix round 1, item 1).
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
 *   - FEC region (`nodeCount >= 2*nf`): a new dedicated branch (neither `isGroup` — independent
 *     parallel groups, any one lost = total loss — nor the flat drive-count parity model, which
 *     is node-blind) tracks per-node failure counts and declares loss when more than `nf`
 *     DISTINCT nodes are touched, OR more than `M` failures land in one node.
 *
 * NOT vendor-attested (see `SimulationInput.powerScaleProtection`'s doc comment) — Dell's
 * PowerSizer export carries no AFR/URE/MTBF, so unlike every capacity number on this branch,
 * this model cannot be validated against the source of truth. These tests validate internal
 * consistency (the model does what its own rules say) and directional correctness (more
 * tolerance survives more often), not agreement with a vendor number.
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

describe('resilienceWorker PowerScale topology classification (computeTopologyModel)', () => {
  it('FEC region: nodeCount >= 2*nf gets the dedicated node-failure model, not isMirror/isGroup', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    // +2n: nf=2, M=2. 2*nf = 4, so 10 nodes is comfortably FEC region.
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
    expect(topo.powerScaleNodeTolerance).toBe(2)
    expect(topo.powerScaleDriveWithinNodeTolerance).toBe(2)
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

  it('drive-level protections carry the same nf/M as their node-level peers (+2d:1n like +2n)', async () => {
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
    expect(topo.powerScaleDriveWithinNodeTolerance).toBe(2) // M
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
    // Stressed well above real-world rates, same reason resilience-analytic.spec.ts and
    // resilienceReplacementDelay.spec.ts do it: at realistic AFR the baseline dual-failure
    // probability sits far below the Monte Carlo noise floor for a feasible iteration count.
    afrPercent: 25,
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

  it('FEC region: tolerates failures concentrated within one node up to M, independent of the nf node-count check', async () => {
    // +4d:2n: nf=2, M=4, u=2. 2*nf=4, so 10 nodes is FEC region. A protection whose M exceeds
    // nf (drive-level protection) should survive at least as often as one with M==nf at the
    // same node tolerance, all else equal, since the within-node budget is strictly looser.
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
    expect(driveLevel).toBeGreaterThanOrEqual(nodeLevel)
  }, 30000)
})
