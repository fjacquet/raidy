/**
 * vSAN (OSA and ESA) topology options panel.
 *
 * Displays configuration controls for VMware vSAN topologies:
 * - OSA: Disk groups with cache/capacity tiers
 * - ESA: Single-tier NVMe-only architecture
 * - Compression, deduplication, encryption settings
 */

import { useTranslation } from 'react-i18next'
import { Label, Slider, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { useConfigStore } from '@/store'
import type { Topology } from '@/types'
import { DEFAULT_TIERING_CONFIG } from '@/types'

interface VsanOptionsPanelProps {
  topology: Topology & { type: 'vsan_osa' | 'vsan_esa' }
}

export function VsanOptionsPanel({ topology }: VsanOptionsPanelProps) {
  const { t } = useTranslation('topology')
  const { vsanOptions, serverCount, setVsanOptions } = useConfigStore()

  const isOsa = topology.type === 'vsan_osa'
  const isEsa = topology.type === 'vsan_esa'
  const idPrefix = `vsan-${isOsa ? 'osa' : 'esa'}`

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {isOsa ? t('vsanOsa.title') : t('vsanEsa.title')}
      </h4>

      {/* Configuration info box */}
      <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
        {isOsa && topology.level === 'vsan_osa_raid1' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-1 FTT=1:</strong> 2-way
            mirror, requires minimum 3 hosts. 50% storage efficiency. Best read performance.
          </p>
        )}
        {isOsa && topology.level === 'vsan_osa_raid1_ftt2' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-1 FTT=2:</strong> 3-way
            mirror, requires minimum 5 hosts. 33% storage efficiency. Maximum fault tolerance.
          </p>
        )}
        {isOsa && topology.level === 'vsan_osa_raid5' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-5 (3+1):</strong> Single
            parity, requires minimum 4 hosts. 75% efficiency. 4x write penalty vs mirror.
          </p>
        )}
        {isOsa && topology.level === 'vsan_osa_raid6' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-6 (4+2):</strong> Dual
            parity, requires minimum 6 hosts. 67% efficiency. 6x write penalty vs mirror.
          </p>
        )}
        {isEsa && topology.level === 'vsan_esa_raid5' && (
          <>
            <p>
              <strong className="text-slate-600 dark:text-slate-300">Adaptive RAID-5:</strong> Uses
              2+1 for 3-5 hosts (67% efficiency) or 4+1 for 6+ hosts (80% efficiency). Near RAID-1
              performance with ~2.5x write penalty.
            </p>
            <p className="mt-1 text-green-400">Recommended for most ESA deployments.</p>
          </>
        )}
        {isEsa && topology.level === 'vsan_esa_raid6' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-6 (4+2):</strong> FTT=2,
            requires minimum 6 hosts. 67% efficiency. ~3.5x write penalty (much better than OSA
            RAID-6).
          </p>
        )}
        {isEsa && topology.level === 'vsan_esa_raid1' && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">RAID-1 (Mirror):</strong> Only
            recommended for 2-node stretched clusters. 50% efficiency. Use RAID-5 for better
            efficiency in 3+ node clusters.
          </p>
        )}
        <p className="mt-2 text-slate-500">
          {isOsa
            ? 'OSA uses disk groups with cache tier (NVMe/SSD) + capacity tier (SSD/HDD).'
            : 'ESA is a single-tier architecture. NVMe drives only, no disk groups.'}
        </p>
      </div>

      {/* NVMe requirement notice for ESA */}
      {isEsa && (
        <div className="p-2 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300">
          vSAN ESA requires NVMe drives only. Each drive serves both cache and capacity.
        </div>
      )}

      <Toggle
        id={`${idPrefix}-compression`}
        label={t('common.enableCompression')}
        checked={vsanOptions.compression}
        onChange={(v) => setVsanOptions({ compression: v })}
      />

      {vsanOptions.compression && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-compression-ratio`}>{t('common.compressionRatio')}</Label>
          <Slider
            id={`${idPrefix}-compression-ratio`}
            value={vsanOptions.compressionRatio}
            min={1}
            max={3}
            step={0.1}
            onChange={(v) => setVsanOptions({ compressionRatio: v })}
          />
          <p className="text-xs text-slate-500">
            Expected ratio: {vsanOptions.compressionRatio.toFixed(1)}:1
          </p>
        </div>
      )}

      <Toggle
        id={`${idPrefix}-dedup`}
        label={t('common.enableDedup')}
        checked={vsanOptions.dedup}
        onChange={(v) => setVsanOptions({ dedup: v })}
      />

      {vsanOptions.dedup && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-dedup-ratio`}>{t('common.dedupRatio')}</Label>
          <Slider
            id={`${idPrefix}-dedup-ratio`}
            value={vsanOptions.dedupRatio}
            min={1}
            max={3}
            step={0.1}
            onChange={(v) => setVsanOptions({ dedupRatio: v })}
          />
          <p className="text-xs text-slate-500">
            Expected ratio: {vsanOptions.dedupRatio.toFixed(1)}:1
          </p>
        </div>
      )}

      <Toggle
        id={`${idPrefix}-encryption`}
        label={t('common.enableEncryption')}
        checked={vsanOptions.encryption}
        onChange={(v) => setVsanOptions({ encryption: v })}
      />

      {/* Disk Group Tiering (OSA only) */}
      {isOsa && (
        <>
          <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
            <h5 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              {t('vsanOsa.diskGroupConfig')}
            </h5>
          </div>
          <TieringPanel
            config={vsanOptions.tiering ?? DEFAULT_TIERING_CONFIG}
            onChange={(tiering) =>
              setVsanOptions({
                tiering: {
                  ...DEFAULT_TIERING_CONFIG,
                  ...vsanOptions.tiering,
                  ...tiering,
                },
              })
            }
            serverCount={serverCount}
            platform="vsan"
            showCacheMode={false}
            vsanMode={vsanOptions.diskGroupMode}
            onVsanModeChange={(diskGroupMode) => setVsanOptions({ diskGroupMode })}
          />
        </>
      )}
    </div>
  )
}
