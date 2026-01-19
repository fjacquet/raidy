/**
 * Independent volumetry calculation hook with focused dependencies.
 * Only re-runs when volumetry-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
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

    // Calculate total drives across all servers
    const totalDriveCount = driveCount * serverCount
    const totalHotSpares = hotSpares * serverCount

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
  ])
}
