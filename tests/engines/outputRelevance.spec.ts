import { describe, expect, it } from 'vitest'
import {
  type RelevanceContext,
  type SectionContext,
  shouldShowKpi,
  shouldShowSection,
} from '@/engines/outputRelevance'
import type { SustainabilityResult, VolumetryResult } from '@/types/results'

const vol = (over: Partial<VolumetryResult> = {}): VolumetryResult => ({
  rawCapacity: 1000,
  parityOverhead: 100,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 900,
  effectiveCapacity: 900,
  efficiency: 90,
  breakdown: [],
  ...over,
})
const sus = (over: Partial<SustainabilityResult> = {}): SustainabilityResult => ({
  annualEnergyKwh: 5000,
  annualEnergyCost: 1000,
  annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 },
  ...over,
})
const ctx = (over: Partial<RelevanceContext> = {}): RelevanceContext => ({
  topology: { type: 'standard', level: 'RAID5' },
  volumetry: vol(),
  sustainability: sus(),
  hasResilienceResult: false,
  hasBackup: false,
  ...over,
})

describe('shouldShowKpi', () => {
  it('always shows usable, efficiency, peakIops, annualEnergy', () => {
    const c = ctx()
    expect(shouldShowKpi('usable', c)).toBe(true)
    expect(shouldShowKpi('efficiency', c)).toBe(true)
    expect(shouldShowKpi('peakIops', c)).toBe(true)
    expect(shouldShowKpi('annualEnergy', c)).toBe(true)
  })
  it('hides effective for RAID (effective === usable, no compression/dedup)', () => {
    expect(shouldShowKpi('effective', ctx())).toBe(false)
  })
  it('shows effective for ZFS when effective differs from usable', () => {
    const c = ctx({
      topology: { type: 'zfs', level: 'raidz2' },
      volumetry: vol({ usableCapacity: 900, effectiveCapacity: 1500 }),
    })
    expect(shouldShowKpi('effective', c)).toBe(true)
  })
  it('shows survival only when a simulation result exists', () => {
    expect(shouldShowKpi('survival', ctx({ hasResilienceResult: false }))).toBe(false)
    expect(shouldShowKpi('survival', ctx({ hasResilienceResult: true }))).toBe(true)
  })
})

describe('shouldShowSection', () => {
  it('hides zfsDetails unless zfsDetails present', () => {
    const noZfs: SectionContext = {
      topology: { type: 'standard', level: 'RAID5' },
      volumetry: vol(),
    }
    expect(shouldShowSection('zfsDetails', noZfs)).toBe(false)
    const c: SectionContext = {
      topology: { type: 'zfs', level: 'raidz2' },
      volumetry: vol({ zfsDetails: {} as never }),
    }
    expect(shouldShowSection('zfsDetails', c)).toBe(true)
  })
  it('hides longhornDetails unless longhornDetails present', () => {
    const c: SectionContext = {
      topology: { type: 'longhorn', level: 'longhorn_r3' },
      volumetry: vol({ longhornDetails: {} as never }),
    }
    expect(shouldShowSection('longhornDetails', c)).toBe(true)
    const noLonghorn: SectionContext = {
      topology: { type: 'standard', level: 'RAID5' },
      volumetry: vol(),
    }
    expect(shouldShowSection('longhornDetails', noLonghorn)).toBe(false)
  })
  it('shows backup only when hasBackup', () => {
    expect(shouldShowSection('backup', { hasBackup: true })).toBe(true)
    expect(shouldShowSection('backup', { hasBackup: false })).toBe(false)
  })
  it('always shows the four core acts', () => {
    for (const s of ['capacity', 'performance', 'resilience', 'cost', 'takeaway'] as const) {
      expect(shouldShowSection(s, {})).toBe(true)
    }
  })
})
