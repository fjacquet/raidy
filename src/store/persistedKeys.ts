/**
 * Which configuration fields belong in a shared link, and which deliberately do not.
 *
 * These two lists must partition the store's configuration state — `tests/store/persistedKeys.spec.ts`
 * asserts it. That parity check exists because the same field set used to be written out by hand
 * in four places (`partialize`, `getDefaultState`, `ConfigStateSchema`, and the slices), which is
 * how `performanceThreshold` came to be absent from a shared link while every other setting
 * survived (#63).
 */
export const PERSISTED_KEYS = [
  // Hardware
  'driveId',
  'driveCount',
  'serverCount',
  'serverPowerWatts',
  // Topology
  'topology',
  'hotSpares',
  'zfsOptions',
  's2dOptions',
  'vsanOptions',
  'cephOptions',
  'longhornOptions',
  'beeGfsOptions',
  'powerFlexOptions',
  'controllerOptions',
  'netAppOptions',
  'synologyOptions',
  'nutanixOptions',
  'objectscaleOptions',
  'powerstoreOptions',
  'powerscaleOptions',
  'powervaultOptions',
  // Workload
  'readPercent',
  'blockSize',
  'randomPercent',
  'datasetSize',
  'dailyWriteVolume',
  // Advanced
  'compressionRatio',
  'dedupRatio',
  'networkSpeed',
  'pcieGen',
  'pcieLanes',
  'pue',
  'carbonRegion',
  'projectYears',
  'electricityCostPerKwh',
  'unitSystem',
  'performanceThreshold',
  // Filesystem
  'fsType',
  'supportsReflink',
  'backupRetention',
  'dailyChangeRate',
] as const

/**
 * Configuration state deliberately kept out of shared links.
 *
 * The drive filters narrow the picker for the current session; they describe how someone is
 * browsing the drive database, not the configuration the link is meant to reproduce.
 */
export const EPHEMERAL_KEYS = ['driveConnectivity', 'driveFormFactor'] as const

export type PersistedKey = (typeof PERSISTED_KEYS)[number]
