/**
 * Performance Strategy Tests for all 8 vendor strategies.
 *
 * Validates getWritePenalty and calculateIOPS for:
 * Dell, Proprietary (Synology/NetApp), PowerFlex, S2D, vSAN, Ceph, ZFS, Nutanix
 */

import { describe, expect, it } from 'vitest'
import { dellPerformanceStrategy } from '@engines/performance/strategies/dell'
import { proprietaryPerformanceStrategy } from '@engines/performance/strategies/proprietary'
import { powerFlexPerformanceStrategy } from '@engines/performance/strategies/powerflex'
import { s2dPerformanceStrategy } from '@engines/performance/strategies/s2d'
import { vsanPerformanceStrategy } from '@engines/performance/strategies/vsan'
import { cephPerformanceStrategy } from '@engines/performance/strategies/ceph'
import { zfsPerformanceStrategy } from '@engines/performance/strategies/zfs'
import { nutanixPerformanceStrategy } from '@engines/performance/strategies/nutanix'

// Common test parameters for calculateIOPS
const DRIVES = 10
const IOPS_PER_DRIVE = 1000
const READ_PERCENT = 50

/**
 * Helper: calculate expected IOPS for standard formula
 * readIOPS = driveCount * driveIOPS * (readPercent/100)
 * writeIOPS = driveCount * driveIOPS * (1 - readPercent/100) / writePenalty
 * total = (readIOPS + writeIOPS) * specialFactor
 */
function expectedIOPS(writePenalty: number, specialFactor = 1.0): number {
  const readIOPS = DRIVES * IOPS_PER_DRIVE * (READ_PERCENT / 100)
  const writeIOPS = (DRIVES * IOPS_PER_DRIVE * (1 - READ_PERCENT / 100)) / writePenalty
  return (readIOPS + writeIOPS) * specialFactor
}

// ─── Dell Performance Strategy ──────────────────────────────────────────────

describe('Dell Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      // PowerStore
      ['powerstore_raid5', 3.0],
      ['powerstore_raid6', 4.0],
      ['powerstore_raid10', 2.0],
      // PowerScale
      ['powerscale_n1', 2.5],
      ['powerscale_n2', 3.5],
      ['powerscale_n2_1', 3.5],
      ['powerscale_n3', 4.5],
      ['powerscale_n4', 5.5],
      ['powerscale_mirror_2x', 2.0],
      ['powerscale_mirror_3x', 3.0],
      // ObjectScale
      ['objectscale_ec_12_4', 1.33],
      ['objectscale_ec_10_2', 1.2],
      ['objectscale_ec_24_4', 1.17],
      ['objectscale_mirror_3', 3.0],
      // PowerVault
      ['powervault_raid1', 2.0],
      ['powervault_raid5', 4.0],
      ['powervault_raid6', 6.0],
      ['powervault_raid10', 2.0],
      ['powervault_adapt', 2.5],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(dellPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 3.0 for unknown level (default)', () => {
      expect(dellPerformanceStrategy.getWritePenalty('unknown')).toBe(3.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates standard IOPS for PowerStore RAID5', () => {
      const result = dellPerformanceStrategy.calculateIOPS(
        'powerstore_raid5',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      // No special factor for PowerStore
      expect(result).toBeCloseTo(expectedIOPS(3.0), 0)
    })

    it('applies 0.9 protocol overhead for ObjectScale levels', () => {
      const result = dellPerformanceStrategy.calculateIOPS(
        'objectscale_ec_12_4',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(1.33, 0.9), 0)
    })

    it('does not apply protocol overhead for non-ObjectScale levels', () => {
      const result = dellPerformanceStrategy.calculateIOPS(
        'powervault_raid5',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(4.0, 1.0), 0)
    })
  })
})

// ─── Proprietary Performance Strategy ───────────────────────────────────────

describe('Proprietary Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['synology_shr', 4.0],
      ['synology_shr2', 6.0],
      ['synology_raid_f1', 3.5],
      ['netapp_raid_dp', 4.0],
      ['netapp_raid_tec', 5.0],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(proprietaryPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 1.0 for unknown level (default)', () => {
      expect(proprietaryPerformanceStrategy.getWritePenalty('unknown')).toBe(1.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates standard IOPS for Synology SHR', () => {
      const result = proprietaryPerformanceStrategy.calculateIOPS(
        'synology_shr',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(4.0, 1.0), 0)
    })

    it('applies 1.05 WAFL boost for NetApp levels', () => {
      const result = proprietaryPerformanceStrategy.calculateIOPS(
        'netapp_raid_dp',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(4.0, 1.05), 0)
    })

    it('does not apply WAFL boost for Synology levels', () => {
      const result = proprietaryPerformanceStrategy.calculateIOPS(
        'synology_shr',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      // Without WAFL boost
      const withoutBoost = expectedIOPS(4.0, 1.0)
      const withBoost = expectedIOPS(4.0, 1.05)
      expect(result).toBeCloseTo(withoutBoost, 0)
      expect(result).not.toBeCloseTo(withBoost, 0)
    })
  })
})

// ─── PowerFlex Performance Strategy ─────────────────────────────────────────

describe('PowerFlex Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['powerflex_medium_2way', 2.0],
      ['powerflex_fine_2way', 2.0],
      ['powerflex_medium_3way', 3.0],
      ['powerflex_ec_4_1', 1.25],
      ['powerflex_ec_4_2', 1.5],
      ['powerflex_ec_8_2', 1.25],
      ['powerflex_ec_12_4', 1.33],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(powerFlexPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 2.0 for unknown level (default)', () => {
      expect(powerFlexPerformanceStrategy.getWritePenalty('unknown')).toBe(2.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates IOPS for 2-way mirror', () => {
      const result = powerFlexPerformanceStrategy.calculateIOPS(
        'powerflex_medium_2way',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(2.0), 0)
    })

    it('calculates IOPS for EC 4+1', () => {
      const result = powerFlexPerformanceStrategy.calculateIOPS(
        'powerflex_ec_4_1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(1.25), 0)
    })
  })
})

// ─── S2D Performance Strategy ───────────────────────────────────────────────

describe('S2D Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['simple', 1.0],
      ['mirror', 2.0],
      ['parity', 3.0],
      ['dual_parity', 4.0],
      ['map', 2.5],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(s2dPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 1.0 for unknown level (default)', () => {
      expect(s2dPerformanceStrategy.getWritePenalty('unknown')).toBe(1.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates IOPS for simple (no penalty)', () => {
      const result = s2dPerformanceStrategy.calculateIOPS(
        'simple',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(1.0), 0)
    })

    it('calculates IOPS for dual parity', () => {
      const result = s2dPerformanceStrategy.calculateIOPS(
        'dual_parity',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(4.0), 0)
    })
  })
})

// ─── vSAN Performance Strategy ──────────────────────────────────────────────

describe('vSAN Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['vsan_osa_raid1', 2.0],
      ['vsan_osa_raid1_ftt2', 3.0],
      ['vsan_osa_raid5', 4.0],
      ['vsan_osa_raid6', 6.0],
      ['vsan_esa_raid1', 2.0],
      ['vsan_esa_raid5', 2.5],
      ['vsan_esa_raid6', 3.5],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(vsanPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 2.5 for unknown level (default)', () => {
      expect(vsanPerformanceStrategy.getWritePenalty('unknown')).toBe(2.5)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates standard IOPS for OSA RAID1', () => {
      const result = vsanPerformanceStrategy.calculateIOPS(
        'vsan_osa_raid1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      // OSA has no ESA boost (factor = 1.0)
      expect(result).toBeCloseTo(expectedIOPS(2.0, 1.0), 0)
    })

    it('applies 1.1 ESA boost for ESA levels', () => {
      const result = vsanPerformanceStrategy.calculateIOPS(
        'vsan_esa_raid5',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(2.5, 1.1), 0)
    })

    it('does not apply ESA boost for OSA levels', () => {
      const osaResult = vsanPerformanceStrategy.calculateIOPS(
        'vsan_osa_raid5',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      const esaResult = vsanPerformanceStrategy.calculateIOPS(
        'vsan_esa_raid5',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      // ESA should be higher due to 1.1 boost (even with different penalties)
      // OSA RAID5 wp=4.0: 5000 + 5000/4 = 6250
      // ESA RAID5 wp=2.5: (5000 + 5000/2.5) * 1.1 = 7000 * 1.1 = 7700
      expect(osaResult).toBeCloseTo(6250, 0)
      expect(esaResult).toBeCloseTo(7700, 0)
    })
  })
})

// ─── Ceph Performance Strategy ──────────────────────────────────────────────

describe('Ceph Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['ceph_replicated_2', 2.0],
      ['ceph_replicated_3', 3.0],
      ['ceph_ec_2_1', 2.0],
      ['ceph_ec_4_2', 2.5],
      ['ceph_ec_8_3', 3.0],
      ['ceph_ec_8_4', 3.5],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(cephPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 3.0 for unknown level (default)', () => {
      expect(cephPerformanceStrategy.getWritePenalty('unknown')).toBe(3.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates standard IOPS for replicated_3', () => {
      const result = cephPerformanceStrategy.calculateIOPS(
        'ceph_replicated_3',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(3.0, 1.0), 0)
    })

    it('applies 1.1 network factor with 100GbE option', () => {
      const result = cephPerformanceStrategy.calculateIOPS(
        'ceph_replicated_3',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
        { networkSpeed: '100GbE' },
      )
      expect(result).toBeCloseTo(expectedIOPS(3.0, 1.1), 0)
    })

    it('does not apply network factor without 100GbE option', () => {
      const withoutOption = cephPerformanceStrategy.calculateIOPS(
        'ceph_replicated_3',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      const withOption = cephPerformanceStrategy.calculateIOPS(
        'ceph_replicated_3',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
        { networkSpeed: '100GbE' },
      )
      expect(withOption).toBeGreaterThan(withoutOption)
    })
  })
})

// ─── ZFS Performance Strategy ───────────────────────────────────────────────

describe('ZFS Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['stripe', 1.0],
      ['mirror', 2.0],
      ['raidz1', 2.0],
      ['draid1', 2.0],
      ['raidz2', 3.0],
      ['draid2', 3.0],
      ['raidz3', 4.0],
      ['draid3', 4.0],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(zfsPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 1.0 for unknown level (default)', () => {
      expect(zfsPerformanceStrategy.getWritePenalty('unknown')).toBe(1.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates standard IOPS for raidz1', () => {
      const result = zfsPerformanceStrategy.calculateIOPS(
        'raidz1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(2.0, 1.0), 0)
    })

    it('applies 1.1 ARC boost when arcCacheEnabled', () => {
      const result = zfsPerformanceStrategy.calculateIOPS(
        'raidz1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
        { arcCacheEnabled: true },
      )
      expect(result).toBeCloseTo(expectedIOPS(2.0, 1.1), 0)
    })

    it('does not apply ARC boost when arcCacheEnabled is false', () => {
      const withArc = zfsPerformanceStrategy.calculateIOPS(
        'raidz1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
        { arcCacheEnabled: true },
      )
      const withoutArc = zfsPerformanceStrategy.calculateIOPS(
        'raidz1',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
        { arcCacheEnabled: false },
      )
      expect(withArc).toBeGreaterThan(withoutArc)
    })
  })
})

// ─── Nutanix Performance Strategy ───────────────────────────────────────────

describe('Nutanix Performance Strategy', () => {
  describe('getWritePenalty', () => {
    describe.each([
      ['nutanix_rf2', 2.0],
      ['nutanix_rf3', 3.0],
      ['nutanix_ec_rf2', 1.25],
      ['nutanix_ec_rf3', 1.33],
    ] as [string, number][])('level %s', (level, expected) => {
      it(`returns ${expected}`, () => {
        expect(nutanixPerformanceStrategy.getWritePenalty(level)).toBe(expected)
      })
    })

    it('returns 2.0 for unknown level (default)', () => {
      expect(nutanixPerformanceStrategy.getWritePenalty('unknown')).toBe(2.0)
    })
  })

  describe('calculateIOPS', () => {
    it('calculates IOPS for RF2', () => {
      const result = nutanixPerformanceStrategy.calculateIOPS(
        'nutanix_rf2',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(2.0), 0)
    })

    it('calculates IOPS for EC RF3', () => {
      const result = nutanixPerformanceStrategy.calculateIOPS(
        'nutanix_ec_rf3',
        DRIVES,
        IOPS_PER_DRIVE,
        READ_PERCENT,
      )
      expect(result).toBeCloseTo(expectedIOPS(1.33), 0)
    })
  })
})
