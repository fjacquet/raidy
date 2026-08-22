import { describe, expect, it } from 'vitest'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
import type { PowerScaleOptions, PowerScaleTier } from '@/types/topology'

// F200 has 4 drives/node, A200 has 15.
const f200Tier: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 6,
  protection: '+2d:1n',
  vhsDriveCount: 2,
  vhsPercent: 0,
}
const a200Tier: PowerScaleTier = {
  nodeModel: 'A200',
  driveSizeTb: 8,
  nodeCount: 12,
  protection: '+2n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}
const twoTier: PowerScaleOptions = { tiers: [f200Tier, a200Tier] }

describe('powerScaleDriveTotals', () => {
  it('reports the first tier for per-pool engines', () => {
    const t = powerScaleDriveTotals(twoTier)
    expect(t.firstTierNodes).toBe(6)
    expect(t.firstTierDrives).toBe(24) // 6 nodes x 4 drives
    expect(t.firstTierSpareDrives).toBe(2)
  })

  it('sums every tier for cluster-wide engines', () => {
    const t = powerScaleDriveTotals(twoTier)
    expect(t.clusterNodes).toBe(18) // 6 + 12
    expect(t.clusterDrives).toBe(204) // 24 + 180
  })

  it('ignores tiers naming an unknown model rather than counting them as zero-drive nodes', () => {
    const t = powerScaleDriveTotals({
      tiers: [f200Tier, { ...a200Tier, nodeModel: 'NOPE' }],
    })
    expect(t.clusterNodes).toBe(6)
    expect(t.clusterDrives).toBe(24)
  })

  it('returns zeroes for an empty tier list rather than throwing', () => {
    const t = powerScaleDriveTotals({ tiers: [] })
    expect(t).toEqual({
      firstTierDrives: 0,
      firstTierNodes: 0,
      firstTierSpareDrives: 0,
      firstTier: undefined,
      clusterDrives: 0,
      clusterNodes: 0,
    })
  })

  it('reports the SAME tier object the population came from, not tiers[0] re-indexed', () => {
    // The second tier is the first one sizeTier can actually size (see the next test); firstTier
    // must point at IT, not literally options.tiers[0].
    const unsizeable: PowerScaleTier = { ...f200Tier, nodeCount: 3, protection: '+4n' } // F200 does not publish +4n below 9 nodes
    const t = powerScaleDriveTotals({ tiers: [unsizeable, a200Tier] })
    expect(t.firstTier).toBe(a200Tier)
    expect(t.firstTierNodes).toBe(12)
  })

  it('drops a tier naming a KNOWN model but an unpublished protection/node-count combination — fix round 1, item 3', () => {
    // F200 at 3 nodes does not publish +4n (needs >= 9 nodes — see powerscaleCatalog fixture
    // data). getModel('F200') resolves fine, so the pre-fix getModel-only check would have
    // counted this tier's 3 x 4 = 12 drives toward power/CO2/TCO while volumetry (which already
    // goes through sizeTier) contributed 0 TB for the identical tier — the "confidently wrong on
    // a dashboard that looks correct" failure this fix closes.
    const unsizeable: PowerScaleTier = {
      nodeModel: 'F200',
      driveSizeTb: 1.92,
      nodeCount: 3,
      protection: '+4n',
      vhsDriveCount: 0,
      vhsPercent: 0,
    }
    const t = powerScaleDriveTotals({ tiers: [unsizeable, a200Tier] })
    // The unsizeable tier contributes NOTHING — not even its 3 nodes/12 drives — to the cluster
    // totals, and does not become the first tier.
    expect(t.clusterNodes).toBe(12) // a200Tier only, NOT 3 + 12 = 15
    expect(t.clusterDrives).toBe(180) // a200Tier only (12 x 15), NOT 12 + 180 = 192
    expect(t.firstTier).toBe(a200Tier)
    expect(t.firstTierNodes).toBe(12)
  })
})
