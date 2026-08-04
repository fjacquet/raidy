/**
 * Resilience Analytic Cross-Check (Phase 18, Task 9, Step 2)
 *
 * Cross-checks the Monte Carlo resilience worker (`src/workers/resilienceWorker.ts`)
 * against closed-form MTTDL (Mean Time To Data Loss) approximations for RAID-5 and
 * RAID-6, using an order-of-magnitude bound rather than a tight tolerance.
 *
 * Closed-form approximations (industry-standard, dual/triple-independent-failure model):
 *   RAID-5: MTTDL ≈ MTBF² / (N × (N−1) × MTTR)
 *   RAID-6: MTTDL ≈ MTBF³ / (N × (N−1) × (N−2) × MTTR²)
 *   P(loss within 1yr) ≈ 1 − exp(−8760 / MTTDL_hours)
 *
 * Why an order-of-magnitude bound (ratio ∈ (0.1, 10)), not a tight one:
 * The Monte Carlo worker also models URE (Unrecoverable Read Error) risk during
 * rebuild, batch/correlated failures, and a rebuild-stress AFR multiplier — none of
 * which the closed-form dual/triple-independent-failure formula captures. With
 * testDrive1TB's actual consumer-grade URE rate (1e-14) and 1 TB capacity, URE risk
 * during a RAID-5 rebuild dominates the loss probability by ~4 orders of magnitude
 * (empirically verified: ~3.4% simulated loss vs. ~1.3e-6 analytic dual-failure
 * probability) — a real, well-documented industry phenomenon (URE-during-rebuild is
 * literally why RAID-6 exists), not an engine bug. To isolate the dual/triple-failure
 * mechanism the closed-form formula actually models (and avoid the URE mechanism
 * swamping the comparison), these tests use the best available URE rate (ureRate: 17,
 * i.e., 1e-17, enterprise-SSD-grade) as a SimulationInput parameter — independent of
 * testDrive1TB's own (consumer HDD) ure_rate field — so the dual/triple-independent-
 * failure signal is what's actually being measured on both sides.
 *
 * RAID-6 additionally needed an AFR stress adjustment: at testDrive1TB's real AFR
 * (1%), the analytic RAID-6 triple-failure probability is ~1e-9–1e-10/yr — needing
 * ~1e9-1e10 Monte Carlo iterations to observe even one event, infeasible for a fast
 * unit test. RAID-6's inherent resistance to double/triple independent failure is
 * itself the correct, expected behavior — not a testability defect in the engine.
 * To keep the RAID-6 check both meaningful and non-flaky, this suite raises AFR to
 * 15% (representing a stressed/aging fleet) and derives a matching MTBF for the
 * analytic formula via the standard approximation MTBF ≈ 8760 / AFR_fraction, so both
 * sides of the comparison describe the same (stressed) drive population. RAID-5 keeps
 * testDrive1TB's real AFR (1%) and MTBF (1,000,000h) since its signal is observable
 * at a practical iteration count without stress-testing.
 *
 * Determinism note: `resilienceWorker.ts`'s `random()` helper calls `Math.random()`
 * directly with no seed override exposed. Rather than rely on unseeded randomness
 * (which risks a zero-loss-event run producing mcP=0 and an artificial `ratio` of 0,
 * or general run-to-run flakiness near the (0.1, 10) bounds), this suite stubs
 * `Math.random` with a seeded mulberry32 PRNG in `beforeEach`, restored in
 * `afterEach`. This makes every run of the suite bit-for-bit identical — the
 * (0.1, 10) bounds below are exercised against a fixed sequence, not a fresh
 * random draw each time. Verified by running the suite 3 times in a row with
 * identical ratios each time.
 *
 * Implementation note: the stub assigns `Math.random` directly rather than via
 * `vi.spyOn(...).mockImplementation(...)`. Each simulation run calls `random()`
 * tens of millions of times (1,000,000 simulations × up to 365 days × 8 drives ×
 * several calls per failure check); a `vi.fn()`-based spy records every call's
 * args/return value in `.mock.calls`, which OOMs the test process at that call
 * volume. A plain reassignment stubs the same deterministic sequence without the
 * per-call bookkeeping.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimulationInput, SimulationOutput, WorkerOutputMessage } from '@/types/worker'

/**
 * mulberry32 — small, fast, deterministic PRNG used to stub Math.random() so the
 * Monte Carlo worker produces identical results across runs (see file header).
 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const mockPostMessage = vi.fn()
vi.stubGlobal('self', { postMessage: mockPostMessage, onmessage: null })

const SEED = 0x5eed_1234
const originalRandom = Math.random

beforeEach(() => {
  Math.random = mulberry32(SEED)
})

afterEach(() => {
  Math.random = originalRandom
})

async function importWorker() {
  vi.resetModules()
  await import('@/workers/resilienceWorker')
}

function runSimulation(payload: SimulationInput): SimulationOutput {
  const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  handler?.({ data: { type: 'START', payload } } as MessageEvent)
  const resultCall = mockPostMessage.mock.calls.find(
    (c): c is [Extract<WorkerOutputMessage, { type: 'RESULT' }>] => c[0].type === 'RESULT',
  )
  expect(resultCall).toBeDefined()
  if (!resultCall) throw new Error('worker did not post a RESULT message')
  return resultCall[0].payload
}

/** RAID-5: MTTDL ≈ MTBF² / (N × (N−1) × MTTR) */
function mttdlRaid5Hours(mtbfHours: number, n: number, mttrHours: number): number {
  return mtbfHours ** 2 / (n * (n - 1) * mttrHours)
}

/** RAID-6: MTTDL ≈ MTBF³ / (N × (N−1) × (N−2) × MTTR²) */
function mttdlRaid6Hours(mtbfHours: number, n: number, mttrHours: number): number {
  return mtbfHours ** 3 / (n * (n - 1) * (n - 2) * mttrHours ** 2)
}

/** P(loss within 1yr) ≈ 1 − exp(−8760 / MTTDL_hours) */
function annualLossProbability(mttdlHours: number): number {
  return 1 - Math.exp(-8760 / mttdlHours)
}

/** MTTR (rebuild time) = drive capacity (MB, binary) / rebuild speed (MB/s), in hours. */
function mttrHours(capacityBytes: number, rebuildSpeedMBs: number): number {
  const capacityMB = capacityBytes / (1024 * 1024)
  return capacityMB / rebuildSpeedMBs / 3600
}

const N = 8
const CAPACITY_BYTES = 1_000_000_000_000 // testDrive1TB (1TB)

describe('Resilience Analytic Cross-Check — RAID-5 vs closed-form MTTDL', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('RAID-5 8×1TB (testDrive1TB AFR/MTBF) — MC loss probability within an order of magnitude of MTTDL', async () => {
    const rebuildSpeedMBs = 20
    const mtbfHours = 1_000_000 // testDrive1TB reliability.mtbf_hours
    const afrPercent = 1.0 // testDrive1TB reliability.afr

    const mttr = mttrHours(CAPACITY_BYTES, rebuildSpeedMBs)
    const analyticP = annualLossProbability(mttdlRaid5Hours(mtbfHours, N, mttr))

    await importWorker()
    const result = runSimulation({
      driveCount: N,
      driveCapacityBytes: CAPACITY_BYTES,
      rebuildSpeedMBs,
      ureRate: 17, // best-case URE — isolates the dual-failure mechanism (see file header)
      afrPercent,
      simulationCount: 1_000_000,
      raidLevel: 'RAID5',
    })

    const mcP = 1 - result.survivalRate
    const ratio = mcP / analyticP

    // Order-of-magnitude agreement only — catches sign/exponent bugs, not noise
    // (Monte Carlo vs closed-form differ by URE/correlated-failure modeling).
    expect(ratio).toBeGreaterThan(0.1)
    expect(ratio).toBeLessThan(10)
    // simulationCount: 1_000_000 comfortably finishes well under 60s on plain `vitest run`,
    // but v8 coverage instrumentation pushes it past that margin deterministically under
    // `--coverage`. 180s leaves ample margin for instrumentation overhead without touching
    // simulationCount, which the order-of-magnitude assertions above rely on for signal.
  }, 180_000)
})

describe('Resilience Analytic Cross-Check — RAID-6 vs closed-form MTTDL', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('RAID-6 8×1TB (AFR-stressed for testability) — MC loss probability within an order of magnitude of MTTDL', async () => {
    const rebuildSpeedMBs = 10
    // AFR stress test (see file header): testDrive1TB's real 1% AFR makes the RAID-6
    // triple-failure probability too rare to observe at a practical simulationCount.
    const afrPercent = 15
    const mtbfHours = 8760 / (afrPercent / 100) // self-consistent MTBF for the stressed AFR

    const mttr = mttrHours(CAPACITY_BYTES, rebuildSpeedMBs)
    const analyticP = annualLossProbability(mttdlRaid6Hours(mtbfHours, N, mttr))

    await importWorker()
    const result = runSimulation({
      driveCount: N,
      driveCapacityBytes: CAPACITY_BYTES,
      rebuildSpeedMBs,
      ureRate: 17, // best-case URE — isolates the dual/triple-failure mechanism
      afrPercent,
      simulationCount: 1_000_000,
      raidLevel: 'RAID6',
    })

    const mcP = 1 - result.survivalRate
    const ratio = mcP / analyticP

    expect(ratio).toBeGreaterThan(0.1)
    expect(ratio).toBeLessThan(10)
    // simulationCount: 1_000_000 comfortably finishes well under 60s on plain `vitest run`,
    // but v8 coverage instrumentation pushes it past that margin deterministically under
    // `--coverage`. 180s leaves ample margin for instrumentation overhead without touching
    // simulationCount, which the order-of-magnitude assertions above rely on for signal.
  }, 180_000)
})
