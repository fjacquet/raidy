/**
 * Independent sustainability calculation hook with focused dependencies.
 * Only re-runs when sustainability-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { resolveTiering } from '@/engines/shared/tiering'
import { calculateSustainability } from '@/engines/sustainability'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
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
    powerscaleOptions,
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

    // Power, cooling and TCO are additive across node pools, so sustainability counts EVERY
    // tier — unlike performance and resilience, which model the first pool only (a client's
    // IOPS or a rebuild's exposure window are properties of the pool serving the data; a
    // cluster's power draw is not). `powerScaleDriveTotals` returns all zeroes for an
    // empty/unsized tier list, which degrades every figure below to 0 rather than throwing.
    const psTotals =
      topology.type === 'powerscale' && powerscaleOptions
        ? powerScaleDriveTotals(powerscaleOptions)
        : null

    // Calculate total drives across all servers
    const totalDriveCount = psTotals ? psTotals.clusterDrives : driveCount * effServerCount
    const nodeCount = psTotals ? psTotals.clusterNodes : effServerCount

    // Resolve tiering configuration (null when not a tiered topology). PowerScale has no
    // tiering branch in `resolveTiering`, so passing `nodeCount` here is harmless but kept
    // consistent with every other server-count use below.
    const tiering = resolveTiering(topology, nodeCount, tieringOptions)

    try {
      return calculateSustainability({
        drive,
        driveCount: totalDriveCount,
        serverCount: nodeCount,
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
    powerscaleOptions,
    tieringOptions,
  ])
}
