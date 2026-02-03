/**
 * Hook that connects the calculation engines to the store.
 * Orchestrates independent calculation hooks for optimal performance.
 */

import drivesData from '@/data/drives.json'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import type { CalculationResults } from '@/types/results'
import { formatBytes as formatBytesUtil } from '@/utils'
import { hasBlockingErrors, validateConfiguration } from '@/utils/validators'
import { useBackupCalc } from './useBackupCalc'
import { usePerformanceCalc } from './usePerformanceCalc'
import { useSustainabilityCalc } from './useSustainabilityCalc'
import { useVolumetryCalc } from './useVolumetryCalc'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that provides all calculated results based on current configuration.
 * Orchestrates three independent calculation hooks with focused dependencies.
 */
export function useCalculations(): CalculationResults {
  const {
    // Hardware
    driveId,
    driveCount,
    serverCount,
    // Topology
    topology,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    controllerOptions,
  } = useConfigStore()

  // Get selected drive
  const drive = drives[driveId]

  // Call independent calculation hooks UNCONDITIONALLY (React Rules of Hooks)
  // Each hook has its own useMemo with focused dependencies
  // Each hook handles null drive gracefully by returning zero-state
  const volumetry = useVolumetryCalc()
  const backup = useBackupCalc(volumetry.usableCapacity)
  const performance = usePerformanceCalc()
  const sustainability = useSustainabilityCalc(volumetry.usableCapacity)

  // NOW we can check for errors and return early if needed
  const errors: string[] = []

  // Return error state if drive not found
  if (!drive) {
    errors.push(`Drive "${driveId}" not found`)
    return {
      volumetry,
      performance,
      resilience: null,
      sustainability,
      tco: null,
      backup,
      lastUpdated: Date.now(),
      errors,
    }
  }

  // Total drives across all servers
  const totalDriveCount = driveCount * serverCount

  // Validate configuration before returning results
  const validationAlerts = validateConfiguration({
    drive,
    driveCount: totalDriveCount,
    serverCount,
    topology,
    controller: controllerOptions.controller,
    ramPerNodeGb: 16, // Default RAM (could be made configurable in store)
    zfsOptions,
    s2dOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    vsanOptions,
  })

  // If blocking errors found, return error state
  if (hasBlockingErrors(validationAlerts)) {
    const blockingMessages = validationAlerts
      .filter((a) => a.severity === 'error')
      .map((a) => a.message)

    return {
      volumetry,
      performance,
      resilience: null,
      sustainability,
      tco: null,
      backup,
      lastUpdated: Date.now(),
      errors: blockingMessages,
    }
  }

  // All validation passed, return calculated results
  return {
    volumetry,
    performance,
    resilience: null, // Monte Carlo is Phase 4
    sustainability,
    tco: null, // TCO removed
    backup,
    lastUpdated: Date.now(),
    errors,
  }
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
