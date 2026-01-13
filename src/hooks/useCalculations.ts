/**
 * Hook that connects the calculation engines to the store.
 * Automatically recalculates when configuration changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculatePerformance } from '@/engines/performance'
import { calculateSustainability } from '@/engines/sustainability'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import type { CalculationResults } from '@/types/results'
import { formatBytes as formatBytesUtil } from '@/utils'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that provides all calculated results based on current configuration.
 */
export function useCalculations(): CalculationResults {
  const {
    // Hardware
    driveId,
    driveCount,
    serverCount,
    serverPowerWatts,
    // Topology
    topology,
    hotSpares,
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
    controllerOptions,
    // Workload
    readPercent,
    blockSize,
    randomPercent,
    dailyWriteVolume,
    // Advanced
    compressionRatio,
    dedupRatio,
    networkSpeed,
    pcieGen,
    pcieLanes,
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
  } = useConfigStore()

  // Get selected drive
  const drive = drives[driveId]

  // Calculate all results
  return useMemo(() => {
    const errors: string[] = []

    if (!drive) {
      errors.push(`Drive "${driveId}" not found`)
      return {
        volumetry: {
          rawCapacity: 0,
          parityOverhead: 0,
          hotSpareOverhead: 0,
          filesystemOverhead: 0,
          slopOverhead: 0,
          usableCapacity: 0,
          effectiveCapacity: 0,
          efficiency: 0,
          breakdown: [],
        },
        performance: {
          maxReadThroughputMBs: 0,
          maxWriteThroughputMBs: 0,
          maxReadIOPS: 0,
          maxWriteIOPS: 0,
          layers: [],
          bottleneckDescription: 'No drive selected',
        },
        resilience: null,
        sustainability: {
          annualEnergyKwh: 0,
          annualEnergyCost: 0,
          annualCO2Kg: 0,
          powerBreakdown: { drives: 0, servers: 0, cooling: 0, total: 0 },
        },
        tco: null,
        lastUpdated: Date.now(),
        errors,
      }
    }

    // Total drives across all servers
    // driveCount = drives per server, serverCount = number of servers
    const totalDriveCount = driveCount * serverCount
    const totalHotSpares = hotSpares * serverCount

    // Volumetry calculations (uses total drives across all servers)
    const volumetry = calculateVolumetry({
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

    // Performance calculations (uses total drives across all servers)
    const performance = calculatePerformance({
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
    })

    // Sustainability calculations (uses total drives for power, serverCount for server power)
    const sustainability = calculateSustainability({
      drive,
      driveCount: totalDriveCount,
      serverCount,
      serverPowerWatts,
      pue,
      carbonRegion,
      projectYears,
      electricityCostPerKwh,
      dailyWriteVolume,
      usableCapacity: volumetry.usableCapacity,
    })

    return {
      volumetry,
      performance,
      resilience: null, // Monte Carlo is Phase 4
      sustainability,
      tco: null, // TCO removed
      lastUpdated: Date.now(),
      errors,
    }
  }, [
    drive,
    driveId,
    driveCount,
    serverCount,
    serverPowerWatts,
    topology,
    hotSpares,
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
    controllerOptions,
    readPercent,
    blockSize,
    randomPercent,
    dailyWriteVolume,
    compressionRatio,
    dedupRatio,
    networkSpeed,
    pcieGen,
    pcieLanes,
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
  ])
}

/**
 * Format bytes to human-readable string using the store's unit system setting.
 * Re-exports the centralized formatBytes utility for backward compatibility.
 */
export { formatBytes } from '@/utils'

/**
 * Format bytes using the unit system from store (for use in React components).
 * Use this hook when you need the formatted value to update when unitSystem changes.
 */
export function useFormatBytes() {
  const unitSystem = useConfigStore((state) => state.unitSystem)
  return (bytes: number) => formatBytesUtil(bytes, unitSystem)
}

/**
 * Format number with thousand separators.
 */
export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format currency.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
