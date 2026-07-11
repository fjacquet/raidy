/**
 * Synology capacity test vectors — sources recorded per vector and in
 * .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is compared against VolumetryResult.usableCapacity, i.e. AFTER the DSM system
 * partition reservation, AFTER SHR/SHR-2/RAID F1 parity efficiency, AND AFTER the Btrfs 4%
 * filesystem-overhead layer. The engine applies these in that order
 * (`src/engines/volumetry/index.ts:163-210`, `src/engines/volumetry/overhead/overheadCalculator.ts:210`):
 *   1. capacityAfterSysPartition = (drive.capacity_raw x usableDrives) - (systemPartitionSize x usableDrives)
 *   2. capacityAfterParity       = capacityAfterSysPartition x dataFraction   [SHR: (N-1)/N,
 *      SHR-2: (N-2)/N, RAID F1: (N-1)/N — `src/engines/volumetry/strategies/proprietary.ts:16-32`]
 *   3. usableCapacity            = capacityAfterParity x (1 - btrfsOverhead)  [Btrfs 4%,
 *      `FILESYSTEM_OVERHEAD.btrfs` in src/types/topology.ts:717, applied via
 *      src/engines/volumetry/overhead/filesystem-overhead.ts:112-116]
 *
 * UNIFORM DRIVES ONLY: all vectors below use identical-size drives. Synology's SHR/SHR-2 capacity
 * math only reduces to the simple (N-1)/N and (N-2)/N ratios used here when drives are uniform;
 * mixed-size SHR builds internal RAID tiers of different widths and is out of scope for this
 * fixture (also noted in the 18-AUDIT.md ledger).
 *
 * HONESTY NOTE (binding): of the pipeline's three layers, ONE is genuinely Synology-published and
 * matches the engine's implementation exactly:
 *   - SHR (SHR-1) with uniform drives is explicitly documented by Synology as capacity- and
 *     fault-tolerance-equivalent to RAID 5 (1-drive fault tolerance, usable ~ (N-1) x smallest
 *     drive, which reduces to (N-1)/N for uniform drives): "One-Drive Fault Tolerance...SHR-1 is
 *     similar to RAID 5" (kb.synology.com/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR;
 *     community.synology.com/enu/forum/1/post/132151). SHR-2 is documented as the RAID-6-like,
 *     2-drive-fault-tolerant variant, usable ~ (N-2) x smallest drive -> (N-2)/N for uniform
 *     drives (same KB + community.synology.com/enu/forum/1/post/132151). RAID F1 is documented as
 *     an all-flash RAID 5-class scheme (rotating parity for SSD wear-leveling, NOT extra
 *     redundancy) — capacity-equivalent to RAID 5, i.e. (N-1)/N for uniform drives, 1-drive fault
 *     tolerance (Synology RAID F1 product documentation). These three data-fraction formulas
 *     match src/engines/volumetry/strategies/proprietary.ts:16-32 exactly (synology_shr:
 *     (usableDrives-1)/usableDrives; synology_shr2: (usableDrives-2)/usableDrives; synology_raid_f1:
 *     (usableDrives-1)/usableDrives).
 *     Sources: https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR ,
 *     https://community.synology.com/enu/forum/1/post/132151 ,
 *     https://www.synology.com/en-global/support/RAID_calculator
 *
 * The other TWO layers are [engine-formula analog], NOT independently published numbers:
 *   - DSM system partition reservation (`DEFAULT_SYNOLOGY_OPTIONS.systemPartitionSize = 25 * 1024
 *     * 1024 * 1024` bytes/disk, src/types/topology.ts:696). Perplexity research against
 *     Synology's own KB/RAID-calculator material found no official statement of a fixed ~25 GB
 *     (or 20-30 GB range) per-disk figure — Synology's own SHR explainer only says DSM "takes a
 *     little bit off the top" for system/metadata overhead without quantifying it. The 25 GB
 *     value is this codebase's engineering estimate (matches widely-observed DSM behavior across
 *     community reports, but is not a cited Synology constant).
 *   - Btrfs filesystem overhead (`FILESYSTEM_OVERHEAD.btrfs = 0.04`, src/types/topology.ts:717,
 *     code comment "4% for Btrfs metadata + CoW"). No Synology KB page states a flat 4% Btrfs
 *     overhead constant; this plays the same generic small-fs-overhead role documented for
 *     xfs/ext4/zfs/vsan/nutanix/ceph elsewhere in filesystem-overhead.ts (see NetApp Task 5 /
 *     Ceph Task 6 honesty notes for the identical pattern).
 *
 * Genuinely-external vector count: 3/3 vectors validate the genuinely-published SHR/SHR-2/RAID F1
 * parity-efficiency formula against Synology's documented fault-tolerance/capacity semantics; all
 * 3 also carry the two engine-formula-analog layers (25 GB/disk system partition, 4% Btrfs
 * overhead) needed to match the engine's actual usableCapacity output. Coverage should not be
 * read as validating the system-partition-size or Btrfs-overhead constants themselves.
 */
import type { ProprietaryRaid, Topology } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

export type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function synology(level: Extract<ProprietaryRaid, `synology_${string}`>): Topology {
  return { type: 'proprietary', level }
}

export const synologyVectors: PlatformVector[] = [
  {
    // SHR (SHR-1), 4 uniform 1TB drives: dataFraction = (4-1)/4 = 0.75 (RAID-5-equivalent,
    // 1-drive fault tolerance, Synology-documented). Pipeline: 4 TB raw usable
    // - (25GB x 4 = ~100.0 GB DSM system partition, engine-formula analog) = ~3.893 TB;
    // x 0.75 = ~2.919 TB after parity; x 0.96 (Btrfs 4% overhead, engine-formula analog)
    // = ~2.803 TB.
    name: 'Synology SHR (SHR-1), 4 drives',
    topology: synology('synology_shr'),
    drives: 4,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 2_802_690_588_672,
    tolerance: 0.01,
    source:
      'Synology SHR KB (SHR-1 = RAID-5-equivalent for uniform drives, 1-drive fault tolerance) [genuinely external] + Synology RAID calculator; 25GB/disk system partition and 4% Btrfs overhead layers are [engine-formula analog] (see file header honesty note)',
    url: 'https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR',
  },
  {
    // SHR-2, 6 uniform 1TB drives: dataFraction = (6-2)/6 = 0.6667 (RAID-6-equivalent,
    // 2-drive fault tolerance, Synology-documented). Pipeline: 6 TB raw usable
    // - (25GB x 6 = ~161.06 GB DSM system partition) = ~5.839 TB; x (4/6) = ~3.893 TB after
    // parity; x 0.96 (Btrfs 4% overhead) = ~3.737 TB.
    name: 'Synology SHR-2, 6 drives',
    topology: synology('synology_shr2'),
    drives: 6,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 3_736_920_784_896,
    tolerance: 0.01,
    source:
      'Synology SHR KB / community forum (SHR-2 = RAID-6-equivalent for uniform drives, 2-drive fault tolerance) [genuinely external] + Synology RAID calculator; 25GB/disk system partition and 4% Btrfs overhead layers are [engine-formula analog] (see file header honesty note)',
    url: 'https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR',
  },
  {
    // RAID F1, 6 uniform 1TB drives: dataFraction = (6-1)/6 = 0.8333 (RAID-5-class,
    // all-flash, rotating parity for SSD wear-leveling only — NOT extra redundancy;
    // capacity-equivalent to RAID 5, 1-drive fault tolerance, Synology-documented).
    // Pipeline: 6 TB raw usable - (25GB x 6 = ~161.06 GB DSM system partition) = ~5.839 TB;
    // x (5/6) = ~4.866 TB after parity; x 0.96 (Btrfs 4% overhead) = ~4.671 TB.
    name: 'Synology RAID F1, 6 drives',
    topology: synology('synology_raid_f1'),
    drives: 6,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 4_671_150_981_120,
    tolerance: 0.01,
    source:
      'Synology RAID F1 product documentation (RAID-5-class capacity, rotating parity for all-flash wear-leveling, 1-drive fault tolerance) [genuinely external] + Synology RAID calculator; 25GB/disk system partition and 4% Btrfs overhead layers are [engine-formula analog] (see file header honesty note)',
    url: 'https://www.synology.com/en-global/support/RAID_calculator',
  },
]
