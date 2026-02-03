/**
 * Hook for running Monte Carlo resilience simulation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Drive } from '@/types/drive'
import type { ResilienceResult, SimulationProgress } from '@/types/results'
import type { Topology } from '@/types/topology'
import type { SimulationInput, SimulationOutput, WorkerOutputMessage } from '@/types/worker'

interface UseResilienceOptions {
  drive: Drive | null
  driveCount: number
  serverCount?: number
  topology: Topology
  rebuildSpeedMBs?: number
  simulationCount?: number
  autoRun?: boolean
  /** Mirror copies per group (2 or 3). 0 = not a mirror topology. */
  mirrorCopies?: number
}

interface UseResilienceResult {
  result: ResilienceResult | null
  progress: SimulationProgress
  isRunning: boolean
  error: string | null
  runSimulation: () => void
  abort: () => void
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
    topology,
    rebuildSpeedMBs = 200, // Default 200 MB/s rebuild speed (modern RAID controllers)
    simulationCount = 100000, // 100K iterations for better precision on rare events
    autoRun = false,
    mirrorCopies = 0,
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
    // driveCount from store is per-server; worker needs total drives (matching other engines)
    const totalDriveCount = driveCount * serverCount
    const input: SimulationInput = {
      driveCount: totalDriveCount,
      raidLevel: getRaidLevel(topology),
      driveCapacityBytes: drive.capacity_raw,
      rebuildSpeedMBs,
      ureRate: drive.reliability.ure_rate,
      afrPercent: drive.reliability.afr,
      simulationCount,
      serverCount,
      mirrorCopies,
    }

    worker.postMessage({ type: 'START', payload: input })
  }, [drive, driveCount, serverCount, topology, rebuildSpeedMBs, simulationCount, mirrorCopies])

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
