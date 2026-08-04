/**
 * URL Storage Tests
 *
 * Validates URL state serialization for shareable links.
 * Reference: Plan 02-05 TEST-14 - URL roundtrip must preserve all configuration values.
 * Reference: Plan 03-01 - Security hardening against malicious URL manipulation.
 */

import { compressToEncodedURIComponent } from 'lz-string'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyShareableUrl, getShareableUrl, urlHashStorage } from '@/store/urlStorage'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_LONGHORN_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
} from '@/types'

/**
 * Narrows the sync-or-async union returned by the Zustand StateStorage API.
 * These tests use the synchronous URL-hash implementation, so getItem always
 * returns a string here; this runtime guard makes that explicit for the type
 * checker without an unsafe cast.
 */
function expectSyncString(v: string | Promise<string | null>): string {
  if (typeof v !== 'string') throw new Error('expected a synchronous string from storage')
  return v
}

/** The shape zustand's `createJSONStorage` actually writes. */
function envelope(state: unknown): string {
  return JSON.stringify({ state, version: 1 })
}

// Mock window object
const mockLocation = {
  hash: '',
  pathname: '/simulator',
  search: '',
  href: 'http://localhost:3000/simulator',
}

const mockHistory = {
  replaceState: vi.fn(),
}

const mockNavigator = {
  clipboard: {
    writeText: vi.fn(),
  },
}

// Setup window mock before each test
beforeEach(() => {
  vi.stubGlobal('window', {
    location: mockLocation,
    history: mockHistory,
    navigator: mockNavigator,
  })
  mockLocation.hash = ''
  mockLocation.href = 'http://localhost:3000/simulator'
  mockHistory.replaceState.mockClear()
  mockNavigator.clipboard.writeText.mockClear()
})

describe('URL Storage - Serialization Roundtrip', () => {
  it('should roundtrip simple state correctly', () => {
    const stateKey = 'storage-state'
    const originalState = {
      driveCount: 8,
    }

    // Serialize: setItem
    urlHashStorage.setItem(stateKey, envelope(originalState))

    // Extract from mocked replaceState call
    expect(mockHistory.replaceState).toHaveBeenCalled()
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    const hashPart = newUrl.split('#')[1]
    mockLocation.hash = `#${hashPart}`

    // Deserialize: getItem
    const retrievedState = urlHashStorage.getItem(stateKey)

    // Verify roundtrip
    expect(retrievedState).toBe(envelope(originalState))
    expect(retrievedState).not.toBeNull()
    if (retrievedState) {
      expect(JSON.parse(expectSyncString(retrievedState)).state).toEqual(originalState)
    }
  })

  it('should roundtrip standard RAID configuration', () => {
    const stateKey = 'storage-state'
    const raidConfig = {
      topology: { type: 'standard', level: 'RAID5' },
      driveCount: 8,
      hotSpares: 1,
      serverCount: 1,
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(raidConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(raidConfig)
      expect(parsed.topology.level).toBe('RAID5')
      expect(parsed.driveCount).toBe(8)
      expect(parsed.hotSpares).toBe(1)
    }
  })

  it('should roundtrip ZFS configuration with options', () => {
    const stateKey = 'storage-state'
    const zfsConfig = {
      topology: { type: 'zfs', level: 'raidz2' },
      driveCount: 6,
      zfsOptions: {
        ashift: 12,
        compression: true,
        compressionType: 'lz4' as const,
        dedup: false,
        recordsize: 128,
        specialVdev: false,
        maxOccupation: 80,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(zfsConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all ZFS options preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(zfsConfig)
      expect(parsed.zfsOptions.compression).toBe(true)
      expect(parsed.zfsOptions.compressionType).toBe('lz4')
      expect(parsed.zfsOptions.ashift).toBe(12)
      expect(parsed.zfsOptions.maxOccupation).toBe(80)
    }
  })

  it('should roundtrip vSAN ESA configuration', () => {
    const stateKey = 'storage-state'
    // vsanOptions shape must match VsanOptions (src/types/topology.ts) now that
    // Task 9 added a real Zod schema for it — the field is validated, not just
    // passed through, so a fake ad-hoc shape (ftt/ftm/...) is correctly rejected.
    const vsanConfig = {
      topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' },
      driveCount: 8,
      serverCount: 8, // affects adaptive efficiency
      vsanOptions: {
        diskGroupMode: 'all-flash',
        compression: true,
        compressionRatio: 1.5,
        dedup: true,
        dedupRatio: 1.2,
        encryption: false,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(vsanConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify vSAN options preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(vsanConfig)
      expect(parsed.serverCount).toBe(8)
      expect(parsed.vsanOptions.dedup).toBe(true)
      expect(parsed.vsanOptions.dedupRatio).toBe(1.2)
    }
  })

  it('should roundtrip complete configuration with all fields', () => {
    const stateKey = 'storage-state'
    const completeConfig = {
      // Hardware
      driveCount: 12,
      serverCount: 4,
      hotSpares: 2,
      // Topology
      topology: { type: 's2d', level: 'mirror' },
      // Workload
      blockSize: '64K',
      // Advanced settings
      networkSpeed: '25GbE',
      compressionRatio: 1.5,
      dedupRatio: 1.2,
      // S2D options
      s2dOptions: {
        faultDomains: 4,
        mirrorCopies: 3 as const,
        rebuildReserve: true,
        reserveStrategy: 'node_failure' as const,
        storageTiers: true,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(completeConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(completeConfig)
      expect(parsed.driveCount).toBe(12)
      expect(parsed.hotSpares).toBe(2)
      expect(parsed.blockSize).toBe('64K')
      expect(parsed.networkSpeed).toBe('25GbE')
      expect(parsed.compressionRatio).toBe(1.5)
      expect(parsed.s2dOptions.faultDomains).toBe(4)
    }
  })

  it('should roundtrip empty/minimal configuration', () => {
    const stateKey = 'storage-state'
    const minimalConfig = {}

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(minimalConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify empty object preserved
    expect(retrieved).toBe(envelope(minimalConfig))
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      expect(JSON.parse(expectSyncString(retrieved)).state).toEqual({})
    }
  })

  it('should compress URL for complex configuration', () => {
    const stateKey = 'storage-state'
    // A configuration this large only happens through repeated string keys and structurally
    // similar nested objects, not through free-text fields (the schema has none) — the
    // platform-options objects are what make a real configuration big. This test calls
    // urlHashStorage directly, bypassing the store's `partialize`, which is what strips
    // default-equal values from a real shared link; every option below is therefore adjusted
    // away from its `DEFAULT_*_OPTIONS` value on at least one field, so the fixture stays large
    // even if a future test migrates it through `partialize` instead.
    const largeConfig = {
      driveCount: 24,
      topology: { type: 'ceph', level: 'ceph_ec_4_2' },
      zfsOptions: { ...DEFAULT_ZFS_OPTIONS, ashift: 9, recordsize: 4096 },
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, faultDomains: 8, storageTiers: true },
      vsanOptions: { ...DEFAULT_VSAN_OPTIONS, dedup: true, dedupRatio: 1.3 },
      // cephOptions shape must match CephOptions (src/types/topology.ts) now that
      // Task 9 added a real Zod schema for it.
      cephOptions: {
        ...DEFAULT_CEPH_OPTIONS,
        poolType: 'erasure',
        replicationFactor: 3,
        compression: true,
        compressionAlgorithm: 'zstd',
      },
      longhornOptions: { ...DEFAULT_LONGHORN_OPTIONS, diskMode: 'root', growthHeadroom: 1.8 },
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 10, numTargets: 8 },
      nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS, clusterType: 'hybrid' },
      powerFlexOptions: { ...DEFAULT_POWERFLEX_OPTIONS, granularity: 'fine', compressionRatio: 3 },
      netAppOptions: { ...DEFAULT_NETAPP_OPTIONS, raidType: 'raid_tec', dataReductionRatio: 3.5 },
    }
    const largeConfigStr = JSON.stringify(largeConfig)

    // Get compressed version
    const compressed = compressToEncodedURIComponent(largeConfigStr)

    // A real configuration this size is dominated by repeated key names and structurally
    // similar option objects, which LZ-String's dictionary compression exploits well.
    expect(compressed.length).toBeLessThan(largeConfigStr.length)

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(largeConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(largeConfig)
    }
  })

  it('should snapshot URL format for regression prevention', () => {
    const stateKey = 'storage-state'
    const config = {
      topology: { type: 'standard', level: 'RAID6' },
      driveCount: 6,
    }

    urlHashStorage.setItem(stateKey, envelope(config))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]

    // Snapshot the URL format
    expect(newUrl).toMatchSnapshot()
  })

  it('should handle maximum complexity configuration', () => {
    const stateKey = 'storage-state'
    const maxConfig = {
      driveCount: 60,
      serverCount: 16,
      hotSpares: 4,
      topology: { type: 'proprietary', level: 'netapp_raid_tec' },
      networkSpeed: '100GbE',
      compressionRatio: 2.5,
      dedupRatio: 3.0,
      netAppOptions: {
        platform: 'aff_a' as const,
        raidType: 'raid_tec' as const,
        adpVersion: 'adpv2' as const,
        snapshotReserve: 0.2, // FRACTION (=20%), see NetAppOptions.snapshotReserve
        dataReductionRatio: 3.5,
        waflOverhead: 0.1,
        compression: true,
        dedup: true,
        zeroDetection: true,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, envelope(maxConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed).toMatchObject(maxConfig)
      expect(parsed.driveCount).toBe(60)
      expect(parsed.netAppOptions.raidType).toBe('raid_tec')
    }
  })

  it('preserves special characters in driveId through an enveloped round trip', () => {
    // driveId is z.string().min(1) — a free-text drive-database key, not a closed union
    // (see the design spec's Decision 1) — so it can carry characters an LZ-String +
    // URI-encoded hash must survive byte-identical: @ | / ( ).
    const stateKey = 'storage-state'
    const config = {
      driveId: 'custom-drive @ DC-01 (2024) | rack-42/node-3',
      driveCount: 8,
    }

    urlHashStorage.setItem(stateKey, envelope(config))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(expectSyncString(retrieved)).state
      expect(parsed.driveId).toBe(config.driveId)
    }
  })
})

describe('URL Storage - Platform Options Persistence (Task 9)', () => {
  function baseConfig() {
    return {
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 12,
      topology: { type: 'standard', level: 'RAID6' },
    }
  }

  const platformCases: Array<{ name: string; key: string; value: Record<string, unknown> }> = [
    {
      name: 'ZFS',
      key: 'zfsOptions',
      value: {
        ashift: 9,
        compression: false,
        compressionType: 'zstd',
        dedup: true,
        recordsize: 4096,
        specialVdev: true,
        maxOccupation: 60,
      },
    },
    {
      name: 'S2D (with tieringConfig)',
      key: 's2dOptions',
      value: {
        faultDomains: 8,
        mirrorCopies: 3,
        rebuildReserve: false,
        reserveStrategy: 'drive_failure',
        storageTiers: true,
        tieringConfig: {
          enabled: true,
          fastTier: { driveId: 'nvme-x', driveCount: 2 },
          capacityTier: { driveId: 'hdd-y', driveCount: 10 },
          cacheMode: 'write-through',
          workingSetPercent: 30,
        },
      },
    },
    {
      name: 'vSAN',
      key: 'vsanOptions',
      value: {
        diskGroupMode: 'hybrid',
        compression: false,
        compressionRatio: 2.0,
        dedup: true,
        dedupRatio: 1.3,
        encryption: true,
        tiering: {
          enabled: true,
          fastTier: { driveId: 'ssd', driveCount: 2 },
          capacityTier: { driveId: 'hdd', driveCount: 8 },
          cacheMode: 'read-only',
          workingSetPercent: 15,
        },
      },
    },
    {
      name: 'Ceph',
      key: 'cephOptions',
      value: {
        backend: 'filestore',
        poolType: 'erasure',
        replicationFactor: 4,
        ecK: 8,
        ecM: 3,
        compression: true,
        compressionAlgorithm: 'zstd',
        encryption: true,
        journalOnSsd: false,
        walDbOffload: true,
        safeCapacityThreshold: 0.9,
        tiering: {
          enabled: true,
          fastTier: { driveId: 'nvme', driveCount: 2 },
          capacityTier: { driveId: 'hdd', driveCount: 12 },
          cacheMode: 'write-back',
          workingSetPercent: 25,
        },
      },
    },
    {
      name: 'Longhorn',
      key: 'longhornOptions',
      value: {
        diskMode: 'root',
        minimalAvailablePercent: 25,
        snapshotHeadroom: 1.5,
        growthHeadroom: 1.8,
        overProvisioningPercent: 300,
      },
    },
    {
      name: 'BeeGFS',
      key: 'beeGfsOptions',
      value: {
        drivesPerTarget: 10,
        storageBuddyMirror: true,
        metadataBuddyMirror: false,
        chunkSizeKb: 1024,
        numTargets: 8,
        network: 'ib-ndr',
        fsOverheadPercent: 3,
        metadataTargets: true,
        tiering: {
          enabled: true,
          fastTier: { driveId: 'mdt', driveCount: 2 },
          capacityTier: { driveId: 'ost', driveCount: 40 },
          cacheMode: 'write-back',
          workingSetPercent: 10,
        },
      },
    },
    {
      name: 'PowerFlex',
      key: 'powerFlexOptions',
      value: {
        granularity: 'fine',
        protectionMode: 'erasure',
        mirrorCopies: 2,
        compression: false,
        compressionRatio: 4.0,
        fgOverhead: 0.15,
      },
    },
    {
      name: 'Nutanix (with tiering)',
      key: 'nutanixOptions',
      value: {
        clusterType: 'hybrid',
        compression: false,
        compressionRatio: 1.2,
        dedup: true,
        dedupRatio: 1.4,
        systemOverhead: 0.08,
        networkType: 'rdma',
        tiering: {
          enabled: true,
          fastTier: { driveId: 'nvme', driveCount: 4 },
          capacityTier: { driveId: 'hdd', driveCount: 20 },
          cacheMode: 'write-back',
          workingSetPercent: 20,
        },
      },
    },
    {
      name: 'PowerStore',
      key: 'powerstoreOptions',
      value: {
        model: 'powerstore_3200',
        compression: false,
        compressionRatio: 3.0,
        dedup: true,
        dedupRatio: 2.5,
        snapshotReservePercent: 30,
        systemOverheadPercent: 8,
      },
    },
  ]

  it.each(platformCases)('round-trips $name options through the URL hash', ({ key, value }) => {
    const stateKey = 'storage-state'
    const config = { ...baseConfig(), [key]: value }

    urlHashStorage.setItem(stateKey, envelope(config))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    expect(retrieved).not.toBeNull()
    const parsed = JSON.parse(expectSyncString(retrieved as string)).state
    expect(parsed[key]).toEqual(value)
  })

  it('rejects a flat (non-enveloped) link, which no released version has ever written', () => {
    const stateKey = 'storage-state'
    const flatConfig = {
      ...baseConfig(),
      topology: { type: 'ceph', level: 'ceph_ec_4_2' },
    }

    urlHashStorage.setItem(stateKey, JSON.stringify(flatConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // `createJSONStorage` has wrapped state in `{ state, version }` since the initial commit, so
    // a flat payload can only come from a hand-crafted link, and is now rejected outright rather
    // than hydrated with the new platform-option fields silently missing.
    expect(retrieved).toBeNull()
  })

  describe('malformed platform options are rejected, not adopted', () => {
    it('rejects a wrong-typed field inside a new options object', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const config = {
        ...baseConfig(),
        cephOptions: {
          backend: 'bluestore',
          poolType: 'replicated',
          replicationFactor: 3,
          ecK: 4,
          ecM: 2,
          compression: false,
          compressionAlgorithm: 'none',
          encryption: false,
          journalOnSsd: true,
          walDbOffload: 'yes', // wrong type: should be boolean
          safeCapacityThreshold: 0.85,
        },
      }

      urlHashStorage.setItem('storage-state', envelope(config))
      const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
      mockLocation.hash = `#${newUrl.split('#')[1]}`
      const result = urlHashStorage.getItem('storage-state')

      expect(result).toBeNull()
      consoleErrorSpy.mockRestore()
    })

    it('strips an unknown extra field inside a new options object rather than rejecting it', () => {
      const config = {
        ...baseConfig(),
        beeGfsOptions: {
          drivesPerTarget: 12,
          storageBuddyMirror: false,
          metadataBuddyMirror: true,
          chunkSizeKb: 512,
          numTargets: 4,
          network: '100gbe',
          fsOverheadPercent: 2,
          metadataTargets: false,
          maliciousInjectedField: '<script>alert(1)</script>',
        },
      }

      urlHashStorage.setItem('storage-state', envelope(config))
      const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
      mockLocation.hash = `#${newUrl.split('#')[1]}`
      const result = urlHashStorage.getItem('storage-state')

      expect(result).not.toBeNull()
      const parsed = JSON.parse(expectSyncString(result as string)).state
      expect(parsed.beeGfsOptions.maliciousInjectedField).toBeUndefined()
      expect(parsed.beeGfsOptions.drivesPerTarget).toBe(12)
    })

    it('rejects an out-of-range number inside a new options object', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const config = {
        ...baseConfig(),
        cephOptions: {
          backend: 'bluestore',
          poolType: 'replicated',
          replicationFactor: 3,
          ecK: 4,
          ecM: 2,
          compression: false,
          compressionAlgorithm: 'none',
          encryption: false,
          journalOnSsd: true,
          walDbOffload: false,
          safeCapacityThreshold: 5, // out of range: schema bounds this to [0, 1]
        },
      }

      urlHashStorage.setItem('storage-state', envelope(config))
      const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
      mockLocation.hash = `#${newUrl.split('#')[1]}`
      const result = urlHashStorage.getItem('storage-state')

      expect(result).toBeNull()
      consoleErrorSpy.mockRestore()
    })
  })

  it('measures the compressed URL length for a pathological all-15-platforms-customized config', () => {
    const maximalConfig = {
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 60,
      serverCount: 16,
      serverPowerWatts: 650,
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      hotSpares: 4,
      ...Object.fromEntries(platformCases.map(({ key, value }) => [key, value])),
      controllerOptions: {
        controller: 'perc_h965i',
        stripeSize: 256,
        readPolicy: 'adaptive',
        writePolicy: 'write-back',
        cacheSize: 8192,
      },
      objectscaleOptions: {
        systemOverheadPercent: 15,
        sites: 3,
        compression: true,
        compressionRatio: 2.0,
      },
      powerscaleOptions: {
        compression: true,
        compressionRatio: 1.8,
        dedup: true,
        dedupRatio: 1.5,
        snapshotReservePercent: 25,
        smartQuotas: true,
        syncIQ: true,
      },
      powervaultOptions: {
        model: 'ME5284',
        controllers: 2,
        tiering: true,
        ssdReadCache: true,
        thinProvisioning: true,
      },
      synologyOptions: {
        filesystem: 'btrfs',
        systemPartitionSize: 25 * 1024 * 1024 * 1024,
        modelSeries: 'xs',
        ssdCache: true,
        cacheMode: 'read_write',
      },
      netAppOptions: {
        platform: 'aff_a',
        raidType: 'raid_tec',
        adpVersion: 'adpv2',
        snapshotReserve: 0.1, // FRACTION (=10%)
        dataReductionRatio: 3.5,
        waflOverhead: 0.015,
        compression: true,
        dedup: true,
        zeroDetection: true,
      },
      readPercent: 70,
      blockSize: '64K',
      randomPercent: 50,
      datasetSize: 500 * 1024 * 1024 * 1024 * 1024,
      dailyWriteVolume: 5 * 1024 * 1024 * 1024 * 1024,
      compressionRatio: 1.5,
      dedupRatio: 1.0,
      networkSpeed: '100GbE',
      pcieGen: 'gen5',
      pcieLanes: 'x16',
      pue: 1.3,
      carbonRegion: 'switzerland',
      projectYears: 5,
      electricityCostPerKwh: 0.12,
      fsType: 'zfs',
      supportsReflink: true,
      backupRetention: 30,
      dailyChangeRate: 5,
      unitSystem: 'binary',
    }

    const serialized = JSON.stringify(maximalConfig)
    const compressed = compressToEncodedURIComponent(serialized)

    // This scenario (every one of the ~15 platform options objects customized
    // away from its default simultaneously) never happens in the real app —
    // the UI only lets a user edit the *currently selected* topology's options
    // object, so at most one of these ~15 objects is ever non-default at a
    // time. It is measured here as a pathological upper bound, not a realistic
    // budget target; see the realistic single-platform scenario in
    // tests/store/urlPersistenceOptions.spec.ts for the number that matters
    // for actual shared links, and task-9-report.md for both figures.
    console.info(
      `[Task 9] pathological all-platforms-customized compressed length: ${compressed.length} chars`,
    )
    // Tight bound on purpose. The payload is a fixed literal and LZ-String is deterministic,
    // so this measures 2827 chars on every run — a `< 4000` bound had 30% slack and no
    // discriminating power. ~3% headroom absorbs an incidental field rename without letting a
    // real regression (a platform's options object escaping omitDefaults, ~200-500 chars) pass.
    expect(compressed.length).toBeLessThan(2900)
  })
})

describe('URL Storage - Backward Compatibility', () => {
  it('should handle missing hash gracefully', () => {
    mockLocation.hash = ''
    const result = urlHashStorage.getItem('storage-state')
    expect(result).toBeNull()
  })

  it('should handle empty hash gracefully', () => {
    mockLocation.hash = '#'
    const result = urlHashStorage.getItem('storage-state')
    expect(result).toBeNull()
  })

  it('should handle missing key in hash', () => {
    const stateKey = 'storage-state'
    mockLocation.hash = '#other-key=value'
    const result = urlHashStorage.getItem(stateKey)
    expect(result).toBeNull()
  })

  it('should handle malformed compressed data gracefully', () => {
    mockLocation.hash = '#storage-state=invalid-compressed-data'
    const result = urlHashStorage.getItem('storage-state')
    // Should return null and log warning (not throw)
    expect(result).toBeNull()
  })

  it('should document future versioning strategy', () => {
    // When v2.0 format is needed (breaking changes), implement:
    // 1. Add version parameter to URL: #v=2.0&storage-state=...
    // 2. Detect v=1.0 or missing version in getItem
    // 3. Migrate old format to new structure
    // 4. Re-serialize in new format

    // For now, document expected pattern
    const futureVersioningStrategy = {
      v1_0: 'Current format (no version param, LZ-compressed JSON)',
      v2_0_plan: 'Add #v=2.0 param when breaking changes needed',
      migration: 'Detect version in getItem, migrate if old version',
      example_v2: '#v=2.0&state=<compressed>',
    }

    expect(futureVersioningStrategy.v1_0).toBeDefined()
    expect(futureVersioningStrategy.migration).toContain('migrate')
  })

  it('should preserve URL across re-serialization', () => {
    const stateKey = 'storage-state'
    const config = { driveCount: 4, topology: { type: 'standard', level: 'RAID5' } }

    // First serialization
    urlHashStorage.setItem(stateKey, envelope(config))
    const url1 = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${url1.split('#')[1]}`

    // Retrieve and re-serialize
    const retrieved = urlHashStorage.getItem(stateKey)
    expect(retrieved).not.toBeNull()
    mockHistory.replaceState.mockClear()
    if (retrieved) {
      urlHashStorage.setItem(stateKey, expectSyncString(retrieved))
      const url2 = mockHistory.replaceState.mock.calls[0]?.[2]

      // URLs should be identical (stable serialization)
      expect(url1).toBe(url2)
    }
  })
})

describe('URL Storage - Helper Functions', () => {
  it('should return current URL with getShareableUrl', () => {
    mockLocation.href = 'http://localhost:3000/simulator#storage-state=abc123'
    const url = getShareableUrl()
    expect(url).toBe('http://localhost:3000/simulator#storage-state=abc123')
  })

  it('should copy URL to clipboard successfully', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: mockWriteText,
      },
    })
    mockLocation.href = 'http://localhost:3000/simulator#state=test'

    const success = await copyShareableUrl()

    expect(success).toBe(true)
    expect(mockWriteText).toHaveBeenCalledWith('http://localhost:3000/simulator#state=test')
  })

  it('should handle clipboard copy failure gracefully', async () => {
    const mockWriteText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    const success = await copyShareableUrl()

    expect(success).toBe(false)
  })
})

describe('URL Storage - removeItem', () => {
  it('should remove key from URL hash', () => {
    const stateKey = 'storage-state'
    const config = JSON.stringify({ driveCount: 4 })

    // Add item
    urlHashStorage.setItem(stateKey, config)
    const urlWithItem = mockHistory.replaceState.mock.calls[0]?.[2]
    mockLocation.hash = `#${urlWithItem.split('#')[1]}`

    // Remove item
    mockHistory.replaceState.mockClear()
    urlHashStorage.removeItem(stateKey)

    // Verify removal
    expect(mockHistory.replaceState).toHaveBeenCalled()
    const urlAfterRemove = mockHistory.replaceState.mock.calls[0]?.[2]
    expect(urlAfterRemove).not.toContain(stateKey)
  })

  it('should preserve other keys when removing one key', () => {
    mockLocation.hash = '#key1=value1&key2=value2'

    urlHashStorage.removeItem('key1')

    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    expect(newUrl).toContain('key2=value2')
    expect(newUrl).not.toContain('key1')
  })

  it('should remove hash entirely when last key removed', () => {
    mockLocation.hash = '#storage-state=value'
    mockLocation.pathname = '/simulator'
    mockLocation.search = ''

    urlHashStorage.removeItem('storage-state')

    const newUrl = mockHistory.replaceState.mock.calls[0]?.[2]
    expect(newUrl).toBe('/simulator')
    expect(newUrl).not.toContain('#')
  })
})

describe('URL Storage - Security: Malicious URL Protection (SEC-01, SEC-02, SEC-10)', () => {
  /**
   * Helper to create minimal valid state for security tests
   */
  function createValidState(overrides = {}) {
    return {
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 12,
      serverCount: 1,
      serverPowerWatts: 400,
      topology: { type: 'standard', level: 'RAID6' },
      hotSpares: 1,
      zfsOptions: {
        ashift: 12,
        compression: true,
        compressionType: 'lz4',
        dedup: false,
        recordsize: 131072,
        specialVdev: false,
        maxOccupation: 80,
      },
      s2dOptions: {
        faultDomains: 4,
        mirrorCopies: 2,
        rebuildReserve: true,
        reserveStrategy: 'node_failure',
        storageTiers: false,
      },
      controllerOptions: {
        controller: 'software',
        stripeSize: 256,
        readPolicy: 'adaptive',
        writePolicy: 'write-back',
      },
      netAppOptions: {
        platform: 'aff_a',
        raidType: 'raid_dp',
        adpVersion: 'adpv2',
        snapshotReserve: 0.05, // FRACTION (=5%)
        dataReductionRatio: 3.0,
        waflOverhead: 0.015,
        compression: true,
        dedup: true,
        zeroDetection: true,
      },
      synologyOptions: {
        filesystem: 'btrfs',
        systemPartitionSize: 25 * 1024 * 1024 * 1024,
        modelSeries: 'plus',
        ssdCache: false,
        cacheMode: 'read_only',
      },
      nutanixOptions: {
        clusterType: 'all-flash',
        compression: true,
        compressionRatio: 1.5,
        dedup: false,
        dedupRatio: 1.0,
        systemOverhead: 0.1,
        networkType: '25gbe',
      },
      objectscaleOptions: {
        systemOverheadPercent: 15,
        sites: 1,
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
        model: 'ME5224',
        controllers: 2,
        tiering: false,
        ssdReadCache: false,
        thinProvisioning: true,
      },
      readPercent: 70,
      blockSize: '64K',
      randomPercent: 50,
      datasetSize: 100 * 1024 * 1024 * 1024 * 1024,
      dailyWriteVolume: 1024 * 1024 * 1024 * 1024,
      compressionRatio: 1.5,
      dedupRatio: 1.0,
      networkSpeed: '25GbE',
      pcieGen: 'gen4',
      pcieLanes: 'x8',
      pue: 1.4,
      carbonRegion: 'switzerland',
      projectYears: 5,
      electricityCostPerKwh: 0.12,
      fsType: 'zfs',
      supportsReflink: true,
      backupRetention: 14,
      dailyChangeRate: 5,
      unitSystem: 'binary',
      ...overrides,
    }
  }

  /**
   * Helper to set URL hash with compressed malicious state
   */
  function setMaliciousUrlHash(state: unknown): void {
    const compressed = compressToEncodedURIComponent(envelope(state))
    mockLocation.hash = `#raidy=${compressed}`
  }

  describe('SEC-01: Numeric Bounds Validation', () => {
    it('should reject negative drive count', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const maliciousState = createValidState({ driveCount: -999 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should reject NaN drive count', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const maliciousState = createValidState({ driveCount: NaN })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should reject Infinity server count (SEC-01)', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const maliciousState = createValidState({ serverCount: Infinity })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should reject drive count exceeding maximum (1000)', () => {
      const maliciousState = createValidState({ driveCount: 9999 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject zero drive count', () => {
      const maliciousState = createValidState({ driveCount: 0 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject a NetApp snapshotReserve above 1 (it is a fraction, not a percent)', () => {
      // overheadCalculator.ts multiplies capacityAfterParity by this value directly, so the
      // old `.max(100)` bound let a crafted link validate a 100x snapshot reserve. The panel
      // slider works in percent and divides by 100 on the way in, so 100 can never come from
      // the UI — only from a hand-edited link.
      const maliciousState = createValidState({
        netAppOptions: {
          platform: 'aff_a',
          raidType: 'raid_dp',
          adpVersion: 'adpv2',
          snapshotReserve: 100,
          dataReductionRatio: 3.0,
          waflOverhead: 0.015,
          compression: true,
          dedup: true,
          zeroDetection: true,
        },
      })
      setMaliciousUrlHash(maliciousState)

      expect(urlHashStorage.getItem('raidy')).toBeNull()
    })

    it('should reject negative percentages', () => {
      const maliciousState = createValidState({ readPercent: -50 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject percentages over 100', () => {
      const maliciousState = createValidState({ randomPercent: 150 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject negative PUE values', () => {
      const maliciousState = createValidState({ pue: -1.4 })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })
  })

  describe('SEC-02: Enum Validation', () => {
    it('should reject invalid topology type', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const maliciousState = createValidState({
        topology: { type: 'hacked', level: 'RAID6' },
      })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should reject invalid ZFS compression type', () => {
      const maliciousState = createValidState({
        zfsOptions: {
          ashift: 12,
          compression: true,
          compressionType: 'malicious_algorithm',
          dedup: false,
          recordsize: 131072,
          specialVdev: false,
          maxOccupation: 80,
        },
      })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject invalid unit system', () => {
      const maliciousState = createValidState({ unitSystem: 'malicious' })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })
  })

  describe('SEC-10: Type Safety', () => {
    it('should reject string instead of number for driveCount', () => {
      const maliciousState = createValidState({ driveCount: '12' as unknown as number })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should reject null topology', () => {
      const maliciousState = createValidState({ topology: null })
      setMaliciousUrlHash(maliciousState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
    })

    it('should allow partial state (Zustand fills defaults for missing fields)', () => {
      // Fields are optional because Zustand persist middleware fills in defaults
      // from getDefaultState() for any missing fields. This is expected behavior.
      const partialState = {
        driveId: 'ent-hdd-7k2-sata-24tb-cmr',
        driveCount: 12,
        topology: { type: 'standard', level: 'RAID6' },
      }
      setMaliciousUrlHash(partialState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(expectSyncString(result)).state
      expect(parsed.driveId).toBe('ent-hdd-7k2-sata-24tb-cmr')
      expect(parsed.driveCount).toBe(12)
    })
  })

  describe('SEC-10: Decompression Error Handling', () => {
    it('should reject corrupt LZ-string data', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockLocation.hash = '#raidy=INVALID_COMPRESSED_DATA!!!'

      const result = urlHashStorage.getItem('raidy')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('should log error message for invalid URL', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const maliciousState = createValidState({ driveCount: -999 })
      setMaliciousUrlHash(maliciousState)

      urlHashStorage.getItem('raidy')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration link is invalid or corrupted'),
      )
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Valid State Acceptance', () => {
    it('should accept valid configuration with all fields', () => {
      const validState = createValidState()
      setMaliciousUrlHash(validState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(expectSyncString(result)).state
      expect(parsed.driveCount).toBe(12)
      expect(parsed.topology.type).toBe('standard')
      expect(parsed.topology.level).toBe('RAID6')
    })

    it('should accept different valid topology types', () => {
      const zfsState = createValidState({
        topology: { type: 'zfs', level: 'raidz2' },
      })
      setMaliciousUrlHash(zfsState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(expectSyncString(result)).state
      expect(parsed.topology.type).toBe('zfs')
      expect(parsed.topology.level).toBe('raidz2')
    })

    it('should accept maximum valid drive count', () => {
      const maxDrivesState = createValidState({ driveCount: 1000 })
      setMaliciousUrlHash(maxDrivesState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(expectSyncString(result)).state
      expect(parsed.driveCount).toBe(1000)
    })

    it('should accept minimum valid drive count', () => {
      const minDrivesState = createValidState({ driveCount: 1 })
      setMaliciousUrlHash(minDrivesState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(expectSyncString(result)).state
      expect(parsed.driveCount).toBe(1)
    })
  })
})
