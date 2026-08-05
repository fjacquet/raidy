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
  /** Number of servers/groups (for RAID 50/60 group-based failure model) */
  serverCount?: number
  /** Mirror copies per group (2 or 3) — 0 or undefined = not a mirror topology */
  mirrorCopies?: number
  /**
   * Whether the platform has at least one dedicated hot spare drive for the group/pool this
   * input simulates (issue #93). A hot spare lets rebuild start the moment a failure is
   * detected; without one, someone has to notice the alert, source a replacement, and install
   * it before rebuild can begin, which lengthens the exposure window during which a second
   * failure is catastrophic.
   *
   * Defaults to `true` (immediate rebuild, no sourcing delay) when omitted, matching every
   * caller's behavior before #93 — this keeps the analytic MTTDL cross-check
   * (`tests/engines/resilience-analytic.spec.ts`) and the worker's own unit tests, which
   * construct `SimulationInput` without this field, on the original model. Only
   * `useResilience.ts` sets it explicitly, from the same `hotSpares > 0` (post
   * `usesDistributedSpares` zeroing) signal already used to size the simulated population.
   */
  hasHotSpare?: boolean
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
