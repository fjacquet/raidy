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
import {
  Label,
  NumberInput,
  SegmentedControl,
  Slider,
  Toggle,
} from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'

export function CephOptionsPanel() {
  const { t } = useTranslation('topology')
  const { cephOptions, serverCount, setCephOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-surface-700">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {t('ceph.title')}
      </h4>

      <div className="space-y-2">
        <Label>{t('ceph.backend')}</Label>
        <SegmentedControl
          value={cephOptions.backend}
          options={[
            { value: 'bluestore', label: 'BlueStore' },
            { value: 'filestore', label: 'FileStore' },
          ]}
          onChange={(v) => setCephOptions({ backend: v as 'bluestore' | 'filestore' })}
        />
        <p className="text-xs text-slate-500">
          {cephOptions.backend === 'bluestore'
            ? 'Modern backend with direct disk access, better performance'
            : 'Legacy backend using filesystem, compatibility mode'}
        </p>
      </div>

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
        </div>
      )}

      <Toggle
        id="ceph-encryption"
        label={t('common.enableEncryption')}
        checked={cephOptions.encryption}
        onChange={(v) => setCephOptions({ encryption: v })}
      />

      <Toggle
        id="ceph-journal-ssd"
        label={t('ceph.journalOnSsd')}
        checked={cephOptions.journalOnSsd}
        onChange={(v) => setCephOptions({ journalOnSsd: v })}
      />

      <Toggle
        id="ceph-wal-db-offload"
        label={t('ceph.walDbOffload')}
        checked={cephOptions.walDbOffload}
        onChange={(v) => setCephOptions({ walDbOffload: v })}
      />

      {cephOptions.walDbOffload && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ceph-wal-ratio">{t('ceph.walDbRatio')}</Label>
            <NumberInput
              id="ceph-wal-ratio"
              value={cephOptions.walDbRatio}
              min={2}
              max={12}
              onChange={(v) => setCephOptions({ walDbRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Ratio of HDDs to NVMe drives for WAL/DB offload
            </p>
          </div>

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
            showCacheMode={false}
            showWorkingSet={false}
          />
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="ceph-safe-capacity">{t('ceph.safeCapacity')}</Label>
        <Slider
          id="ceph-safe-capacity"
          value={cephOptions.safeCapacityThreshold * 100}
          min={70}
          max={95}
          onChange={(v) => setCephOptions({ safeCapacityThreshold: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          Ceph nearfull threshold: {Math.round(cephOptions.safeCapacityThreshold * 100)}%
        </p>
      </div>
    </div>
  )
}
