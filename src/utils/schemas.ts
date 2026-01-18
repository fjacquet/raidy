/**
 * Zod validation schemas for URL state deserialization.
 * Protects against malicious URL manipulation and invalid values.
 */

import { z } from 'zod'

/**
 * Standard RAID level enum
 */
const StandardRaidLevelSchema = z.enum([
  'RAID0',
  'RAID1',
  'RAID1E',
  'RAID1_3WAY',
  'RAID3',
  'RAID4',
  'RAID5',
  'RAID5E',
  'RAID5EE',
  'RAID6',
  'RAID10',
  'RAID50',
  'RAID60',
])

/**
 * Topology schema - discriminated union by type
 */
const TopologySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('standard'),
    level: StandardRaidLevelSchema,
  }),
  z.object({
    type: z.literal('zfs'),
    level: z.enum(['stripe', 'mirror', 'raidz1', 'raidz2', 'raidz3', 'draid1', 'draid2', 'draid3']),
  }),
  z.object({
    type: z.literal('s2d'),
    level: z.enum(['simple', 'mirror', 'parity', 'dual_parity', 'map']),
  }),
  z.object({
    type: z.literal('proprietary'),
    level: z.enum([
      'synology_shr',
      'synology_shr2',
      'synology_raid_f1',
      'netapp_raid_dp',
      'netapp_raid_tec',
    ]),
  }),
  z.object({
    type: z.literal('vsan_osa'),
    level: z.enum(['vsan_osa_raid1', 'vsan_osa_raid1_ftt2', 'vsan_osa_raid5', 'vsan_osa_raid6']),
  }),
  z.object({
    type: z.literal('vsan_esa'),
    level: z.enum(['vsan_esa_raid5', 'vsan_esa_raid6', 'vsan_esa_raid1']),
  }),
  z.object({
    type: z.literal('ceph'),
    level: z.enum([
      'ceph_replicated_2',
      'ceph_replicated_3',
      'ceph_ec_2_1',
      'ceph_ec_4_2',
      'ceph_ec_8_3',
      'ceph_ec_8_4',
    ]),
  }),
  z.object({
    type: z.literal('powerflex'),
    level: z.enum([
      'powerflex_medium_2way',
      'powerflex_medium_3way',
      'powerflex_fine_2way',
      'powerflex_ec_4_1',
      'powerflex_ec_4_2',
      'powerflex_ec_8_2',
      'powerflex_ec_12_4',
    ]),
  }),
  z.object({
    type: z.literal('powerstore'),
    level: z.enum(['powerstore_raid5', 'powerstore_raid6', 'powerstore_raid10']),
  }),
  z.object({
    type: z.literal('powerscale'),
    level: z.enum([
      'powerscale_n1',
      'powerscale_n2',
      'powerscale_n2_1',
      'powerscale_n3',
      'powerscale_n4',
      'powerscale_mirror_2x',
      'powerscale_mirror_3x',
    ]),
  }),
  z.object({
    type: z.literal('objectscale'),
    level: z.enum([
      'objectscale_ec_12_4',
      'objectscale_ec_10_2',
      'objectscale_ec_24_4',
      'objectscale_mirror_3',
    ]),
  }),
  z.object({
    type: z.literal('nutanix'),
    level: z.enum(['nutanix_rf2', 'nutanix_rf3', 'nutanix_ec_rf2', 'nutanix_ec_rf3']),
  }),
  z.object({
    type: z.literal('powervault'),
    level: z.enum([
      'powervault_raid1',
      'powervault_raid5',
      'powervault_raid6',
      'powervault_raid10',
      'powervault_adapt',
    ]),
  }),
])

/**
 * ZFS options schema
 */
const ZfsOptionsSchema = z.object({
  ashift: z.union([z.literal(9), z.literal(12), z.literal(13)]),
  compression: z.boolean(),
  compressionType: z.enum(['lz4', 'zstd', 'gzip', 'off']),
  dedup: z.boolean(),
  recordsize: z.number().int().positive().finite(),
  specialVdev: z.boolean(),
  slogDevice: z.boolean(),
  l2arcDevice: z.boolean(),
  maxOccupation: z.number().int().min(1).max(100).finite(),
})

/**
 * S2D options schema
 */
const S2DOptionsSchema = z.object({
  faultDomains: z.number().int().min(1).max(100).finite(),
  mirrorCopies: z.union([z.literal(2), z.literal(3)]),
  rebuildReserve: z.boolean(),
  reserveStrategy: z.enum(['drive_failure', 'node_failure']),
  storageTiers: z.boolean(),
})

/**
 * Controller options schema
 */
const ControllerOptionsSchema = z.object({
  controller: z.string(),
  stripeSize: z.union([
    z.literal(64),
    z.literal(128),
    z.literal(256),
    z.literal(512),
    z.literal(1024),
  ]),
  readPolicy: z.enum(['read-ahead', 'no-read-ahead', 'adaptive']),
  writePolicy: z.enum(['write-back', 'write-through', 'write-back-with-bbu']),
  cacheSize: z.number().int().positive().finite().optional(),
})

/**
 * NetApp options schema
 */
const NetAppOptionsSchema = z.object({
  platform: z.enum(['aff_a', 'aff_c', 'fas', 'asa', 'e_series']),
  raidType: z.enum(['raid_dp', 'raid_tec']),
  adpVersion: z.enum(['none', 'adpv1', 'adpv2']),
  snapshotReserve: z.number().min(0).max(100).finite(),
  dataReductionRatio: z.number().min(1).max(20).finite(),
  waflOverhead: z.number().min(0).max(1).finite(),
  compression: z.boolean(),
  dedup: z.boolean(),
  zeroDetection: z.boolean(),
})

/**
 * Synology options schema
 */
const SynologyOptionsSchema = z.object({
  filesystem: z.enum(['btrfs', 'ext4']),
  btrfsOverhead: z.number().min(0).max(1).finite(),
  systemPartitionSize: z.number().int().positive().finite(),
  modelSeries: z.enum(['j', 'value', 'plus', 'xs']),
  ssdCache: z.boolean(),
  cacheMode: z.enum(['read_only', 'read_write']),
})

/**
 * Nutanix options schema
 */
const NutanixOptionsSchema = z.object({
  clusterType: z.enum(['all-flash', 'hybrid']),
  replicationFactor: z.union([z.literal(2), z.literal(3)]),
  erasureCoding: z.boolean(),
  ecStripe: z.enum(['4_1', '6_2']),
  compression: z.boolean(),
  compressionRatio: z.number().min(1).max(10).finite(),
  dedup: z.boolean(),
  dedupRatio: z.number().min(1).max(10).finite(),
  systemOverhead: z.number().min(0).max(1).finite(),
  networkType: z.enum(['10gbe', '25gbe', 'rdma']),
})

/**
 * ObjectScale options schema
 */
const ObjectScaleOptionsSchema = z.object({
  objectSizeKB: z.number().int().positive().finite(),
  systemOverheadPercent: z.number().min(0).max(100).finite(),
  networkEfficiencyFactor: z.number().min(0).max(1).finite(),
  sites: z.number().int().min(1).max(8).finite(),
  fillRatePercent: z.number().min(0).max(100).finite(),
  compression: z.boolean(),
  compressionRatio: z.number().min(1).max(10).finite(),
})

/**
 * PowerStore options schema
 */
const PowerStoreOptionsSchema = z.object({
  compression: z.boolean(),
  compressionRatio: z.number().min(1).max(10).finite(),
  dedup: z.boolean(),
  dedupRatio: z.number().min(1).max(10).finite(),
  snapshotReservePercent: z.number().min(0).max(100).finite(),
})

/**
 * PowerScale options schema
 */
const PowerScaleOptionsSchema = z.object({
  compression: z.boolean(),
  compressionRatio: z.number().min(1).max(10).finite(),
  dedup: z.boolean(),
  dedupRatio: z.number().min(1).max(10).finite(),
  snapshotReservePercent: z.number().min(0).max(100).finite(),
  smartQuotas: z.boolean(),
  syncIQ: z.boolean(),
})

/**
 * PowerVault options schema
 */
const PowerVaultOptionsSchema = z.object({
  model: z.enum(['ME5212', 'ME5224', 'ME5284']),
  controllers: z.union([z.literal(1), z.literal(2)]),
  tiering: z.boolean(),
  ssdReadCache: z.boolean(),
  thinProvisioning: z.boolean(),
})

/**
 * Complete ConfigState schema matching Zustand store
 * Based on partialize function in configStore.ts
 *
 * Fields are optional to support Zustand's persist middleware,
 * which fills in defaults for missing fields from getDefaultState().
 * However, when fields ARE present, they must pass validation.
 */
export const ConfigStateSchema = z
  .object({
    // Hardware
    driveId: z.string().min(1).optional(),
    driveCount: z.number().int().min(1).max(1000).finite().optional(),
    serverCount: z.number().int().min(1).max(100).finite().optional(),
    serverPowerWatts: z.number().int().positive().finite().optional(),

    // Topology
    topology: TopologySchema.optional(),
    hotSpares: z.number().int().min(0).max(100).finite().optional(),
    zfsOptions: ZfsOptionsSchema.optional(),
    s2dOptions: S2DOptionsSchema.optional(),
    controllerOptions: ControllerOptionsSchema.optional(),
    netAppOptions: NetAppOptionsSchema.optional(),
    synologyOptions: SynologyOptionsSchema.optional(),
    nutanixOptions: NutanixOptionsSchema.optional(),
    objectscaleOptions: ObjectScaleOptionsSchema.optional(),
    powerstoreOptions: PowerStoreOptionsSchema.optional(),
    powerscaleOptions: PowerScaleOptionsSchema.optional(),
    powervaultOptions: PowerVaultOptionsSchema.optional(),

    // Workload
    readPercent: z.number().min(0).max(100).finite().optional(),
    blockSize: z.string().optional(),
    randomPercent: z.number().min(0).max(100).finite().optional(),
    datasetSize: z.number().positive().finite().optional(),
    dailyWriteVolume: z.number().nonnegative().finite().optional(),

    // Advanced
    compressionRatio: z.number().min(1).max(10).finite().optional(),
    dedupRatio: z.number().min(1).max(10).finite().optional(),
    networkSpeed: z.string().optional(),
    pcieGen: z.string().optional(),
    pcieLanes: z.string().optional(),
    pue: z.number().min(1).max(3).finite().optional(),
    carbonRegion: z.string().optional(),
    projectYears: z.number().int().min(1).max(20).finite().optional(),
    electricityCostPerKwh: z.number().positive().finite().optional(),
    fsType: z.string().optional(),
    supportsReflink: z.boolean().optional(),
    backupRetention: z.number().int().positive().finite().optional(),
    dailyChangeRate: z.number().min(0).max(100).finite().optional(),
    unitSystem: z.enum(['binary', 'decimal']).optional(),
  })
  .passthrough() // Allow extra fields for forward compatibility

export type ConfigState = z.infer<typeof ConfigStateSchema>

/**
 * Validate URL state against schema.
 * Returns validated data on success, null on validation failure.
 *
 * @param data - Unknown data from URL deserialization
 * @returns Validated ConfigState or null if invalid
 */
export function validateUrlState(data: unknown): ConfigState | null {
  const result = ConfigStateSchema.safeParse(data)

  if (result.success) {
    return result.data
  } else {
    // Log detailed validation errors for debugging
    console.error('Invalid URL state:', result.error.format())
    return null
  }
}
