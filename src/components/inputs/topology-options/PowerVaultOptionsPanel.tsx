/**
 * Dell PowerVault ME5 options — mid-range block storage.
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 *
 * There are no configurable options: all five this once rendered (model, controllers, tiering,
 * SSD read cache, thin provisioning) changed no computed figure, and each said so in its own
 * hint text. The whole `PowerVaultOptions` object went with them in the 2026-08-05 relevance
 * sweep. What remains is a description of the selected level and one capability note.
 */

import { useTranslation } from 'react-i18next'
import type { Topology } from '@/types'
import { OptionsSection } from './dellShared'

type PowerVaultLevel = Extract<Topology, { type: 'powervault' }>['level']

/**
 * i18n keys per level, exhaustive so a new level cannot silently render an empty box (#142).
 *
 * The paths are written out in FULL rather than assembled from the level name, deliberately: the
 * orphan-key test scans the source for literal keys, and a template like
 * `` t(`powervault.level.${key}.body`) `` is invisible to it. Written this way the scan sees every
 * key, so deleting a level's translations without deleting its entry here fails the suite —
 * which is the same reason `topologyConstants.ts` spells its keys out.
 *
 * The RAID names and `ADAPT` live in the locale files' `title` rather than being hardcoded here.
 * They are technical terms, but they sit inside a sentence whose order a translator may need to
 * change.
 */
const LEVEL_KEYS: Record<PowerVaultLevel, { title: string; body: string }> = {
  powervault_raid1: {
    title: 'powervault.level.raid1.title',
    body: 'powervault.level.raid1.body',
  },
  powervault_raid5: {
    title: 'powervault.level.raid5.title',
    body: 'powervault.level.raid5.body',
  },
  powervault_raid6: {
    title: 'powervault.level.raid6.title',
    body: 'powervault.level.raid6.body',
  },
  powervault_raid10: {
    title: 'powervault.level.raid10.title',
    body: 'powervault.level.raid10.body',
  },
  powervault_adapt: {
    title: 'powervault.level.adapt.title',
    body: 'powervault.level.adapt.body',
  },
}

export function PowerVaultOptionsPanel({
  topology,
}: {
  topology: Extract<Topology, { type: 'powervault' }>
}) {
  const { t } = useTranslation('topology')
  const keys = LEVEL_KEYS[topology.level]

  return (
    <OptionsSection title={t('powervault.title')}>
      <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
        <p>
          <strong className="text-slate-600 dark:text-slate-300">{t(keys.title)}</strong>{' '}
          {t(keys.body)}
        </p>
      </div>

      <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg text-xs text-amber-300">
        <strong>{t('powervault.noDataReduction.label')}</strong>{' '}
        {t('powervault.noDataReduction.body')}
      </div>
    </OptionsSection>
  )
}
