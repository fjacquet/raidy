import { describe, expect, it } from 'vitest'
import {
  backupApplies,
  type RelevanceContext,
  type SectionContext,
  shouldShowKpi,
  shouldShowSection,
} from '@/engines/outputRelevance'
import type { SustainabilityResult, VolumetryResult } from '@/types/results'
import type { Topology } from '@/types/topology'

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
  it('hides beegfsDetails unless beeGfsDetails present', () => {
    // Vary ONE thing at a time. The earlier version flipped topology AND details together, so
    // deleting the `beeGfsDetails != null` conjunct from outputRelevance.ts left it green.
    const both: SectionContext = {
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      volumetry: vol({ beeGfsDetails: {} as never }),
    }
    expect(shouldShowSection('beegfsDetails', both)).toBe(true)

    // Right topology, no details — isolates the `beeGfsDetails != null` conjunct.
    const noDetails: SectionContext = {
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      volumetry: vol(),
    }
    expect(shouldShowSection('beegfsDetails', noDetails)).toBe(false)

    // Details present, wrong topology — isolates the topology conjunct.
    const wrongTopology: SectionContext = {
      topology: { type: 'standard', level: 'RAID5' },
      volumetry: vol({ beeGfsDetails: {} as never }),
    }
    expect(shouldShowSection('beegfsDetails', wrongTopology)).toBe(false)
  })
  it('shows backup only when hasBackup', () => {
    const raid: Topology = { type: 'standard', level: 'RAID5' }
    expect(shouldShowSection('backup', { topology: raid, hasBackup: true })).toBe(true)
    expect(shouldShowSection('backup', { topology: raid, hasBackup: false })).toBe(false)
  })

  /**
   * The Advanced panel hides `backupRetention` and `dailyChangeRate` for PowerScale, so a backup
   * card here would report a figure derived from two values the user can neither see nor change —
   * the same orphaned-dependency defect this branch has already fixed twice. Input visibility and
   * output visibility are one decision, made in one place: `backupApplies`.
   */
  it('hides backup for PowerScale even when a result exists', () => {
    const powerscale: Topology = { type: 'powerscale', level: 'powerscale_onefs' }
    expect(shouldShowSection('backup', { topology: powerscale, hasBackup: true })).toBe(false)
    expect(backupApplies(powerscale)).toBe(false)
    expect(backupApplies({ type: 'standard', level: 'RAID5' })).toBe(true)
  })

  /**
   * A missing topology must not be read as "not PowerScale". The section is opt-in: an act that
   * forgets to pass its topology gets no backup card rather than a silently unguarded one.
   */
  it('hides backup when the caller passes no topology', () => {
    expect(shouldShowSection('backup', { hasBackup: true })).toBe(false)
  })
  it('always shows the four core acts', () => {
    for (const s of ['capacity', 'performance', 'resilience', 'cost', 'takeaway'] as const) {
      expect(shouldShowSection(s, {})).toBe(true)
    }
  })
})
