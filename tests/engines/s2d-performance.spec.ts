/**
 * S2D Performance Strategy Tests
 *
 * Locks in the per-copy mirror write penalty: a mirror write fans out to one
 * backend write per copy, so the penalty equals mirrorCopies (2-way = 2x, 3-way = 3x).
 * MAP applies a small parity surcharge on top of the mirror-tier penalty (mirrorCopies + 0.5).
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import { s2dPerformanceStrategy } from '@/engines/performance/strategies/s2d'
import type { TieredCapacityResult } from '@/engines/shared/tiering'
import { DEFAULT_CONTROLLER_OPTIONS, DEFAULT_S2D_OPTIONS } from '@/types'
import type { Drive } from '@/types/drive'

describe('S2D Performance Strategy - getWritePenalty', () => {
  it('two-way mirror has a 2.0x write penalty (one backend write per copy)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('mirror', { mirrorCopies: 2 })).toBe(2.0)
  })

  it('three-way mirror has a 3.0x write penalty (one backend write per copy)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('mirror', { mirrorCopies: 3 })).toBe(3.0)
  })

  it('simple (no redundancy) has a 1.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('simple')).toBe(1.0)
  })

  it('single parity has a 3.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('parity')).toBe(3.0)
  })

  it('dual parity has a 4.0x write penalty', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('dual_parity')).toBe(4.0)
  })

  it('MAP with a two-way mirror tier has a 2.5x write penalty (mirrorCopies + 0.5)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('map', { mirrorCopies: 2 })).toBe(2.5)
  })

  it('MAP with a three-way mirror tier has a 3.5x write penalty (mirrorCopies + 0.5)', () => {
    expect(s2dPerformanceStrategy.getWritePenalty('map', { mirrorCopies: 3 })).toBe(3.5)
  })
})

// ─── S2D Tiered Performance (Hybrid Cache) ────────────────────────────────────

describe('S2D tiered performance (hybrid cache)', () => {
  // Synthetic NVMe cache drive: high IOPS, rated 3 DWPD
  const cacheDrive: Drive = {
    id: 'test-cache-nvme',
    model: 'Test Cache NVMe 960GB',
    type: 'SSD_NVMe',
    formFactor: 'U.2',
    interface: 'PCIe4',
    capacity_raw: 960_000_000_000,
    sector_size: 512,
    performance: {
      iops_read: 300_000,
      iops_write: 150_000,
      bandwidth_read_mb: 2500,
      bandwidth_write_mb: 2000,
    },
    reliability: { ure_rate: 17, afr: 0.5, dwpd: 3, mtbf_hours: 2_000_000 },
    power: { idle_watts: 5, load_watts: 8 },
    cost_usd: 500,
  }

  // Synthetic HDD capacity drive: low IOPS, no DWPD rating
  const capacityDrive: Drive = {
    id: 'test-capacity-hdd',
    model: 'Test Capacity HDD 12TB',
    type: 'HDD',
    formFactor: '3.5"',
    interface: 'SATA',
    capacity_raw: 12_000_000_000_000,
    sector_size: 512,
    performance: {
      iops_read: 200,
      iops_write: 200,
      bandwidth_read_mb: 250,
      bandwidth_write_mb: 250,
    },
    reliability: { ure_rate: 15, afr: 1.0, dwpd: 0, mtbf_hours: 1_000_000 },
    power: { idle_watts: 7, load_watts: 12 },
    cost_usd: 150,
  }

  // Tiered config: 6 NVMe cache + 12 HDD capacity drives
  const tiering: TieredCapacityResult = {
    cacheTierCapacity: cacheDrive.capacity_raw * 6,
    cacheTierDrive: cacheDrive,
    cacheTierDriveCount: 6,
    capacityTierCapacity: capacityDrive.capacity_raw * 12,
    capacityTierDrive: capacityDrive,
    capacityTierDriveCount: 12,
  }

  // Base S2D input without tiering (non-tiered path sanity baseline)
  const baseS2DInput: PerformanceInput = {
    drive: capacityDrive,
    driveCount: 12,
    hotSpares: 0,
    serverCount: 1,
    topology: { type: 's2d', level: 'mirror' },
    controllerOptions: DEFAULT_CONTROLLER_OPTIONS,
    readPercent: 50,
    randomPercent: 100,
    blockSize: '64K',
    networkSpeed: '25GbE',
    pcieGen: 'gen4',
    pcieLanes: 'x8',
    s2dOptions: DEFAULT_S2D_OPTIONS,
  }

  it('non-tiered S2D still returns finite positive IOPS (unchanged path)', () => {
    const result = calculatePerformance(baseS2DInput)
    expect(result.maxReadIOPS).toBeGreaterThan(0)
    expect(result.maxWriteIOPS).toBeGreaterThan(0)
    expect(Number.isFinite(result.maxReadIOPS)).toBe(true)
    expect(Number.isFinite(result.maxWriteIOPS)).toBe(true)
  })

  it('write performance reflects the cache tier — far exceeds a pure HDD aggregate', () => {
    // With write-back cache, writes are absorbed by the fast NVMe tier.
    // maxWriteIOPS must be far above the slowest possible figure: all-HDD capacity writes.
    const tieredInput: PerformanceInput = {
      ...baseS2DInput,
      driveCount: 18,
      tiering,
      workingSetPercent: 20,
    }
    const result = calculatePerformance(tieredInput)

    const allHddWriteAggregate =
      tiering.capacityTierDriveCount * capacityDrive.performance.iops_write
    // 6 cache × 150 000 iops_write / mirror-penalty-2 = 450 000 >> 12 × 200 = 2 400
    expect(result.maxWriteIOPS).toBeGreaterThan(allHddWriteAggregate)
  })

  it('read performance is a working-set blend between all-capacity and all-cache aggregates', () => {
    // At ws=20%, hot data comes from cache (20%) and cold data from capacity (80%).
    // The blended read IOPS lies strictly between the two extremes.
    const tieredInput: PerformanceInput = {
      ...baseS2DInput,
      driveCount: 18,
      tiering,
      workingSetPercent: 20,
    }
    const result = calculatePerformance(tieredInput)

    const allCapacityRead = tiering.capacityTierDriveCount * capacityDrive.performance.iops_read // 2 400
    const allCacheRead = tiering.cacheTierDriveCount * cacheDrive.performance.iops_read // 1 800 000

    expect(result.maxReadIOPS).toBeGreaterThan(allCapacityRead)
    expect(result.maxReadIOPS).toBeLessThan(allCacheRead)
  })
})
