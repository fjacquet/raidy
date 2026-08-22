/**
 * The URL schema's closed unions must reject forged values rather than letting them reach a
 * lookup table, miss, and fall back — a silently wrong calculation is worse than a rejected
 * link. Each enum derives from the same `as const` array the TypeScript type derives from, so
 * the schema and the lookup tables cannot drift apart.
 */

import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTROLLER_OPTIONS, DEFAULT_POWERSCALE_TIER } from '@/types'
import {
  BLOCK_SIZES,
  CARBON_REGIONS,
  FS_TYPES,
  NETWORK_SPEEDS,
  PCIE_GENS,
  PCIE_LANES,
} from '@/types/config'
import { CONTROLLER_TYPES, type PowerScaleProtection } from '@/types/topology'
import { validateUrlState } from '@/utils/schemas'

const VALID_CONTROLLER_OPTIONS = DEFAULT_CONTROLLER_OPTIONS

const POWERSCALE_PROTECTIONS: PowerScaleProtection[] = [
  '+1n',
  '+2n',
  '+3n',
  '+4n',
  '+2d:1n',
  '+3d:1n',
  '+3d:1n1d',
  '+4d:1n',
  '+4d:2n',
]

describe('URL schema closed enums', () => {
  const rootCases = [
    { field: 'blockSize', values: BLOCK_SIZES },
    { field: 'networkSpeed', values: NETWORK_SPEEDS },
    { field: 'pcieGen', values: PCIE_GENS },
    { field: 'pcieLanes', values: PCIE_LANES },
    { field: 'carbonRegion', values: CARBON_REGIONS },
    { field: 'fsType', values: FS_TYPES },
  ] as const

  for (const { field, values } of rootCases) {
    it(`accepts every declared ${field} value`, () => {
      expect(values.length).toBeGreaterThan(1)
      for (const value of values) {
        expect(validateUrlState({ [field]: value })).toEqual({ [field]: value })
      }
    })

    it(`rejects a forged ${field} value`, () => {
      expect(validateUrlState({ [field]: 'not-a-real-value' })).toBeNull()
    })
  }

  it('accepts every declared controller value', () => {
    expect(CONTROLLER_TYPES.length).toBeGreaterThan(1)
    for (const controller of CONTROLLER_TYPES) {
      const state = { controllerOptions: { ...VALID_CONTROLLER_OPTIONS, controller } }
      expect(validateUrlState(state)).not.toBeNull()
    }
  })

  it('rejects a forged controller value', () => {
    const state = {
      controllerOptions: { ...VALID_CONTROLLER_OPTIONS, controller: 'not-a-controller' },
    }
    expect(validateUrlState(state)).toBeNull()
  })

  it('accepts only the collapsed powerscale_onefs topology level', () => {
    expect(
      validateUrlState({ topology: { type: 'powerscale', level: 'powerscale_onefs' } }),
    ).not.toBeNull()
    expect(
      validateUrlState({ topology: { type: 'powerscale', level: 'powerscale_n2' } }),
    ).toBeNull()
  })

  it('accepts every declared powerscale tier protection value', () => {
    expect(POWERSCALE_PROTECTIONS.length).toBeGreaterThan(1)
    for (const protection of POWERSCALE_PROTECTIONS) {
      const state = {
        powerscaleOptions: { tiers: [{ ...DEFAULT_POWERSCALE_TIER, protection }] },
      }
      expect(validateUrlState(state)).not.toBeNull()
    }
  })

  it('rejects a forged powerscale tier protection value', () => {
    const state = {
      powerscaleOptions: {
        tiers: [{ ...DEFAULT_POWERSCALE_TIER, protection: '+9n' }],
      },
    }
    expect(validateUrlState(state)).toBeNull()
  })

  it('rejects a powerscale tier node count below the schema floor of 3', () => {
    const state = {
      powerscaleOptions: {
        tiers: [{ ...DEFAULT_POWERSCALE_TIER, nodeCount: 2 }],
      },
    }
    expect(validateUrlState(state)).toBeNull()
  })
})
