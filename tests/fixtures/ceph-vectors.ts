/**
 * Ceph capacity test vectors — sources recorded per vector and in
 * .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is compared against VolumetryResult.usableCapacity, i.e. AFTER replication/EC
 * data-fraction, AFTER the ~2% BlueStore filesystem-overhead layer, AND AFTER the Ceph
 * safeCapacityThreshold ("nearfull") multiplier (default 0.85). The engine applies these in that
 * order (`src/engines/volumetry/index.ts:228-247`):
 *   1. capacityAfterParity = rawUsableCapacity × dataFraction
 *   2. usableCapacity      = capacityAfterParity × (1 − filesystemOverhead)   [ceph fs overhead = 2%,
 *      src/engines/volumetry/overhead/filesystem-overhead.ts:83-85]
 *   3. usableCapacity      = usableCapacity × cephOptions.safeCapacityThreshold (0.85 default)
 *
 * APPLES-TO-APPLES NOTE: Ceph community sources (calculators, docs.ceph.com) generally state
 * raw → usable BEFORE any nearfull headroom is subtracted — nearfull (mon_osd_nearfull_ratio) is
 * a cluster HEALTH_WARN threshold, not a capacity-planning discount, in the docs. This fixture's
 * expectedUsable values are computed WITH the nearfull multiplier applied (post-nearfull), to
 * match what the engine actually returns in VolumetryResult.usableCapacity. Each vector's
 * comment shows the full raw → data-fraction → fs-overhead → nearfull derivation so the
 * pre-nearfull ("raw external" number) is always visible.
 *
 * HONESTY NOTE (binding): of the pipeline's three multiplicative layers, TWO are genuinely
 * Ceph-published and match the engine's implementation exactly:
 *   - Replicated-pool data fraction = raw / size (replica count). docs.ceph.com/en/reef/rados/
 *     operations/pools/ documents `size` (replica count, default 3) as the pool parameter that
 *     directly sets this fraction (usable = raw / size). Matches
 *     src/engines/volumetry/strategies/ceph.ts exactly: `1 / replicationFactor` (and the
 *     hardcoded 1/2, 1/3 cases for ceph_replicated_2 / ceph_replicated_3).
 *     https://docs.ceph.com/en/reef/rados/operations/pools/
 *   - Erasure-coded pool data fraction = k / (k + m) ("overhead factor (space amplification) =
 *     (k+m)/k", worked 4,2 example given explicitly). docs.ceph.com/en/reef/rados/operations/
 *     erasure-code/ Matches src/engines/volumetry/strategies/ceph.ts exactly:
 *     `ecK / (ecK + ecM)` (and the hardcoded 4/6, 8/11 cases for ceph_ec_4_2, ceph_ec_8_3).
 *     https://docs.ceph.com/en/reef/rados/operations/erasure-code
 *   - `mon_osd_nearfull_ratio` default = 0.85 (85%), documented in the Ceph Monitor Config
 *     Reference. Matches `DEFAULT_CEPH_OPTIONS.safeCapacityThreshold = 0.85` exactly.
 *     https://docs.ceph.com/en/reef/rados/configuration/mon-config-ref/
 *
 * The THIRD layer — the ~2% BlueStore filesystem/metadata overhead
 * (`src/engines/volumetry/overhead/filesystem-overhead.ts:83-85`, code comment "~1-2% for
 * metadata, OSD journals") — is an [engine-formula analog], NOT an independently published
 * Ceph number: no docs.ceph.com page states a fixed "2% BlueStore overhead" constant (actual
 * BlueStore metadata overhead varies with object/OSD count, `bluestore_min_alloc_size`, and
 * RocksDB/WAL sizing, and is not summarized anywhere as a flat percentage). It plays the same
 * generic small-fs-overhead role documented for xfs/ext4/zfs/vsan/nutanix elsewhere in
 * `filesystem-overhead.ts` (see NetApp Task 5 honesty note on `waflOverhead` for the identical
 * pattern). It is included in expectedUsable below (because the comparison target,
 * VolumetryResult.usableCapacity, includes it), but is not one of the genuinely-external layers.
 *
 * Genuinely-external vector count: 4/4 vectors combine a genuinely-published data-fraction
 * layer (replicated size or EC k/(k+m)) with the genuinely-published 0.85 nearfull ratio; all
 * 4 also carry the one engine-formula-analog fs-overhead layer (2%) needed to match the
 * engine's actual usableCapacity output. Coverage should not be read as validating the
 * BlueStore fs-overhead constant itself.
 */
import type { CephTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

export type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function ceph(level: CephTopology): Topology {
  return { type: 'ceph', level }
}

export const cephVectors: PlatformVector[] = [
  {
    // Replicated size=2 (2-way replication): data fraction = 1/2 (docs.ceph.com/rados/
    // operations/pools). Pipeline: 6 TB raw usable x 0.5 = 3 TB after replication;
    // x 0.98 (2% BlueStore fs-overhead engine-formula analog) = 2.94 TB;
    // x 0.85 (mon_osd_nearfull_ratio default, docs.ceph.com/rados/configuration/mon-config-ref)
    // = 2.499 TB.
    name: 'Ceph replicated size=2, 6 drives / 3 nodes',
    topology: ceph('ceph_replicated_2'),
    drives: 6,
    serverCount: 3,
    driveSize: TB,
    expectedUsable: 2_499_000_000_000,
    tolerance: 0.01,
    source:
      'docs.ceph.com pools (replicated size -> usable = raw/size) [genuinely external] + mon-config-ref (mon_osd_nearfull_ratio default 0.85) [genuinely external]; 2% BlueStore fs-overhead layer is [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.ceph.com/en/reef/rados/operations/pools/',
  },
  {
    // Replicated size=3 (3-way replication, Ceph's documented default): data fraction = 1/3.
    // Pipeline: 12 TB raw usable x (1/3) = 4 TB after replication; x 0.98 = 3.92 TB;
    // x 0.85 = 3.332 TB.
    name: 'Ceph replicated size=3 (default), 12 drives / 4 nodes',
    topology: ceph('ceph_replicated_3'),
    drives: 12,
    serverCount: 4,
    driveSize: TB,
    expectedUsable: 3_332_000_000_000,
    tolerance: 0.01,
    source:
      'docs.ceph.com pools (replicated size -> usable = raw/size, size=3 documented default) [genuinely external] + mon-config-ref (mon_osd_nearfull_ratio default 0.85) [genuinely external]; 2% BlueStore fs-overhead layer is [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.ceph.com/en/reef/rados/operations/pools/',
  },
  {
    // Erasure coded k=4, m=2 ("4,2" profile): data fraction = k/(k+m) = 4/6 = 66.7%
    // (docs.ceph.com/rados/operations/erasure-code worked 4,2 example: overhead factor 1.5 =
    // (4+2)/4). Pipeline: 12 TB raw usable x (4/6) = 8 TB after EC; x 0.98 = 7.84 TB;
    // x 0.85 = 6.664 TB.
    name: 'Ceph erasure coded 4+2, 12 drives / 6 nodes',
    topology: ceph('ceph_ec_4_2'),
    drives: 12,
    serverCount: 6,
    driveSize: TB,
    expectedUsable: 6_664_000_000_000,
    tolerance: 0.01,
    source:
      'docs.ceph.com erasure-code (overhead factor (k+m)/k, worked 4,2 example -> efficiency k/(k+m)=4/6) [genuinely external] + mon-config-ref (mon_osd_nearfull_ratio default 0.85) [genuinely external]; 2% BlueStore fs-overhead layer is [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.ceph.com/en/reef/rados/operations/erasure-code',
  },
  {
    // Erasure coded k=8, m=3 ("8,3" profile): data fraction = k/(k+m) = 8/11 = 72.7%.
    // Pipeline: 22 TB raw usable x (8/11) = 16 TB after EC; x 0.98 = 15.68 TB;
    // x 0.85 = 13.328 TB.
    name: 'Ceph erasure coded 8+3, 22 drives / 11 nodes',
    topology: ceph('ceph_ec_8_3'),
    drives: 22,
    serverCount: 11,
    driveSize: TB,
    expectedUsable: 13_328_000_000_000,
    tolerance: 0.01,
    source:
      'docs.ceph.com erasure-code (overhead factor (k+m)/k -> efficiency k/(k+m)=8/11 for 8,3) [genuinely external] + mon-config-ref (mon_osd_nearfull_ratio default 0.85) [genuinely external]; 2% BlueStore fs-overhead layer is [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.ceph.com/en/reef/rados/operations/erasure-code',
  },
]
