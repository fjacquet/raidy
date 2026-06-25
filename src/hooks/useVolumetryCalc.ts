/**
 * Independent volumetry calculation hook with focused dependencies.
 * Only re-runs when volumetry-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { usesDistributedSpares } from '@/types'
import type { VolumetryResult } from '@/types/results'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that calculates volumetry results based on current configuration.
 * Memoized with only volumetry-related dependencies.
 */
export function useVolumetryCalc(): VolumetryResult {
  const {
    // Hardware (capacity-related only)
    driveId,
    driveCount,
    serverCount,
    hotSpares,
    // Topology
    topology,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    nutanixOptions,
    powervaultOptions,
    // Advanced (capacity modifiers only)
    compressionRatio,
    dedupRatio,
    // Filesystem type for overhead calculation
    fsType,
  } = useConfigStore()

  // Get selected drive
  const drive = drives[driveId]

  return useMemo(() => {
    // Return zero-state if drive not found (orchestrator handles validation)
    if (!drive) {
      return {
        rawCapacity: 0,
        parityOverhead: 0,
        hotSpareOverhead: 0,
        filesystemOverhead: 0,
        slopOverhead: 0,
        usableCapacity: 0,
        effectiveCapacity: 0,
        efficiency: 0,
        breakdown: [],
      }
    }

    // Calculate total drives across all servers.
    // vSAN rebuilds from distributed slack space, not dedicated hot-spare drives,
    // so force 0 spares even if persisted URL state hydrated a non-zero count.
    const totalDriveCount = driveCount * serverCount
    const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount

    try {
      return calculateVolumetry({
        drive,
        driveCount: totalDriveCount,
        hotSpares: totalHotSpares,
        serverCount,
        topology,
        zfsOptions,
        s2dOptions,
        vsanOptions,
        objectscaleOptions,
        powerstoreOptions,
        powerscaleOptions,
        cephOptions,
        powerFlexOptions,
        netAppOptions,
        synologyOptions,
        nutanixOptions,
        powervaultOptions,
        compressionRatio,
        dedupRatio,
        fsType,
      })
    } catch (error) {
      console.error('[Volumetry Engine Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        context: {
          driveId: drive.id,
          driveCount: totalDriveCount,
          serverCount,
          topology: topology.type,
          level: topology.level,
        },
        timestamp: new Date().toISOString(),
      })

      // Return safe fallback state
      return {
        rawCapacity: 0,
        parityOverhead: 0,
        hotSpareOverhead: 0,
        filesystemOverhead: 0,
        slopOverhead: 0,
        usableCapacity: 0,
        effectiveCapacity: 0,
        efficiency: 0,
        breakdown: [],
      }
    }
  }, [
    // Only volumetry-related dependencies
    drive,
    driveCount,
    serverCount,
    hotSpares,
    topology,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    nutanixOptions,
    powervaultOptions,
    compressionRatio,
    dedupRatio,
    fsType,
  ])
}
