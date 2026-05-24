/**
 * Dell topology options panel.
 *
 * Consolidates configuration controls for all Dell storage topologies:
 * - PowerFlex: Fault sets, compression, fine-granularity overhead
 * - PowerStore: RAID levels, snapshots, inline reduction
 * - PowerScale: Node protection (N+x), snapshots, SmartQuotas, SyncIQ
 * - ObjectScale: Erasure coding, geo-replication, network efficiency
 * - PowerVault: ADAPT/RAID variants, controllers, tiering, SSD cache
 */

import { useTranslation } from 'react-i18next'
import {
  Label,
  NumberInput,
  SegmentedControl,
  Slider,
  Toggle,
} from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { PowerStoreOptions, Topology } from '@/types'
import { POWERSTORE_MODEL_OVERHEAD } from '@/types'

interface DellOptionsPanelProps {
  topology: Topology & {
    type: 'powerflex' | 'powerstore' | 'powerscale' | 'objectscale' | 'powervault'
  }
}

export function DellOptionsPanel({ topology }: DellOptionsPanelProps) {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const {
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    powerFlexOptions,
    powervaultOptions,
    setObjectScaleOptions,
    setPowerStoreOptions,
    setPowerScaleOptions,
    setPowerFlexOptions,
    setPowerVaultOptions,
  } = useConfigStore()

  // PowerVault ME5 Options
  if (topology.type === 'powervault') {
    return (
      <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('powervault.title')}
        </h4>

        {/* Show mode description based on selected topology level */}
        <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
          {topology.level === 'powervault_raid1' && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">RAID 1:</strong> 2-way mirror
              with 50% storage efficiency. Simple, fast rebuilds. Best for boot volumes and small
              deployments.
            </p>
          )}
          {topology.level === 'powervault_raid5' && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">RAID 5:</strong> Single
              distributed parity with (n-1)/n efficiency. 4x write penalty. Not recommended for
              write-intensive workloads.
            </p>
          )}
          {topology.level === 'powervault_raid6' && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">RAID 6:</strong> Dual
              distributed parity with (n-2)/n efficiency. 6x write penalty. Better data protection
              for large capacity drives.
            </p>
          )}
          {topology.level === 'powervault_raid10' && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">RAID 10:</strong> Mirrored
              stripes with 50% efficiency. Best random IOPS performance. Ideal for databases.
            </p>
          )}
          {topology.level === 'powervault_adapt' && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">ADAPT:</strong> Distributed
              RAID with ~87% efficiency. Spare capacity distributed across all drives. Fastest
              rebuilds (8-10x faster). Requires 12-128 drives.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>{t('powervault.model')}</Label>
          <SegmentedControl
            value={powervaultOptions.model}
            options={[
              { value: 'ME5212', label: 'ME5212' },
              { value: 'ME5224', label: 'ME5224' },
              { value: 'ME5284', label: 'ME5284' },
            ]}
            onChange={(v) => setPowerVaultOptions({ model: v as 'ME5212' | 'ME5224' | 'ME5284' })}
          />
          <p className="text-xs text-slate-500">
            {powervaultOptions.model === 'ME5212'
              ? 'ME5212: 2U, 12 drives (3.5" only)'
              : powervaultOptions.model === 'ME5224'
                ? 'ME5224: 2U, 24 drives (2.5")'
                : 'ME5284: 5U, 84 drives (3.5"), max density'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t('powervault.controllers')}</Label>
          <SegmentedControl
            value={String(powervaultOptions.controllers)}
            options={[
              { value: '1', label: 'Single' },
              { value: '2', label: 'Dual Active' },
            ]}
            onChange={(v) => setPowerVaultOptions({ controllers: Number(v) as 1 | 2 })}
          />
          <p className="text-xs text-slate-500">
            {powervaultOptions.controllers === 1
              ? 'Single: 420K IOPS, 7 GB/s max'
              : 'Dual Active: 840K IOPS, 14 GB/s max, failover support'}
          </p>
        </div>

        <Toggle
          id="powervault-tiering"
          label={t('powervault.enableTiering')}
          checked={powervaultOptions.tiering}
          onChange={(v) => setPowerVaultOptions({ tiering: v })}
        />
        <p className="text-xs text-slate-500">
          Automatically moves data between tiers (Performance SSD, Standard 10K, Archive NL-SAS)
        </p>

        <Toggle
          id="powervault-ssd-cache"
          label={t('powervault.ssdReadCache')}
          checked={powervaultOptions.ssdReadCache}
          onChange={(v) => setPowerVaultOptions({ ssdReadCache: v })}
        />
        <p className="text-xs text-slate-500">
          Uses SSDs as read cache for HDD pools (not available with all-flash)
        </p>

        <Toggle
          id="powervault-thin"
          label={t('common.thinProvisioning')}
          checked={powervaultOptions.thinProvisioning}
          onChange={(v) => setPowerVaultOptions({ thinProvisioning: v })}
        />
        <p className="text-xs text-slate-500">
          4MB page size thin provisioning. No compression/deduplication support.
        </p>

        {/* Warning about no compression/dedup */}
        <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg text-xs text-amber-300">
          <strong>Note:</strong> PowerVault ME5 does not support inline compression or
          deduplication. For data reduction features, consider PowerStore or PowerScale.
        </div>
      </div>
    )
  }

  // ObjectScale Options
  if (topology.type === 'objectscale') {
    return (
      <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('objectscale.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="objectscale-object-size">{t('objectscale.objectSize')}</Label>
          <Slider
            id="objectscale-object-size"
            value={objectscaleOptions.objectSizeKB}
            min={100}
            max={10240}
            step={100}
            onChange={(v) => setObjectScaleOptions({ objectSizeKB: v })}
          />
          <p className="text-xs text-slate-500">
            Average object size:{' '}
            {objectscaleOptions.objectSizeKB >= 1024
              ? `${(objectscaleOptions.objectSizeKB / 1024).toFixed(1)} MB`
              : `${objectscaleOptions.objectSizeKB} KB`}
          </p>
        </div>

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
          />
          <p className="text-xs text-slate-500">
            Metadata, indexes, S3 protocol: {objectscaleOptions.systemOverheadPercent}%
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="objectscale-network">{t('objectscale.networkEfficiency')}</Label>
          <Slider
            id="objectscale-network"
            value={objectscaleOptions.networkEfficiencyFactor * 100}
            min={50}
            max={80}
            onChange={(v) => setObjectScaleOptions({ networkEfficiencyFactor: v / 100 })}
          />
          <p className="text-xs text-slate-500">
            East-West traffic factor: {Math.round(objectscaleOptions.networkEfficiencyFactor * 100)}
            %
          </p>
        </div>

        <Toggle
          id="objectscale-compression"
          label={t('common.enableCompression')}
          checked={objectscaleOptions.compression}
          onChange={(v) => setObjectScaleOptions({ compression: v })}
        />

        {objectscaleOptions.compression && (
          <div className="space-y-2">
            <Label htmlFor="objectscale-compression-ratio">{t('common.compressionRatio')}</Label>
            <Slider
              id="objectscale-compression-ratio"
              value={objectscaleOptions.compressionRatio}
              min={1}
              max={3}
              step={0.1}
              onChange={(v) => setObjectScaleOptions({ compressionRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {objectscaleOptions.compressionRatio.toFixed(1)}:1
            </p>
          </div>
        )}
      </div>
    )
  }

  // PowerStore Options
  if (topology.type === 'powerstore') {
    return (
      <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('powerstore.title')}
        </h4>

        <div className="space-y-2">
          <Label>{t('powerstore.model')}</Label>
          <SegmentedControl
            value={powerstoreOptions.model}
            options={[
              { value: 'powerstore_3200', label: '3200' },
              { value: 'powerstore_5200q', label: '5200Q' },
              { value: 'powerstore_5200t', label: '5200T' },
              { value: 'custom', label: 'Custom' },
            ]}
            onChange={(v) => {
              const model = v as PowerStoreOptions['model']
              if (model !== 'custom') {
                setPowerStoreOptions({
                  model,
                  systemOverheadPercent: POWERSTORE_MODEL_OVERHEAD[model],
                })
              } else {
                setPowerStoreOptions({ model })
              }
            }}
          />
          <p className="text-xs text-slate-500">
            {powerstoreOptions.model === 'powerstore_3200'
              ? '3200: Entry-level, 5% system overhead'
              : powerstoreOptions.model === 'powerstore_5200t'
                ? '5200T: All-flash T-Series, 7% system overhead'
                : powerstoreOptions.model === 'powerstore_5200q'
                  ? '5200Q: Quad-controller, 5% system overhead (Dell Sizer reference)'
                  : `Custom: ${powerstoreOptions.systemOverheadPercent}% user-specified`}
          </p>
        </div>

        <Toggle
          id="powerstore-compression"
          label={t('common.enableCompression')}
          checked={powerstoreOptions.compression}
          onChange={(v) => setPowerStoreOptions({ compression: v })}
        />

        {powerstoreOptions.compression && (
          <div className="space-y-2">
            <Label htmlFor="powerstore-compression-ratio">{t('common.compressionRatio')}</Label>
            <Slider
              id="powerstore-compression-ratio"
              value={powerstoreOptions.compressionRatio}
              min={1}
              max={3}
              step={0.1}
              onChange={(v) => setPowerStoreOptions({ compressionRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {powerstoreOptions.compressionRatio.toFixed(1)}:1
            </p>
          </div>
        )}

        <Toggle
          id="powerstore-dedup"
          label={t('common.enableDedup')}
          checked={powerstoreOptions.dedup}
          onChange={(v) => setPowerStoreOptions({ dedup: v })}
        />

        {powerstoreOptions.dedup && (
          <div className="space-y-2">
            <Label htmlFor="powerstore-dedup-ratio">{t('common.dedupRatio')}</Label>
            <Slider
              id="powerstore-dedup-ratio"
              value={powerstoreOptions.dedupRatio}
              min={1}
              max={3}
              step={0.1}
              onChange={(v) => setPowerStoreOptions({ dedupRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {powerstoreOptions.dedupRatio.toFixed(1)}:1
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="powerstore-snapshot">{t('common.snapshotReserve')}</Label>
          <Slider
            id="powerstore-snapshot"
            value={powerstoreOptions.snapshotReservePercent}
            min={0}
            max={30}
            onChange={(v) => setPowerStoreOptions({ snapshotReservePercent: v })}
          />
          <p className="text-xs text-slate-500">
            Snapshot reserve: {powerstoreOptions.snapshotReservePercent}%
          </p>
        </div>

        {powerstoreOptions.model === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="powerstore-overhead">{t('powerstore.systemOverhead')}</Label>
            <Slider
              id="powerstore-overhead"
              value={powerstoreOptions.systemOverheadPercent}
              min={1}
              max={15}
              onChange={(v) => setPowerStoreOptions({ systemOverheadPercent: v })}
            />
            <p className="text-xs text-slate-500">
              System overhead: {powerstoreOptions.systemOverheadPercent}%
            </p>
          </div>
        )}
      </div>
    )
  }

  // PowerScale Options
  if (topology.type === 'powerscale') {
    return (
      <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('powerscale.title')}
        </h4>

        <Toggle
          id="powerscale-compression"
          label={t('common.enableCompression')}
          checked={powerscaleOptions.compression}
          onChange={(v) => setPowerScaleOptions({ compression: v })}
        />

        {powerscaleOptions.compression && (
          <div className="space-y-2">
            <Label htmlFor="powerscale-compression-ratio">{t('common.compressionRatio')}</Label>
            <Slider
              id="powerscale-compression-ratio"
              value={powerscaleOptions.compressionRatio}
              min={1}
              max={3}
              step={0.1}
              onChange={(v) => setPowerScaleOptions({ compressionRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {powerscaleOptions.compressionRatio.toFixed(1)}:1
            </p>
          </div>
        )}

        <Toggle
          id="powerscale-dedup"
          label={t('common.enableDedup')}
          checked={powerscaleOptions.dedup}
          onChange={(v) => setPowerScaleOptions({ dedup: v })}
        />

        {powerscaleOptions.dedup && (
          <div className="space-y-2">
            <Label htmlFor="powerscale-dedup-ratio">{t('common.dedupRatio')}</Label>
            <Slider
              id="powerscale-dedup-ratio"
              value={powerscaleOptions.dedupRatio}
              min={1}
              max={3}
              step={0.1}
              onChange={(v) => setPowerScaleOptions({ dedupRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {powerscaleOptions.dedupRatio.toFixed(1)}:1
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="powerscale-snapshot">{t('common.snapshotReserve')}</Label>
          <Slider
            id="powerscale-snapshot"
            value={powerscaleOptions.snapshotReservePercent}
            min={0}
            max={30}
            onChange={(v) => setPowerScaleOptions({ snapshotReservePercent: v })}
          />
          <p className="text-xs text-slate-500">
            Snapshot reserve: {powerscaleOptions.snapshotReservePercent}%
          </p>
        </div>

        <Toggle
          id="powerscale-smartquotas"
          label={t('powerscale.smartQuotas')}
          checked={powerscaleOptions.smartQuotas}
          onChange={(v) => setPowerScaleOptions({ smartQuotas: v })}
        />

        <Toggle
          id="powerscale-synciq"
          label={t('powerscale.syncIQ')}
          checked={powerscaleOptions.syncIQ}
          onChange={(v) => setPowerScaleOptions({ syncIQ: v })}
        />
      </div>
    )
  }

  // PowerFlex Options
  if (topology.type === 'powerflex') {
    return (
      <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('powerflex.title')}
        </h4>

        {/* Show mode description based on selected topology level */}
        <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
          {topology.level.includes('medium') && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">
                Medium Granularity (1MB):
              </strong>{' '}
              Standard mode with lower metadata overhead. Supports 2-way and 3-way mirroring.
            </p>
          )}
          {topology.level.includes('fine') && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">
                Fine Granularity (8KB):
              </strong>{' '}
              Better for small random I/O. Only supports 2-way mirroring. 12-15% metadata overhead.
            </p>
          )}
          {topology.level.includes('ec_') && (
            <p>
              <strong className="text-slate-600 dark:text-slate-300">Erasure Coding:</strong> Higher
              capacity efficiency but ~30% lower IOPS due to CPU overhead. Requires PowerFlex 4.5+.
            </p>
          )}
        </div>

        <Toggle
          id="powerflex-compression"
          label={t('common.enableCompression')}
          checked={powerFlexOptions.compression}
          onChange={(v) => setPowerFlexOptions({ compression: v })}
        />

        {powerFlexOptions.compression && (
          <div className="space-y-2">
            <Label htmlFor="powerflex-compression-ratio">{t('common.compressionRatio')}</Label>
            <Slider
              id="powerflex-compression-ratio"
              value={powerFlexOptions.compressionRatio}
              min={1}
              max={4}
              step={0.5}
              onChange={(v) => setPowerFlexOptions({ compressionRatio: v })}
            />
            <p className="text-xs text-slate-500">
              Expected ratio: {powerFlexOptions.compressionRatio}:1
            </p>
          </div>
        )}

        {/* FG Metadata overhead - only for Fine granularity modes */}
        {topology.level.includes('fine') && (
          <div className="space-y-2">
            <Label htmlFor="powerflex-fg-overhead" tooltip={th('dell.powerFlex')}>
              {t('powerflex.fgOverhead')}
            </Label>
            <Slider
              id="powerflex-fg-overhead"
              value={powerFlexOptions.fgOverhead * 100}
              min={10}
              max={18}
              onChange={(v) => setPowerFlexOptions({ fgOverhead: v / 100 })}
            />
            <p className="text-xs text-slate-500">
              Fine granularity overhead: {Math.round(powerFlexOptions.fgOverhead * 100)}%
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="powerflex-fault-sets" tooltip={th('dell.powerFlex')}>
            {t('powerflex.faultSets')}
          </Label>
          <NumberInput
            id="powerflex-fault-sets"
            value={powerFlexOptions.faultSets}
            min={3}
            max={16}
            onChange={(v) => setPowerFlexOptions({ faultSets: v })}
          />
          <p className="text-xs text-slate-500">
            Minimum 3 fault sets required for data protection
          </p>
        </div>
      </div>
    )
  }

  return null
}
