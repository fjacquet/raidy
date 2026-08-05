/**
 * Ceph topology options panel.
 *
 * Displays configuration controls for Ceph storage:
 * - Backend (BlueStore/FileStore)
 * - Compression settings
 * - Encryption
 * - Journal/WAL/DB offload
 * - Safe capacity threshold
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { CEPH_COMPRESSION_RATIOS } from '@/engines/volumetry/postProcessing/capacityEnhancements'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'

export function CephOptionsPanel() {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { cephOptions, serverCount, setCephOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('ceph.title')}
      </h4>

      <Toggle
        id="ceph-compression"
        label={t('common.enableCompression')}
        checked={cephOptions.compression}
        onChange={(v) => setCephOptions({ compression: v })}
      />

      {cephOptions.compression && (
        <div className="space-y-2">
          <Label>{t('ceph.compressionAlgorithm')}</Label>
          <SegmentedControl
            value={cephOptions.compressionAlgorithm}
            options={[
              { value: 'snappy', label: 'Snappy' },
              { value: 'lz4', label: 'LZ4' },
              { value: 'zstd', label: 'ZSTD' },
            ]}
            onChange={(v) =>
              setCephOptions({ compressionAlgorithm: v as 'snappy' | 'lz4' | 'zstd' })
            }
          />
          <p className="text-xs text-slate-500">
            {t('ceph.expectedRatio', {
              ratio: CEPH_COMPRESSION_RATIOS[cephOptions.compressionAlgorithm].toFixed(1),
            })}
          </p>
        </div>
      )}

      <Toggle
        id="ceph-wal-db-offload"
        label={t('ceph.walDbOffload')}
        checked={cephOptions.walDbOffload}
        onChange={(v) => setCephOptions({ walDbOffload: v })}
      />

      {cephOptions.walDbOffload && (
        <TieringPanel
          config={cephOptions.tiering ?? DEFAULT_TIERING_CONFIG}
          onChange={(tiering) =>
            setCephOptions({
              tiering: {
                ...DEFAULT_TIERING_CONFIG,
                ...cephOptions.tiering,
                ...tiering,
              },
            })
          }
          serverCount={serverCount}
          platform="ceph"
          showWorkingSet={false}
        />
      )}

      <div className="space-y-2">
        <Label htmlFor="ceph-safe-capacity" tooltip={th('ceph.nearfull')}>
          {t('ceph.safeCapacity')}
        </Label>
        <Slider
          id="ceph-safe-capacity"
          value={cephOptions.safeCapacityThreshold * 100}
          min={70}
          max={95}
          onChange={(v) => setCephOptions({ safeCapacityThreshold: v / 100 })}
          formatValue={(v) => `${Math.round(v)}%`}
        />
      </div>
    </div>
  )
}
