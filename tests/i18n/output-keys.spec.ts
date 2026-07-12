import { describe, expect, it } from 'vitest'
import de from '@/i18n/locales/de/output.json'
import en from '@/i18n/locales/en/output.json'
import fr from '@/i18n/locales/fr/output.json'
import itLocale from '@/i18n/locales/it/output.json'

const flat = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  )

const REQUIRED = [
  'headline.usable',
  'headline.effective',
  'headline.efficiency',
  'headline.peakIops',
  'headline.survival',
  'headline.annualEnergy',
  'headline.runSurvival',
  'acts.capacity',
  'acts.performance',
  'acts.resilience',
  'acts.cost',
  'acts.takeaway',
  'acts.forEngineers',
]

describe('output namespace headline/act keys', () => {
  it.each([
    ['en', en],
    ['fr', fr],
    ['de', de],
    ['it', itLocale],
  ] as const)('%s has all required keys', (_n, loc) => {
    const keys = new Set(flat(loc))
    for (const k of REQUIRED) expect(keys.has(k)).toBe(true)
  })
})
