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
import { useConfigStore } from '@/store'
import type { Topology, TopologyType } from '@/types'
import { DEFAULT_TIERING_CONFIG } from '@/types'

// NetApp platform options
const NETAPP_PLATFORM_OPTIONS = [
  { value: 'aff_a', label: 'AFF A-Series' },
  { value: 'aff_c', label: 'AFF C-Series' },
  { value: 'fas', label: 'FAS' },
  { value: 'asa', label: 'ASA (SAN)' },
  { value: 'e_series', label: 'E-Series' },
]

const NETAPP_ADP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'adpv1', label: 'ADP v1' },
  { value: 'adpv2', label: 'ADP v2 (Root-Data)' },
]

// Synology model series options
const SYNOLOGY_MODEL_OPTIONS = [
  { value: 'j', label: 'J Series (Entry)' },
  { value: 'value', label: 'Value Series' },
  { value: 'plus', label: 'Plus Series' },
  { value: 'xs', label: 'XS/XS+ (Enterprise)' },
]

const TOPOLOGY_TYPES = [
  { value: 'standard', label: 'RAID' },
  { value: 'ceph', label: 'Ceph' },
  { value: 'nutanix', label: 'Nutanix' },
  { value: 's2d', label: 'S2D' },
  { value: 'vsan_esa', label: 'vSAN ESA' },
  { value: 'vsan_osa', label: 'vSAN OSA' },
  { value: 'zfs', label: 'ZFS' },
  { value: 'objectscale', label: 'ObjectScale' },
  { value: 'powerflex', label: 'PowerFlex' },
  { value: 'powerscale', label: 'PowerScale' },
  { value: 'powerstore', label: 'PowerStore' },
  { value: 'powervault', label: 'PowerVault ME5' },
  { value: 'proprietary', label: 'Other' },
]

const TOPOLOGY_LEVELS: Record<
  TopologyType,
  { value: string; label: string; description: string }[]
> = {
  standard: [
    { value: 'RAID0', label: 'RAID 0', description: 'Stripe, no redundancy' },
    { value: 'RAID1', label: 'RAID 1', description: 'Mirror (2-way), 50% capacity' },
    { value: 'RAID1E', label: 'RAID 1E', description: 'Mirrored stripe, 50% capacity, 3+ drives' },
    { value: 'RAID1_3WAY', label: '3-Way Mirror', description: 'Triple mirror, 33% capacity' },
    {
      value: 'RAID3',
      label: 'RAID 3',
      description: 'Byte-stripe + dedicated parity, sequential I/O',
    },
    { value: 'RAID4', label: 'RAID 4', description: 'Block-stripe + dedicated parity' },
    { value: 'RAID5', label: 'RAID 5', description: 'Single distributed parity, n-1 capacity' },
    {
      value: 'RAID5E',
      label: 'RAID 5E',
      description: 'RAID 5 + integrated hot spare, n-2 capacity',
    },
    { value: 'RAID5EE', label: 'RAID 5EE', description: 'RAID 5E Enhanced, active spare' },
    { value: 'RAID6', label: 'RAID 6', description: 'Double distributed parity, n-2 capacity' },
    { value: 'RAID10', label: 'RAID 10', description: 'Mirrored stripes, 50% capacity' },
    { value: 'RAID50', label: 'RAID 50', description: 'Striped RAID 5 groups' },
    { value: 'RAID60', label: 'RAID 60', description: 'Striped RAID 6 groups' },
  ],
  zfs: [
    { value: 'stripe', label: 'Stripe', description: 'No redundancy, max capacity' },
    { value: 'mirror', label: 'Mirror', description: '2-way mirror, 50% capacity' },
    { value: 'raidz1', label: 'RAID-Z1', description: 'Single parity, n-1 capacity' },
    { value: 'raidz2', label: 'RAID-Z2', description: 'Double parity, n-2 capacity' },
    { value: 'raidz3', label: 'RAID-Z3', description: 'Triple parity, n-3 capacity' },
    { value: 'draid1', label: 'dRAID1', description: 'Distributed RAID-Z1' },
    { value: 'draid2', label: 'dRAID2', description: 'Distributed RAID-Z2' },
    { value: 'draid3', label: 'dRAID3', description: 'Distributed RAID-Z3' },
  ],
  s2d: [
    { value: 'simple', label: 'Simple', description: 'No redundancy' },
    { value: 'mirror', label: 'Mirror', description: '2-way or 3-way mirror' },
    { value: 'parity', label: 'Parity', description: 'Single parity' },
    { value: 'dual_parity', label: 'Dual Parity', description: 'Erasure coding' },
    { value: 'map', label: 'MAP', description: 'Mirror-Accelerated Parity' },
  ],
  vsan_osa: [
    {
      value: 'vsan_osa_raid1',
      label: 'RAID-1 (Mirror)',
      description: 'FTT=1, min 3 hosts, 50% efficiency',
    },
    {
      value: 'vsan_osa_raid1_ftt2',
      label: 'RAID-1 FTT=2',
      description: 'FTT=2, min 5 hosts, 33% efficiency',
    },
    {
      value: 'vsan_osa_raid5',
      label: 'RAID-5 Erasure Coding',
      description: 'FTT=1, min 4 hosts, 75% efficiency, write penalty',
    },
    {
      value: 'vsan_osa_raid6',
      label: 'RAID-6 Erasure Coding',
      description: 'FTT=2, min 6 hosts, 67% efficiency, write penalty',
    },
  ],
  vsan_esa: [
    {
      value: 'vsan_esa_raid5',
      label: 'RAID-5 Adaptive (Recommended)',
      description: 'Optimizes stripe width for cluster size, min 3 hosts, 67-80% efficiency',
    },
    {
      value: 'vsan_esa_raid6',
      label: 'RAID-6 Erasure Coding',
      description: 'FTT=2, min 6 hosts, 67% efficiency',
    },
    {
      value: 'vsan_esa_raid1',
      label: 'RAID-1 (Mirror)',
      description: 'Only recommended for 2-node clusters, 50% efficiency',
    },
  ],
  objectscale: [
    {
      value: 'objectscale_ec_12_4',
      label: 'EC 12+4 (Default)',
      description: '75% efficiency, min 5 nodes, tolerates 4 failures',
    },
    {
      value: 'objectscale_ec_10_2',
      label: 'EC 10+2 (Cold/Archive)',
      description: '83% efficiency, min 7 nodes, tolerates 2 failures',
    },
    {
      value: 'objectscale_ec_24_4',
      label: 'EC 24+4 (Preview)',
      description: '86% efficiency, min 8 nodes, tech preview',
    },
    {
      value: 'objectscale_mirror_3',
      label: 'Triple Mirror',
      description: '33% efficiency, for metadata/small configs',
    },
  ],
  powerstore: [
    {
      value: 'powerstore_raid5',
      label: 'RAID-5',
      description: 'Single parity, ~80% efficiency',
    },
    {
      value: 'powerstore_raid6',
      label: 'RAID-6',
      description: 'Dual parity, ~75% efficiency',
    },
    {
      value: 'powerstore_raid10',
      label: 'RAID-10',
      description: 'Mirrored stripes, 50% efficiency',
    },
  ],
  powerscale: [
    {
      value: 'powerscale_n1',
      label: 'N+1',
      description: 'Single parity protection',
    },
    {
      value: 'powerscale_n2',
      label: 'N+2',
      description: 'Double parity protection',
    },
    {
      value: 'powerscale_n2_1',
      label: 'N+2:1',
      description: 'N+2 with stripe failure tolerance',
    },
    {
      value: 'powerscale_n3',
      label: 'N+3',
      description: 'Triple parity protection',
    },
    {
      value: 'powerscale_n4',
      label: 'N+4',
      description: 'Quad parity protection',
    },
    {
      value: 'powerscale_mirror_2x',
      label: 'Mirror 2x',
      description: '2-way mirrored, 50% efficiency',
    },
    {
      value: 'powerscale_mirror_3x',
      label: 'Mirror 3x',
      description: '3-way mirrored, 33% efficiency',
    },
  ],
  powerflex: [
    {
      value: 'powerflex_medium_2way',
      label: 'Medium 2-way',
      description: 'Medium granularity, 2-way mirror, 50% efficiency',
    },
    {
      value: 'powerflex_medium_3way',
      label: 'Medium 3-way',
      description: 'Medium granularity, 3-way mirror, 33% efficiency',
    },
    {
      value: 'powerflex_fine_2way',
      label: 'Fine 2-way',
      description: 'Fine granularity (8KB), 2-way mirror only, ~42.5% efficiency',
    },
    {
      value: 'powerflex_ec_4_1',
      label: 'EC 4+1',
      description: 'Erasure coding 4+1, 80% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_4_2',
      label: 'EC 4+2',
      description: 'Erasure coding 4+2, 67% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_8_2',
      label: 'EC 8+2',
      description: 'Erasure coding 8+2, 80% efficiency, -30% IOPS',
    },
    {
      value: 'powerflex_ec_12_4',
      label: 'EC 12+4',
      description: 'Erasure coding 12+4, 75% efficiency, -30% IOPS',
    },
  ],
  ceph: [
    {
      value: 'ceph_replicated_2',
      label: 'Replicated 2x',
      description: '2-way replication, 50% efficiency',
    },
    {
      value: 'ceph_replicated_3',
      label: 'Replicated 3x',
      description: '3-way replication, 33% efficiency',
    },
    {
      value: 'ceph_ec_2_1',
      label: 'EC 2+1',
      description: 'Erasure coded k=2, m=1, 67% efficiency',
    },
    {
      value: 'ceph_ec_4_2',
      label: 'EC 4+2',
      description: 'Erasure coded k=4, m=2, 67% efficiency',
    },
    {
      value: 'ceph_ec_8_3',
      label: 'EC 8+3',
      description: 'Erasure coded k=8, m=3, 73% efficiency',
    },
    {
      value: 'ceph_ec_8_4',
      label: 'EC 8+4',
      description: 'Erasure coded k=8, m=4, 67% efficiency',
    },
  ],
  nutanix: [
    {
      value: 'nutanix_rf2',
      label: 'RF2',
      description: 'Replication Factor 2 (2 copies), 50% efficiency',
    },
    {
      value: 'nutanix_rf3',
      label: 'RF3',
      description: 'Replication Factor 3 (3 copies), 33% efficiency',
    },
    {
      value: 'nutanix_ec_rf2',
      label: 'EC-X (RF2)',
      description: 'Erasure Coding 4:1 with RF2 base, ~75% efficiency',
    },
    {
      value: 'nutanix_ec_rf3',
      label: 'EC-X (RF3)',
      description: 'Erasure Coding 6:2 with RF3 base, ~75% efficiency',
    },
  ],
  powervault: [
    { value: 'powervault_raid1', label: 'RAID 1', description: '2-way mirror, 50% efficiency' },
    {
      value: 'powervault_raid5',
      label: 'RAID 5',
      description: 'Single parity, 4x write penalty',
    },
    {
      value: 'powervault_raid6',
      label: 'RAID 6',
      description: 'Dual parity, 2-drive fault tolerance',
    },
    {
      value: 'powervault_raid10',
      label: 'RAID 10',
      description: 'Mirrored stripes, best random IOPS',
    },
    {
      value: 'powervault_adapt',
      label: 'ADAPT (Recommended)',
      description: 'Distributed RAID, ~87% efficiency, 12-128 drives',
    },
  ],
  proprietary: [
    { value: 'synology_shr', label: 'Synology SHR', description: 'Hybrid RAID, 1-drive fault' },
    { value: 'synology_shr2', label: 'Synology SHR-2', description: 'Hybrid RAID, 2-drive fault' },
    {
      value: 'synology_raid_f1',
      label: 'Synology RAID F1',
      description: 'All-Flash optimized, uneven parity rotation',
    },
    { value: 'netapp_raid_dp', label: 'NetApp RAID-DP', description: 'Double parity' },
    { value: 'netapp_raid_tec', label: 'NetApp RAID-TEC', description: 'Triple parity' },
  ],
}

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

export function TopologyPanel() {
  const { t } = useTranslation('topology')
  const {
    topology,
    hotSpares,
    serverCount,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    objectscaleOptions,
    powerstoreOptions,
    powerscaleOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    nutanixOptions,
    powervaultOptions,
    setTopology,
    setHotSpares,
    setZfsOptions,
    setS2DOptions,
    setVsanOptions,
    setObjectScaleOptions,
    setPowerStoreOptions,
    setPowerScaleOptions,
    setCephOptions,
    setPowerFlexOptions,
    setNetAppOptions,
    setSynologyOptions,
    setNutanixOptions,
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
      {topology.type === 'zfs' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('zfs.title')}
          </h4>

          <div className="space-y-2">
            <Label htmlFor="ashift">{t('zfs.ashift')}</Label>
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
              <Label htmlFor="compression-type">{t('zfs.compressionAlgorithm')}</Label>
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
            <Label htmlFor="recordsize">{t('zfs.recordSize')}</Label>
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
      )}

      {/* S2D Options */}
      {topology.type === 's2d' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('s2d.title')}
          </h4>

          <div className="space-y-2">
            <Label htmlFor="fault-domains">{t('s2d.faultDomains')}</Label>
            <NumberInput
              id="fault-domains"
              value={s2dOptions.faultDomains}
              min={2}
              max={16}
              onChange={(v) => setS2DOptions({ faultDomains: v })}
            />
          </div>

          {(topology.level === 'mirror' || topology.level === 'map') && (
            <div className="space-y-2">
              <Label>{t('s2d.mirrorCopies')}</Label>
              <SegmentedControl
                value={String(s2dOptions.mirrorCopies)}
                options={[
                  { value: '2', label: '2-way' },
                  { value: '3', label: '3-way' },
                ]}
                onChange={(v) => setS2DOptions({ mirrorCopies: Number(v) as 2 | 3 })}
              />
            </div>
          )}

          <Toggle
            id="s2d-reserve"
            label={t('s2d.rebuildReserve')}
            checked={s2dOptions.rebuildReserve}
            onChange={(v) => setS2DOptions({ rebuildReserve: v })}
          />

          <Toggle
            id="s2d-tiers"
            label={t('s2d.storageTiers')}
            checked={s2dOptions.storageTiers}
            onChange={(v) => setS2DOptions({ storageTiers: v })}
          />

          {s2dOptions.storageTiers && (
            <TieringPanel
              config={s2dOptions.tieringConfig ?? DEFAULT_TIERING_CONFIG}
              onChange={(tieringConfig) =>
                setS2DOptions({
                  tieringConfig: {
                    ...DEFAULT_TIERING_CONFIG,
                    ...s2dOptions.tieringConfig,
                    ...tieringConfig,
                  },
                })
              }
              serverCount={serverCount}
              platform="s2d"
            />
          )}
        </div>
      )}

      {/* vSAN OSA Options */}
      {topology.type === 'vsan_osa' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('vsanOsa.title')}
          </h4>

          {/* Configuration info box */}
          <div className="p-3 bg-surface-800 rounded-lg text-xs text-slate-400">
            {topology.level === 'vsan_osa_raid1' && (
              <p>
                <strong className="text-slate-300">RAID-1 FTT=1:</strong> 2-way mirror, requires
                minimum 3 hosts. 50% storage efficiency. Best read performance.
              </p>
            )}
            {topology.level === 'vsan_osa_raid1_ftt2' && (
              <p>
                <strong className="text-slate-300">RAID-1 FTT=2:</strong> 3-way mirror, requires
                minimum 5 hosts. 33% storage efficiency. Maximum fault tolerance.
              </p>
            )}
            {topology.level === 'vsan_osa_raid5' && (
              <p>
                <strong className="text-slate-300">RAID-5 (3+1):</strong> Single parity, requires
                minimum 4 hosts. 75% efficiency. 4x write penalty vs mirror.
              </p>
            )}
            {topology.level === 'vsan_osa_raid6' && (
              <p>
                <strong className="text-slate-300">RAID-6 (4+2):</strong> Dual parity, requires
                minimum 6 hosts. 67% efficiency. 6x write penalty vs mirror.
              </p>
            )}
            <p className="mt-2 text-slate-500">
              OSA uses disk groups with cache tier (NVMe/SSD) + capacity tier (SSD/HDD).
            </p>
          </div>

          <Toggle
            id="vsan-compression"
            label={t('common.enableCompression')}
            checked={vsanOptions.compression}
            onChange={(v) => setVsanOptions({ compression: v })}
          />

          <Toggle
            id="vsan-dedup"
            label={t('common.enableDedup')}
            checked={vsanOptions.dedup}
            onChange={(v) => setVsanOptions({ dedup: v })}
          />

          <Toggle
            id="vsan-encryption"
            label={t('common.enableEncryption')}
            checked={vsanOptions.encryption}
            onChange={(v) => setVsanOptions({ encryption: v })}
          />

          {/* Disk Group Tiering */}
          <div className="pt-3 border-t border-surface-700">
            <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
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
        </div>
      )}

      {/* vSAN ESA Options */}
      {topology.type === 'vsan_esa' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('vsanEsa.title')}
          </h4>

          {/* Configuration info box */}
          <div className="p-3 bg-surface-800 rounded-lg text-xs text-slate-400">
            {topology.level === 'vsan_esa_raid5' && (
              <>
                <p>
                  <strong className="text-slate-300">Adaptive RAID-5:</strong> Uses 2+1 for 3-5
                  hosts (67% efficiency) or 4+1 for 6+ hosts (80% efficiency). Near RAID-1
                  performance with ~2.5x write penalty.
                </p>
                <p className="mt-1 text-green-400">Recommended for most ESA deployments.</p>
              </>
            )}
            {topology.level === 'vsan_esa_raid6' && (
              <p>
                <strong className="text-slate-300">RAID-6 (4+2):</strong> FTT=2, requires minimum 6
                hosts. 67% efficiency. ~3.5x write penalty (much better than OSA RAID-6).
              </p>
            )}
            {topology.level === 'vsan_esa_raid1' && (
              <p>
                <strong className="text-slate-300">RAID-1 (Mirror):</strong> Only recommended for
                2-node stretched clusters. 50% efficiency. Use RAID-5 for better efficiency in 3+
                node clusters.
              </p>
            )}
            <p className="mt-2 text-slate-500">
              ESA is a single-tier architecture. NVMe drives only, no disk groups.
            </p>
          </div>

          {/* NVMe requirement notice */}
          <div className="p-2 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300">
            vSAN ESA requires NVMe drives only. Each drive serves both cache and capacity.
          </div>

          <Toggle
            id="vsan-esa-compression"
            label={t('common.enableCompression')}
            checked={vsanOptions.compression}
            onChange={(v) => setVsanOptions({ compression: v })}
          />

          <Toggle
            id="vsan-esa-dedup"
            label={t('common.enableDedup')}
            checked={vsanOptions.dedup}
            onChange={(v) => setVsanOptions({ dedup: v })}
          />

          <Toggle
            id="vsan-esa-encryption"
            label={t('common.enableEncryption')}
            checked={vsanOptions.encryption}
            onChange={(v) => setVsanOptions({ encryption: v })}
          />
        </div>
      )}

      {/* Nutanix Options */}
      {topology.type === 'nutanix' && (
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
      )}

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
      {topology.type === 'ceph' && (
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
      )}

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
            <Label htmlFor="netapp-adp">{t('netapp.adp')}</Label>
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
            <Label htmlFor="netapp-snapshot-reserve">{t('common.snapshotReserve')}</Label>
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
            <Label htmlFor="netapp-wafl">{t('netapp.waflOverhead')}</Label>
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
      )}

      {/* Synology Options (proprietary type with synology_ prefix) */}
      {topology.type === 'proprietary' && topology.level.startsWith('synology_') && (
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
              onChange={(v) =>
                setSynologyOptions({ modelSeries: v as 'j' | 'value' | 'plus' | 'xs' })
              }
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
      )}
    </div>
  )
}
