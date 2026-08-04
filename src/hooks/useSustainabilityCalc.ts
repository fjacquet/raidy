/**
 * Independent sustainability calculation hook with focused dependencies.
 * Only re-runs when sustainability-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { resolveTiering } from '@/engines/shared/tiering'
import { calculateSustainability } from '@/engines/sustainability'
import { useTieringOptions } from '@/hooks/useTieringOptions'
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
    // Topology (needed for tiering resolver)
    topology,
    // Workload
    dailyWriteVolume,
    // Advanced (sustainability-related only)
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
  } = useConfigStore()

  const tieringOptions = useTieringOptions()

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

    // Clamp a stale serverCount to 1 for platforms whose servers/nodes slider
    // is hidden, so switching topology can't silently scale results by a
    // leftover serverCount from a previously selected multi-node platform.
    const effServerCount = effectiveServerCount(serverCount, topology)

    // Calculate total drives across all servers
    const totalDriveCount = driveCount * effServerCount

    // Resolve tiering configuration (null when not a tiered topology)
    const tiering = resolveTiering(topology, effServerCount, tieringOptions)

    try {
      return calculateSustainability({
        drive,
        driveCount: totalDriveCount,
        serverCount: effServerCount,
        serverPowerWatts,
        pue,
        carbonRegion,
        projectYears,
        electricityCostPerKwh,
        dailyWriteVolume,
        usableCapacity,
        tiering,
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
    topology,
    tieringOptions,
  ])
}
