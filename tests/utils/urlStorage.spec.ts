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
    const originalState = JSON.stringify({
      driveCount: 8,
      driveModel: 'wd-gold-12tb',
    })

    // Serialize: setItem
    urlHashStorage.setItem(stateKey, originalState)

    // Extract from mocked replaceState call
    expect(mockHistory.replaceState).toHaveBeenCalled()
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    const hashPart = newUrl.split('#')[1]
    mockLocation.hash = `#${hashPart}`

    // Deserialize: getItem
    const retrievedState = urlHashStorage.getItem(stateKey)

    // Verify roundtrip
    expect(retrievedState).toBe(originalState)
    expect(retrievedState).not.toBeNull()
    if (retrievedState) {
      expect(JSON.parse(retrievedState)).toEqual(JSON.parse(originalState))
    }
  })

  it('should roundtrip standard RAID configuration', () => {
    const stateKey = 'storage-state'
    const raidConfig = {
      topology: { type: 'standard', level: 'RAID5' },
      driveCount: 8,
      driveModel: 'wd-gold-12tb',
      hotSpares: 1,
      serverCount: 1,
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, JSON.stringify(raidConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
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
      driveModel: 'samsung-870-evo-4tb',
      zfsOptions: {
        ashift: 12,
        compression: true,
        compressionType: 'lz4' as const,
        dedup: false,
        recordsize: 128,
        specialVdev: false,
        slogDevice: false,
        l2arcDevice: false,
        maxOccupation: 80,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, JSON.stringify(zfsConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all ZFS options preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed).toMatchObject(zfsConfig)
      expect(parsed.zfsOptions.compression).toBe(true)
      expect(parsed.zfsOptions.compressionType).toBe('lz4')
      expect(parsed.zfsOptions.ashift).toBe(12)
      expect(parsed.zfsOptions.maxOccupation).toBe(80)
    }
  })

  it('should roundtrip vSAN ESA configuration', () => {
    const stateKey = 'storage-state'
    const vsanConfig = {
      topology: { type: 'vsan_esa', level: 'vsan_esa_raid5' },
      driveCount: 8,
      driveModel: 'intel-p5520-3.84tb',
      serverCount: 8, // affects adaptive efficiency
      vsanOptions: {
        ftt: 1,
        ftm: 'raid5',
        dedupEnabled: true,
        compressionEnabled: true,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, JSON.stringify(vsanConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify vSAN options preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed).toMatchObject(vsanConfig)
      expect(parsed.serverCount).toBe(8)
      expect(parsed.vsanOptions.ftt).toBe(1)
      expect(parsed.vsanOptions.dedupEnabled).toBe(true)
    }
  })

  it('should roundtrip complete configuration with all fields', () => {
    const stateKey = 'storage-state'
    const completeConfig = {
      // Hardware
      driveCount: 12,
      driveModel: 'seagate-exos-x18-18tb',
      serverCount: 4,
      hotSpares: 2,
      // Topology
      topology: { type: 's2d', level: 'mirror' },
      // Workload
      workloadProfile: 'database',
      randomReadPercent: 70,
      randomWritePercent: 20,
      blockSize: '8192',
      // Advanced settings
      networkSpeed: '25000',
      controllerType: 'hba_12g',
      raidChunkSize: 256,
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
    urlHashStorage.setItem(stateKey, JSON.stringify(completeConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed).toMatchObject(completeConfig)
      expect(parsed.driveCount).toBe(12)
      expect(parsed.hotSpares).toBe(2)
      expect(parsed.workloadProfile).toBe('database')
      expect(parsed.blockSize).toBe('8192')
      expect(parsed.networkSpeed).toBe('25000')
      expect(parsed.compressionRatio).toBe(1.5)
      expect(parsed.s2dOptions.faultDomains).toBe(4)
    }
  })

  it('should roundtrip empty/minimal configuration', () => {
    const stateKey = 'storage-state'
    const minimalConfig = JSON.stringify({})

    // Roundtrip
    urlHashStorage.setItem(stateKey, minimalConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify empty object preserved
    expect(retrieved).toBe(minimalConfig)
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      expect(JSON.parse(retrieved)).toEqual({})
    }
  })

  it('should handle special characters in configuration values', () => {
    const stateKey = 'storage-state'
    const specialCharsConfig = JSON.stringify({
      customLabel: 'Production Storage @ DC-01 (2024)',
      notes: 'Server: rack-42/node-3 | Contact: admin@example.com',
      tags: ['high-priority', 'tier-1', 'finance/accounting'],
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, specialCharsConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify special chars preserved
    expect(retrieved).toBe(specialCharsConfig)
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed.customLabel).toBe('Production Storage @ DC-01 (2024)')
      expect(parsed.notes).toContain('admin@example.com')
    }
  })

  it('should compress URL for complex configuration', () => {
    const stateKey = 'storage-state'
    // Create a large config with repetitive data that compresses well
    const largeConfig = {
      driveCount: 24,
      driveModel: 'samsung-pm9a3-3.84tb',
      topology: { type: 'ceph', level: 'ceph_ec_4_2' },
      cephOptions: {
        poolType: 'erasure_coded',
        ecProfile: '4+2',
        minSize: 5,
        crushRule: 'default',
      },
      performanceMetrics: {
        iopsRead: 250000,
        iopsWrite: 150000,
        bandwidthReadMb: 12000,
        bandwidthWriteMb: 8000,
      },
      // Add repetitive data that compresses well
      nodes: Array(20).fill({
        id: 'node-001',
        rack: 'rack-42',
        datacenter: 'dc-west-1',
        status: 'active',
      }),
    }
    const largeConfigStr = JSON.stringify(largeConfig)

    // Get compressed version
    const compressed = compressToEncodedURIComponent(largeConfigStr)

    // With repetitive data, compression should work
    // LZ compression is effective on repetitive patterns
    expect(compressed.length).toBeLessThan(largeConfigStr.length)

    // Roundtrip
    urlHashStorage.setItem(stateKey, largeConfigStr)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed).toMatchObject(largeConfig)
    }
  })

  it('should snapshot URL format for regression prevention', () => {
    const stateKey = 'storage-state'
    const config = JSON.stringify({
      topology: { type: 'standard', level: 'RAID6' },
      driveCount: 6,
    })

    urlHashStorage.setItem(stateKey, config)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]

    // Snapshot the URL format
    expect(newUrl).toMatchSnapshot()
  })

  it('should handle maximum complexity configuration', () => {
    const stateKey = 'storage-state'
    const maxConfig = {
      driveCount: 60,
      driveModel: 'micron-9400-15.36tb',
      serverCount: 16,
      hotSpares: 4,
      topology: { type: 'proprietary', level: 'netapp_raid_tec' },
      workloadProfile: 'mixed',
      networkSpeed: '100000',
      controllerType: 'smartpqi_gen5',
      raidChunkSize: 1024,
      compressionRatio: 2.5,
      dedupRatio: 3.0,
      netAppOptions: {
        platform: 'aff_a' as const,
        raidType: 'raid_tec' as const,
        adpVersion: 'adpv2' as const,
        snapshotReserve: 20,
        dataReductionRatio: 3.5,
        waflOverhead: 0.1,
        compression: true,
        dedup: true,
        zeroDetection: true,
      },
      performanceTargets: {
        iopsTarget: 1000000,
        latencyTargetMs: 1,
        bandwidthTargetMb: 50000,
      },
      costConstraints: {
        maxBudgetUsd: 500000,
        maxPowerWatts: 20000,
        maxRackUnits: 42,
      },
    }

    // Roundtrip
    urlHashStorage.setItem(stateKey, JSON.stringify(maxConfig))
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).not.toBeNull()
    if (retrieved) {
      const parsed = JSON.parse(retrieved)
      expect(parsed).toMatchObject(maxConfig)
      expect(parsed.driveCount).toBe(60)
      expect(parsed.netAppOptions.raidType).toBe('raid_tec')
      expect(parsed.costConstraints.maxBudgetUsd).toBe(500000)
    }
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
    const config = JSON.stringify({ driveCount: 4, topology: { type: 'standard', level: 'RAID5' } })

    // First serialization
    urlHashStorage.setItem(stateKey, config)
    const url1 = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${url1.split('#')[1]}`

    // Retrieve and re-serialize
    const retrieved = urlHashStorage.getItem(stateKey)
    expect(retrieved).not.toBeNull()
    mockHistory.replaceState.mockClear()
    if (retrieved) {
      urlHashStorage.setItem(stateKey, retrieved)
      const url2 = mockHistory.replaceState.mock.calls[0][2]

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
    const urlWithItem = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${urlWithItem.split('#')[1]}`

    // Remove item
    mockHistory.replaceState.mockClear()
    urlHashStorage.removeItem(stateKey)

    // Verify removal
    expect(mockHistory.replaceState).toHaveBeenCalled()
    const urlAfterRemove = mockHistory.replaceState.mock.calls[0][2]
    expect(urlAfterRemove).not.toContain(stateKey)
  })

  it('should preserve other keys when removing one key', () => {
    mockLocation.hash = '#key1=value1&key2=value2'

    urlHashStorage.removeItem('key1')

    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    expect(newUrl).toContain('key2=value2')
    expect(newUrl).not.toContain('key1')
  })

  it('should remove hash entirely when last key removed', () => {
    mockLocation.hash = '#storage-state=value'
    mockLocation.pathname = '/simulator'
    mockLocation.search = ''

    urlHashStorage.removeItem('storage-state')

    const newUrl = mockHistory.replaceState.mock.calls[0][2]
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
        slogDevice: false,
        l2arcDevice: false,
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
        snapshotReserve: 5,
        dataReductionRatio: 3.0,
        waflOverhead: 0.015,
        compression: true,
        dedup: true,
        zeroDetection: true,
      },
      synologyOptions: {
        filesystem: 'btrfs',
        btrfsOverhead: 0.04,
        systemPartitionSize: 25 * 1024 * 1024 * 1024,
        modelSeries: 'plus',
        ssdCache: false,
        cacheMode: 'read_only',
      },
      nutanixOptions: {
        clusterType: 'all-flash',
        replicationFactor: 2,
        erasureCoding: false,
        ecStripe: '4_1',
        compression: true,
        compressionRatio: 1.5,
        dedup: false,
        dedupRatio: 1.0,
        systemOverhead: 0.1,
        networkType: '25gbe',
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
    const compressed = compressToEncodedURIComponent(JSON.stringify(state))
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
          slogDevice: false,
          l2arcDevice: false,
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
      const parsed = JSON.parse(result)
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
      const parsed = JSON.parse(result)
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
      const parsed = JSON.parse(result)
      expect(parsed.topology.type).toBe('zfs')
      expect(parsed.topology.level).toBe('raidz2')
    })

    it('should accept maximum valid drive count', () => {
      const maxDrivesState = createValidState({ driveCount: 1000 })
      setMaliciousUrlHash(maxDrivesState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(result)
      expect(parsed.driveCount).toBe(1000)
    })

    it('should accept minimum valid drive count', () => {
      const minDrivesState = createValidState({ driveCount: 1 })
      setMaliciousUrlHash(minDrivesState)

      const result = urlHashStorage.getItem('raidy')

      expect(result).not.toBeNull()
      if (!result) throw new Error('Expected result to be non-null')
      const parsed = JSON.parse(result)
      expect(parsed.driveCount).toBe(1)
    })
  })
})
