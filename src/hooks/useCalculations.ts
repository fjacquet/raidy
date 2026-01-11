/**
 * Hook that connects the calculation engines to the store.
 * Automatically recalculates when configuration changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { calculatePerformance } from '@/engines/performance'
import { calculateSustainability, calculateTCO } from '@/engines/sustainability'
import { calculateVolumetry } from '@/engines/volumetry'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import type { CalculationResults } from '@/types/results'

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
    dellOptions,
    cephOptions,
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
        tco: {
          hardwareCost: 0,
          totalEnergyCost: 0,
          maintenanceCost: 0,
          replacementCost: 0,
          totalCost: 0,
          costPerTB: 0,
          costPerEffectiveTB: 0,
          annualOpex: 0,
        },
        lastUpdated: Date.now(),
        errors,
      }
    }

    // Volumetry calculations
    const volumetry = calculateVolumetry({
      drive,
      driveCount,
      hotSpares,
      topology,
      zfsOptions,
      s2dOptions,
      vsanOptions,
      dellOptions,
      cephOptions,
      compressionRatio,
      dedupRatio,
    })

    // Performance calculations
    const performance = calculatePerformance({
      drive,
      driveCount,
      hotSpares,
      topology,
      controllerOptions,
      readPercent,
      randomPercent,
      blockSize,
      networkSpeed,
      pcieGen,
      pcieLanes,
    })

    // Sustainability calculations
    const sustainability = calculateSustainability({
      drive,
      driveCount,
      serverCount,
      serverPowerWatts,
      pue,
      carbonRegion,
      projectYears,
      electricityCostPerKwh,
      dailyWriteVolume,
      usableCapacity: volumetry.usableCapacity,
    })

    // TCO calculations
    const tco = calculateTCO(
      drive,
      driveCount,
      projectYears,
      sustainability,
      volumetry.usableCapacity,
      volumetry.effectiveCapacity,
    )

    return {
      volumetry,
      performance,
      resilience: null, // Monte Carlo is Phase 4
      sustainability,
      tco,
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
    dellOptions,
    cephOptions,
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
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 5) {
    const pb = bytes / 1024 ** 5
    return `${pb >= 100 ? pb.toFixed(0) : pb.toFixed(1)} PB`
  }
  if (bytes >= 1024 ** 4) {
    const tb = bytes / 1024 ** 4
    return `${tb >= 100 ? tb.toFixed(0) : tb.toFixed(1)} TB`
  }
  if (bytes >= 1024 ** 3) {
    const gb = bytes / 1024 ** 3
    return `${gb >= 100 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(0)} MB`
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
