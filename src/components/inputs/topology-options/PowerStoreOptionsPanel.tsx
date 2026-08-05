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
 * Hint under the model selector. `custom` has no entry — its hint interpolates the user's own
 * overhead value, so it is built at render rather than looked up.
 */
const MODEL_HINTS: Record<string, string> = {
  powerstore_3200: '3200: Entry-level, 5% system overhead',
  powerstore_5200t: '5200T: All-flash T-Series, 7% system overhead',
  powerstore_5200q: '5200Q: Quad-controller, 5% system overhead (Dell Sizer reference)',
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
          {MODEL_HINTS[powerstoreOptions.model] ??
            `Custom: ${powerstoreOptions.systemOverheadPercent}% user-specified`}
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
