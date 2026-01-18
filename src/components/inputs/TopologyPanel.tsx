/**
 * Topology configuration panel - RAID/ZFS/S2D/vSAN/Dell selection.
 */

import { useTranslation } from 'react-i18next'
import {
  Label,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Toggle,
} from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { ZfsOptionsPanel } from '@/components/inputs/topology-options/ZfsOptionsPanel'
import { S2dOptionsPanel } from '@/components/inputs/topology-options/S2dOptionsPanel'
import { VsanOptionsPanel } from '@/components/inputs/topology-options/VsanOptionsPanel'
import { CephOptionsPanel } from '@/components/inputs/topology-options/CephOptionsPanel'
import { NutanixOptionsPanel } from '@/components/inputs/topology-options/NutanixOptionsPanel'
import { NetAppOptionsPanel } from '@/components/inputs/topology-options/NetAppOptionsPanel'
import { SynologyOptionsPanel } from '@/components/inputs/topology-options/SynologyOptionsPanel'
import {
  TOPOLOGY_TYPES,
  TOPOLOGY_LEVELS,
} from '@/components/inputs/topology-options/topologyConstants'
import { useConfigStore } from '@/store'
import type { Topology, TopologyType } from '@/types'
import { DEFAULT_TIERING_CONFIG } from '@/types'

export function TopologyPanel() {
  const { t } = useTranslation('topology')
  const {
    topology,
    hotSpares,
    serverCount,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    powerFlexOptions,
    powervaultOptions,
    setTopology,
    setHotSpares,
    setObjectScaleOptions,
    setPowerStoreOptions,
    setPowerScaleOptions,
    setPowerFlexOptions,
    setPowerVaultOptions,
  } = useConfigStore()

  const handleTypeChange = (type: string) => {
    const levels = TOPOLOGY_LEVELS[type as TopologyType]
    const defaultLevel = levels?.[0]?.value ?? 'RAID0'
    setTopology({ type, level: defaultLevel } as Topology)
  }

  const handleLevelChange = (level: string) => {
    setTopology({ type: topology.type, level } as Topology)
  }

  const levelOptions = TOPOLOGY_LEVELS[topology.type] || []

  return (
    <div className="space-y-5">
      {/* Topology Type */}
      <div className="space-y-2">
        <Label htmlFor="storage-type">{t('type.label')}</Label>
        <Select
          id="storage-type"
          value={topology.type}
          options={TOPOLOGY_TYPES}
          onChange={handleTypeChange}
        />
      </div>

      {/* Topology Level */}
      <div className="space-y-2">
        <Label htmlFor="topology-level">{t('configuration.label')}</Label>
        <Select
          id="topology-level"
          value={topology.level}
          options={levelOptions}
          onChange={handleLevelChange}
        />
        <p className="text-xs text-slate-500">
          {levelOptions.find((o) => o.value === topology.level)?.description}
        </p>
      </div>

      {/* Hot Spares */}
      <div className="space-y-2">
        <Label htmlFor="hot-spares">{t('hotSpares.label')}</Label>
        <Slider id="hot-spares" value={hotSpares} min={0} max={4} onChange={setHotSpares} />
      </div>

      {/* ZFS Options */}
      {topology.type === 'zfs' && <ZfsOptionsPanel />}

      {/* S2D Options */}
      {topology.type === 's2d' && <S2dOptionsPanel topology={topology} />}

      {/* vSAN OSA Options */}
      {topology.type === 'vsan_osa' && <VsanOptionsPanel topology={topology} />}

      {/* vSAN ESA Options */}
      {topology.type === 'vsan_esa' && <VsanOptionsPanel topology={topology} />}

      {/* Nutanix Options */}
      {topology.type === 'nutanix' && <NutanixOptionsPanel topology={topology} />}

      {/* PowerVault ME5 Options */}
      {topology.type === 'powervault' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('powervault.title')}
          </h4>

          {/* Show mode description based on selected topology level */}
          <div className="p-3 bg-surface-800 rounded-lg text-xs text-slate-400">
            {topology.level === 'powervault_raid1' && (
              <p>
                <strong className="text-slate-300">RAID 1:</strong> 2-way mirror with 50% storage
                efficiency. Simple, fast rebuilds. Best for boot volumes and small deployments.
              </p>
            )}
            {topology.level === 'powervault_raid5' && (
              <p>
                <strong className="text-slate-300">RAID 5:</strong> Single distributed parity with
                (n-1)/n efficiency. 4x write penalty. Not recommended for write-intensive workloads.
              </p>
            )}
            {topology.level === 'powervault_raid6' && (
              <p>
                <strong className="text-slate-300">RAID 6:</strong> Dual distributed parity with
                (n-2)/n efficiency. 6x write penalty. Better data protection for large capacity
                drives.
              </p>
            )}
            {topology.level === 'powervault_raid10' && (
              <p>
                <strong className="text-slate-300">RAID 10:</strong> Mirrored stripes with 50%
                efficiency. Best random IOPS performance. Ideal for databases.
              </p>
            )}
            {topology.level === 'powervault_adapt' && (
              <p>
                <strong className="text-slate-300">ADAPT:</strong> Distributed RAID with ~87%
                efficiency. Spare capacity distributed across all drives. Fastest rebuilds (8-10x
                faster). Requires 12-128 drives.
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
      )}

      {/* ObjectScale Options */}
      {topology.type === 'objectscale' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
            <Label htmlFor="objectscale-overhead">{t('common.systemOverhead')}</Label>
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
              East-West traffic factor:{' '}
              {Math.round(objectscaleOptions.networkEfficiencyFactor * 100)}%
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
      )}

      {/* PowerStore Options */}
      {topology.type === 'powerstore' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('powerstore.title')}
          </h4>

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
        </div>
      )}

      {/* PowerScale Options */}
      {topology.type === 'powerscale' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
      )}

      {/* Ceph Options */}
      {topology.type === 'ceph' && <CephOptionsPanel />}

      {/* PowerFlex Options */}
      {topology.type === 'powerflex' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('powerflex.title')}
          </h4>

          {/* Show mode description based on selected topology level */}
          <div className="p-3 bg-surface-800 rounded-lg text-xs text-slate-400">
            {topology.level.includes('medium') && (
              <p>
                <strong className="text-slate-300">Medium Granularity (1MB):</strong> Standard mode
                with lower metadata overhead. Supports 2-way and 3-way mirroring.
              </p>
            )}
            {topology.level.includes('fine') && (
              <p>
                <strong className="text-slate-300">Fine Granularity (8KB):</strong> Better for small
                random I/O. Only supports 2-way mirroring. 12-15% metadata overhead.
              </p>
            )}
            {topology.level.includes('ec_') && (
              <p>
                <strong className="text-slate-300">Erasure Coding:</strong> Higher capacity
                efficiency but ~30% lower IOPS due to CPU overhead. Requires PowerFlex 4.5+.
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
              <Label htmlFor="powerflex-fg-overhead">{t('powerflex.fgOverhead')}</Label>
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
            <Label htmlFor="powerflex-fault-sets">{t('powerflex.faultSets')}</Label>
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
      )}

      {/* NetApp Options (proprietary type with netapp_ prefix) */}
      {topology.type === 'proprietary' && topology.level.startsWith('netapp_') && (
        <NetAppOptionsPanel />
      )}

      {/* Synology Options (proprietary type with synology_ prefix) */}
      {topology.type === 'proprietary' && topology.level.startsWith('synology_') && (
        <SynologyOptionsPanel />
      )}
    </div>
  )
}
