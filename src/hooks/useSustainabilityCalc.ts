/**
 * Independent sustainability calculation hook with focused dependencies.
 * Only re-runs when sustainability-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculateSustainability } from '@/engines/sustainability'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import type { SustainabilityResult } from '@/types/results'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that calculates sustainability results based on current configuration.
 * Memoized with only sustainability-related dependencies.
 * Accepts usableCapacity from volumetry as a parameter.
 */
export function useSustainabilityCalc(usableCapacity: number): SustainabilityResult {
  const {
    // Hardware
    driveId,
    driveCount,
    serverCount,
    serverPowerWatts,
    // Workload
    dailyWriteVolume,
    // Advanced (sustainability-related only)
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
  } = useConfigStore()

  // Get selected drive
  const drive = drives[driveId]

  return useMemo(() => {
    // Return zero-state if drive not found (orchestrator handles validation)
    if (!drive) {
      return {
        annualEnergyKwh: 0,
        annualEnergyCost: 0,
        annualCO2Kg: 0,
        powerBreakdown: { drives: 0, servers: 0, cooling: 0, total: 0 },
      }
    }

    // Calculate total drives across all servers
    const totalDriveCount = driveCount * serverCount

    try {
      return calculateSustainability({
        drive,
        driveCount: totalDriveCount,
        serverCount,
        serverPowerWatts,
        pue,
        carbonRegion,
        projectYears,
        electricityCostPerKwh,
        dailyWriteVolume,
        usableCapacity,
      })
    } catch (error) {
      console.error('[Sustainability Engine Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        context: {
          driveId: drive.id,
          driveCount: totalDriveCount,
          serverCount,
          pue,
          carbonRegion,
        },
        timestamp: new Date().toISOString(),
      })

      // Return safe fallback state
      return {
        annualEnergyKwh: 0,
        annualEnergyCost: 0,
        annualCO2Kg: 0,
        powerBreakdown: { drives: 0, servers: 0, cooling: 0, total: 0 },
      }
    }
  }, [
    // Only sustainability-related dependencies
    drive,
    driveCount,
    serverCount,
    serverPowerWatts,
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
    dailyWriteVolume,
    usableCapacity,
  ])
}
