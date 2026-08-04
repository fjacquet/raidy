/**
 * Configuration validators and alert generators.
 * Implements spec requirements for hardware/software validation.
 */

import i18n from '@/i18n'
import type { Drive } from '@/types/drive'
import type { BeeGfsCapacityDetails } from '@/types/results'
import type {
  BeeGfsOptions,
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
import { CONTROLLER_LIMITS, getControllerRequirement } from '@/types/topology'
import { formatBytes } from '@/utils/units'

/** i18n lookup for the `validation` namespace, used outside React components. */
function tv(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`validation:${key}`, options) as string
}

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
  serverCount?: number
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
  beeGfsOptions?: BeeGfsOptions
  /** Engine-computed MDT advisory (volumetry.beeGfsDetails) — read-only for the validator. */
  beeGfsDetails?: BeeGfsCapacityDetails
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
      message: tv('ceph.ramLow', { ramPerOsd: ramPerOsd.toFixed(1) }),
      recommendation: tv('ceph.ramLowRecommendation', { osdsPerNode, ramPerNodeGb }),
    }
  }

  if (ramPerOsd < 4) {
    return {
      severity: 'info',
      code: 'CEPH_RAM_MARGINAL',
      message: tv('ceph.ramMarginal', { ramPerOsd: ramPerOsd.toFixed(1) }),
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
      message: tv('zfs.occupationHigh', { maxOccupation: zfsOptions.maxOccupation }),
      recommendation: tv('zfs.occupationHighRecommendation'),
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
  // BeeGFS resolves its controller class from the level: a RAIDz2 target needs IT mode,
  // a RAID6/RAID10 target belongs behind a RAID controller.
  const requirement = getControllerRequirement(topology.type, topology.level)
  const needsHba = requirement === 'hba'
  const controllerSpec = CONTROLLER_LIMITS[controller]
  const isHba = controllerSpec?.isHba ?? false

  // A hardware-RAID BeeGFS target modelled behind an HBA inherits the HBA's much higher
  // ceiling (10M IOPS on NVMe direct attach vs 750k on a PERC H755) — an optimistic error.
  // The store snaps the controller on topology change, so this is only reachable from a
  // hand-crafted or pre-existing shared URL.
  if (requirement === 'raid' && isHba && topology.type === 'beegfs') {
    return {
      severity: 'error',
      code: 'BEEGFS_RAID_TARGET_NEEDS_RAID_CONTROLLER',
      message: tv('beegfs.raidTargetNeedsRaidController', { level: topology.level }),
      recommendation: tv('beegfs.raidTargetNeedsRaidControllerRecommendation'),
    }
  }

  if (needsHba && !isHba) {
    return {
      severity: 'error',
      code: 'RAID_CONTROLLER_INCOMPATIBLE',
      message: tv('controller.raidIncompatible', { topologyType: topology.type.toUpperCase() }),
      recommendation: tv('controller.raidIncompatibleRecommendation'),
    }
  }

  if (!needsHba && isHba && topology.type === 'standard') {
    return {
      severity: 'info',
      code: 'HBA_WITH_STANDARD_RAID',
      message: tv('controller.hbaWithStandardRaid'),
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
        message: tv('driveType.smrIncompatible', { model: drive.model }),
        recommendation: tv('driveType.smrIncompatibleRecommendation'),
      }
    }
    return {
      severity: 'warning',
      code: 'SMR_DRIVE_WARNING',
      message: tv('driveType.smrWarning', { model: drive.model }),
      recommendation: tv('driveType.smrWarningRecommendation'),
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
      message: tv('sectorSize.deprecated512n'),
      recommendation: tv('sectorSize.deprecated512nRecommendation'),
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
        message: tv('s2d.cacheLow', { cachePerNode: cachePerNode.toFixed(1) }),
        recommendation: tv('s2d.cacheLowRecommendation'),
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
        message: tv('s2d.cacheRatioLow', { cacheRatioPct: (cacheRatio * 100).toFixed(1) }),
        recommendation: tv('s2d.cacheRatioLowRecommendation'),
      }
    }
  }
  return null
}

/**
 * Validate S2D resiliency against the fault-domain (node) count and surface
 * Microsoft best-practice guidance.
 *
 * Minimum nodes per resiliency (Microsoft Learn, Storage Spaces Direct fault tolerance):
 * - three-way mirror: 3 nodes
 * - single parity: 3 nodes (supported but not recommended for clustered S2D)
 * - dual parity: 4 nodes
 * - mirror-accelerated parity: 4 nodes
 */
function validateS2DResiliency(topology: Topology, s2dOptions: S2DOptions): ValidationAlert[] {
  if (topology.type !== 's2d') return []

  const alerts: ValidationAlert[] = []
  const { faultDomains, mirrorCopies } = s2dOptions
  const level = topology.level

  // Node minimums per resiliency type (errors).
  if (level === 'mirror' && mirrorCopies === 3 && faultDomains < 3) {
    alerts.push({
      severity: 'error',
      code: 'S2D_3WAY_MIN_NODES',
      message: tv('s2d.threeWayMinNodes', { faultDomains }),
      recommendation: tv('s2d.threeWayMinNodesRecommendation'),
    })
  }
  if (level === 'parity' && faultDomains < 3) {
    alerts.push({
      severity: 'error',
      code: 'S2D_PARITY_MIN_NODES',
      message: tv('s2d.parityMinNodes', { faultDomains }),
      recommendation: tv('s2d.parityMinNodesRecommendation'),
    })
  }
  if (level === 'dual_parity' && faultDomains < 4) {
    alerts.push({
      severity: 'error',
      code: 'S2D_DUAL_PARITY_MIN_NODES',
      message: tv('s2d.dualParityMinNodes', { faultDomains }),
      recommendation: tv('s2d.dualParityMinNodesRecommendation'),
    })
  }
  if (level === 'map' && faultDomains < 4) {
    alerts.push({
      severity: 'error',
      code: 'S2D_MAP_MIN_NODES',
      message: tv('s2d.mapMinNodes', { faultDomains }),
      recommendation: tv('s2d.mapMinNodesRecommendation'),
    })
  }

  // Single parity is supported but discouraged for clustered S2D (tolerates only one failure).
  if (level === 'parity') {
    alerts.push({
      severity: 'warning',
      code: 'S2D_SINGLE_PARITY_DISCOURAGED',
      message: tv('s2d.singleParityDiscouraged'),
      recommendation: tv('s2d.singleParityDiscouragedRecommendation'),
    })
  }

  // 2-node clusters should use nested resiliency to survive a drive failure during a node outage.
  if (faultDomains === 2 && level !== 'simple') {
    alerts.push({
      severity: 'warning',
      code: 'S2D_2NODE_NESTED_RECOMMENDED',
      message: tv('s2d.twoNodeNestedRecommended'),
      recommendation: tv('s2d.twoNodeNestedRecommendedRecommendation'),
    })
  }

  // Three-way mirror is Microsoft's recommended default for production HA.
  if (level === 'mirror' && mirrorCopies === 2 && faultDomains >= 3) {
    alerts.push({
      severity: 'info',
      code: 'S2D_3WAY_RECOMMENDED',
      message: tv('s2d.threeWayRecommended'),
      recommendation: tv('s2d.threeWayRecommendedRecommendation'),
    })
  }

  return alerts
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
      message: tv('netapp.raidTecRecommended', {
        tb: (drive.capacity_raw / (1024 * 1024 * 1024 * 1024)).toFixed(1),
      }),
      recommendation: tv('netapp.raidTecRecommendedRecommendation'),
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
      message: tv('synology.btrfsRecommended'),
      recommendation: tv('synology.btrfsRecommendedRecommendation'),
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
          message: tv('driveCount.zfsRaidz1'),
        }
      }
      if (topology.level === 'raidz2' && driveCount < 4) {
        return {
          severity: 'error',
          code: 'ZFS_RAIDZ2_MIN_DRIVES',
          message: tv('driveCount.zfsRaidz2'),
        }
      }
      if (topology.level === 'raidz3' && driveCount < 5) {
        return {
          severity: 'error',
          code: 'ZFS_RAIDZ3_MIN_DRIVES',
          message: tv('driveCount.zfsRaidz3'),
        }
      }
      break

    case 's2d':
      if (topology.level !== 'simple' && driveCount < 4) {
        return {
          severity: 'error',
          code: 'S2D_MIN_DRIVES',
          message: tv('driveCount.s2dMin'),
        }
      }
      break

    case 'ceph':
      if (driveCount < 3) {
        return {
          severity: 'warning',
          code: 'CEPH_MIN_OSDS',
          message: tv('driveCount.cephMinOsds'),
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
      message: tv('powerflex.hddNotSupported', { model: drive.model }),
      recommendation: tv('powerflex.hddNotSupportedRecommendation'),
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
      message: tv('powerflex.fg3wayNotSupported'),
      recommendation: tv('powerflex.fg3wayNotSupportedRecommendation'),
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
  serverCount: number,
  _vsanOptions?: VsanOptions,
): ValidationAlert[] {
  const alerts: ValidationAlert[] = []

  // vSAN ESA validation
  if (topology.type === 'vsan_esa') {
    // vSAN ESA requires NVMe drives only
    if (drive.type !== 'SSD_NVMe') {
      alerts.push({
        severity: 'error',
        code: 'VSAN_ESA_NVME_REQUIRED',
        message: tv('vsan.esaNvmeRequired', { model: drive.model, driveType: drive.type }),
        recommendation: tv('vsan.esaNvmeRequiredRecommendation'),
      })
    }

    // vSAN ESA recommends high-endurance drives
    if (drive.type === 'SSD_NVMe' && drive.reliability.dwpd < 1) {
      alerts.push({
        severity: 'warning',
        code: 'VSAN_ESA_LOW_ENDURANCE',
        message: tv('vsan.esaLowEndurance', { model: drive.model, dwpd: drive.reliability.dwpd }),
        recommendation: tv('vsan.esaLowEnduranceRecommendation'),
      })
    }

    // ESA minimum host requirements
    const esaMinHosts: Record<string, number> = {
      vsan_esa_raid1: 2,
      vsan_esa_raid5: 3,
      vsan_esa_raid6: 6,
    }
    const minHosts = esaMinHosts[topology.level] ?? 3
    if (serverCount < minHosts) {
      alerts.push({
        severity: 'error',
        code: 'VSAN_ESA_MIN_HOSTS',
        message: tv('vsan.esaMinHosts', { level: topology.level, minHosts, serverCount }),
        recommendation: tv('vsan.esaMinHostsRecommendation', { minHosts }),
      })
    }
  }

  // vSAN OSA validation
  if (topology.type === 'vsan_osa') {
    // OSA with HDD should have SSD cache tier
    if (drive.type === 'HDD') {
      alerts.push({
        severity: 'info',
        code: 'VSAN_OSA_HDD_CACHE_RECOMMENDED',
        message: tv('vsan.osaHddCacheRecommended'),
        recommendation: tv('vsan.osaHddCacheRecommendedRecommendation'),
      })
    }

    // OSA minimum host requirements
    const osaMinHosts: Record<string, number> = {
      vsan_osa_raid1: 3,
      vsan_osa_raid1_ftt2: 5,
      vsan_osa_raid5: 4,
      vsan_osa_raid6: 6,
    }
    const minHosts = osaMinHosts[topology.level] ?? 3
    if (serverCount < minHosts) {
      alerts.push({
        severity: 'error',
        code: 'VSAN_OSA_MIN_HOSTS',
        message: tv('vsan.osaMinHosts', { level: topology.level, minHosts, serverCount }),
        recommendation: tv('vsan.osaMinHostsRecommendation', { minHosts }),
      })
    }
  }

  return alerts
}

/**
 * Validate BeeGFS-specific configuration.
 *
 * These are the *advisory* layer on top of the engine's zero-state handling
 * (see src/engines/volumetry/validation/inputValidation.ts): buddy mirroring
 * with fewer than 2 nodes, fewer drives than one storage target, and
 * drivesPerTarget below the level's RAID minimum already produce a zero
 * result from the engine. This validator explains *why*, plus advisory
 * checks the engine has no reason to zero-state (stranded drives, metadata
 * target sizing).
 */
function validateBeeGfs(
  driveCount: number,
  serverCount: number,
  topology: Topology,
  beeGfsOptions?: BeeGfsOptions,
  beeGfsDetails?: BeeGfsCapacityDetails,
): ValidationAlert[] {
  if (topology.type !== 'beegfs' || !beeGfsOptions) return []

  const alerts: ValidationAlert[] = []

  // Buddy groups mirror between pairs of targets on different nodes — a
  // single-node cluster cannot form a fault-tolerant pair. Mirrors the
  // engine's zero-state for this case.
  if (beeGfsOptions.storageBuddyMirror && serverCount < 2) {
    alerts.push({
      severity: 'error',
      code: 'BEEGFS_BUDDY_MIRROR_MIN_NODES',
      message: tv('beegfs.buddyMirrorMinNodes', { serverCount }),
      recommendation: tv('beegfs.buddyMirrorMinNodesRecommendation'),
    })
  }

  // Drives that don't fill a whole storage target are wasted — capacity is
  // computed on whole targets only (src/engines/volumetry/index.ts).
  // Prefer the engine's own count when a result exists: `beeGfsDetails.strandedDrives` is
  // derived from the hot-spare- and tiering-adjusted drive count that actually feeds the
  // capacity calculation, whereas the local `driveCount % drivesPerTarget` fallback (used
  // when the validator runs before any result, e.g. validateOrThrow) sees neither. Without
  // this the warning could name a different number than the capacity card it sits next to.
  const drivesPerTarget = beeGfsOptions.drivesPerTarget
  if (drivesPerTarget > 0 && driveCount >= drivesPerTarget) {
    const stranded = beeGfsDetails?.strandedDrives ?? driveCount % drivesPerTarget
    if (stranded > 0) {
      alerts.push({
        severity: 'warning',
        code: 'BEEGFS_STRANDED_DRIVES',
        message: tv('beegfs.strandedDrives', { stranded, drivesPerTarget }),
      })
    }
  }

  if (beeGfsDetails?.status === 'none') {
    alerts.push({
      severity: 'info',
      code: 'BEEGFS_NO_MDT',
      message: tv('beegfs.noMdt'),
    })
  } else if (beeGfsDetails?.status === 'under') {
    alerts.push({
      severity: 'warning',
      code: 'BEEGFS_MDT_UNDER_MIN',
      message: tv('beegfs.mdtUnderMin', {
        recommendedMin: formatBytes(beeGfsDetails.mdtRecommendedMin, 'decimal'),
      }),
      recommendation: tv('beegfs.mdtUnderMinRecommendation', {
        recommendedTypical: formatBytes(beeGfsDetails.mdtRecommendedTypical, 'decimal'),
      }),
    })
  }

  return alerts
}

/**
 * Run all validators and return alerts.
 *
 * To prevent calculations on invalid configs, use hasBlockingErrors(alerts)
 * or validateOrThrow(input) which throws on error-severity alerts.
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

    alerts.push(...validateS2DResiliency(input.topology, input.s2dOptions))
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
  if (input.topology.type === 'vsan_osa' || input.topology.type === 'vsan_esa') {
    const vsanAlerts = validateVsan(
      input.drive,
      input.topology,
      input.serverCount ?? 3,
      input.vsanOptions,
    )
    alerts.push(...vsanAlerts)
  }

  // BeeGFS-specific (buddy mirroring fault domains, stranded drives, MDT sizing)
  if (input.topology.type === 'beegfs') {
    const beeGfsAlerts = validateBeeGfs(
      input.driveCount,
      input.serverCount ?? 1,
      input.topology,
      input.beeGfsOptions,
      input.beeGfsDetails,
    )
    alerts.push(...beeGfsAlerts)
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
 * Validate configuration and throw error if blocking issues found.
 * Use this before running calculations to enforce validation rules.
 */
export function validateOrThrow(input: ValidationInput): void {
  const alerts = validateConfiguration(input)
  const blockingErrors = alerts.filter((a) => a.severity === 'error')

  if (blockingErrors.length > 0) {
    const errorMessages = blockingErrors.map((e) => e.message).join('\n')
    throw new Error(`Invalid configuration:\n${errorMessages}`)
  }
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
