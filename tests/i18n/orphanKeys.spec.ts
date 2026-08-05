/**
 * Every translation key must be reachable from the source, or be covered by a documented
 * dynamic prefix.
 *
 * The failure mode this guards is quiet. i18next renders a missing key's own name rather than
 * throwing, so a wrongly deleted key ships as the literal text `formFactor.u2` on screen, in a
 * language the developer may not read, with every other test still green.
 *
 * That is also why a naive scan cannot be trusted to delete: sixteen call sites assemble keys at
 * runtime, and the first scan run against this codebase condemned `formFactor.u2`, `.e3s` and
 * `.m2`, all three of them live. Each prefix below names the call site that builds it and the set
 * that feeds it, so an exemption is a recorded fact rather than a shrug.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Same discovery pattern as parity.spec.ts next door: node:fs, no glob library.
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'src', 'i18n', 'locales')

/**
 * Key prefixes assembled at runtime. A key under one of these is exempt from the literal scan
 * because the scan structurally cannot see it — not because nobody checked.
 */
const DYNAMIC_PREFIXES: Record<string, string> = {
  'connectivity.': 'HardwarePanel.tsx — t(`connectivity.${value}`) over CONNECTIVITY_VALUES',
  'formFactor.': 'HardwarePanel.tsx — t(`formFactor.${value}`) over FORM_FACTOR_VALUES',
  'tiering.s2d.': 'TieringPanel.tsx — t(`tiering.${platform}.*`)',
  'tiering.vsan.': 'TieringPanel.tsx — t(`tiering.${platform}.*`)',
  'tiering.ceph.': 'TieringPanel.tsx — t(`tiering.${platform}.*`)',
  'tiering.beegfs.': 'TieringPanel.tsx — t(`tiering.${platform}.*`)',
  'carbon.regions.': 'Header.tsx — t(`carbon.regions.${region}`)',
  'theme.': 'ThemeToggle.tsx — t(`theme.${pref}`)',
  'resilience.process.': 'ResilienceGuide.tsx — t(`resilience.process.${step}`)',
  'capacity.beegfs.statusValue.':
    'BeeGfsCapacityDetails.tsx — t(`capacity.beegfs.statusValue.${status}`)',
  'pptx.labels.': 'pptxContent.ts — t(`output:pptx.labels.${key}`)',
}

/**
 * Whole namespaces reached through a wrapper taking an arbitrary key. Call sites pass literals,
 * so most keys still appear in the scan — but the wrapper means a key can be reached without its
 * full path ever being written out, so the namespace is exempt as a whole.
 */
const DYNAMIC_NAMESPACES: Record<string, string> = {
  validation: 'validators.ts — i18n.t(`validation:${key}`) via the tv() wrapper',
  pdf: 'exportPdf.ts — i18n.t(`pdf:${key}`) via its t() wrapper',
}

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, key) : [key]
  })
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectSourceFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const SOURCE = collectSourceFiles(join(REPO_ROOT, 'src'))
  .map((f) => readFileSync(f, 'utf-8'))
  .join('\n')

const NAMESPACES = readdirSync(join(LOCALES_DIR, 'en'))
  .filter((f) => f.endsWith('.json'))
  .sort()

describe('every translation key is reachable', () => {
  for (const nsFile of NAMESPACES) {
    const ns = nsFile.replace('.json', '')
    if (ns in DYNAMIC_NAMESPACES) continue

    it(`${ns} has no orphan keys`, () => {
      const keys = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, 'en', nsFile), 'utf-8')))
      const orphans = keys.filter((key) => {
        if (Object.keys(DYNAMIC_PREFIXES).some((p) => key.startsWith(p))) return false
        const leaf = key.split('.').pop() ?? key
        // Full path, or the leaf as a quoted literal — `t('capacity.title')` and the
        // `t('title')` form a namespaced `useTranslation('x')` produces both count.
        return !SOURCE.includes(key) && !SOURCE.includes(`'${leaf}'`)
      })

      expect(
        orphans,
        `Orphan keys in ${ns}. Either delete them from all four locales, or — if a key is ` +
          `assembled at runtime — add its prefix to DYNAMIC_PREFIXES with the call site that ` +
          `builds it.`,
      ).toEqual([])
    })
  }
})
