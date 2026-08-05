/**
 * Dell PowerScale options — scale-out NAS (OneFS).
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 */

import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@/store'
import { DataReductionControl, OptionsSection, SnapshotReserveSlider } from './dellShared'

export function PowerScaleOptionsPanel() {
  const { t } = useTranslation('topology')
  const { powerscaleOptions, setPowerScaleOptions } = useConfigStore()

  return (
    <OptionsSection title={t('powerscale.title')}>
      <DataReductionControl
        idPrefix="powerscale"
        kind="compression"
        enabled={powerscaleOptions.compression}
        ratio={powerscaleOptions.compressionRatio}
        onToggle={(v) => setPowerScaleOptions({ compression: v })}
        onRatio={(v) => setPowerScaleOptions({ compressionRatio: v })}
      />

      <DataReductionControl
        idPrefix="powerscale"
        kind="dedup"
        enabled={powerscaleOptions.dedup}
        ratio={powerscaleOptions.dedupRatio}
        onToggle={(v) => setPowerScaleOptions({ dedup: v })}
        onRatio={(v) => setPowerScaleOptions({ dedupRatio: v })}
      />

      <SnapshotReserveSlider
        idPrefix="powerscale"
        value={powerscaleOptions.snapshotReservePercent}
        onChange={(v) => setPowerScaleOptions({ snapshotReservePercent: v })}
      />
    </OptionsSection>
  )
}
