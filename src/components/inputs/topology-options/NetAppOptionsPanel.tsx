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
import { Label, SegmentedControl, Select, Slider, Toggle } from '@/components/common/FormControls'
import {
  NETAPP_ADP_OPTIONS,
  NETAPP_PLATFORM_OPTIONS,
} from '@/components/inputs/topology-options/topologyConstants'
import { useConfigStore } from '@/store'

export function NetAppOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { netAppOptions, setNetAppOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-surface-700">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {t('netapp.title')}
      </h4>

      <div className="space-y-2">
        <Label htmlFor="netapp-platform">{t('netapp.platform')}</Label>
        <Select
          id="netapp-platform"
          value={netAppOptions.platform}
          options={NETAPP_PLATFORM_OPTIONS}
          onChange={(v) =>
            setNetAppOptions({
              platform: v as 'aff_a' | 'aff_c' | 'fas' | 'asa' | 'e_series',
            })
          }
        />
        <p className="text-xs text-slate-500">
          {netAppOptions.platform === 'aff_a'
            ? 'All-Flash FAS A-Series: High performance'
            : netAppOptions.platform === 'aff_c'
              ? 'All-Flash FAS C-Series: Capacity optimized'
              : netAppOptions.platform === 'fas'
                ? 'Fabric-Attached Storage: Hybrid HDD/SSD'
                : netAppOptions.platform === 'asa'
                  ? 'All-Flash SAN Array: Block-only SAN'
                  : 'E-Series: High-performance block storage'}
        </p>
      </div>

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
        <Label htmlFor="netapp-adp" tooltip={th('netapp.adp')}>
          {t('netapp.adp')}
        </Label>
        <Select
          id="netapp-adp"
          value={netAppOptions.adpVersion}
          options={NETAPP_ADP_OPTIONS}
          onChange={(v) => setNetAppOptions({ adpVersion: v as 'none' | 'adpv1' | 'adpv2' })}
        />
        <p className="text-xs text-slate-500">
          {netAppOptions.adpVersion === 'adpv2'
            ? 'ADP v2: Root-data partitioning, better capacity utilization'
            : netAppOptions.adpVersion === 'adpv1'
              ? 'ADP v1: Basic root partitioning'
              : 'No partitioning: Traditional dedicated root drives'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="netapp-snapshot-reserve" tooltip={th('netapp.snapshot')}>
          {t('common.snapshotReserve')}
        </Label>
        <Slider
          id="netapp-snapshot-reserve"
          value={netAppOptions.snapshotReserve}
          min={0}
          max={20}
          onChange={(v) => setNetAppOptions({ snapshotReserve: v })}
        />
        <p className="text-xs text-slate-500">
          Snapshot reserve: {netAppOptions.snapshotReserve}%
          {netAppOptions.platform.startsWith('aff') && netAppOptions.snapshotReserve === 0
            ? ' (typical for AFF)'
            : ''}
        </p>
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

      <Toggle
        id="netapp-zero-detection"
        label={t('netapp.zeroDetection')}
        checked={netAppOptions.zeroDetection}
        onChange={(v) => setNetAppOptions({ zeroDetection: v })}
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
          />
          <p className="text-xs text-slate-500">
            Expected DRR: {netAppOptions.dataReductionRatio}:1 (compression + dedup)
          </p>
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
        />
        <p className="text-xs text-slate-500">
          WAFL filesystem overhead: {(netAppOptions.waflOverhead * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  )
}
