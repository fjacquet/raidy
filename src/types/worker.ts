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
  /**
   * AFR of the shared fast-tier device (cache / block.db), when the platform has one that takes
   * capacity devices down with it (issue #88).
   *
   * Absent or 0 means "no shared fast tier", which is the default and reproduces the pre-#88
   * model exactly. Only `useResilience` sets it, and only for the two platforms with a vendor
   * statement behind the cascade:
   *
   * - **vSAN OSA** — "vSAN interprets the failure of a single flash caching device as a failure
   *   of the entire disk group", capacity devices included (Broadcom, *A Flash Caching Device Is
   *   Not Accessible in a vSAN Cluster*).
   * - **Ceph** — "a corrupt block.db file will impact all OSDs which are included in that
   *   block.db file" (Red Hat Ceph Storage Operations Guide, *Handling a disk failure*).
   *
   * S2D and Nutanix tier through the same resolver but are deliberately excluded: their fast
   * tiers are write-back cache and no vendor documents the loss taking the capacity tier with
   * it. Including them for symmetry would be inventing a failure mode.
   */
  sharedFastTierAfrPercent?: number
  /**
   * How many shared fast-tier devices back the whole simulated population. Each one's failure
   * takes down `driveCount / fastTierDeviceCount` capacity drives at once — for vSAN OSA that is
   * a disk group, for Ceph the OSDs sharing one block.db device.
   *
   * A cluster-wide total rather than a per-group figure, because that is what
   * `TieredCapacityResult.cacheTierDriveCount` already is.
   */
  fastTierDeviceCount?: number
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
