import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { longhornVectors } from '../../../fixtures/longhorn-vectors'
import { createVolumetryInput } from '../../../fixtures/vector-harness'

describe('Longhorn external-reference vectors', () => {
  for (const v of longhornVectors) {
    it(v.name, () => {
      const result = calculateVolumetry(
        createVolumetryInput(v.drives, v.topology, {
          serverCount: v.serverCount,
          ...v.overrides,
        }),
      )
      const deviation = Math.abs(result.usableCapacity - v.expectedUsable) / v.expectedUsable
      expect(
        deviation,
        `${v.name}: got ${result.usableCapacity}, ref ${v.expectedUsable} (${v.source})`,
      ).toBeLessThanOrEqual(v.tolerance)
    })
  }
})
