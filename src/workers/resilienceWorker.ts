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
 * Calculate number of parity drives (fault tolerance) for a RAID level.
 */
function getParityDrives(raidLevel: string): number {
  const level = raidLevel.toLowerCase()

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

  return 1 // Default to single parity
}

/**
 * Run a single Monte Carlo simulation.
 * Returns true if the array survives, false if data loss occurs.
 */
function runSingleSimulation(input: SimulationInput): {
  survived: boolean
  rebuildTimeHours: number
  hadURE: boolean
  hadDualFailure: boolean
} {
  const { driveCount, raidLevel, driveCapacityBytes, rebuildSpeedMBs, ureRate, afrPercent } = input

  const parityDrives = getParityDrives(raidLevel)

  // No redundancy = any failure is data loss
  if (parityDrives === 0) {
    // Simulate one year of operation
    const dailyFailureRate = afrPercent / 100 / 365
    for (let day = 0; day < 365; day++) {
      for (let drive = 0; drive < driveCount; drive++) {
        if (random() < dailyFailureRate) {
          return { survived: false, rebuildTimeHours: 0, hadURE: false, hadDualFailure: true }
        }
      }
    }
    return { survived: true, rebuildTimeHours: 0, hadURE: false, hadDualFailure: false }
  }

  // Calculate rebuild time in hours
  const driveCapacityMB = driveCapacityBytes / (1024 * 1024)
  const rebuildTimeHours = driveCapacityMB / rebuildSpeedMBs / 3600

  // URE probability during rebuild
  // URE rate is 10^-ureRate per bit read
  // Total bits read during rebuild = drive capacity in bits
  const bitsRead = driveCapacityBytes * 8 * (driveCount - 1) // Read from all surviving drives
  const ureRatePerBit = 10 ** -ureRate
  const ureProbability = 1 - (1 - ureRatePerBit) ** bitsRead

  // Daily failure rate per drive
  const dailyFailureRate = afrPercent / 100 / 365

  // Simulate one year of operation
  let failedDrives = 0
  let isRebuilding = false
  let rebuildDaysRemaining = 0
  let hadURE = false
  let hadDualFailure = false

  for (let day = 0; day < 365; day++) {
    // Check for drive failures
    for (let drive = 0; drive < driveCount - failedDrives; drive++) {
      if (random() < dailyFailureRate) {
        failedDrives++

        if (failedDrives > parityDrives) {
          // Too many failures - data loss
          hadDualFailure = true
          return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
        }

        // Start or extend rebuild
        if (!isRebuilding) {
          isRebuilding = true
          rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)

          // Check for URE during rebuild
          if (random() < ureProbability) {
            hadURE = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }
        }
      }
    }

    // Progress rebuild
    if (isRebuilding) {
      rebuildDaysRemaining--
      if (rebuildDaysRemaining <= 0) {
        isRebuilding = false
        failedDrives = 0 // Rebuild complete, drive replaced
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
  if (survivalRate >= 0.99999) {
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
