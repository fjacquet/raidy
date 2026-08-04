import { describe, expect, it } from 'vitest'
import {
  TOPOLOGY_LEVELS,
  TOPOLOGY_TYPES,
} from '@/components/inputs/topology-options/topologyConstants'

describe('BeeGFS topology constants', () => {
  it('exposes BeeGFS in the type selector', () => {
    expect(TOPOLOGY_TYPES.some((t) => t.value === 'beegfs')).toBe(true)
  })

  it('defines exactly the four levels, RAID6 first (the sane default)', () => {
    const values = TOPOLOGY_LEVELS.beegfs.map((l) => l.value)
    expect(values).toEqual(['beegfs_raid6', 'beegfs_raid10', 'beegfs_raidz2', 'beegfs_single'])
  })
})
