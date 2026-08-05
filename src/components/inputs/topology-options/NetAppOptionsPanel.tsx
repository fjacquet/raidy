/**
 * NetApp ONTAP topology options panel.
 *
 * Displays configuration controls for NetApp storage systems (under proprietary topology type):
 * - Platform selection (AFF A/C-Series, FAS, ASA, E-Series)
 * - RAID type (RAID-DP/RAID-TEC)
 * - ADP (Advanced Drive Partitioning)
 * - Data reduction features
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider, Toggle } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'

export function NetAppOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { netAppOptions, setNetAppOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('netapp.title')}
      </h4>

      <div className="space-y-2">
        <Label>{t('netapp.raidType')}</Label>
        <SegmentedControl
          value={netAppOptions.raidType}
          options={[
            { value: 'raid_dp', label: 'RAID-DP' },
            { value: 'raid_tec', label: 'RAID-TEC' },
          ]}
          onChange={(v) => setNetAppOptions({ raidType: v as 'raid_dp' | 'raid_tec' })}
        />
        <p className="text-xs text-slate-500">
          {netAppOptions.raidType === 'raid_tec'
            ? 'Triple parity: Recommended for drives > 10TB'
            : 'Double parity: Standard protection'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="netapp-snapshot-reserve" tooltip={th('netapp.snapshot')}>
          {t('common.snapshotReserve')}
        </Label>
        {/*
          `snapshotReserve` is stored as a FRACTION (the engine multiplies capacity by it
          directly), but the slider and its readout are in percent — so the value is scaled on
          both sides. Before this conversion the slider wrote raw percent into a field the
          engine read as a fraction: moving it to 5 meant a 500% snapshot reserve.
        */}
        <Slider
          id="netapp-snapshot-reserve"
          value={Math.round(netAppOptions.snapshotReserve * 100)}
          min={0}
          max={20}
          onChange={(v) => setNetAppOptions({ snapshotReserve: v / 100 })}
          formatValue={(v) => `${v}%`}
        />
      </div>

      <Toggle
        id="netapp-compression"
        label={t('netapp.inlineCompression')}
        checked={netAppOptions.compression}
        onChange={(v) => setNetAppOptions({ compression: v })}
      />

      <Toggle
        id="netapp-dedup"
        label={t('netapp.inlineDedup')}
        checked={netAppOptions.dedup}
        onChange={(v) => setNetAppOptions({ dedup: v })}
      />

      {(netAppOptions.compression || netAppOptions.dedup) && (
        <div className="space-y-2">
          <Label htmlFor="netapp-drr">{t('netapp.dataReductionRatio')}</Label>
          <Slider
            id="netapp-drr"
            value={netAppOptions.dataReductionRatio}
            min={1}
            max={5}
            step={0.5}
            onChange={(v) => setNetAppOptions({ dataReductionRatio: v })}
            formatValue={(v) => `${v}:1`}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="netapp-wafl" tooltip={th('netapp.wafl')}>
          {t('netapp.waflOverhead')}
        </Label>
        <Slider
          id="netapp-wafl"
          value={netAppOptions.waflOverhead * 100}
          min={1}
          max={3}
          step={0.1}
          onChange={(v) => setNetAppOptions({ waflOverhead: v / 100 })}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
      </div>
    </div>
  )
}
