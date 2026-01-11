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

const TOPOLOGY_TYPES = [
  { value: 'zfs', label: 'ZFS' },
  { value: 'standard', label: 'RAID' },
  { value: 's2d', label: 'S2D' },
  { value: 'vmware', label: 'vSAN' },
  { value: 'dell', label: 'Dell' },
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
    setTopology,
    setHotSpares,
    setZfsOptions,
    setS2DOptions,
    setVsanOptions,
    setDellOptions,
    setCephOptions,
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
            <SegmentedControl
              value={vsanOptions.architecture}
              options={[
                { value: 'osa', label: 'OSA' },
                { value: 'esa', label: 'ESA' },
              ]}
              onChange={(v) => setVsanOptions({ architecture: v as 'osa' | 'esa' })}
            />
            <p className="text-xs text-slate-500">
              {vsanOptions.architecture === 'esa'
                ? 'Express Storage Architecture - NVMe-optimized, higher performance'
                : 'Original Storage Architecture - Traditional disk groups'}
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
        </div>
      )}
    </div>
  )
}
