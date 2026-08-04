import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * i18n key-parity test.
 *
 * Guards against translation namespace files drifting out of sync with the
 * `en` reference: missing keys render as raw i18n keys on screen, and orphan
 * keys (present in a translation but absent from `en`) are dead weight,
 * usually left behind by a typo or a removed feature.
 *
 * The locale/namespace lists are discovered from disk, not hand-listed, so
 * adding a locale or namespace file automatically gets covered.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, '..', '..', 'src', 'i18n', 'locales')

const REFERENCE_LOCALE = 'en'
const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const namespaces = readdirSync(join(LOCALES_DIR, REFERENCE_LOCALE))
  .filter((file) => file.endsWith('.json'))
  .sort()

const targetLocales = locales.filter((locale) => locale !== REFERENCE_LOCALE)

type JsonObject = Record<string, unknown>

const loadNamespace = (locale: string, namespace: string): JsonObject =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, namespace), 'utf-8'))

/** Recursively collects dotted key paths for every leaf value in the object. */
const flattenKeys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value && typeof value === 'object' && !Array.isArray(value)
      ? flattenKeys(value as object, path)
      : [path]
  })

/** Recursively collects dotted key paths mapped to their leaf string value. */
const flattenEntries = (obj: object, prefix = ''): Record<string, unknown> =>
  Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(acc, flattenEntries(value as object, path))
    } else {
      acc[path] = value
    }
    return acc
  }, {})

const PLACEHOLDER_PATTERN = /\{\{\s*[\w-]+\s*\}\}/g

/** Extracts the set of `{{placeholder}}` tokens present in a string value. */
const extractPlaceholders = (value: unknown): string[] =>
  typeof value === 'string' ? (value.match(PLACEHOLDER_PATTERN) ?? []) : []

describe('i18n key parity against en reference', () => {
  it.each(targetLocales)('%s has no locale-specific namespace files missing', (locale) => {
    const localeNamespaces = readdirSync(join(LOCALES_DIR, locale))
      .filter((file) => file.endsWith('.json'))
      .sort()
    expect(localeNamespaces).toEqual(namespaces)
  })

  for (const namespace of namespaces) {
    describe(namespace, () => {
      const enKeys = new Set(flattenKeys(loadNamespace(REFERENCE_LOCALE, namespace)))

      it.each(targetLocales)('%s has every en key (no missing keys)', (locale) => {
        const localeKeys = new Set(flattenKeys(loadNamespace(locale, namespace)))
        const missing = [...enKeys].filter((key) => !localeKeys.has(key))
        if (missing.length > 0) {
          const list = missing.map((key) => `${locale}/${namespace}: ${key}`).join('\n')
          throw new Error(`Missing ${missing.length} key(s):\n${list}`)
        }
      })

      it.each(targetLocales)('%s has no orphan keys absent from en', (locale) => {
        const localeKeys = new Set(flattenKeys(loadNamespace(locale, namespace)))
        const orphans = [...localeKeys].filter((key) => !enKeys.has(key))
        if (orphans.length > 0) {
          const list = orphans.map((key) => `${locale}/${namespace}: ${key}`).join('\n')
          throw new Error(`Found ${orphans.length} orphan key(s) not present in en:\n${list}`)
        }
      })

      it.each(
        targetLocales,
      )('%s preserves every {{placeholder}} present in the en value', (locale) => {
        const enEntries = flattenEntries(loadNamespace(REFERENCE_LOCALE, namespace))
        const localeEntries = flattenEntries(loadNamespace(locale, namespace))
        const problems: string[] = []

        for (const [key, enValue] of Object.entries(enEntries)) {
          const enPlaceholders = new Set(extractPlaceholders(enValue))
          if (enPlaceholders.size === 0) continue

          const localeValue = localeEntries[key]
          const localePlaceholders = new Set(extractPlaceholders(localeValue))
          const missing = [...enPlaceholders].filter((p) => !localePlaceholders.has(p))
          if (missing.length > 0) {
            problems.push(`${locale}/${namespace}: ${key} missing ${missing.join(', ')}`)
          }
        }

        if (problems.length > 0) {
          throw new Error(
            `Found ${problems.length} value(s) with dropped/mangled placeholder(s):\n${problems.join('\n')}`,
          )
        }
      })
    })
  }
})
