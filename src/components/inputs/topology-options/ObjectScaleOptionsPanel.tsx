/**
 * Dell ObjectScale options — S3 object storage on erasure coding.
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 */

import { useTranslation } from 'react-i18next'
import { Label, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import { DataReductionControl, OptionsSection } from './dellShared'

export function ObjectScaleOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { objectscaleOptions, setObjectScaleOptions } = useConfigStore()

  return (
    <OptionsSection title={t('objectscale.title')}>
      <div className="space-y-2">
        <Label htmlFor="objectscale-overhead" tooltip={th('dell.objectScale')}>
          {t('common.systemOverhead')}
        </Label>
        <Slider
          id="objectscale-overhead"
          value={objectscaleOptions.systemOverheadPercent}
          min={10}
          max={15}
          onChange={(v) => setObjectScaleOptions({ systemOverheadPercent: v })}
          formatValue={(v) => `${v}%`}
        />
      </div>

      <DataReductionControl
        idPrefix="objectscale"
        kind="compression"
        enabled={objectscaleOptions.compression}
        ratio={objectscaleOptions.compressionRatio}
        onToggle={(v) => setObjectScaleOptions({ compression: v })}
        onRatio={(v) => setObjectScaleOptions({ compressionRatio: v })}
      />
    </OptionsSection>
  )
}
