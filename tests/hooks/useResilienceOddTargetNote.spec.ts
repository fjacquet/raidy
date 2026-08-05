/**
 * Issue #68: an odd BeeGFS storage-target count makes buddy mirroring withhold credit
 * entirely (see `isBuddyMirroredGroup` in `resilienceWorker.ts`), which produces a visible
 * survival discontinuity — a 5-target cluster reports worse survival than a 4-target one.
 * Rather than changing the (deliberately conservative) simulation model, the resilience panel
 * shows an explanatory note. `isOddTargetCountNoBuddyCredit` is the predicate that gates it,
 * mirroring the worker's own `isBuddyMirroredGroup` condition so the note only appears exactly
 * when the worker actually withheld credit.
 */
import { describe, expect, it } from 'vitest'
import { isOddTargetCountNoBuddyCredit } from '@/hooks/useResilience'
import type { Topology } from '@/types/topology'

const beegfsRaid6: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
const beegfsRaid10: Topology = { type: 'beegfs', level: 'beegfs_raid10' }
const beegfsSingle: Topology = { type: 'beegfs', level: 'beegfs_single' }
const standardRaid50: Topology = { type: 'standard', level: 'RAID50' }

describe('isOddTargetCountNoBuddyCredit', () => {
  it('is true for a BeeGFS group level with buddy mirroring on and an odd target count', () => {
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid6, 2, 3)).toBe(true)
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid10, 2, 5)).toBe(true)
  })

  it('is false for the same configuration with an even target count', () => {
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid6, 2, 4)).toBe(false)
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid10, 2, 2)).toBe(false)
  })

  it('is false when buddy mirroring is not requested, regardless of parity', () => {
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid6, 0, 3)).toBe(false)
  })

  it('is false for beegfs_single: it has no group-topology buddy cliff (mirror path instead)', () => {
    expect(isOddTargetCountNoBuddyCredit(beegfsSingle, 2, 3)).toBe(false)
  })

  it('is false for a non-BeeGFS platform even with an odd group count', () => {
    expect(isOddTargetCountNoBuddyCredit(standardRaid50, 2, 3)).toBe(false)
  })

  it('is true even for a single-target cluster (serverCount 1): the worker withholds credit identically — 1 is odd', () => {
    expect(isOddTargetCountNoBuddyCredit(beegfsRaid6, 2, 1)).toBe(true)
  })
})
