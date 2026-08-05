/**
 * Synology NAS topology options panel.
 *
 * Displays configuration controls for Synology NAS systems (under proprietary topology type):
 * - Filesystem (Btrfs/EXT4)
 * - Model series
 * - SSD cache configuration
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'

export function SynologyOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { synologyOptions, setSynologyOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('synology.title')}
      </h4>

      <div className="space-y-2">
        <Label tooltip={th('synology.shr')}>{t('synology.filesystem')}</Label>
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
        <Label htmlFor="synology-system-partition" tooltip={th('synology.systemPartition')}>
          {t('synology.systemPartition')}
        </Label>
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
