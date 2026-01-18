/**
 * Synology NAS topology options panel.
 *
 * Displays configuration controls for Synology NAS systems (under proprietary topology type):
 * - Filesystem (Btrfs/EXT4)
 * - Model series
 * - SSD cache configuration
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Select, Slider, Toggle } from '@/components/common/FormControls'
import { SYNOLOGY_MODEL_OPTIONS } from '@/components/inputs/topology-options/topologyConstants'
import { useConfigStore } from '@/store'

export function SynologyOptionsPanel() {
  const { t } = useTranslation('topology')
  const { synologyOptions, setSynologyOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-surface-700">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {t('synology.title')}
      </h4>

      <div className="space-y-2">
        <Label>{t('synology.filesystem')}</Label>
        <SegmentedControl
          value={synologyOptions.filesystem}
          options={[
            { value: 'btrfs', label: 'Btrfs' },
            { value: 'ext4', label: 'EXT4' },
          ]}
          onChange={(v) => setSynologyOptions({ filesystem: v as 'btrfs' | 'ext4' })}
        />
        <p className="text-xs text-slate-500">
          {synologyOptions.filesystem === 'btrfs'
            ? 'Btrfs: Snapshots, data protection, ~4% overhead'
            : 'EXT4: Legacy, no snapshots, lower overhead'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="synology-model">{t('synology.modelSeries')}</Label>
        <Select
          id="synology-model"
          value={synologyOptions.modelSeries}
          options={SYNOLOGY_MODEL_OPTIONS}
          onChange={(v) => setSynologyOptions({ modelSeries: v as 'j' | 'value' | 'plus' | 'xs' })}
        />
        <p className="text-xs text-slate-500">
          {synologyOptions.modelSeries === 'j'
            ? 'J Series: Entry-level, limited CPU for RAID parity'
            : synologyOptions.modelSeries === 'value'
              ? 'Value Series: Home/small office use'
              : synologyOptions.modelSeries === 'plus'
                ? 'Plus Series: SMB with Btrfs support'
                : 'XS Series: Enterprise with high performance'}
        </p>
      </div>

      <Toggle
        id="synology-ssd-cache"
        label={t('synology.ssdCache')}
        checked={synologyOptions.ssdCache}
        onChange={(v) => setSynologyOptions({ ssdCache: v })}
      />

      {synologyOptions.ssdCache && (
        <div className="space-y-2">
          <Label>{t('synology.cacheMode')}</Label>
          <SegmentedControl
            value={synologyOptions.cacheMode}
            options={[
              { value: 'read_only', label: 'Read Only' },
              { value: 'read_write', label: 'Read/Write' },
            ]}
            onChange={(v) => setSynologyOptions({ cacheMode: v as 'read_only' | 'read_write' })}
          />
          <p className="text-xs text-slate-500">
            {synologyOptions.cacheMode === 'read_write'
              ? 'Read/Write cache: Better performance, requires 2 SSDs for protection'
              : 'Read-only cache: Accelerates reads only'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="synology-system-partition">{t('synology.systemPartition')}</Label>
        <Slider
          id="synology-system-partition"
          value={synologyOptions.systemPartitionSize / (1024 * 1024 * 1024)}
          min={20}
          max={35}
          onChange={(v) => setSynologyOptions({ systemPartitionSize: v * 1024 * 1024 * 1024 })}
        />
        <p className="text-xs text-slate-500">
          System partition per disk:{' '}
          {Math.round(synologyOptions.systemPartitionSize / (1024 * 1024 * 1024))} GB
        </p>
      </div>
    </div>
  )
}
