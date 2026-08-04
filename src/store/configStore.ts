/**
 * Main configuration store with URL persistence.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  type AdvancedSlice,
  createAdvancedSlice,
  createHardwareSlice,
  createTopologySlice,
  createWorkloadSlice,
  type HardwareSlice,
  type TopologySlice,
  type WorkloadSlice,
} from './slices'
import { urlHashStorage } from './urlStorage'

/**
 * Drop top-level keys whose value is structurally identical to the default,
 * before compressing for the URL hash. Shared links are dominated by the ~15
 * platform-specific `*Options` objects; most links only touch one platform, so
 * the other 14 default-valued objects would otherwise be serialized verbatim
 * on every share. Omitting them is safe: a key missing entirely from the
 * persisted payload already falls back to the store's own default value via
 * Zustand's persist `merge` (`{ ...currentState, ...persistedState }`), so
 * this is purely a size optimization — it cannot change what a round-trip
 * produces. See docs/ARCHITECTURE.md and task-9-report.md for the measured
 * URL-length impact.
 */
function omitDefaults<T extends Record<string, unknown>>(
  state: T,
  defaults: { [K in keyof T]?: unknown },
): Partial<T> {
  const result: Partial<T> = {}
  for (const key of Object.keys(state) as (keyof T)[]) {
    if (JSON.stringify(state[key]) !== JSON.stringify(defaults[key])) {
      result[key] = state[key]
    }
  }
  return result
}

// Combined store type
export type ConfigStore = HardwareSlice &
  TopologySlice &
  WorkloadSlice &
  AdvancedSlice & {
    resetToDefaults: () => void
  }

// Default state for reset
const getDefaultState = () => ({
  // Hardware defaults
  driveId: 'ent-hdd-7k2-sata-24tb-cmr',
  driveCount: 12,
  serverCount: 1,
  serverPowerWatts: 400,

  // Topology defaults
  topology: { type: 'standard' as const, level: 'RAID6' as const },
  hotSpares: 1,
  zfsOptions: {
    ashift: 12 as const,
    compression: true,
    compressionType: 'lz4' as const,
    dedup: false,
    recordsize: 131072,
    specialVdev: false,
    slogDevice: false,
    l2arcDevice: false,
    maxOccupation: 80,
  },
  s2dOptions: {
    faultDomains: 4,
    mirrorCopies: 2 as const,
    rebuildReserve: true,
    reserveStrategy: 'node_failure' as const,
    storageTiers: false,
  },
  vsanOptions: {
    diskGroupMode: 'all-flash' as const,
    compression: true,
    compressionRatio: 1.5,
    dedup: false,
    dedupRatio: 1.0,
    encryption: false,
  },
  cephOptions: {
    backend: 'bluestore' as const,
    poolType: 'replicated' as const,
    replicationFactor: 3 as const,
    ecK: 4,
    ecM: 2,
    compression: false,
    compressionAlgorithm: 'none' as const,
    encryption: false,
    journalOnSsd: true,
    walDbOffload: false,
    walDbRatio: 4,
    safeCapacityThreshold: 0.85,
  },
  longhornOptions: {
    diskMode: 'dedicated' as const,
    minimalAvailablePercent: 10,
    snapshotHeadroom: 1.2,
    growthHeadroom: 1.2,
    overProvisioningPercent: 200,
  },
  beeGfsOptions: {
    drivesPerTarget: 12,
    storageBuddyMirror: false,
    metadataBuddyMirror: true,
    chunkSizeKb: 512 as const,
    numTargets: 4,
    network: '100gbe' as const,
    fsOverheadPercent: 2,
    metadataTargets: false,
  },
  powerFlexOptions: {
    granularity: 'medium' as const,
    protectionMode: 'mirror' as const,
    mirrorCopies: 2 as const,
    ecScheme: '8_2' as const,
    compression: true,
    compressionRatio: 2.0,
    storagePools: 1,
    faultSets: 1,
    fgOverhead: 0.12,
  },
  controllerOptions: {
    controller: 'software' as const,
    stripeSize: 256 as const,
    readPolicy: 'adaptive' as const,
    writePolicy: 'write-back' as const,
  },
  netAppOptions: {
    platform: 'aff_a' as const,
    raidType: 'raid_dp' as const,
    adpVersion: 'adpv2' as const,
    snapshotReserve: 5,
    dataReductionRatio: 3.0,
    waflOverhead: 0.015,
    compression: true,
    dedup: true,
    zeroDetection: true,
  },
  synologyOptions: {
    filesystem: 'btrfs' as const,
    btrfsOverhead: 0.04,
    systemPartitionSize: 25 * 1024 * 1024 * 1024, // 25GB
    modelSeries: 'plus' as const,
    ssdCache: false,
    cacheMode: 'read_only' as const,
  },
  nutanixOptions: {
    clusterType: 'all-flash' as const,
    replicationFactor: 2 as const,
    erasureCoding: false,
    ecStripe: '4_1' as const,
    compression: true,
    compressionRatio: 1.5,
    dedup: false,
    dedupRatio: 1.0,
    systemOverhead: 0.1,
    networkType: '25gbe' as const,
  },
  objectscaleOptions: {
    objectSizeKB: 1024,
    systemOverheadPercent: 15,
    networkEfficiencyFactor: 0.55,
    sites: 1,
    fillRatePercent: 80,
    compression: false,
    compressionRatio: 1.0,
  },
  powerstoreOptions: {
    model: 'powerstore_5200q' as const,
    compression: true,
    compressionRatio: 1.5,
    dedup: false,
    dedupRatio: 1.0,
    snapshotReservePercent: 20,
    systemOverheadPercent: 5,
  },
  powerscaleOptions: {
    compression: true,
    compressionRatio: 1.5,
    dedup: false,
    dedupRatio: 1.0,
    snapshotReservePercent: 20,
    smartQuotas: false,
    syncIQ: false,
  },
  powervaultOptions: {
    model: 'ME5224' as const,
    controllers: 2 as const,
    tiering: false,
    ssdReadCache: false,
    thinProvisioning: true,
  },

  // Workload defaults
  readPercent: 70,
  blockSize: '64K' as const,
  randomPercent: 50,
  datasetSize: 100 * 1024 * 1024 * 1024 * 1024,
  dailyWriteVolume: 1024 * 1024 * 1024 * 1024,

  // Advanced defaults
  compressionRatio: 1.5,
  dedupRatio: 1.0,
  networkSpeed: '25GbE' as const,
  pcieGen: 'gen4' as const,
  pcieLanes: 'x8' as const,
  pue: 1.4,
  carbonRegion: 'switzerland' as const,
  projectYears: 5,
  electricityCostPerKwh: 0.12,
  unitSystem: 'binary' as const,

  // Filesystem defaults
  fsType: 'zfs' as const,
  supportsReflink: true,
  backupRetention: 14,
  dailyChangeRate: 5,
})

export const useConfigStore = create<ConfigStore>()(
  persist(
    (...args) => ({
      ...createHardwareSlice(...args),
      ...createTopologySlice(...args),
      ...createWorkloadSlice(...args),
      ...createAdvancedSlice(...args),
      resetToDefaults: () => args[0](getDefaultState()),
    }),
    {
      name: 'raidy',
      storage: createJSONStorage(() => urlHashStorage),
      version: 1,
      partialize: (state) =>
        omitDefaults(
          {
            // Only persist configuration values, not actions
            driveId: state.driveId,
            driveCount: state.driveCount,
            serverCount: state.serverCount,
            serverPowerWatts: state.serverPowerWatts,
            topology: state.topology,
            hotSpares: state.hotSpares,
            zfsOptions: state.zfsOptions,
            s2dOptions: state.s2dOptions,
            vsanOptions: state.vsanOptions,
            cephOptions: state.cephOptions,
            longhornOptions: state.longhornOptions,
            beeGfsOptions: state.beeGfsOptions,
            powerFlexOptions: state.powerFlexOptions,
            controllerOptions: state.controllerOptions,
            netAppOptions: state.netAppOptions,
            synologyOptions: state.synologyOptions,
            nutanixOptions: state.nutanixOptions,
            objectscaleOptions: state.objectscaleOptions,
            powerstoreOptions: state.powerstoreOptions,
            powerscaleOptions: state.powerscaleOptions,
            powervaultOptions: state.powervaultOptions,
            readPercent: state.readPercent,
            blockSize: state.blockSize,
            randomPercent: state.randomPercent,
            datasetSize: state.datasetSize,
            dailyWriteVolume: state.dailyWriteVolume,
            compressionRatio: state.compressionRatio,
            dedupRatio: state.dedupRatio,
            networkSpeed: state.networkSpeed,
            pcieGen: state.pcieGen,
            pcieLanes: state.pcieLanes,
            pue: state.pue,
            carbonRegion: state.carbonRegion,
            projectYears: state.projectYears,
            electricityCostPerKwh: state.electricityCostPerKwh,
            fsType: state.fsType,
            supportsReflink: state.supportsReflink,
            backupRetention: state.backupRetention,
            dailyChangeRate: state.dailyChangeRate,
            unitSystem: state.unitSystem,
          },
          getDefaultState(),
        ),
    },
  ),
)
