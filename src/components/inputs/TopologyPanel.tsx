/**
 * Topology configuration panel - RAID/ZFS/S2D/vSAN/Dell selection.
 */

import {
  Label,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Toggle,
} from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { Topology, TopologyType } from '@/types'

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

// PowerFlex EC scheme options
const POWERFLEX_EC_OPTIONS = [
  { value: '4_1', label: '4+1 (80%)' },
  { value: '4_2', label: '4+2 (67%)' },
  { value: '8_2', label: '8+2 (80%)' },
  { value: '12_4', label: '12+4 (75%)' },
]

const TOPOLOGY_TYPES = [
  { value: 'zfs', label: 'ZFS' },
  { value: 'standard', label: 'RAID' },
  { value: 's2d', label: 'S2D' },
  { value: 'vmware', label: 'vSAN' },
  { value: 'dell', label: 'Dell' },
  { value: 'powerflex', label: 'PowerFlex' },
  { value: 'ceph', label: 'Ceph' },
  { value: 'proprietary', label: 'Other' },
]

const TOPOLOGY_LEVELS: Record<
  TopologyType,
  { value: string; label: string; description: string }[]
> = {
  standard: [
    { value: 'RAID0', label: 'RAID 0', description: 'Stripe, no redundancy' },
    { value: 'RAID1', label: 'RAID 1', description: 'Mirror, 50% capacity' },
    { value: 'RAID5', label: 'RAID 5', description: 'Single parity, n-1 capacity' },
    { value: 'RAID6', label: 'RAID 6', description: 'Double parity, n-2 capacity' },
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
  vmware: [
    {
      value: 'vsan_osa_raid1',
      label: 'vSAN OSA RAID-1',
      description: 'Original Storage Architecture, mirrored (FTT=1)',
    },
    {
      value: 'vsan_osa_raid5',
      label: 'vSAN OSA RAID-5',
      description: 'Original Storage Architecture, single parity (FTT=1)',
    },
    {
      value: 'vsan_osa_raid6',
      label: 'vSAN OSA RAID-6',
      description: 'Original Storage Architecture, dual parity (FTT=2)',
    },
    {
      value: 'vsan_esa_raid1',
      label: 'vSAN ESA RAID-1',
      description: 'Express Storage Architecture, mirrored',
    },
    {
      value: 'vsan_esa_raid5',
      label: 'vSAN ESA RAID-5',
      description: 'Express Storage Architecture, single parity',
    },
    {
      value: 'vsan_esa_raid6',
      label: 'vSAN ESA RAID-6',
      description: 'Express Storage Architecture, dual parity',
    },
  ],
  dell: [
    {
      value: 'powerstore_raid5',
      label: 'PowerStore RAID-5',
      description: 'Dell PowerStore with single parity',
    },
    {
      value: 'powerstore_raid6',
      label: 'PowerStore RAID-6',
      description: 'Dell PowerStore with dual parity',
    },
    {
      value: 'powerscale_n1',
      label: 'PowerScale N+1',
      description: 'Dell PowerScale (Isilon) N+1 protection',
    },
    {
      value: 'powerscale_n2',
      label: 'PowerScale N+2',
      description: 'Dell PowerScale (Isilon) N+2 protection',
    },
    {
      value: 'powerscale_mirror',
      label: 'PowerScale Mirror',
      description: 'Dell PowerScale mirrored protection',
    },
    {
      value: 'objectscale_ec',
      label: 'ObjectScale EC',
      description: 'Dell ObjectScale erasure coding',
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
  proprietary: [
    { value: 'synology_shr', label: 'Synology SHR', description: 'Hybrid RAID, 1-drive fault' },
    { value: 'synology_shr2', label: 'Synology SHR-2', description: 'Hybrid RAID, 2-drive fault' },
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
  const {
    topology,
    hotSpares,
    zfsOptions,
    s2dOptions,
    vsanOptions,
    dellOptions,
    cephOptions,
    powerFlexOptions,
    netAppOptions,
    synologyOptions,
    setTopology,
    setHotSpares,
    setZfsOptions,
    setS2DOptions,
    setVsanOptions,
    setDellOptions,
    setCephOptions,
    setPowerFlexOptions,
    setNetAppOptions,
    setSynologyOptions,
  } = useConfigStore()

  const handleTypeChange = (type: string) => {
    const levels = TOPOLOGY_LEVELS[type as TopologyType]
    const defaultLevel = levels?.[0]?.value ?? 'RAID0'
    setTopology({ type, level: defaultLevel } as Topology)

    // Sync vSAN architecture with default topology level
    if (type === 'vmware') {
      if (defaultLevel.includes('esa')) {
        setVsanOptions({ architecture: 'esa' })
      } else if (defaultLevel.includes('osa')) {
        setVsanOptions({ architecture: 'osa' })
      }
    }
  }

  const handleLevelChange = (level: string) => {
    setTopology({ type: topology.type, level } as Topology)

    // Sync vSAN architecture with topology level
    if (topology.type === 'vmware') {
      if (level.includes('esa')) {
        setVsanOptions({ architecture: 'esa' })
      } else if (level.includes('osa')) {
        setVsanOptions({ architecture: 'osa' })
      }
    }
  }

  const levelOptions = TOPOLOGY_LEVELS[topology.type] || []

  return (
    <div className="space-y-5">
      {/* Topology Type */}
      <div className="space-y-2">
        <Label htmlFor="storage-type">Storage Type</Label>
        <Select
          id="storage-type"
          value={topology.type}
          options={TOPOLOGY_TYPES}
          onChange={handleTypeChange}
        />
      </div>

      {/* Topology Level */}
      <div className="space-y-2">
        <Label htmlFor="topology-level">Configuration</Label>
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
        <Label htmlFor="hot-spares">Hot Spares</Label>
        <Slider id="hot-spares" value={hotSpares} min={0} max={4} onChange={setHotSpares} />
      </div>

      {/* ZFS Options */}
      {topology.type === 'zfs' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            ZFS Options
          </h4>

          <div className="space-y-2">
            <Label htmlFor="ashift">Sector Size (ashift)</Label>
            <Select
              id="ashift"
              value={String(zfsOptions.ashift)}
              options={ASHIFT_OPTIONS}
              onChange={(v) => setZfsOptions({ ashift: Number(v) as 9 | 12 | 13 })}
            />
          </div>

          <Toggle
            id="zfs-compression"
            label="Enable Compression"
            checked={zfsOptions.compression}
            onChange={(v) => setZfsOptions({ compression: v })}
          />

          {zfsOptions.compression && (
            <div className="space-y-2">
              <Label htmlFor="compression-type">Compression Algorithm</Label>
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
            <Label htmlFor="recordsize">Record Size</Label>
            <Select
              id="recordsize"
              value={String(zfsOptions.recordsize)}
              options={RECORDSIZE_OPTIONS}
              onChange={(v) => setZfsOptions({ recordsize: Number(v) })}
            />
          </div>

          <Toggle
            id="zfs-dedup"
            label="Enable Deduplication"
            checked={zfsOptions.dedup}
            onChange={(v) => setZfsOptions({ dedup: v })}
          />

          <Toggle
            id="zfs-special"
            label="Special VDEV (metadata)"
            checked={zfsOptions.specialVdev}
            onChange={(v) => setZfsOptions({ specialVdev: v })}
          />
        </div>
      )}

      {/* S2D Options */}
      {topology.type === 's2d' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            S2D Options
          </h4>

          <div className="space-y-2">
            <Label htmlFor="fault-domains">Fault Domains (Nodes)</Label>
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
              <Label>Mirror Copies</Label>
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
            label="Rebuild Reserve (1 drive/node)"
            checked={s2dOptions.rebuildReserve}
            onChange={(v) => setS2DOptions({ rebuildReserve: v })}
          />

          <Toggle
            id="s2d-tiers"
            label="Storage Tiers Enabled"
            checked={s2dOptions.storageTiers}
            onChange={(v) => setS2DOptions({ storageTiers: v })}
          />
        </div>
      )}

      {/* vSAN Options */}
      {topology.type === 'vmware' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            vSAN Options
          </h4>

          <div className="space-y-2">
            <Label>Architecture</Label>
            <div className="px-3 py-2 bg-surface-700 rounded-md text-sm font-medium text-white">
              {vsanOptions.architecture === 'esa'
                ? 'ESA (Express Storage)'
                : 'OSA (Original Storage)'}
            </div>
            <p className="text-xs text-slate-500">
              {vsanOptions.architecture === 'esa'
                ? 'NVMe-only, single-tier, higher performance'
                : 'Traditional disk groups with caching tier'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Failures To Tolerate (FTT)</Label>
            <SegmentedControl
              value={String(vsanOptions.ftt)}
              options={[
                { value: '1', label: 'FTT=1' },
                { value: '2', label: 'FTT=2' },
                { value: '3', label: 'FTT=3' },
              ]}
              onChange={(v) => setVsanOptions({ ftt: Number(v) as 1 | 2 | 3 })}
            />
          </div>

          <Toggle
            id="vsan-compression"
            label="Enable Compression"
            checked={vsanOptions.compression}
            onChange={(v) => setVsanOptions({ compression: v })}
          />

          <Toggle
            id="vsan-dedup"
            label="Enable Deduplication"
            checked={vsanOptions.dedup}
            onChange={(v) => setVsanOptions({ dedup: v })}
          />

          <Toggle
            id="vsan-encryption"
            label="Enable Encryption"
            checked={vsanOptions.encryption}
            onChange={(v) => setVsanOptions({ encryption: v })}
          />
        </div>
      )}

      {/* Dell Options */}
      {topology.type === 'dell' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Dell Platform Options
          </h4>

          <div className="space-y-2">
            <Label>Platform</Label>
            <SegmentedControl
              value={dellOptions.platform}
              options={[
                { value: 'powerstore', label: 'PowerStore' },
                { value: 'powerscale', label: 'PowerScale' },
                { value: 'objectscale', label: 'ObjectScale' },
              ]}
              onChange={(v) =>
                setDellOptions({ platform: v as 'objectscale' | 'powerscale' | 'powerstore' })
              }
            />
            <p className="text-xs text-slate-500">
              {dellOptions.platform === 'powerstore'
                ? 'Unified block/file storage with NVMe'
                : dellOptions.platform === 'powerscale'
                  ? 'Scale-out NAS (formerly Isilon)'
                  : 'S3-compatible object storage'}
            </p>
          </div>

          <Toggle
            id="dell-compression"
            label="Enable Compression"
            checked={dellOptions.compression}
            onChange={(v) => setDellOptions({ compression: v })}
          />

          <Toggle
            id="dell-dedup"
            label="Enable Deduplication"
            checked={dellOptions.dedup}
            onChange={(v) => setDellOptions({ dedup: v })}
          />
        </div>
      )}

      {/* Ceph Options */}
      {topology.type === 'ceph' && (
        <div className="space-y-4 pt-3 border-t border-surface-700">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Ceph Options
          </h4>

          <div className="space-y-2">
            <Label>Storage Backend</Label>
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
            label="Enable Compression"
            checked={cephOptions.compression}
            onChange={(v) => setCephOptions({ compression: v })}
          />

          {cephOptions.compression && (
            <div className="space-y-2">
              <Label>Compression Algorithm</Label>
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
            label="Enable Encryption"
            checked={cephOptions.encryption}
            onChange={(v) => setCephOptions({ encryption: v })}
          />

          <Toggle
            id="ceph-journal-ssd"
            label="Journal/WAL on SSD"
            checked={cephOptions.journalOnSsd}
            onChange={(v) => setCephOptions({ journalOnSsd: v })}
          />

          <Toggle
            id="ceph-wal-db-offload"
            label="WAL/DB on Separate NVMe"
            checked={cephOptions.walDbOffload}
            onChange={(v) => setCephOptions({ walDbOffload: v })}
          />

          {cephOptions.walDbOffload && (
            <div className="space-y-2">
              <Label htmlFor="ceph-wal-ratio">HDDs per WAL/DB NVMe</Label>
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
          )}

          <div className="space-y-2">
            <Label htmlFor="ceph-safe-capacity">Safe Capacity Threshold</Label>
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
            PowerFlex Options
          </h4>

          <div className="space-y-2">
            <Label>Granularity</Label>
            <SegmentedControl
              value={powerFlexOptions.granularity}
              options={[
                { value: 'medium', label: 'Medium (1MB)' },
                { value: 'fine', label: 'Fine (8KB)' },
              ]}
              onChange={(v) => setPowerFlexOptions({ granularity: v as 'medium' | 'fine' })}
            />
            <p className="text-xs text-slate-500">
              {powerFlexOptions.granularity === 'fine'
                ? 'Fine granularity: Better for small I/O, 12-15% metadata overhead'
                : 'Medium granularity: Standard mode, lower overhead'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Protection Mode</Label>
            <SegmentedControl
              value={powerFlexOptions.protectionMode}
              options={[
                { value: 'mirror', label: 'Mirror' },
                { value: 'erasure', label: 'Erasure Coding' },
              ]}
              onChange={(v) => setPowerFlexOptions({ protectionMode: v as 'mirror' | 'erasure' })}
            />
          </div>

          {powerFlexOptions.protectionMode === 'mirror' && (
            <div className="space-y-2">
              <Label>Mirror Copies</Label>
              <SegmentedControl
                value={String(powerFlexOptions.mirrorCopies)}
                options={[
                  { value: '2', label: '2-way' },
                  { value: '3', label: '3-way' },
                ]}
                onChange={(v) => setPowerFlexOptions({ mirrorCopies: Number(v) as 2 | 3 })}
              />
            </div>
          )}

          {powerFlexOptions.protectionMode === 'erasure' && (
            <div className="space-y-2">
              <Label>EC Scheme</Label>
              <Select
                id="powerflex-ec-scheme"
                value={powerFlexOptions.ecScheme}
                options={POWERFLEX_EC_OPTIONS}
                onChange={(v) =>
                  setPowerFlexOptions({ ecScheme: v as '4_1' | '4_2' | '8_2' | '12_4' })
                }
              />
              <p className="text-xs text-slate-500">
                Erasure coding reduces IOPS by ~30% due to CPU overhead
              </p>
            </div>
          )}

          <Toggle
            id="powerflex-compression"
            label="Enable Compression"
            checked={powerFlexOptions.compression}
            onChange={(v) => setPowerFlexOptions({ compression: v })}
          />

          {powerFlexOptions.compression && (
            <div className="space-y-2">
              <Label htmlFor="powerflex-compression-ratio">Compression Ratio</Label>
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

          {powerFlexOptions.granularity === 'fine' && (
            <div className="space-y-2">
              <Label htmlFor="powerflex-fg-overhead">FG Metadata Overhead</Label>
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
            <Label htmlFor="powerflex-fault-sets">Fault Sets</Label>
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
            NetApp ONTAP Options
          </h4>

          <div className="space-y-2">
            <Label htmlFor="netapp-platform">Platform</Label>
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
            <Label>RAID Type</Label>
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
            <Label htmlFor="netapp-adp">Advanced Drive Partitioning</Label>
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
            <Label htmlFor="netapp-snapshot-reserve">Snapshot Reserve</Label>
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
            label="Inline Compression"
            checked={netAppOptions.compression}
            onChange={(v) => setNetAppOptions({ compression: v })}
          />

          <Toggle
            id="netapp-dedup"
            label="Inline Deduplication"
            checked={netAppOptions.dedup}
            onChange={(v) => setNetAppOptions({ dedup: v })}
          />

          <Toggle
            id="netapp-zero-detection"
            label="Zero-Block Detection"
            checked={netAppOptions.zeroDetection}
            onChange={(v) => setNetAppOptions({ zeroDetection: v })}
          />

          {(netAppOptions.compression || netAppOptions.dedup) && (
            <div className="space-y-2">
              <Label htmlFor="netapp-drr">Data Reduction Ratio</Label>
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
            <Label htmlFor="netapp-wafl">WAFL Overhead</Label>
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
            Synology Options
          </h4>

          <div className="space-y-2">
            <Label>Filesystem</Label>
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
            <Label htmlFor="synology-model">Model Series</Label>
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
            label="SSD Cache"
            checked={synologyOptions.ssdCache}
            onChange={(v) => setSynologyOptions({ ssdCache: v })}
          />

          {synologyOptions.ssdCache && (
            <div className="space-y-2">
              <Label>Cache Mode</Label>
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
            <Label htmlFor="synology-system-partition">System Partition Size</Label>
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
