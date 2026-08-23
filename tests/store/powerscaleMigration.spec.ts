import { describe, expect, it } from 'vitest'
import { migratePowerScaleState } from '@/store/urlStorage'
import { validateUrlState } from '@/utils/schemas'

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

describe('migratePowerScaleState — a stale options bag under another platform', () => {
  /**
   * `omitDefaults` keeps a non-default `powerscaleOptions` in the hash even after the user
   * switches platforms, so a link shared from ZFS can still carry the retired
   * `{compression, dedup, snapshotReservePercent}` bag. Keying the migration on
   * `topology.type === 'powerscale'` left that bag unmigrated, Zod then rejected the whole
   * payload — nested `z.object()` requires its declared keys — and `getItem` turned a perfectly
   * valid ZFS link into "Invalid configuration link" plus full default state. The user loses a
   * configuration that had nothing to do with PowerScale.
   */
  const LEGACY_BAG = {
    compression: true,
    compressionRatio: 1.5,
    dedup: false,
    dedupRatio: 1,
    snapshotReservePercent: 25,
  }

  it('keeps the link and drops the bag', () => {
    const migrated = migratePowerScaleState({
      topology: { type: 'zfs', level: 'raidz2' },
      powerscaleOptions: LEGACY_BAG,
    }) as Record<string, unknown>

    expect(migrated.topology).toEqual({ type: 'zfs', level: 'raidz2' })
    expect('powerscaleOptions' in migrated).toBe(false)
    expect(validateUrlState(migrated)).not.toBeNull()
  })

  it('does not rebuild a PowerScale cluster the user navigated away from', () => {
    // The bag cannot say which node hardware it meant, and the link's own topology is ZFS.
    // Seeding a default node pool here would attach hardware the user never chose.
    const migrated = migratePowerScaleState({
      topology: { type: 'zfs', level: 'raidz2' },
      powerscaleOptions: LEGACY_BAG,
    }) as Record<string, unknown>

    expect(migrated.powerscaleOptions).toBeUndefined()
  })

  it('still migrates a real legacy PowerScale link', () => {
    const migrated = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_n2' },
      serverCount: 6,
    }) as { topology: { level: string }; powerscaleOptions: { tiers: { protection: string }[] } }

    expect(migrated.topology.level).toBe('powerscale_onefs')
    expect(migrated.powerscaleOptions.tiers).toHaveLength(1)
    expect(migrated.powerscaleOptions.tiers[0]?.protection).toBe('+2n')
  })
})
