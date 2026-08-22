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
      clusterDrives: 0,
      clusterNodes: 0,
    })
  })
})
