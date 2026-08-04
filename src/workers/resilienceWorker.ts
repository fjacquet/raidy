/**
 * Web Worker for Monte Carlo resilience simulation.
 * Runs 10,000+ simulations to calculate array survival probability.
 */

import type { SimulationInput, WorkerInputMessage, WorkerOutputMessage } from '@/types/worker'

// Post typed message to main thread
function postMessage(message: WorkerOutputMessage) {
  self.postMessage(message)
}

// Random number generator with better distribution
function random(): number {
  return Math.random()
}

/**
 * Check if a RAID level uses mirror-based redundancy (pairs of drives).
 * Mirror topologies have a different failure model: data loss only occurs
 * when both drives in the same mirror pair fail, not just any N+1 failures.
 */
function isMirrorTopology(raidLevel: string): boolean {
  const level = raidLevel.toLowerCase()
  return level === 'raid10' || level === 'raid1' || level === 'mirror' || level === 'raid1e'
}

/**
 * Split `total` drives across `groups` fault groups as evenly as possible.
 * `Math.floor(total / groups)` alone can leave up to `groups - 1` drives
 * unassigned to any simulated group (issue #70), and failures beyond total
 * group capacity all landed on group 0 by array-index fallbacks. Distributing
 * the remainder — the first `total % groups` groups get one extra drive —
 * means every drive is modelled, at the cost of making groups heterogeneous
 * in width.
 */
export function distributeAcrossGroups(total: number, groups: number): number[] {
  if (groups <= 0) return []
  const base = Math.floor(total / groups)
  const remainder = total % groups
  return Array.from({ length: groups }, (_, g) => base + (g < remainder ? 1 : 0))
}

/**
 * Check if a RAID level uses group-based redundancy (RAID 50/60).
 * Group topologies stripe across independent RAID groups. Data loss only occurs
 * when a single group exceeds its parity tolerance, not from failures across groups.
 */
function isGroupTopology(raidLevel: string): boolean {
  const level = raidLevel.toLowerCase()
  return (
    level === 'raid50' ||
    level === 'raid60' ||
    // BeeGFS storage targets are independent local-RAID fault groups — the
    // storage-target count is passed in as `serverCount` (see the caller), so
    // this reuses the RAID 50/60 group model.
    //
    // `beegfs_raid10` routes here, not through the drive-pair mirror model. A
    // real RAID10 target holding `drivesPerTarget` drives is
    // `drivesPerTarget / 2` striped mirror pairs and is lost when ANY one of
    // those pairs loses both drives, so its failure probability scales with
    // `drivesPerTarget`. The mirror model cannot see that: it only receives
    // `driveCount` and `mirrorCopies`, never the target width, so it silently
    // assumed one pair per target and understated failure probability by a
    // factor of ~`drivesPerTarget / 2`. The group model is the only path where
    // the target width reaches the simulation (`drivesPerGroup` is derived
    // from `serverCount`). See the group-topology branch below for the
    // superset proof.
    level === 'beegfs_raid6' ||
    level === 'beegfs_raidz2' ||
    level === 'beegfs_raid10'
  )
}

/**
 * Calculate number of parity drives (fault tolerance) for a RAID level.
 */
export function getParityDrives(raidLevel: string): number {
  const level = raidLevel.toLowerCase()

  // BeeGFS levels (storage-target-local redundancy; buddy mirroring is a
  // separate layer expressed via mirrorCopies, not here)
  if (level === 'beegfs_raid6') return 2
  if (level === 'beegfs_raidz2') return 2
  if (level === 'beegfs_raid10') return 1
  if (level === 'beegfs_single') return 0

  // RAID levels
  if (level === 'raid0' || level === 'stripe') return 0
  if (level === 'raid1' || level === 'mirror') return 1 // Can lose 1 drive in a pair
  if (level === 'raid5' || level === 'raidz1' || level === 'draid1') return 1
  if (level === 'raid6' || level === 'raidz2' || level === 'draid2') return 2
  if (level === 'raidz3' || level === 'draid3') return 3
  if (level === 'raid10') return 1 // Per mirror pair
  if (level === 'raid50') return 1 // Per RAID5 group
  if (level === 'raid60') return 2 // Per RAID6 group

  // S2D levels
  if (level === 'simple') return 0
  if (level === 'parity' || level === 'single') return 1
  if (level === 'dual_parity' || level === 'dual') return 2
  if (level === 'map') return 2 // Mirror-accelerated parity

  // Proprietary
  if (level === 'synology_shr') return 1
  if (level === 'synology_shr2') return 2
  if (level === 'netapp_raid_dp') return 2
  if (level === 'netapp_raid_tec') return 3

  // Longhorn (replicated block storage): tolerates R-1 replica failures
  if (level === 'longhorn_r2') return 1
  if (level === 'longhorn_r3') return 2

  return 1 // Default to single parity
}

/**
 * Run a single Monte Carlo simulation.
 * Returns true if the array survives, false if data loss occurs.
 *
 * This model includes:
 * - Individual drive failures based on AFR
 * - Correlated/batch failures (drives from same batch fail together)
 * - URE (Unrecoverable Read Error) during rebuild
 * - Stress-induced failures (rebuild increases failure rate of remaining drives)
 */
function runSingleSimulation(input: SimulationInput): {
  survived: boolean
  rebuildTimeHours: number
  hadURE: boolean
  hadDualFailure: boolean
} {
  const {
    driveCount,
    raidLevel,
    driveCapacityBytes,
    rebuildSpeedMBs,
    ureRate,
    afrPercent,
    serverCount = 1,
    mirrorCopies = 0,
  } = input

  const parityDrives = getParityDrives(raidLevel)

  // Base daily failure rate per drive
  const baseDailyFailureRate = afrPercent / 100 / 365

  // Correlated failure factor: 10% chance a failure triggers another within 7 days
  // This models batch failures from same manufacturing lot
  const correlatedFailureProbability = 0.1
  const correlatedFailureWindowDays = 7

  // Stress factor: rebuild increases failure rate of remaining drives by 30%
  const rebuildStressFactor = 1.3

  // Topology classification. Computed before the zero-redundancy early return
  // below: a caller can pass mirrorCopies (e.g. BeeGFS buddy mirroring) even for
  // a level whose local redundancy is zero (beegfs_single), and that mirror
  // layer must still apply.
  //
  // A level's own group-vs-mirror shape (RAID 50/60, BeeGFS RAID6/RAIDZ2/RAID10
  // storage targets) always wins over a generic mirrorCopies input —
  // mirrorCopies then layers an *additional* mirror on top of the group
  // (buddy mirroring pairs storage targets, it does not replace their local
  // redundancy — see the buddy-pair handling in the group-topology branch
  // below). Only when the level has no native group shape does mirrorCopies
  // switch on the drive-pair mirror model directly (e.g. plain 'mirror' /
  // 'raid1', or beegfs_single which has no local redundancy of its own).
  const isGroup = isGroupTopology(raidLevel)
  const isMirror = !isGroup && (mirrorCopies >= 2 || isMirrorTopology(raidLevel))
  const effectiveMirrorCopies = mirrorCopies >= 2 ? mirrorCopies : 2

  // No redundancy and no mirror layer = any failure is data loss
  if (parityDrives === 0 && !isMirror) {
    for (let day = 0; day < 365; day++) {
      for (let drive = 0; drive < driveCount; drive++) {
        if (random() < baseDailyFailureRate) {
          return { survived: false, rebuildTimeHours: 0, hadURE: false, hadDualFailure: true }
        }
      }
    }
    return { survived: true, rebuildTimeHours: 0, hadURE: false, hadDualFailure: false }
  }

  // Calculate rebuild time in hours
  const driveCapacityMB = driveCapacityBytes / (1024 * 1024)
  const rebuildTimeHours = driveCapacityMB / rebuildSpeedMBs / 3600

  // Mirror topology: N-way mirror groups (e.g., 2-way pairs, 3-way triplets)
  const numMirrorGroups = isMirror ? Math.floor(driveCount / effectiveMirrorCopies) : 0
  const mirrorParityPerGroup = effectiveMirrorCopies - 1 // Can lose N-1 copies per group

  // Group topology: RAID 50/60 (and BeeGFS RAID6/RAIDZ2/RAID10 storage targets)
  // stripe across independent RAID groups.
  //
  // Buddy mirroring pairs whole storage targets, not individual drives, and a
  // BeeGFS buddy group is always exactly two targets (there is no 3-way buddy
  // mode) — hence `=== 2`, not `>= 2`: a stray 3 must never be silently
  // treated as a buddy pair. Two adjacent groups are merged into one buddy
  // unit with double the drives and tolerance `2 * parityDrives + 1`.
  //
  // It also requires an even target count. With an odd `serverCount` at least
  // one target is necessarily unpaired and therefore has no buddy protection
  // at all; merging `floor(serverCount / 2)` units would pool that unprotected
  // target's drives into a merged unit and hide it, which would OVERSTATE
  // resilience. So buddy credit is withheld entirely when `serverCount` is
  // odd, falling back to the (provably conservative, see below) unmerged
  // per-target model.
  //
  // INVARIANT (holds for every BeeGFS group level, buddy on or off): the set
  // of drive-failure patterns this simulation calls "data loss" is a SUPERSET
  // of the physically real one. The tool may therefore understate resilience,
  // never overstate it. It is NOT exact.
  //
  // Proof, per configuration, on any failure pattern:
  //  - Unmerged (buddy off, or odd serverCount). A group is one storage
  //    target; it is declared dead at `> parityDrives` failures.
  //    * beegfs_raid6 / beegfs_raidz2 (parityDrives 2): a real target is lost
  //      once a 3rd drive in it fails — exactly the simulated threshold.
  //    * beegfs_raid10 (parityDrives 1): a real target is lost only when both
  //      drives of the SAME mirror pair die, which needs >= 2 failures in the
  //      target; the simulation flags every >= 2 pattern regardless of which
  //      pairs were hit. Real loss => simulated loss. Strict superset (2
  //      failures in different pairs are survivable in reality, flagged here).
  //    * Cluster-wide: BeeGFS stripes across targets, so losing any single
  //      target is data loss with buddy mirroring off — matching "any group
  //      over tolerance".
  //  - Merged (buddy on, even serverCount). A buddy unit A+B is really lost
  //    only when A and B are each independently lost. From the unmerged case,
  //    A lost => A holds >= parityDrives + 1 failures, likewise B, so a real
  //    buddy loss implies >= 2 * parityDrives + 2 failures in the merged unit.
  //    The simulated threshold fires at `> 2 * parityDrives + 1`, i.e. at
  //    2 * parityDrives + 2. Real loss => simulated loss. Strict superset:
  //    2 * parityDrives + 2 failures concentrated in A alone are flagged here
  //    but survivable in reality (B is intact).
  // URE-triggered losses only add further simulated failures on top, so they
  // preserve the superset direction.
  //
  // Direction property for beegfs_raid10 (why `drivesPerTarget` now matters):
  // `serverCount = floor(totalDrives / drivesPerTarget)`, so a larger
  // `drivesPerTarget` yields fewer, wider groups at an unchanged tolerance —
  // more drives able to collide inside one fault group. Survival is therefore
  // non-increasing in `drivesPerTarget`, the physically correct direction
  // (more striped mirror pairs per target = more ways to lose one).
  const isBuddyMirroredGroup = isGroup && mirrorCopies === 2 && serverCount % 2 === 0
  const numGroups = isGroup
    ? isBuddyMirroredGroup
      ? Math.max(1, Math.floor(serverCount / 2))
      : serverCount
    : 0
  // Heterogeneous group widths (#70): the remainder of driveCount / numGroups is
  // distributed one-per-group across the first `driveCount % numGroups` groups
  // instead of being silently dropped by Math.floor. Every drive is now inside
  // exactly one simulated group.
  const groupWidths: number[] = isGroup ? distributeAcrossGroups(driveCount, numGroups) : []
  const parityPerGroup = isBuddyMirroredGroup ? parityDrives * 2 + 1 : parityDrives // 1 for RAID 50, 2 for RAID 60

  // A RAID10-mirror storage target rebuilds by reading only the surviving
  // mirror partner — one drive's worth — never the rest of the target, unlike
  // a parity group rebuild (RAID50/60, beegfs_raid6/raidz2) which reads every
  // other group drive. The group-path formula below previously used
  // `(drivesPerGroup - 1) x capacity` unconditionally, overstating
  // beegfs_raid10's rebuild-read volume and therefore its URE exposure
  // (safe-direction bug: it could only overstate risk, never understate it).
  const isMirroredGroupLayout = isGroup && raidLevel.toLowerCase() === 'beegfs_raid10'

  // URE probability during rebuild
  const ureRatePerBit = 10 ** -ureRate

  // Bits read during rebuild depends on topology:
  // Mirror: reads only 1 good copy (any surviving mirror partner)
  // Group: reads all drives in the group minus the failed one — except mirrored
  //   group layouts (beegfs_raid10, #67), which rebuild from a single
  //   surviving mirror partner regardless of the group's total width, same as
  //   the plain mirror case.
  // Parity: reads ALL surviving drives (N-1 drives)
  let bitsRead: number
  if (isMirror) {
    bitsRead = driveCapacityBytes * 8 // 1 drive
  } else if (isGroup) {
    bitsRead = 0 // computed per-group below — groups can have different widths now (#70)
  } else {
    bitsRead = driveCapacityBytes * 8 * (driveCount - 1)
  }
  const ureProbability = 1 - (1 - ureRatePerBit) ** bitsRead

  // Per-group rebuild-read volume and URE probability (#67, #70): each group can
  // now have a different width, and mirrored group layouts always read just one
  // drive's worth regardless of width (a RAID10 rebuild reads only the surviving
  // mirror partner, not `drivesPerGroup - 1` drives).
  const groupUreProbability: number[] = isGroup
    ? groupWidths.map((width) => {
        const groupBitsRead = isMirroredGroupLayout
          ? driveCapacityBytes * 8 // mirrored group: rebuild reads 1 surviving partner
          : width > 1
            ? driveCapacityBytes * 8 * (width - 1)
            : 0
        return 1 - (1 - ureRatePerBit) ** groupBitsRead
      })
    : []

  // Simulate one year of operation
  let failedDrives = 0
  // Mirror: per-group failure tracking (supports 2-way, 3-way, N-way mirrors)
  const mirrorGroupFailures = isMirror ? (new Array(numMirrorGroups).fill(0) as number[]) : []
  const groupFailures = isGroup ? (new Array(numGroups).fill(0) as number[]) : []
  let isRebuilding = false
  let rebuildDaysRemaining = 0
  let correlatedFailureWindow = 0
  let hadURE = false
  let hadDualFailure = false

  for (let day = 0; day < 365; day++) {
    const activeDrives = driveCount - failedDrives

    // Calculate effective failure rate
    let effectiveFailureRate = baseDailyFailureRate

    // Increase failure rate during rebuild (stress on remaining drives)
    if (isRebuilding) {
      effectiveFailureRate *= rebuildStressFactor
    }

    // Increase failure rate during correlated failure window
    if (correlatedFailureWindow > 0) {
      effectiveFailureRate *= 2.0 // Double the rate during batch failure window
      correlatedFailureWindow--
    }

    // Check for drive failures
    for (let drive = 0; drive < activeDrives; drive++) {
      if (random() < effectiveFailureRate) {
        failedDrives++

        // Check for correlated failure trigger
        if (random() < correlatedFailureProbability) {
          correlatedFailureWindow = correlatedFailureWindowDays
        }

        if (isMirror) {
          // Mirror topology: N-way mirror groups (2-way, 3-way, etc.)
          // Assign failure to a mirror group weighted by surviving drives in each group
          const survivingPerGroup = mirrorGroupFailures.map(
            (_f, g) => effectiveMirrorCopies - (mirrorGroupFailures[g] ?? 0),
          )
          const totalSurviving = survivingPerGroup.reduce((a, b) => a + b, 0)

          let r = random() * totalSurviving
          let hitGroup = 0
          for (let g = 0; g < numMirrorGroups; g++) {
            r -= survivingPerGroup[g] ?? 0
            if (r <= 0) {
              hitGroup = g
              break
            }
          }

          mirrorGroupFailures[hitGroup] = (mirrorGroupFailures[hitGroup] ?? 0) + 1

          // Data loss if all copies in a mirror group are lost
          if ((mirrorGroupFailures[hitGroup] ?? 0) > mirrorParityPerGroup) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          // Start or extend rebuild
          if (!isRebuilding) {
            isRebuilding = true
            rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
          }

          // URE only fatal when mirror group is at its parity limit (last copy being rebuilt)
          if (
            (mirrorGroupFailures[hitGroup] ?? 0) >= mirrorParityPerGroup &&
            random() < ureProbability
          ) {
            hadURE = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }
        } else if (isGroup) {
          // Group topology: assign failure to a group weighted by surviving drives.
          // Each group has (groupWidths[g] - groupFailures[g]) surviving drives —
          // groups can differ in width now that the remainder is distributed (#70).
          const survivingPerGroup = groupFailures.map(
            (_f, g) => (groupWidths[g] ?? 0) - (groupFailures[g] ?? 0),
          )
          const totalSurviving = survivingPerGroup.reduce((a, b) => a + b, 0)

          // Pick which group the failure hits (weighted by surviving drives in each group)
          let r = random() * totalSurviving
          let hitGroup = 0
          for (let g = 0; g < numGroups; g++) {
            r -= survivingPerGroup[g] ?? 0
            if (r <= 0) {
              hitGroup = g
              break
            }
          }

          groupFailures[hitGroup] = (groupFailures[hitGroup] ?? 0) + 1
          const groupUre = groupUreProbability[hitGroup] ?? 0

          // Data loss if any group exceeds its parity tolerance
          if ((groupFailures[hitGroup] ?? 0) > parityPerGroup) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          // Start or extend rebuild
          if (!isRebuilding) {
            isRebuilding = true
            rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)

            // URE fatal only when the hit group is at its parity limit
            if ((groupFailures[hitGroup] ?? 0) >= parityPerGroup && random() < groupUre) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          } else {
            if ((groupFailures[hitGroup] ?? 0) >= parityPerGroup && random() < groupUre) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          }
        } else {
          // Standard parity topology: global failure count determines data loss
          if (failedDrives > parityDrives) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          if (!isRebuilding) {
            isRebuilding = true
            rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)

            if (failedDrives >= parityDrives && random() < ureProbability) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          } else {
            if (failedDrives >= parityDrives && random() < ureProbability) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          }
        }
      }
    }

    // Progress rebuild
    if (isRebuilding) {
      rebuildDaysRemaining--
      if (rebuildDaysRemaining <= 0) {
        isRebuilding = false
        failedDrives = Math.max(0, failedDrives - 1)
        if (isMirror) {
          // Repair the most degraded mirror group first
          let maxIdx = 0
          for (let g = 1; g < numMirrorGroups; g++) {
            if ((mirrorGroupFailures[g] ?? 0) > (mirrorGroupFailures[maxIdx] ?? 0)) maxIdx = g
          }
          {
            const cur = mirrorGroupFailures[maxIdx] ?? 0
            if (cur > 0) mirrorGroupFailures[maxIdx] = cur - 1
          }
        }
        if (isGroup) {
          // Rebuild the most degraded group first
          let maxIdx = 0
          for (let g = 1; g < numGroups; g++) {
            if ((groupFailures[g] ?? 0) > (groupFailures[maxIdx] ?? 0)) maxIdx = g
          }
          {
            const cur = groupFailures[maxIdx] ?? 0
            if (cur > 0) groupFailures[maxIdx] = cur - 1
          }
        }
        if (failedDrives === 0) {
          correlatedFailureWindow = 0
        }
      }
    }
  }

  return { survived: true, rebuildTimeHours, hadURE, hadDualFailure }
}

/**
 * Run the full Monte Carlo simulation.
 */
function runSimulation(input: SimulationInput): void {
  const { simulationCount } = input

  let survivedCount = 0
  let totalRebuildTime = 0
  let ureCount = 0
  let dualFailureCount = 0
  let rebuildCount = 0

  const progressInterval = Math.max(1, Math.floor(simulationCount / 100))

  for (let i = 0; i < simulationCount; i++) {
    const result = runSingleSimulation(input)

    if (result.survived) {
      survivedCount++
    }

    if (result.rebuildTimeHours > 0) {
      totalRebuildTime += result.rebuildTimeHours
      rebuildCount++
    }

    if (result.hadURE) {
      ureCount++
    }

    if (result.hadDualFailure) {
      dualFailureCount++
    }

    // Report progress
    if ((i + 1) % progressInterval === 0 || i === simulationCount - 1) {
      postMessage({
        type: 'PROGRESS',
        payload: {
          completed: i + 1,
          total: simulationCount,
        },
      })
    }
  }

  // Calculate final results
  const survivalRate = survivedCount / simulationCount
  const averageRebuildTimeHours = rebuildCount > 0 ? totalRebuildTime / rebuildCount : 0
  const ureProbability = ureCount / simulationCount
  const dualFailureProbability = dualFailureCount / simulationCount

  // Format survival percentage with appropriate precision
  let survivalPercent: string
  if (survivalRate >= 1.0) {
    // Perfect survival - show as ">99.9999%" to indicate limits of simulation
    survivalPercent = '>99.9999%'
  } else if (survivalRate >= 0.99999) {
    survivalPercent = `${(survivalRate * 100).toFixed(4)}%`
  } else if (survivalRate >= 0.999) {
    survivalPercent = `${(survivalRate * 100).toFixed(3)}%`
  } else if (survivalRate >= 0.99) {
    survivalPercent = `${(survivalRate * 100).toFixed(2)}%`
  } else {
    survivalPercent = `${(survivalRate * 100).toFixed(1)}%`
  }

  postMessage({
    type: 'RESULT',
    payload: {
      survivalRate,
      survivalPercent,
      averageRebuildTimeHours,
      ureProbability,
      dualFailureProbability,
    },
  })
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  const message = event.data

  switch (message.type) {
    case 'START':
      try {
        runSimulation(message.payload)
      } catch (error) {
        postMessage({
          type: 'ERROR',
          payload: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      break

    case 'ABORT':
      // Note: Early termination not yet implemented
      postMessage({ type: 'ABORTED' })
      break
  }
}
