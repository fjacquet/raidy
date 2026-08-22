import { describe, expect, it } from 'vitest'
import { migratePowerScaleState } from '@/store/urlStorage'

describe('migratePowerScaleState', () => {
  it('leaves non-PowerScale state untouched', () => {
    const state = { topology: { type: 'zfs', level: 'raidz2' } }
    expect(migratePowerScaleState(state)).toBe(state)
  })

  it('collapses the old level and seeds one tier', () => {
    const migrated = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_n2' },
      serverCount: 12,
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 15,
    }) as { topology: { level: string }; powerscaleOptions: { tiers: unknown[] } }

    expect(migrated.topology.level).toBe('powerscale_onefs')
    expect(migrated.powerscaleOptions.tiers).toHaveLength(1)
    expect(migrated.powerscaleOptions.tiers[0]).toMatchObject({
      nodeCount: 12,
      protection: '+2n',
    })
  })

  it('maps every old level to its real protection', () => {
    const cases: [string, string][] = [
      ['powerscale_n1', '+1n'],
      ['powerscale_n2', '+2n'],
      ['powerscale_n2_1', '+2d:1n'],
      ['powerscale_n3', '+3n'],
      ['powerscale_n4', '+4n'],
    ]
    for (const [level, protection] of cases) {
      const m = migratePowerScaleState({
        topology: { type: 'powerscale', level },
        serverCount: 10,
      }) as { powerscaleOptions: { tiers: { protection: string }[] } }
      expect(m.powerscaleOptions.tiers[0]?.protection).toBe(protection)
    }
  })

  it('falls back to the suggested protection for the removed mirror levels', () => {
    const m = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_mirror_3x' },
      serverCount: 10,
    }) as { powerscaleOptions: { tiers: { protection: string }[] } }
    expect(m.powerscaleOptions.tiers[0]?.protection).toMatch(/^\+/)
  })

  it('clamps a migrated node count into the model bounds', () => {
    const m = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_n2' },
      serverCount: 1,
    }) as { powerscaleOptions: { tiers: { nodeCount: number }[] } }
    expect(m.powerscaleOptions.tiers[0]?.nodeCount).toBeGreaterThanOrEqual(3)
  })
})
