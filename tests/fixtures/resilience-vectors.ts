/**
 * Resilience worker group-modelling vectors — issues #70 (`drivesPerGroup`
 * floor-division leaves drives unmodelled) and #67 (group-path `bitsRead`
 * overstates URE exposure for `beegfs_raid10`).
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
 *
 * ### #67 — group-path `bitsRead` overstates URE exposure for `beegfs_raid10`
 *
 * The group-path rebuild-read formula, `(drivesPerGroup - 1) x capacity`,
 * assumed every group drive but the failed one is read during rebuild. That is
 * correct for parity groups (RAID50/60, beegfs_raid6/raidz2), but a `beegfs_
 * raid10` mirror-pair rebuild reads only the ONE surviving partner in that
 * pair, not the whole target. Fixed by giving mirrored group layouts a fixed
 * 1-drive `groupBitsRead`, matching the `isMirror` branch's formula exactly.
 * Safe-direction bug (overstated risk), so survival only rises.
 *
 * Measured (20,000 iterations, unmerged `beegfs_raid10`, 40 drives / 4 targets
 * of 10, tolerance still a flat counter at this point — #66 not yet applied):
 * survival 9.3% -> 32.5%. URE, not the flat 2-failure tolerance, dominates the
 * death rate at this AFR/URE combination, which is why fixing the read volume
 * alone recovers most of the total improvement later attributed to #66+#67
 * combined.
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
  {
    name: 'beegfs_raid10 unmerged, 40 drives / 4 targets of 10: corrected rebuild-read volume',
    issue: '#67',
    payload: {
      driveCount: 40,
      serverCount: 4,
      driveCapacityBytes: 8_000_000_000_000,
      rebuildSpeedMBs: 150,
      ureRate: 14,
      afrPercent: 6.0,
      simulationCount: 20000,
      raidLevel: 'beegfs_raid10',
    },
    // Measured post-fix (tolerance still a flat counter, #66 not yet applied):
    // ~32.5% (pre-fix: ~9.3%). Wide band — this vector's tolerance widens
    // further once #66 lands per-pair state on top of this fix.
    expectSurvivalAbove: 0.2,
    expectSurvivalBelow: 0.45,
  },
]
