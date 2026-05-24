/**
 * ZFS-specific topology options panel.
 *
 * Displays configuration controls for ZFS topologies:
 * - ashift (sector size power)
 * - Compression settings
 * - Recordsize
 * - Deduplication
 * - Special vdevs
 */

import { useTranslation } from 'react-i18next'
import { Label, Select, Toggle } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'

const ASHIFT_OPTIONS = [
  { value: '9', label: '512B (ashift=9)' },
  { value: '12', label: '4K (ashift=12)' },
  { value: '13', label: '8K (ashift=13)' },
]

const COMPRESSION_OPTIONS = [
  { value: 'lz4', label: 'LZ4 (fast)' },
  { value: 'zstd', label: 'ZSTD (balanced)' },
  { value: 'gzip', label: 'GZIP (high ratio)' },
  { value: 'off', label: 'Disabled' },
]

const RECORDSIZE_OPTIONS = [
  { value: '4096', label: '4K' },
  { value: '8192', label: '8K' },
  { value: '16384', label: '16K' },
  { value: '65536', label: '64K' },
  { value: '131072', label: '128K (default)' },
  { value: '1048576', label: '1M' },
]

export function ZfsOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { zfsOptions, setZfsOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('zfs.title')}
      </h4>

      <div className="space-y-2">
        <Label htmlFor="ashift" tooltip={th('zfs.ashift')}>
          {t('zfs.ashift')}
        </Label>
        <Select
          id="ashift"
          value={String(zfsOptions.ashift)}
          options={ASHIFT_OPTIONS}
          onChange={(v) => setZfsOptions({ ashift: Number(v) as 9 | 12 | 13 })}
        />
      </div>

      <Toggle
        id="zfs-compression"
        label={t('zfs.compression')}
        checked={zfsOptions.compression}
        onChange={(v) => setZfsOptions({ compression: v })}
      />

      {zfsOptions.compression && (
        <div className="space-y-2">
          <Label htmlFor="compression-type" tooltip={th('zfs.compression')}>
            {t('zfs.compressionAlgorithm')}
          </Label>
          <Select
            id="compression-type"
            value={zfsOptions.compressionType}
            options={COMPRESSION_OPTIONS}
            onChange={(v) =>
              setZfsOptions({ compressionType: v as 'lz4' | 'zstd' | 'gzip' | 'off' })
            }
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="recordsize" tooltip={th('zfs.recordsize')}>
          {t('zfs.recordSize')}
        </Label>
        <Select
          id="recordsize"
          value={String(zfsOptions.recordsize)}
          options={RECORDSIZE_OPTIONS}
          onChange={(v) => setZfsOptions({ recordsize: Number(v) })}
        />
      </div>

      <Toggle
        id="zfs-dedup"
        label={t('zfs.dedup')}
        checked={zfsOptions.dedup}
        onChange={(v) => setZfsOptions({ dedup: v })}
      />

      <Toggle
        id="zfs-special"
        label={t('zfs.specialVdev')}
        checked={zfsOptions.specialVdev}
        onChange={(v) => setZfsOptions({ specialVdev: v })}
      />
    </div>
  )
}
