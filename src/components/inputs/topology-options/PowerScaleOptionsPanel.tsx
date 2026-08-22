/**
 * Dell PowerScale options — a cluster of 1-8 node pools (tiers).
 *
 * PowerScale clusters are heterogeneous by design: all-flash over hybrid over archive, under one
 * OneFS namespace. Protection, stripe width and neighborhood splitting are all per node pool, so
 * each tier is configured and sized on its own and the cluster is their sum. That is why this
 * panel carries no compression, dedup or snapshot-reserve control: the data-reduction ratio is a
 * published property of each node model in Dell's catalog, and PowerSizer reserves nothing for
 * snapshots.
 */

import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@/store'
import { POWERSCALE_MAX_TIERS } from '@/types'
import { OptionsSection } from './dellShared'
import { PowerScaleTierRow } from './PowerScaleTierRow'

export function PowerScaleOptionsPanel() {
  const { t } = useTranslation('topology')
  const tiers = useConfigStore((state) => state.powerscaleOptions.tiers)
  const addPowerScaleTier = useConfigStore((state) => state.addPowerScaleTier)

  return (
    <OptionsSection title={t('powerscale.title')}>
      {tiers.map((tier, index) => (
        <PowerScaleTierRow
          // A tier has no id, and every field a row shows is read from the store by index — the
          // row holds no local state a reorder could strand, so position IS the identity here.
          // biome-ignore lint/suspicious/noArrayIndexKey: position is the tier's identity
          key={`powerscale-tier-${index}`}
          tier={tier}
          index={index}
          canRemove={tiers.length > 1}
          canMoveUp={index > 0}
          canMoveDown={index < tiers.length - 1}
        />
      ))}

      <button
        type="button"
        onClick={addPowerScaleTier}
        disabled={tiers.length >= POWERSCALE_MAX_TIERS}
        aria-label={t('powerscale.tier.add')}
        className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-slate-300 dark:border-surface-600 text-slate-600 dark:text-slate-300 hover:border-primary-500 disabled:opacity-40"
      >
        {t('powerscale.tier.add')}
      </button>
    </OptionsSection>
  )
}
