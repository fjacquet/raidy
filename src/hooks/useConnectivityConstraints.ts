/**
 * Hook for managing drive connectivity constraints.
 *
 * Monitors topology and cluster options, determines valid
 * connectivity options, and auto-corrects invalid selections.
 */

import { useEffect, useMemo } from 'react'
import { useConfigStore } from '@/store'
import {
  type ConnectivityConstraintResult,
  getConnectivityConstraint,
} from '@/utils/connectivityConstraints'

/**
 * Provides reactive connectivity constraints with auto-correction.
 *
 * @returns Constraint result with valid options and reason key
 *
 * @example
 * const { constraint, validOptions, reasonKey } = useConnectivityConstraints()
 * // constraint: 'nvme_only' | 'flash_only' | 'none'
 * // validOptions: ['nvme'] or ['all', 'nvme', 'sas', 'sata'] or all
 * // reasonKey: i18n key for the restriction message
 */
export function useConnectivityConstraints(): ConnectivityConstraintResult {
  const { topology, driveConnectivity, nutanixOptions, vsanOptions, setDriveConnectivity } =
    useConfigStore()

  // Calculate current constraint based on topology and options
  const result = useMemo(
    () =>
      getConnectivityConstraint({
        topologyType: topology.type,
        nutanixOptions: topology.type === 'nutanix' ? nutanixOptions : undefined,
        vsanOptions: topology.type === 'vsan_osa' ? vsanOptions : undefined,
      }),
    [topology.type, nutanixOptions, vsanOptions],
  )

  // Auto-correct invalid connectivity selection
  useEffect(() => {
    if (!result.validOptions.includes(driveConnectivity)) {
      // For NVMe-only, switch to 'nvme'
      // For flash-only, switch to 'all' (shows all flash options)
      const correctedValue = result.constraint === 'nvme_only' ? 'nvme' : 'all'
      setDriveConnectivity(correctedValue)
    }
  }, [result, driveConnectivity, setDriveConnectivity])

  return result
}
