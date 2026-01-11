/**
 * Web Worker message types for Monte Carlo simulation.
 */

import type { URERate } from './drive'

/** Input parameters for Monte Carlo simulation */
export interface SimulationInput {
  /** Number of drives in the array */
  driveCount: number
  /** RAID level string (e.g., 'RAID6', 'raidz2') */
  raidLevel: string
  /** Drive capacity in bytes */
  driveCapacityBytes: number
  /** Rebuild speed in MB/s */
  rebuildSpeedMBs: number
  /** URE rate exponent (10^-x) */
  ureRate: URERate
  /** Annual failure rate percentage */
  afrPercent: number
  /** Number of simulations to run */
  simulationCount: number
}

/** Result from Monte Carlo simulation */
export interface SimulationOutput {
  /** Survival probability (0-1) */
  survivalRate: number
  /** Formatted survival percentage */
  survivalPercent: string
  /** Average rebuild time in hours */
  averageRebuildTimeHours: number
  /** URE probability during rebuild */
  ureProbability: number
  /** Dual failure probability */
  dualFailureProbability: number
}

/** Progress update from worker */
export interface SimulationProgress {
  /** Simulations completed so far */
  completed: number
  /** Total simulations to run */
  total: number
}

/** Messages sent TO the worker */
export type WorkerInputMessage = { type: 'START'; payload: SimulationInput } | { type: 'ABORT' }

/** Messages sent FROM the worker */
export type WorkerOutputMessage =
  | { type: 'PROGRESS'; payload: SimulationProgress }
  | { type: 'RESULT'; payload: SimulationOutput }
  | { type: 'ERROR'; payload: string }
  | { type: 'ABORTED' }
