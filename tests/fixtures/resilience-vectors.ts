/**
 * Resilience worker group-modelling vectors — issue #70 (`drivesPerGroup`
 * floor-division leaves drives unmodelled).
 *
 * Unlike the capacity vectors elsewhere in this directory, `resilienceWorker.ts`
 * runs a stochastic Monte Carlo simulation (`Math.random()`, no seed), so these
 * vectors cannot pin an exact `survivalRate` the way `beegfs-vectors.ts` pins an
 * exact `expectedUsable`. Each vector instead documents a payload plus the
 * *direction and rough magnitude* the fix must produce, backed by an actual
 * before/after run recorded in the comment (see `CHANGELOG.md` for the same
 * numbers). Consumed by `tests/workers/resilience-group-modelling.spec.ts`,
 * which asserts against wide bands (large `simulationCount`, generous
 * tolerance) precisely because the numbers are not exact.
 *
 * ### #70 — `drivesPerGroup` floor-division leaves drives unmodelled
 *
 * `Math.floor(driveCount / numGroups)` silently dropped up to `numGroups - 1`
 * drives from every simulated group whenever `driveCount % numGroups != 0` — a
 * drive that never joins any group can never fail, so the old code understated
 * risk (overstated survival). Fixed by `distributeAcrossGroups()`, which gives
 * the first `driveCount % numGroups` groups one extra drive so every drive is
 * inside exactly one group. Applies to RAID 50/60 and every BeeGFS group level
 * (`beegfs_raid6`, `beegfs_raidz2`, `beegfs_raid10`).
 *
 * Measured (20,000 iterations each, `tests/workers/resilience-group-modelling
 * .spec.ts`):
 *   - RAID50, 11 drives / 3 groups (3, 4, 4 after the fix — previously 3, 3, 3
 *     with 2 drives unmodelled): survival 66.06% -> 60.07% (correctly LOWER —
 *     the previously-unmodelled drives are now exposed to failure).
 *   - RAID60, 14 drives / 4 groups (3, 3, 4, 4 after the fix — previously
 *     3, 3, 3, 3 with 2 drives unmodelled): survival 99.980% -> 99.965%.
 */

export interface ResilienceVector {
  name: string
  payload: {
    driveCount: number
    serverCount: number
    driveCapacityBytes: number
    rebuildSpeedMBs: number
    ureRate: 12 | 13 | 14 | 15 | 16 | 17
    afrPercent: number
    simulationCount: number
    raidLevel: string
  }
  /** Rough expectation this vector must satisfy post-fix, checked with generous tolerance. */
  expectSurvivalAbove?: number
  expectSurvivalBelow?: number
  issue: string
}

export const resilienceGroupVectors: ResilienceVector[] = [
  {
    name: 'RAID50, 11 drives / 3 groups (11 % 3 != 0): every drive modelled',
    issue: '#70',
    payload: {
      driveCount: 11,
      serverCount: 3,
      driveCapacityBytes: 4_000_000_000_000,
      rebuildSpeedMBs: 100,
      ureRate: 14,
      afrPercent: 8.0,
      simulationCount: 20000,
      raidLevel: 'RAID50',
    },
    // Measured post-fix: ~60.1%. Wide band — Monte Carlo noise plus this vector
    // exists to pin the direction (lower than the pre-fix 66.1%), not a tight value.
    expectSurvivalAbove: 0.5,
    expectSurvivalBelow: 0.7,
  },
  {
    name: 'RAID60, 14 drives / 4 groups (14 % 4 != 0): every drive modelled',
    issue: '#70',
    payload: {
      driveCount: 14,
      serverCount: 4,
      driveCapacityBytes: 4_000_000_000_000,
      rebuildSpeedMBs: 100,
      ureRate: 14,
      afrPercent: 10.0,
      simulationCount: 20000,
      raidLevel: 'RAID60',
    },
    // Measured post-fix: ~99.97%. RAID60's dual parity absorbs the extra exposure
    // from the 2 previously-unmodelled drives almost entirely — band stays high.
    expectSurvivalAbove: 0.995,
  },
]
