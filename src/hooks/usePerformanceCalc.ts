/**
 * Independent performance calculation hook with focused dependencies.
 * Only re-runs when performance-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculatePerformance } from '@/engines/performance'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { usesDistributedSpares } from '@/types'
import type { PerformanceResult } from '@/types/results'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that calculates performance results based on current configuration.
 * Memoized with only performance-related dependencies.
 */
export function usePerformanceCalc(): PerformanceResult {
  const {
    // Hardware
    driveId,
    driveCount,
    serverCount,
    hotSpares,
    // Topology
    topology,
    controllerOptions,
    powerFlexOptions,
    cephOptions,
    nutanixOptions,
    vsanOptions,
    // Workload
    readPercent,
    randomPercent,
    blockSize,
    // Advanced (performance-related only)
    networkSpeed,
    pcieGen,
    pcieLanes,
  } = useConfigStore()

  // Get selected drive
  const drive = drives[driveId]

  return useMemo(() => {
    // Return zero-state if drive not found (orchestrator handles validation)
    if (!drive) {
      return {
        maxReadThroughputMBs: 0,
        maxWriteThroughputMBs: 0,
        maxReadIOPS: 0,
        maxWriteIOPS: 0,
        layers: [],
        bottleneckDescription: 'No drive selected',
      }
    }

    // Calculate total drives across all servers.
    // vSAN rebuilds from distributed slack space, not dedicated hot-spare drives,
    // so force 0 spares even if persisted URL state hydrated a non-zero count.
    const totalDriveCount = driveCount * serverCount
    const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount

    try {
      return calculatePerformance({
        drive,
        driveCount: totalDriveCount,
        hotSpares: totalHotSpares,
        serverCount,
        topology,
        controllerOptions,
        readPercent,
        randomPercent,
        blockSize,
        networkSpeed,
        pcieGen,
        pcieLanes,
        powerFlexOptions,
        cephOptions,
        nutanixOptions,
        vsanOptions,
      })
    } catch (error) {
      console.error('[Performance Engine Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        context: {
          driveId: drive.id,
          driveCount: totalDriveCount,
          serverCount,
          topology: topology.type,
          level: topology.level,
          readPercent,
          randomPercent,
        },
        timestamp: new Date().toISOString(),
      })

      // Return safe fallback state
      return {
        maxReadThroughputMBs: 0,
        maxWriteThroughputMBs: 0,
        maxReadIOPS: 0,
        maxWriteIOPS: 0,
        layers: [],
        bottleneckDescription: 'Performance calculation failed',
      }
    }
  }, [
    // Only performance-related dependencies
    drive,
    driveCount,
    serverCount,
    hotSpares,
    topology,
    controllerOptions,
    readPercent,
    randomPercent,
    blockSize,
    networkSpeed,
    pcieGen,
    pcieLanes,
    powerFlexOptions,
    cephOptions,
    nutanixOptions,
    vsanOptions,
  ])
}
