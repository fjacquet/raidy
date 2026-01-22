/**
 * Drive connectivity constraints based on topology and cluster options.
 *
 * Determines valid connectivity options (NVMe, SAS, SATA, HDD) based on:
 * - Topology type (some require NVMe-only or flash-only)
 * - Cluster configuration (All-Flash vs Hybrid)
 */

import type { DriveConnectivity } from '@/types/drive'
import type { NutanixOptions, TopologyType, VsanOptions } from '@/types/topology'

/** Constraint types for drive connectivity */
export type ConnectivityConstraint = 'nvme_only' | 'flash_only' | 'none'

/** Flash-only connectivity options (excludes HDD) */
const FLASH_OPTIONS: DriveConnectivity[] = ['all', 'nvme', 'sas', 'sata']

/** All connectivity options */
const ALL_OPTIONS: DriveConnectivity[] = ['all', 'nvme', 'sas', 'sata', 'hdd']

/** Input configuration for constraint calculation */
export interface ConnectivityConstraintInput {
  topologyType: TopologyType
  nutanixOptions?: NutanixOptions
  vsanOptions?: VsanOptions
}

/** Result of connectivity constraint analysis */
export interface ConnectivityConstraintResult {
  /** The type of constraint applied */
  constraint: ConnectivityConstraint
  /** Valid connectivity options for current configuration */
  validOptions: DriveConnectivity[]
  /** i18n key for constraint reason message (null if no restriction) */
  reasonKey: string | null
}

/**
 * Get the connectivity constraint for the current configuration.
 *
 * Priority order:
 * 1. NVMe-only topologies (PowerStore, vSAN ESA)
 * 2. Flash-only topologies (PowerFlex)
 * 3. Flash-only via cluster options (Nutanix All-Flash, vSAN OSA All-Flash)
 * 4. No restriction
 */
export function getConnectivityConstraint(
  input: ConnectivityConstraintInput,
): ConnectivityConstraintResult {
  const { topologyType, nutanixOptions, vsanOptions } = input

  // NVMe-only topologies
  if (topologyType === 'powerstore' || topologyType === 'vsan_esa') {
    return {
      constraint: 'nvme_only',
      validOptions: ['nvme'],
      reasonKey: `connectivity.nvmeRequired.${topologyType}`,
    }
  }

  // Flash-only topologies (PowerFlex - HDD no longer supported)
  if (topologyType === 'powerflex') {
    return {
      constraint: 'flash_only',
      validOptions: FLASH_OPTIONS,
      reasonKey: 'connectivity.flashOnly.powerflex',
    }
  }

  // Nutanix All-Flash clusters
  if (topologyType === 'nutanix' && nutanixOptions?.clusterType === 'all-flash') {
    return {
      constraint: 'flash_only',
      validOptions: FLASH_OPTIONS,
      reasonKey: 'connectivity.flashOnly.nutanix',
    }
  }

  // vSAN OSA All-Flash mode
  if (topologyType === 'vsan_osa' && vsanOptions?.diskGroupMode === 'all-flash') {
    return {
      constraint: 'flash_only',
      validOptions: FLASH_OPTIONS,
      reasonKey: 'connectivity.flashOnly.vsan_osa',
    }
  }

  // No restriction
  return {
    constraint: 'none',
    validOptions: ALL_OPTIONS,
    reasonKey: null,
  }
}
