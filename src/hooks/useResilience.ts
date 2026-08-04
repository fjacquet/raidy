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
import { usesDistributedSpares } from '@/types'
import type { Drive } from '@/types/drive'
import type { ResilienceResult, SimulationProgress } from '@/types/results'
import type {
  BeeGfsOptions,
  CephOptions,
  NutanixOptions,
  S2DOptions,
  Topology,
  VsanOptions,
} from '@/types/topology'
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
  /**
   * Per-platform tiering option bags. When the platform's own tiering toggle is on, the
   * simulated population and media come from the capacity tier — see `tieredPlatformScope`.
   */
  s2dOptions?: S2DOptions
  vsanOptions?: VsanOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
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
 * - Degenerate case: if not even one whole target forms, every remaining USABLE drive goes into
 *   ONE group. That group is wider, and therefore more failure-prone, than any real target, so
 *   the fallback stays on the conservative side of the invariant.
 * - Fully degenerate case: when hot spares consume the whole population there are no usable
 *   drives left, so this returns `{ driveCount: 0, groupCount: 1 }` and the worker reports 100%
 *   survival. That is vacuously true rather than optimistic — a cluster with no data-bearing
 *   drive holds no data to lose — and volumetry zero-states the same input, so the two panels
 *   agree. It is NOT clamped: fabricating a drive would report a non-zero risk for data that
 *   does not exist. See `resolveBeeGfsSimulationScope` tests for the pinned behaviour.
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

/** Inputs a per-platform scope resolver may draw on. */
interface SimulationScopeContext {
  /** Hardware panel's per-server drive count */
  driveCount: number
  /** Already clamped by `effectiveServerCount` */
  serverCount: number
  /** Store's per-server hot spares */
  hotSpares: number
  topology: Topology
  beeGfsOptions?: BeeGfsOptions
  s2dOptions?: S2DOptions
  vsanOptions?: VsanOptions
  cephOptions?: CephOptions
  nutanixOptions?: NutanixOptions
}

/** How a platform overrides the naive `driveCount * serverCount` population, if at all. */
interface PlatformSimulationScope extends SimulationScope {
  /** Media whose capacity/AFR the simulation uses; null keeps the Hardware panel's drive. */
  mediaDrive: Drive | null
}

type SimulationScopeResolver = (ctx: SimulationScopeContext) => PlatformSimulationScope | null

/**
 * Population and media for the platforms that tier through `resolveTiering`: S2D storage tiers,
 * vSAN OSA disk groups, Ceph WAL/DB offload, Nutanix hybrid clusters.
 *
 * One resolver for all four rather than one each: `resolveTiering` already dispatches internally
 * by `topology.type`, and once it has resolved, turning a `TieredCapacityResult` into a scope is
 * identical everywhere. BeeGFS keeps its own resolver because it needs the storage-target concept
 * only it has.
 *
 * Returns null when the platform's tiering toggle is off, which leaves the naive
 * `driveCount * serverCount` path untouched for every currently-correct configuration.
 *
 * Not modelled: the fast tier as a shared failure domain. A vSAN OSA cache device failure takes
 * down its entire disk group, and a Ceph WAL/DB NVMe failure can take out every OSD it serves.
 * This resolver corrects WHICH drives are simulated, not WHY the fast tier failing could cascade
 * — that needs per-platform failure-domain work. The same limitation Ceph's WAL/DB tier already
 * had before this change.
 *
 * Hot spares are not subtracted here — no platform's resilience population subtracts them today
 * (issue #80). Counting a spare as data-bearing overstates risk, so this stays on the safe side
 * of the superset invariant documented on `resolveBeeGfsSimulationScope`.
 */
function tieredPlatformScope({
  topology,
  serverCount,
  s2dOptions,
  vsanOptions,
  cephOptions,
  nutanixOptions,
}: SimulationScopeContext): PlatformSimulationScope | null {
  const tiering = resolveTiering(topology, serverCount, {
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
  })
  if (!tiering) return null
  return {
    driveCount: tiering.capacityTierDriveCount,
    groupCount: serverCount,
    mediaDrive: tiering.capacityTierDrive,
  }
}

/**
 * Per-platform simulation-scope overrides, keyed by topology type.
 *
 * A table rather than a branch at the call site, mirroring `NETWORK_MODEL_BY_TOPOLOGY` in
 * `src/engines/performance/utils/bottleneck-chain.ts`, which solved the structurally identical
 * problem for the network model. Platforms absent from this table fall back to the naive
 * `driveCount * serverCount` population with `serverCount` fault groups.
 *
 * BeeGFS resolves its own storage-target population itself; the four tiered platforms share
 * `tieredPlatformScope`, which reads the capacity tier through `resolveTiering`.
 */
const SIMULATION_SCOPE_BY_TOPOLOGY: Partial<Record<Topology['type'], SimulationScopeResolver>> = {
  beegfs: ({ driveCount, serverCount, hotSpares, topology, beeGfsOptions }) => {
    if (!beeGfsOptions) return null
    const scope = resolveBeeGfsSimulationScope(driveCount, serverCount, hotSpares, beeGfsOptions)
    // When MDT tiering is active the storage targets are built from the capacity-tier drive, not
    // the Hardware panel's. Simulating NVMe metadata media with the capacity tier's HDD
    // capacity/AFR (or vice versa) is the same class of error as a stale drive count, so the
    // media characteristics resolve alongside the population rather than in a second pass.
    const tiering = resolveTiering(topology, serverCount, { beeGfsOptions })
    return { ...scope, mediaDrive: tiering?.capacityTierDrive ?? null }
  },
  s2d: tieredPlatformScope,
  vsan_osa: tieredPlatformScope,
  ceph: tieredPlatformScope,
  nutanix: tieredPlatformScope,
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
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
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

    // A hot spare holds no data, so its failure is not a data-loss event. Volumetry
    // (useVolumetryCalc.ts:80) and performance (usePerformanceCalc.ts:77) already remove spares
    // from their populations on this exact rule; resilience did not, which inflated the failure
    // population and understated survival for every configuration with a spare (#80).
    // vSAN rebuilds from distributed slack space rather than dedicated spare drives, so
    // usesDistributedSpares zeroes the subtraction there.
    const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount

    // Platforms whose simulated population is not simply `driveCount * serverCount` resolve it
    // through the table above — for BeeGFS the fault group is the storage target, and both the
    // population and the media come from the same resolved values volumetry uses. See
    // resolveBeeGfsSimulationScope for the derivation and the superset proof.
    const scope = SIMULATION_SCOPE_BY_TOPOLOGY[topology.type]?.({
      driveCount,
      serverCount: effServerCount,
      hotSpares,
      topology,
      beeGfsOptions,
      s2dOptions,
      vsanOptions,
      cephOptions,
      nutanixOptions,
    })

    const mediaDrive = scope?.mediaDrive ?? drive
    const totalDriveCount = scope
      ? scope.driveCount
      : Math.max(0, driveCount * effServerCount - totalHotSpares)
    const groupCount = scope ? scope.groupCount : effServerCount

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
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
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
