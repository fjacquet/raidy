/**
 * Nutanix topology options panel.
 *
 * Displays configuration controls for Nutanix HCI:
 * - Cluster type (all-flash/hybrid)
 * - Compression and deduplication
 * - Network type (10GbE/25GbE/RDMA)
 * - System overhead
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider, Toggle } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { Topology } from '@/types'

interface NutanixOptionsPanelProps {
  topology: Topology & { type: 'nutanix' }
}

export function NutanixOptionsPanel({ topology }: NutanixOptionsPanelProps) {
  const { t } = useTranslation('topology')
  const { nutanixOptions, setNutanixOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-surface-700">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {t('nutanix.title')}
      </h4>

      {/* Show mode description based on selected topology level */}
      <div className="p-3 bg-surface-800 rounded-lg text-xs text-slate-400">
        {topology.level === 'nutanix_rf2' && (
          <p>
            <strong className="text-slate-300">RF2:</strong> 2 copies of data, 50% storage
            efficiency. Tolerates single node failure.
          </p>
        )}
        {topology.level === 'nutanix_rf3' && (
          <p>
            <strong className="text-slate-300">RF3:</strong> 3 copies of data, 33% storage
            efficiency. Tolerates dual node failure.
          </p>
        )}
        {topology.level === 'nutanix_ec_rf2' && (
          <p>
            <strong className="text-slate-300">EC-X (RF2):</strong> Erasure coding 4:1 for cold
            data, ~75% efficiency. Hot data remains RF2.
          </p>
        )}
        {topology.level === 'nutanix_ec_rf3' && (
          <p>
            <strong className="text-slate-300">EC-X (RF3):</strong> Erasure coding 6:2 for cold
            data, ~75% efficiency. Hot data remains RF3.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('nutanix.clusterType')}</Label>
        <SegmentedControl
          value={nutanixOptions.clusterType}
          options={[
            { value: 'all-flash', label: 'All-Flash' },
            { value: 'hybrid', label: 'Hybrid' },
          ]}
          onChange={(v) => setNutanixOptions({ clusterType: v as 'all-flash' | 'hybrid' })}
        />
        <p className="text-xs text-slate-500">
          {nutanixOptions.clusterType === 'all-flash'
            ? 'All-Flash: NVMe/SSD only, maximum performance'
            : 'Hybrid: SSD cache + HDD capacity tier'}
        </p>
      </div>

      <Toggle
        id="nutanix-compression"
        label={t('common.enableCompression')}
        checked={nutanixOptions.compression}
        onChange={(v) => setNutanixOptions({ compression: v })}
      />

      {nutanixOptions.compression && (
        <div className="space-y-2">
          <Label htmlFor="nutanix-compression-ratio">{t('common.compressionRatio')}</Label>
          <Slider
            id="nutanix-compression-ratio"
            value={nutanixOptions.compressionRatio}
            min={1}
            max={3}
            step={0.1}
            onChange={(v) => setNutanixOptions({ compressionRatio: v })}
          />
          <p className="text-xs text-slate-500">
            Expected ratio: {nutanixOptions.compressionRatio.toFixed(1)}:1
          </p>
        </div>
      )}

      <Toggle
        id="nutanix-dedup"
        label={t('common.enableDedup')}
        checked={nutanixOptions.dedup}
        onChange={(v) => setNutanixOptions({ dedup: v })}
      />

      {nutanixOptions.dedup && (
        <div className="space-y-2">
          <Label htmlFor="nutanix-dedup-ratio">{t('common.dedupRatio')}</Label>
          <Slider
            id="nutanix-dedup-ratio"
            value={nutanixOptions.dedupRatio}
            min={1}
            max={3}
            step={0.1}
            onChange={(v) => setNutanixOptions({ dedupRatio: v })}
          />
          <p className="text-xs text-slate-500">
            Expected ratio: {nutanixOptions.dedupRatio.toFixed(1)}:1
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label>{t('nutanix.networkType')}</Label>
        <SegmentedControl
          value={nutanixOptions.networkType}
          options={[
            { value: '10gbe', label: '10 GbE' },
            { value: '25gbe', label: '25 GbE' },
            { value: 'rdma', label: 'RDMA' },
          ]}
          onChange={(v) => setNutanixOptions({ networkType: v as '10gbe' | '25gbe' | 'rdma' })}
        />
        <p className="text-xs text-slate-500">
          {nutanixOptions.networkType === 'rdma'
            ? 'RDMA (RoCE): Lowest latency (+0.1ms)'
            : nutanixOptions.networkType === '25gbe'
              ? '25 GbE: Standard HCI (+0.25ms latency)'
              : '10 GbE: Legacy (+0.5ms latency)'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nutanix-overhead">{t('common.systemOverhead')}</Label>
        <Slider
          id="nutanix-overhead"
          value={nutanixOptions.systemOverhead * 100}
          min={5}
          max={15}
          onChange={(v) => setNutanixOptions({ systemOverhead: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          CVM, metadata, snapshots: {Math.round(nutanixOptions.systemOverhead * 100)}%
        </p>
      </div>
    </div>
  )
}
