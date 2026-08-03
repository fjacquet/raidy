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
  return (
    level === 'raid10' ||
    level === 'raid1' ||
    level === 'mirror' ||
    level === 'raid1e' ||
    // BeeGFS RAID10 target: local mirroring is drive-pair-based like standard
    // RAID10, so the global drive-pair mirror model applies regardless of the
    // storage-target boundary (pair math is location-agnostic). Buddy mirroring
    // (a separate, cluster-wide mirror layer) is expressed via `mirrorCopies`,
    // not via level name.
    level === 'beegfs_raid10'
  )
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
    // BeeGFS storage targets are independent local-RAID fault groups (RAID6 /
    // RAIDZ2) — the storage-target count is passed in as `serverCount`
    // (see the caller), so this reuses the RAID 50/60 group model.
    level === 'beegfs_raid6' ||
    level === 'beegfs_raidz2'
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
  // A level's own group-vs-mirror shape (RAID 50/60, BeeGFS RAID6/RAIDZ2 storage
  // targets) always wins over a generic mirrorCopies input — mirrorCopies then
  // layers an *additional* mirror on top of the group (buddy mirroring pairs
  // storage targets, it does not replace their local RAID6/RAIDZ2 redundancy —
  // see the buddy-pair handling in the group-topology branch below). Only when
  // the level has no native group shape does mirrorCopies switch on the
  // drive-pair mirror model directly (e.g. plain 'mirror'/'raid1', or
  // beegfs_single which has no local redundancy of its own).
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

  // Mirror topology: N-way mirror groups (e.g., 2-way pairs, 3-way triplets).
  //
  // beegfs_raid10 buddy mirroring: pairs two local RAID10 mirror-pairs (drive
  // pairs are location-agnostic, see isMirrorTopology above) into one merged
  // 4-drive buddy unit, tolerating 3 of its 4 drives — i.e. failure only when
  // BOTH constituent 2-drive pairs are completely lost (2+2). This mirrors the
  // group topology's buddy-pair handling below and is exact, not merely a
  // conservative bound: within a 4-drive buddy unit built from two independent
  // 2-drive sub-pairs, the only way to reach 4 failures is exactly 2 in each
  // sub-pair (a 2-drive pair cannot contribute more than 2), so "total > 3"
  // fires precisely when both sub-pairs are fully dead — the real buddy-loss
  // condition — and never earlier. This is scoped to beegfs_raid10 specifically
  // via raidLevel, so it cannot change numbers for any other mirror caller
  // (S2D mirror/MAP, PowerFlex mirror, 2-/3-way replicated platforms, plain
  // RAID1/RAID10/RAID1E) — those keep using mirrorCopies as a literal replica
  // count, unaffected by this branch.
  const isBeegfsRaid10 = raidLevel.toLowerCase() === 'beegfs_raid10'
  const isBuddyMirroredRaid10 = isBeegfsRaid10 && mirrorCopies >= 2
  const effectiveMirrorGroupWidth = isBuddyMirroredRaid10 ? 4 : effectiveMirrorCopies
  const numMirrorGroups = isMirror ? Math.floor(driveCount / effectiveMirrorGroupWidth) : 0
  const mirrorParityPerGroup = effectiveMirrorGroupWidth - 1 // Can lose N-1 copies per group

  // Group topology: RAID 50/60 (and BeeGFS RAID6/RAIDZ2 storage targets) stripe
  // across independent RAID groups.
  //
  // Buddy mirroring (mirrorCopies >= 2) on a group topology pairs whole groups
  // (BeeGFS mirrors storage targets, not individual drives): adjacent groups are
  // merged into one buddy-pair unit, doubling its drive count and — because the
  // pair only loses data once BOTH targets' local redundancy is independently
  // exhausted, not merely once combined failures cross the single-target
  // threshold — its effective tolerance is set generously above 2x the single
  // group's tolerance (2*parityDrives + 1) as a coarse, conservative stand-in
  // for that two-target-must-both-fail condition.
  const isBuddyMirroredGroup = isGroup && mirrorCopies >= 2
  const numGroups = isGroup
    ? isBuddyMirroredGroup
      ? Math.max(1, Math.floor(serverCount / 2))
      : serverCount
    : 0
  const drivesPerGroup = isGroup && numGroups > 0 ? Math.floor(driveCount / numGroups) : 0
  const parityPerGroup = isBuddyMirroredGroup ? parityDrives * 2 + 1 : parityDrives // 1 for RAID 50, 2 for RAID 60

  // URE probability during rebuild
  const ureRatePerBit = 10 ** -ureRate

  // Bits read during rebuild depends on topology:
  // Mirror: reads only 1 good copy (any surviving mirror partner)
  // Group: reads all drives in the group minus the failed one
  // Parity: reads ALL surviving drives (N-1 drives)
  let bitsRead: number
  if (isMirror) {
    bitsRead = driveCapacityBytes * 8 // 1 drive
  } else if (isGroup && drivesPerGroup > 1) {
    bitsRead = driveCapacityBytes * 8 * (drivesPerGroup - 1)
  } else {
    bitsRead = driveCapacityBytes * 8 * (driveCount - 1)
  }
  const ureProbability = 1 - (1 - ureRatePerBit) ** bitsRead

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
            (_f, g) => effectiveMirrorGroupWidth - (mirrorGroupFailures[g] ?? 0),
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
          // Group topology: assign failure to a group weighted by surviving drives
          // Each group has (drivesPerGroup - groupFailures[g]) surviving drives
          const survivingPerGroup = groupFailures.map(
            (_f, g) => drivesPerGroup - (groupFailures[g] ?? 0),
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
            if ((groupFailures[hitGroup] ?? 0) >= parityPerGroup && random() < ureProbability) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          } else {
            if ((groupFailures[hitGroup] ?? 0) >= parityPerGroup && random() < ureProbability) {
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
