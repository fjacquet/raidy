/**
 * Dell PowerStore options — mid-range block storage.
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { PowerStoreOptions } from '@/types'
import { POWERSTORE_MODEL_OVERHEAD } from '@/types'
import { DataReductionControl, OptionsSection, SnapshotReserveSlider } from './dellShared'

/** Model presets write `systemOverheadPercent`; `custom` leaves the user's own value alone. */
const MODEL_OPTIONS = [
  { value: 'powerstore_3200', label: '3200' },
  { value: 'powerstore_5200q', label: '5200Q' },
  { value: 'powerstore_5200t', label: '5200T' },
  { value: 'custom', label: 'Custom' },
]

/**
 * i18n key suffix for the hint under the model selector (#142). `custom` has no entry — its hint
 * interpolates the user's own overhead value, so it goes through i18next interpolation at render
 * rather than a lookup. Concatenating it would leave a translator unable to reorder the number,
 * which German and Italian need.
 */
const MODEL_HINT_KEYS: Record<string, string> = {
  powerstore_3200: 'model3200',
  powerstore_5200t: 'model5200t',
  powerstore_5200q: 'model5200q',
}

export function PowerStoreOptionsPanel() {
  const { t } = useTranslation('topology')
  const { powerstoreOptions, setPowerStoreOptions } = useConfigStore()

  return (
    <OptionsSection title={t('powerstore.title')}>
      <div className="space-y-2">
        <Label>{t('powerstore.model')}</Label>
        <SegmentedControl
          value={powerstoreOptions.model}
          options={MODEL_OPTIONS}
          onChange={(v) => {
            const model = v as PowerStoreOptions['model']
            if (model !== 'custom') {
              setPowerStoreOptions({
                model,
                systemOverheadPercent: POWERSTORE_MODEL_OVERHEAD[model],
              })
            } else {
              setPowerStoreOptions({ model })
            }
          }}
        />
        <p className="text-xs text-slate-500">
          {MODEL_HINT_KEYS[powerstoreOptions.model]
            ? t(`powerstore.hint.${MODEL_HINT_KEYS[powerstoreOptions.model]}`)
            : t('powerstore.hint.custom', { percent: powerstoreOptions.systemOverheadPercent })}
        </p>
      </div>

      <DataReductionControl
        idPrefix="powerstore"
        kind="compression"
        enabled={powerstoreOptions.compression}
        ratio={powerstoreOptions.compressionRatio}
        onToggle={(v) => setPowerStoreOptions({ compression: v })}
        onRatio={(v) => setPowerStoreOptions({ compressionRatio: v })}
      />

      <DataReductionControl
        idPrefix="powerstore"
        kind="dedup"
        enabled={powerstoreOptions.dedup}
        ratio={powerstoreOptions.dedupRatio}
        onToggle={(v) => setPowerStoreOptions({ dedup: v })}
        onRatio={(v) => setPowerStoreOptions({ dedupRatio: v })}
      />

      <SnapshotReserveSlider
        idPrefix="powerstore"
        value={powerstoreOptions.snapshotReservePercent}
        onChange={(v) => setPowerStoreOptions({ snapshotReservePercent: v })}
      />

      {powerstoreOptions.model === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor="powerstore-overhead">{t('powerstore.systemOverhead')}</Label>
          <Slider
            id="powerstore-overhead"
            value={powerstoreOptions.systemOverheadPercent}
            min={1}
            max={15}
            onChange={(v) => setPowerStoreOptions({ systemOverheadPercent: v })}
            formatValue={(v) => `${v}%`}
          />
        </div>
      )}
    </OptionsSection>
  )
}
