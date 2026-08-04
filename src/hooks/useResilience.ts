/**
 * Hook for running Monte Carlo resilience simulation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { effectiveServerCount } from '@/engines/capabilities'
import { resolveTiering } from '@/engines/shared/tiering'
import {
  calculateStorageTargets,
  resolveBeeGfsUsableDrives,
} from '@/engines/volumetry/strategies/beegfs'
import type { Drive } from '@/types/drive'
import type { ResilienceResult, SimulationProgress } from '@/types/results'
import type { BeeGfsOptions, Topology } from '@/types/topology'
import type { SimulationInput, SimulationOutput, WorkerOutputMessage } from '@/types/worker'

interface UseResilienceOptions {
  drive: Drive | null
  driveCount: number
  serverCount?: number
  /**
   * Per-server hot spares (the store's raw value, as the other engines take it). Spare drives
   * are not data-bearing, so they are excluded from the simulated population — currently only
   * for BeeGFS, see the derivation in `runSimulation`.
   */
  hotSpares?: number
  topology: Topology
  rebuildSpeedMBs?: number
  simulationCount?: number
  autoRun?: boolean
  /** Mirror copies per group (2 or 3). 0 = not a mirror topology. */
  mirrorCopies?: number
  /**
   * BeeGFS-only. When set (topology.type === 'beegfs'), the worker's fault
   * group is the storage target rather than the node — see `drivesPerTarget`.
   */
  beeGfsOptions?: BeeGfsOptions
}

interface UseResilienceResult {
  result: ResilienceResult | null
  progress: SimulationProgress
  isRunning: boolean
  error: string | null
  runSimulation: () => void
  abort: () => void
}

/** Simulated drive population and fault-group count handed to the worker. */
export interface SimulationScope {
  driveCount: number
  groupCount: number
}

/**
 * Derive the BeeGFS simulated population from the SAME resolved values volumetry uses
 * (`resolveBeeGfsUsableDrives` + `calculateStorageTargets`, the single source of truth in
 * `src/engines/volumetry/strategies/beegfs.ts`) rather than from `driveCount * serverCount`,
 * which applied neither hot spares nor MDT tiering. Pre-fix, 100 drives with 10 hot spares at
 * `drivesPerTarget` 12 gave volumetry 7 targets and resilience 8 groups; under MDT tiering it
 * simulated the stale Hardware-panel drive count against a completely different capacity tier.
 * The capacity card and the resilience panel now describe one cluster.
 *
 * Superset invariant (the simulated failure set must never be smaller than the physically real
 * one, so this tool may understate resilience but never overstate it):
 * - Hot spares are excluded. A spare holds no data, so its failure is not a data-loss event in
 *   the real system either — the previous model counted spares as data-bearing, which was
 *   conservative; the new model is exact, and exact ⊇ real.
 * - Stranded drives are excluded for the same reason: after the whole-targets-only capacity
 *   fix they belong to no storage target and hold no data.
 * - The fault group is the whole storage target at its real width, so `drivesPerTarget` still
 *   reaches the simulation — the property the group model exists to preserve.
 * - Degenerate case: if not even one whole target forms, every remaining drive goes into ONE
 *   group. That group is wider, and therefore more failure-prone, than any real target, so the
 *   fallback stays on the conservative side of the invariant instead of simulating zero drives
 *   and reporting 100% survival.
 *
 * MDT drives are not simulated: they are a separate protection domain with their own buddy
 * mirroring, and this panel reports on the storage-target data path. That matches how Ceph's
 * WAL/DB offload tier is treated (also not simulated) and is the pre-existing scope of the
 * panel, not something this derivation introduced.
 *
 * @param driveCount - Hardware panel's per-server drive count
 * @param serverCount - Already clamped by `effectiveServerCount`
 * @param hotSpares - Store's per-server hot spares
 */
export function resolveBeeGfsSimulationScope(
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  beeGfsOptions: BeeGfsOptions,
): SimulationScope {
  const usableDrives = resolveBeeGfsUsableDrives(driveCount, serverCount, hotSpares, beeGfsOptions)
  const { storageTargetCount } = calculateStorageTargets(
    usableDrives,
    beeGfsOptions.drivesPerTarget,
  )
  if (storageTargetCount > 0) {
    return {
      driveCount: storageTargetCount * beeGfsOptions.drivesPerTarget,
      groupCount: storageTargetCount,
    }
  }
  return { driveCount: usableDrives, groupCount: 1 }
}

/**
 * Get the RAID level string from topology.
 */
function getRaidLevel(topology: Topology): string {
  return topology.level
}

/**
 * Calculate number of "nines" from survival rate.
 * e.g., 0.99999 = 5 nines
 */
function calculateNines(survivalRate: number): number {
  if (survivalRate >= 1) return 9 // Perfect
  if (survivalRate <= 0) return 0

  // Count nines after decimal
  const nines = -Math.log10(1 - survivalRate)
  return Math.min(9, Math.max(0, Math.floor(nines)))
}

/**
 * Determine risk level based on survival rate.
 */
function getRiskLevel(survivalRate: number): 'low' | 'medium' | 'high' | 'critical' {
  if (survivalRate >= 0.9999) return 'low' // 4+ nines
  if (survivalRate >= 0.999) return 'medium' // 3 nines
  if (survivalRate >= 0.99) return 'high' // 2 nines
  return 'critical' // Less than 2 nines
}

/**
 * Generate recommendations based on simulation results.
 */
function getRecommendations(
  result: SimulationOutput,
  topology: Topology,
  _driveCount: number,
): string[] {
  const recommendations: string[] = []

  // URE risk
  if (result.ureProbability > 0.01) {
    recommendations.push('Consider using enterprise drives with lower URE rates (10^-17)')
  }

  // Dual failure risk
  if (result.dualFailureProbability > 0.001) {
    if (topology.type === 'standard' && topology.level === 'RAID5') {
      recommendations.push('Upgrade to RAID6 for dual parity protection')
    }
    if (topology.type === 'zfs' && topology.level === 'raidz1') {
      recommendations.push('Upgrade to RAIDZ2 for dual parity protection')
    }
  }

  // Rebuild time
  if (result.averageRebuildTimeHours > 24) {
    recommendations.push(
      'Long rebuild times increase failure risk. Consider faster drives or dRAID',
    )
  }

  // Add hot spare if not present
  if (result.dualFailureProbability > 0.0001) {
    recommendations.push('Add hot spare drives to reduce rebuild initiation time')
  }

  // If survival is very high, acknowledge it
  if (result.survivalRate >= 0.9999 && recommendations.length === 0) {
    recommendations.push('Configuration provides excellent data protection')
  }

  return recommendations
}

/**
 * Hook to run Monte Carlo resilience simulation in a Web Worker.
 */
export function useResilience(options: UseResilienceOptions): UseResilienceResult {
  const {
    drive,
    driveCount,
    serverCount = 1,
    hotSpares = 0,
    topology,
    rebuildSpeedMBs = 200, // Default 200 MB/s rebuild speed (modern RAID controllers)
    simulationCount = 100000, // 100K iterations for better precision on rare events
    autoRun = false,
    mirrorCopies = 0,
    beeGfsOptions,
  } = options

  const [result, setResult] = useState<ResilienceResult | null>(null)
  const [progress, setProgress] = useState<SimulationProgress>({
    completed: 0,
    total: simulationCount,
    percent: 0,
    isRunning: false,
  })
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // Run simulation
  const runSimulation = useCallback(() => {
    if (!drive) {
      setError('No drive selected')
      return
    }

    // Terminate existing worker
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setIsRunning(true)
    setError(null)
    setProgress({
      completed: 0,
      total: simulationCount,
      percent: 0,
      isRunning: true,
    })

    // Create new worker
    const worker = new Worker(new URL('../workers/resilienceWorker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent<WorkerOutputMessage>) => {
      const message = event.data

      switch (message.type) {
        case 'PROGRESS':
          setProgress({
            completed: message.payload.completed,
            total: message.payload.total,
            percent: (message.payload.completed / message.payload.total) * 100,
            isRunning: true,
          })
          break

        case 'RESULT': {
          const simResult = message.payload
          const resilienceResult: ResilienceResult = {
            survivalRate: simResult.survivalRate,
            survivalPercent: simResult.survivalPercent,
            nines: calculateNines(simResult.survivalRate),
            avgRebuildTimeHours: simResult.averageRebuildTimeHours,
            ureProbability: simResult.ureProbability,
            dualFailureProbability: simResult.dualFailureProbability,
            riskLevel: getRiskLevel(simResult.survivalRate),
            recommendations: getRecommendations(simResult, topology, driveCount),
          }
          setResult(resilienceResult)
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break
        }

        case 'ERROR':
          setError(message.payload)
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break

        case 'ABORTED':
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break
      }
    }

    worker.onerror = (event) => {
      setError(event.message || 'Worker error')
      setIsRunning(false)
      setProgress((prev) => ({ ...prev, isRunning: false }))
    }

    // Start simulation
    // driveCount from store is per-server; worker needs total drives (matching other engines).
    // Clamp a stale serverCount to 1 for platforms whose servers/nodes slider is hidden
    // (defense in depth — the OutputDashboard call site passes a pre-clamped value; see
    // effectiveServerCount in src/engines/capabilities.ts, audit finding #14).
    const effServerCount = effectiveServerCount(serverCount, topology)

    // BeeGFS: the fault group is the storage target, and both the drive population and the
    // group count come from the same resolved values volumetry uses — see
    // resolveBeeGfsSimulationScope above for the derivation and the superset proof.
    const beeGfs =
      topology.type === 'beegfs' && beeGfsOptions
        ? resolveBeeGfsSimulationScope(driveCount, effServerCount, hotSpares, beeGfsOptions)
        : null

    // When BeeGFS MDT tiering is active the storage targets are built from the capacity-tier
    // drive, not the Hardware panel's drive. Simulating NVMe metadata media with the capacity
    // tier's HDD capacity/AFR (or vice versa) is the same class of error as the drive-count
    // mismatch above, so the media characteristics follow the same resolution.
    const beeGfsTiering =
      topology.type === 'beegfs' && beeGfsOptions
        ? resolveTiering(topology, effServerCount, { beeGfsOptions })
        : null
    const mediaDrive = beeGfsTiering?.capacityTierDrive ?? drive

    const totalDriveCount = beeGfs ? beeGfs.driveCount : driveCount * effServerCount
    const groupCount = beeGfs ? beeGfs.groupCount : effServerCount

    const input: SimulationInput = {
      driveCount: totalDriveCount,
      raidLevel: getRaidLevel(topology),
      driveCapacityBytes: mediaDrive.capacity_raw,
      rebuildSpeedMBs,
      ureRate: mediaDrive.reliability.ure_rate,
      afrPercent: mediaDrive.reliability.afr,
      simulationCount,
      serverCount: groupCount,
      mirrorCopies,
    }

    worker.postMessage({ type: 'START', payload: input })
  }, [
    drive,
    driveCount,
    serverCount,
    hotSpares,
    topology,
    rebuildSpeedMBs,
    simulationCount,
    mirrorCopies,
    beeGfsOptions,
  ])

  // Abort simulation
  const abort = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'ABORT' })
    }
  }, [])

  // Auto-run on config change (debounced)
  useEffect(() => {
    if (!autoRun || !drive) return

    const timeout = setTimeout(() => {
      runSimulation()
    }, 500)

    return () => clearTimeout(timeout)
  }, [autoRun, drive, runSimulation])

  return {
    result,
    progress,
    isRunning,
    error,
    runSimulation,
    abort,
  }
}
