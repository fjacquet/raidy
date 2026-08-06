/**
 * The preset buttons are data now, and two things about that data are load-bearing.
 *
 * Every `labelKey` must resolve in all four locales: react-i18next renders a missing key as its
 * own name, so a typo ships the literal text `presets.aiTraining` on screen — in a language the
 * author may not read, with every other test green.
 *
 * Every topology must map to a non-empty class list, or its panel renders an empty grid. The
 * `Record<TopologyType, …>` catches an omitted platform at compile time; this catches an empty
 * array, which the type system permits.
 */

import { describe, expect, it } from 'vitest'
import {
  isHpcTopology,
  profilesForTopology,
  TOPOLOGY_PROFILE_CLASSES,
  WORKLOAD_PROFILES,
} from '@/data/workloadProfiles'
import de from '@/i18n/locales/de/workload.json'
import en from '@/i18n/locales/en/workload.json'
import fr from '@/i18n/locales/fr/workload.json'
import itLocale from '@/i18n/locales/it/workload.json'
import { BLOCK_SIZES } from '@/types/config'
import type { TopologyType } from '@/types/topology'

const LOCALES: Record<string, unknown> = { en, fr, de, it: itLocale }

/** Resolves 'presets.aiTraining' against a parsed locale file. */
function lookup(bundle: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      bundle,
    )
}

describe('workload profile catalogue', () => {
  it('holds well-formed values', () => {
    for (const p of WORKLOAD_PROFILES) {
      expect(p.readPercent).toBeGreaterThanOrEqual(0)
      expect(p.readPercent).toBeLessThanOrEqual(100)
      expect(p.randomPercent).toBeGreaterThanOrEqual(0)
      expect(p.randomPercent).toBeLessThanOrEqual(100)
      expect(BLOCK_SIZES).toContain(p.blockSize)
    }
  })

  it('has unique ids', () => {
    const ids = WORKLOAD_PROFILES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves every label in all four locales', () => {
    for (const p of WORKLOAD_PROFILES) {
      for (const [lang, bundle] of Object.entries(LOCALES)) {
        const value = lookup(bundle, p.labelKey)
        expect(typeof value, `${lang} is missing ${p.labelKey}`).toBe('string')
        expect(String(value).length).toBeGreaterThan(0)
      }
    }
  })

  it('gives every topology at least one profile', () => {
    for (const type of Object.keys(TOPOLOGY_PROFILE_CLASSES) as TopologyType[]) {
      expect(TOPOLOGY_PROFILE_CLASSES[type].length).toBeGreaterThan(0)
      expect(profilesForTopology(type).length).toBeGreaterThan(0)
    }
  })

  it('gives BeeGFS the HPC profiles and no general ones', () => {
    const ids = profilesForTopology('beegfs').map((p) => p.id)
    expect(ids).toContain('aiTraining')
    expect(ids).toContain('aiCheckpointing')
    expect(ids).not.toContain('database')
    expect(isHpcTopology('beegfs')).toBe(true)
  })

  it('leaves standard RAID with the general profiles only', () => {
    const ids = profilesForTopology('standard').map((p) => p.id)
    expect(ids).toContain('database')
    expect(ids).toContain('fileServer')
    expect(ids).not.toContain('aiTraining')
    expect(isHpcTopology('standard')).toBe(false)
  })
})
