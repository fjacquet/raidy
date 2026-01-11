/**
 * Configuration validators and alert generators.
 * Implements spec requirements for hardware/software validation.
 */

import type { Drive } from '@/types/drive'
import type {
  CephOptions,
  ControllerType,
  NetAppOptions,
  PowerFlexOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  VsanOptions,
  ZfsOptions,
} from '@/types/topology'
import { CONTROLLER_LIMITS, requiresHba } from '@/types/topology'

/** Alert severity levels */
export type AlertSeverity = 'error' | 'warning' | 'info'

/** Validation alert */
export interface ValidationAlert {
  severity: AlertSeverity
  code: string
  message: string
  recommendation?: string
}

/** Validation input */
export interface ValidationInput {
  drive: Drive
  driveCount: number
  topology: Topology
  controller: ControllerType
  ramPerNodeGb?: number
  zfsOptions?: ZfsOptions
  s2dOptions?: S2DOptions
  cephOptions?: CephOptions
  powerFlexOptions?: PowerFlexOptions
  netAppOptions?: NetAppOptions
  synologyOptions?: SynologyOptions
  vsanOptions?: VsanOptions
}

/**
 * Validate Ceph RAM requirements.
 * Per spec: Alert if < 2GB per OSD
 */
function validateCephRam(
  driveCount: number,
  ramPerNodeGb: number,
  nodes: number,
): ValidationAlert | null {
  // Calculate RAM per OSD (assuming 1 OSD per drive)
  const totalOsds = driveCount
  const osdsPerNode = totalOsds / nodes
  const ramPerOsd = ramPerNodeGb / osdsPerNode

  if (ramPerOsd < 2) {
    return {
      severity: 'warning',
      code: 'CEPH_RAM_LOW',
      message: `Ceph: Insufficient RAM per OSD (${ramPerOsd.toFixed(1)} GB). Minimum recommended: 2 GB/OSD.`,
      recommendation: `Add more RAM or reduce OSD count. Current: ${osdsPerNode} OSDs with ${ramPerNodeGb} GB RAM.`,
    }
  }

  if (ramPerOsd < 4) {
    return {
      severity: 'info',
      code: 'CEPH_RAM_MARGINAL',
      message: `Ceph: RAM per OSD is marginal (${ramPerOsd.toFixed(1)} GB). Consider 4 GB/OSD for production.`,
    }
  }

  return null
}

/**
 * Validate ZFS occupation threshold.
 * Per spec: Alert if occupation > 80%
 */
function validateZfsOccupation(zfsOptions: ZfsOptions): ValidationAlert | null {
  if (zfsOptions.maxOccupation > 80) {
    return {
      severity: 'warning',
      code: 'ZFS_OCCUPATION_HIGH',
      message: `ZFS: Max occupation set to ${zfsOptions.maxOccupation}%. Performance degrades significantly above 80%.`,
      recommendation: 'Keep pool occupation below 80% for optimal performance.',
    }
  }
  return null
}

/**
 * Validate RAID hardware controller compatibility.
 * Per specs: ZFS, S2D, vSAN, Ceph, PowerFlex require HBA (direct disk access)
 */
function validateControllerCompatibility(
  topology: Topology,
  controller: ControllerType,
): ValidationAlert | null {
  const needsHba = requiresHba(topology.type)
  const controllerSpec = CONTROLLER_LIMITS[controller]
  const isHba = controllerSpec?.isHba ?? false

  if (needsHba && !isHba) {
    return {
      severity: 'error',
      code: 'RAID_CONTROLLER_INCOMPATIBLE',
      message: `${topology.type.toUpperCase()}: Hardware RAID controller detected. This topology requires an HBA (IT mode) for direct disk access.`,
      recommendation: `Use an HBA like LSI 9400/9500 series or Dell HBA355i. RAID controllers hide disk identity and prevent proper data protection.`,
    }
  }

  if (!needsHba && isHba && topology.type === 'standard') {
    return {
      severity: 'info',
      code: 'HBA_WITH_STANDARD_RAID',
      message: `Using HBA with standard RAID topology. Consider using a hardware RAID controller for better cache and battery backup.`,
    }
  }

  return null
}

/**
 * Check for SMR (Shingled Magnetic Recording) drives.
 * Per ZFS spec: SMR drives cause timeouts and are incompatible
 */
function validateDriveType(drive: Drive, topology: Topology): ValidationAlert | null {
  // Check for potential SMR drives (typically 2TB+ consumer HDDs)
  // Note: This is a heuristic; actual SMR detection requires drive specs
  const isSuspectedSmr =
    drive.type === 'HDD' &&
    drive.capacity_raw > 2 * 1024 * 1024 * 1024 * 1024 && // > 2TB
    drive.model.toLowerCase().includes('smr')

  if (isSuspectedSmr) {
    if (topology.type === 'zfs' || topology.type === 's2d') {
      return {
        severity: 'error',
        code: 'SMR_DRIVE_INCOMPATIBLE',
        message: `SMR drive detected: ${drive.model}. SMR drives cause timeouts and disk ejection during rebuild operations.`,
        recommendation: 'Use CMR (Conventional Magnetic Recording) drives for ZFS and S2D pools.',
      }
    }
    return {
      severity: 'warning',
      code: 'SMR_DRIVE_WARNING',
      message: `SMR drive detected: ${drive.model}. SMR drives have poor random write performance.`,
      recommendation: 'Consider CMR drives for better performance and reliability.',
    }
  }

  return null
}

/**
 * Validate sector size compatibility.
 * Per spec: 512n deprecated, prefer 512e or 4Kn
 */
function validateSectorSize(drive: Drive): ValidationAlert | null {
  if (drive.sector_size === 512) {
    return {
      severity: 'info',
      code: 'SECTOR_512N_DEPRECATED',
      message: `Drive uses 512n sector size. Modern systems prefer 512e or 4Kn.`,
      recommendation:
        'For new deployments, consider drives with 4K native sectors for best performance.',
    }
  }
  return null
}

/**
 * Validate S2D cache configuration.
 * Per S2D spec: Minimum 2 cache drives per node recommended
 */
function validateS2DCache(s2dOptions: S2DOptions): ValidationAlert | null {
  // Check if using tiered storage
  if (s2dOptions.storageTiers && s2dOptions.tieringConfig?.enabled) {
    const cacheCount = s2dOptions.tieringConfig.fastTier.driveCount
    const cachePerNode = cacheCount / s2dOptions.faultDomains

    if (cachePerNode < 2) {
      return {
        severity: 'warning',
        code: 'S2D_CACHE_LOW',
        message: `S2D: Less than 2 cache drives per node (${cachePerNode.toFixed(1)}). Microsoft recommends minimum 2.`,
        recommendation: 'Add more cache drives for better write performance and protection.',
      }
    }
  }

  return null
}

/**
 * Validate cache to capacity ratio.
 * Per S2D spec: Alert if cache < 10% of capacity
 */
function validateCacheRatio(s2dOptions: S2DOptions): ValidationAlert | null {
  if (s2dOptions.storageTiers && s2dOptions.tieringConfig?.enabled) {
    const config = s2dOptions.tieringConfig
    // This would need actual capacity values; placeholder logic
    const cacheRatio =
      config.fastTier.driveCount / (config.fastTier.driveCount + config.capacityTier.driveCount)

    if (cacheRatio < 0.1) {
      return {
        severity: 'warning',
        code: 'S2D_CACHE_RATIO_LOW',
        message: `S2D: Cache ratio is less than 10% (${(cacheRatio * 100).toFixed(1)}%). Performance may be impacted.`,
        recommendation: 'Increase cache tier size to at least 10% of capacity tier.',
      }
    }
  }
  return null
}

/**
 * Validate NetApp RAID-TEC for large drives.
 * Per NetApp spec: RAID-TEC recommended for drives > 10TB
 */
function validateNetAppRaid(drive: Drive, netAppOptions: NetAppOptions): ValidationAlert | null {
  const tenTbInBytes = 10 * 1024 * 1024 * 1024 * 1024

  if (drive.capacity_raw > tenTbInBytes && netAppOptions.raidType === 'raid_dp') {
    return {
      severity: 'warning',
      code: 'NETAPP_RAID_TEC_RECOMMENDED',
      message: `NetApp: Using RAID-DP with drives > 10TB (${(drive.capacity_raw / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB). RAID-TEC recommended for better protection.`,
      recommendation: 'Switch to RAID-TEC (triple parity) for drives larger than 10TB.',
    }
  }

  return null
}

/**
 * Validate Synology filesystem choice.
 * Per Synology spec: Btrfs recommended for data protection features
 */
function validateSynologyFilesystem(synologyOptions: SynologyOptions): ValidationAlert | null {
  if (synologyOptions.filesystem === 'ext4') {
    return {
      severity: 'info',
      code: 'SYNOLOGY_BTRFS_RECOMMENDED',
      message:
        'Synology: Using ext4 filesystem. Btrfs provides additional data protection features.',
      recommendation: 'Consider Btrfs for snapshots, self-healing, and advanced protection.',
    }
  }
  return null
}

/**
 * Validate drive count for topology.
 */
function validateDriveCount(driveCount: number, topology: Topology): ValidationAlert | null {
  switch (topology.type) {
    case 'zfs':
      if (topology.level === 'raidz1' && driveCount < 3) {
        return {
          severity: 'error',
          code: 'ZFS_RAIDZ1_MIN_DRIVES',
          message: 'ZFS RAIDZ1 requires minimum 3 drives.',
        }
      }
      if (topology.level === 'raidz2' && driveCount < 4) {
        return {
          severity: 'error',
          code: 'ZFS_RAIDZ2_MIN_DRIVES',
          message: 'ZFS RAIDZ2 requires minimum 4 drives.',
        }
      }
      if (topology.level === 'raidz3' && driveCount < 5) {
        return {
          severity: 'error',
          code: 'ZFS_RAIDZ3_MIN_DRIVES',
          message: 'ZFS RAIDZ3 requires minimum 5 drives.',
        }
      }
      break

    case 's2d':
      if (topology.level !== 'simple' && driveCount < 4) {
        return {
          severity: 'error',
          code: 'S2D_MIN_DRIVES',
          message: 'S2D redundant configurations require minimum 4 drives.',
        }
      }
      break

    case 'ceph':
      if (driveCount < 3) {
        return {
          severity: 'warning',
          code: 'CEPH_MIN_OSDS',
          message: 'Ceph requires minimum 3 OSDs for proper data distribution.',
        }
      }
      break
  }

  return null
}

/**
 * Validate PowerFlex requirements.
 * Per PowerFlex spec: HDD no longer supported, Fine Granularity only supports 2-way mirror
 */
function validatePowerFlex(
  drive: Drive,
  _topology: Topology, // Kept for potential future topology-based validation
  powerFlexOptions?: PowerFlexOptions,
): ValidationAlert[] {
  const alerts: ValidationAlert[] = []

  // PowerFlex requires SSD/NVMe - HDD is no longer supported
  if (drive.type === 'HDD') {
    alerts.push({
      severity: 'error',
      code: 'POWERFLEX_HDD_NOT_SUPPORTED',
      message: `PowerFlex: HDD drives are no longer supported. Drive "${drive.model}" is an HDD.`,
      recommendation:
        'PowerFlex requires SSD or NVMe drives. HDDs are not supported in current PowerFlex versions.',
    })
  }

  // Fine Granularity only supports 2-way mirror, not 3-way
  if (
    powerFlexOptions?.granularity === 'fine' &&
    powerFlexOptions.protectionMode === 'mirror' &&
    powerFlexOptions.mirrorCopies === 3
  ) {
    alerts.push({
      severity: 'error',
      code: 'POWERFLEX_FG_3WAY_NOT_SUPPORTED',
      message:
        'PowerFlex: Fine Granularity mode does not support 3-way mirror. Only 2-way mirror is available.',
      recommendation:
        'Use Medium Granularity for 3-way mirror, or use 2-way mirror with Fine Granularity.',
    })
  }

  return alerts
}

/**
 * Validate vSAN requirements.
 * Per VMware spec:
 * - ESA (Express Storage Architecture) requires NVMe-only drives
 * - ESA provides single-tier storage (no hybrid caching)
 * - OSA supports mixed drive types with caching tier
 */
function validateVsan(
  drive: Drive,
  topology: Topology,
  vsanOptions?: VsanOptions,
): ValidationAlert[] {
  const alerts: ValidationAlert[] = []

  // Check if using vSAN ESA topology
  const isEsaTopology = topology.type === 'vmware' && topology.level.includes('esa')
  const isEsaArchitecture = vsanOptions?.architecture === 'esa'

  if (isEsaTopology || isEsaArchitecture) {
    // vSAN ESA requires NVMe drives only
    if (drive.type !== 'SSD_NVMe') {
      alerts.push({
        severity: 'error',
        code: 'VSAN_ESA_NVME_REQUIRED',
        message: `vSAN ESA: NVMe drives required. Drive "${drive.model}" is ${drive.type}.`,
        recommendation:
          'vSAN Express Storage Architecture (ESA) only supports NVMe drives. Use vSAN OSA for SAS/SATA/HDD configurations.',
      })
    }

    // vSAN ESA recommends high-endurance drives
    if (drive.type === 'SSD_NVMe' && drive.reliability.dwpd < 1) {
      alerts.push({
        severity: 'warning',
        code: 'VSAN_ESA_LOW_ENDURANCE',
        message: `vSAN ESA: Drive "${drive.model}" has low endurance (${drive.reliability.dwpd} DWPD).`,
        recommendation:
          'vSAN ESA recommends drives with at least 1 DWPD for write-intensive workloads.',
      })
    }
  }

  // vSAN OSA with HDD should have SSD cache tier
  const isOsaTopology = topology.type === 'vmware' && topology.level.includes('osa')
  const isOsaArchitecture = vsanOptions?.architecture === 'osa'

  if ((isOsaTopology || isOsaArchitecture) && drive.type === 'HDD') {
    alerts.push({
      severity: 'info',
      code: 'VSAN_OSA_HDD_CACHE_RECOMMENDED',
      message: 'vSAN OSA with HDD: SSD cache tier recommended for performance.',
      recommendation:
        'Add NVMe or SSD cache drives for hybrid configuration. Minimum 10% cache-to-capacity ratio.',
    })
  }

  return alerts
}

/**
 * Run all validators and return alerts.
 */
export function validateConfiguration(input: ValidationInput): ValidationAlert[] {
  const alerts: ValidationAlert[] = []

  // Controller compatibility
  const controllerAlert = validateControllerCompatibility(input.topology, input.controller)
  if (controllerAlert) alerts.push(controllerAlert)

  // Drive type (SMR detection)
  const driveTypeAlert = validateDriveType(input.drive, input.topology)
  if (driveTypeAlert) alerts.push(driveTypeAlert)

  // Sector size
  const sectorAlert = validateSectorSize(input.drive)
  if (sectorAlert) alerts.push(sectorAlert)

  // Drive count
  const driveCountAlert = validateDriveCount(input.driveCount, input.topology)
  if (driveCountAlert) alerts.push(driveCountAlert)

  // ZFS-specific
  if (input.topology.type === 'zfs' && input.zfsOptions) {
    const zfsAlert = validateZfsOccupation(input.zfsOptions)
    if (zfsAlert) alerts.push(zfsAlert)
  }

  // S2D-specific
  if (input.topology.type === 's2d' && input.s2dOptions) {
    const cacheAlert = validateS2DCache(input.s2dOptions)
    if (cacheAlert) alerts.push(cacheAlert)

    const cacheRatioAlert = validateCacheRatio(input.s2dOptions)
    if (cacheRatioAlert) alerts.push(cacheRatioAlert)
  }

  // Ceph-specific
  if (input.topology.type === 'ceph' && input.ramPerNodeGb) {
    // Assume 3 nodes for Ceph
    const nodes = 3
    const cephRamAlert = validateCephRam(input.driveCount, input.ramPerNodeGb, nodes)
    if (cephRamAlert) alerts.push(cephRamAlert)
  }

  // NetApp-specific
  if (
    input.topology.type === 'proprietary' &&
    input.topology.level.startsWith('netapp_') &&
    input.netAppOptions
  ) {
    const netAppAlert = validateNetAppRaid(input.drive, input.netAppOptions)
    if (netAppAlert) alerts.push(netAppAlert)
  }

  // Synology-specific
  if (
    input.topology.type === 'proprietary' &&
    input.topology.level.startsWith('synology_') &&
    input.synologyOptions
  ) {
    const synoAlert = validateSynologyFilesystem(input.synologyOptions)
    if (synoAlert) alerts.push(synoAlert)
  }

  // PowerFlex-specific
  if (input.topology.type === 'powerflex') {
    const powerFlexAlerts = validatePowerFlex(input.drive, input.topology, input.powerFlexOptions)
    alerts.push(...powerFlexAlerts)
  }

  // vSAN-specific (ESA requires NVMe, OSA recommends cache tier)
  if (input.topology.type === 'vmware') {
    const vsanAlerts = validateVsan(input.drive, input.topology, input.vsanOptions)
    alerts.push(...vsanAlerts)
  }

  // Sort by severity: error > warning > info
  const severityOrder: Record<AlertSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return alerts
}

/**
 * Check if configuration has any blocking errors.
 */
export function hasBlockingErrors(alerts: ValidationAlert[]): boolean {
  return alerts.some((alert) => alert.severity === 'error')
}

/**
 * Get alert count by severity.
 */
export function getAlertCounts(alerts: ValidationAlert[]): Record<AlertSeverity, number> {
  return {
    error: alerts.filter((a) => a.severity === 'error').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    info: alerts.filter((a) => a.severity === 'info').length,
  }
}
