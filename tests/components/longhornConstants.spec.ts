import { describe, expect, it } from 'vitest'
import {
  TOPOLOGY_LEVELS,
  TOPOLOGY_TYPES,
} from '@/components/inputs/topology-options/topologyConstants'

describe('Longhorn topology constants', () => {
  it('exposes Longhorn in the type selector', () => {
    expect(TOPOLOGY_TYPES.some((t) => t.value === 'longhorn')).toBe(true)
  })

  it('defines exactly the two replica levels', () => {
    const values = TOPOLOGY_LEVELS.longhorn.map((l) => l.value)
    expect(values).toEqual(['longhorn_r2', 'longhorn_r3'])
  })
})
