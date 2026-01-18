/**
 * URL Storage Tests
 *
 * Validates URL state serialization for shareable links.
 * Reference: Plan 02-05 TEST-14 - URL roundtrip must preserve all configuration values.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compressToEncodedURIComponent } from 'lz-string'
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
    expect(JSON.parse(retrievedState!)).toEqual(JSON.parse(originalState))
  })

  it('should roundtrip standard RAID configuration', () => {
    const stateKey = 'storage-state'
    const raidConfig = JSON.stringify({
      topology: { type: 'standard', level: 'RAID5' },
      driveCount: 8,
      driveModel: 'wd-gold-12tb',
      hotSpares: 1,
      serverCount: 1,
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, raidConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).toBe(raidConfig)
    const parsed = JSON.parse(retrieved!)
    expect(parsed.topology.level).toBe('RAID5')
    expect(parsed.driveCount).toBe(8)
    expect(parsed.hotSpares).toBe(1)
  })

  it('should roundtrip ZFS configuration with options', () => {
    const stateKey = 'storage-state'
    const zfsConfig = JSON.stringify({
      topology: { type: 'zfs', level: 'raidz2' },
      driveCount: 6,
      driveModel: 'samsung-870-evo-4tb',
      zfsOptions: {
        compression: 'lz4',
        ashift: 12,
        maxOccupation: 80,
        recordSize: 128,
      },
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, zfsConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all ZFS options preserved
    expect(retrieved).toBe(zfsConfig)
    const parsed = JSON.parse(retrieved!)
    expect(parsed.zfsOptions.compression).toBe('lz4')
    expect(parsed.zfsOptions.ashift).toBe(12)
    expect(parsed.zfsOptions.maxOccupation).toBe(80)
  })

  it('should roundtrip vSAN ESA configuration', () => {
    const stateKey = 'storage-state'
    const vsanConfig = JSON.stringify({
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
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, vsanConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify vSAN options preserved
    expect(retrieved).toBe(vsanConfig)
    const parsed = JSON.parse(retrieved!)
    expect(parsed.serverCount).toBe(8)
    expect(parsed.vsanOptions.ftt).toBe(1)
    expect(parsed.vsanOptions.dedupEnabled).toBe(true)
  })

  it('should roundtrip complete configuration with all fields', () => {
    const stateKey = 'storage-state'
    const completeConfig = JSON.stringify({
      // Hardware
      driveCount: 12,
      driveModel: 'seagate-exos-x18-18tb',
      serverCount: 4,
      hotSpares: 2,
      // Topology
      topology: { type: 's2d', level: 's2d_mirror' },
      // Workload
      workloadProfile: 'database',
      randomReadPercent: 70,
      randomWritePercent: 20,
      blockSize: 8192,
      // Advanced settings
      networkSpeed: 25000,
      controllerType: 'hba_12g',
      raidChunkSize: 256,
      compressionRatio: 1.5,
      dedupRatio: 1.2,
      // S2D options
      s2dOptions: {
        faultDomains: 4,
        redundancyMode: 'three_way_mirror',
        storageTiers: true,
      },
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, completeConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).toBe(completeConfig)
    const parsed = JSON.parse(retrieved!)
    expect(parsed.driveCount).toBe(12)
    expect(parsed.hotSpares).toBe(2)
    expect(parsed.workloadProfile).toBe('database')
    expect(parsed.blockSize).toBe(8192)
    expect(parsed.networkSpeed).toBe(25000)
    expect(parsed.compressionRatio).toBe(1.5)
    expect(parsed.s2dOptions.faultDomains).toBe(4)
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
    expect(JSON.parse(retrieved!)).toEqual({})
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
    const parsed = JSON.parse(retrieved!)
    expect(parsed.customLabel).toBe('Production Storage @ DC-01 (2024)')
    expect(parsed.notes).toContain('admin@example.com')
  })

  it('should compress URL for complex configuration', () => {
    const stateKey = 'storage-state'
    // Create a large config with repetitive data that compresses well
    const largeConfig = JSON.stringify({
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
    })

    // Get compressed version
    const compressed = compressToEncodedURIComponent(largeConfig)

    // With repetitive data, compression should work
    // LZ compression is effective on repetitive patterns
    expect(compressed.length).toBeLessThan(largeConfig.length)

    // Roundtrip
    urlHashStorage.setItem(stateKey, largeConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify
    expect(retrieved).toBe(largeConfig)
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
    const maxConfig = JSON.stringify({
      driveCount: 60,
      driveModel: 'micron-9400-15.36tb',
      serverCount: 16,
      hotSpares: 4,
      topology: { type: 'netapp', level: 'netapp_raid_tec' },
      workloadProfile: 'mixed',
      networkSpeed: 100000,
      controllerType: 'smartpqi_gen5',
      raidChunkSize: 1024,
      compressionRatio: 2.5,
      dedupRatio: 3.0,
      netAppOptions: {
        raidType: 'raid_tec',
        aggregateType: 'ssd',
        adpEnabled: true,
        flashPoolEnabled: true,
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
    })

    // Roundtrip
    urlHashStorage.setItem(stateKey, maxConfig)
    const newUrl = mockHistory.replaceState.mock.calls[0][2]
    mockLocation.hash = `#${newUrl.split('#')[1]}`
    const retrieved = urlHashStorage.getItem(stateKey)

    // Verify all fields preserved
    expect(retrieved).toBe(maxConfig)
    const parsed = JSON.parse(retrieved!)
    expect(parsed.driveCount).toBe(60)
    expect(parsed.netAppOptions.raidType).toBe('raid_tec')
    expect(parsed.costConstraints.maxBudgetUsd).toBe(500000)
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
    mockHistory.replaceState.mockClear()
    urlHashStorage.setItem(stateKey, retrieved!)
    const url2 = mockHistory.replaceState.mock.calls[0][2]

    // URLs should be identical (stable serialization)
    expect(url1).toBe(url2)
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
