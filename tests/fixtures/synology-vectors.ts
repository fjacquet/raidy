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
 * HONESTY NOTE (binding): of the pipeline's three layers, ONE is genuinely Synology-published,
 * one is calculator-corroborated, and one DIVERGES from the vendor-published value:
 *   - Btrfs filesystem overhead (`FILESYSTEM_OVERHEAD.btrfs = 0.04`, src/types/topology.ts:717)
 *     is GENUINELY SYNOLOGY-PUBLISHED: the Synology RAID Calculator page itself states Btrfs
 *     volumes reserve 4% for metadata (ext4 volumes: 2%). The engine's 4% Btrfs constant
 *     matches exactly. (Side finding: the engine's Synology-with-ext4 path uses the generic 5%
 *     ext4 constant, not Synology's published 2% — not exercised by these vectors, which use
 *     the btrfs default; logged as a ledger finding.)
 *     https://www.synology.com/en-global/support/RAID_calculator
 *   - SHR/SHR-2/RAID F1 parity efficiency is CALCULATOR-CORROBORATED, not a formula Synology
 *     documents in prose: the SHR KB
 *     (https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR) documents
 *     SHR's 1-drive / SHR-2's 2-drive fault tolerance and minimum drive counts, but does NOT
 *     state the general (N-1)/N / (N-2)/N usable-capacity formula (and the community forum
 *     post citing it is user-generated). The general formula for uniform drives is corroborated
 *     by the RAID Calculator's behavior (SHR tracks RAID 5, SHR-2 tracks RAID 6, RAID F1 tracks
 *     RAID 5 capacity — F1's rotating parity redistributes SSD wear, it does not add
 *     redundancy) plus industry consensus for single-/dual-parity schemes. It matches
 *     src/engines/volumetry/strategies/proprietary.ts:16-32 exactly (synology_shr:
 *     (usableDrives-1)/usableDrives; synology_shr2: (usableDrives-2)/usableDrives;
 *     synology_raid_f1: (usableDrives-1)/usableDrives).
 *
 * The THIRD layer diverges from the published number:
 *   - DSM system partition reservation: the Synology RAID Calculator page explicitly states
 *     "Each drive in the RAID must reserve approximately 10 GB of system space." The engine
 *     default `DEFAULT_SYNOLOGY_OPTIONS.systemPartitionSize = 25 * 1024 * 1024 * 1024`
 *     bytes/disk (src/types/topology.ts:696) is ~2.5x the vendor-published ~10 GB figure.
 *     The value is user-adjustable in the UI; the default divergence is logged as a
 *     value-wrong ledger finding (product decision deferred, precedent: NetApp finding #5).
 *     expectedUsable below is computed WITH the engine's 25 GB default as a STATED ASSUMPTION
 *     so the vectors validate the parity + fs-overhead pipeline; the system-partition layer
 *     itself is NOT externally validated (it is known to diverge from the published value).
 *     https://www.synology.com/en-global/support/RAID_calculator
 *
 * Genuinely-external vector count: 3/3 vectors validate the Synology-published 4% Btrfs
 * overhead and the calculator-corroborated parity-efficiency ratios; 0/3 validate the
 * system-partition layer (engine default 25 GB/disk vs published ~10 GB/disk — stated
 * assumption only). Coverage should not be read as end-to-end external validation.
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
    // SHR (SHR-1), 4 uniform 1TB drives: dataFraction = (4-1)/4 = 0.75 (RAID-5-class capacity,
    // 1-drive fault tolerance per SHR KB; general (N-1)/N ratio corroborated by the RAID
    // calculator + industry consensus). Pipeline: 4 TB raw usable
    // - (25GB x 4 = ~100.0 GB DSM system partition — engine default, DIVERGES from the
    // calculator's published ~10 GB/drive; stated assumption) = ~3.893 TB;
    // x 0.75 = ~2.919 TB after parity; x 0.96 (Btrfs 4% overhead, Synology-published on the
    // RAID calculator page) = ~2.803 TB.
    name: 'Synology SHR (SHR-1), 4 drives',
    topology: synology('synology_shr'),
    drives: 4,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 2_802_690_588_672,
    tolerance: 0.01,
    source:
      'Synology SHR KB (1-drive fault tolerance) + RAID calculator (SHR tracks RAID 5 for uniform drives; Btrfs 4% metadata reserve [genuinely external]); (N-1)/N ratio calculator-corroborated; 25GB/disk system partition is engine default, diverges from published ~10GB/drive (see file header honesty note)',
    url: 'https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR',
  },
  {
    // SHR-2, 6 uniform 1TB drives: dataFraction = (6-2)/6 = 0.6667 (RAID-6-class capacity,
    // 2-drive fault tolerance per SHR KB; general (N-2)/N ratio corroborated by the RAID
    // calculator + industry consensus). Pipeline: 6 TB raw usable
    // - (25GB x 6 = ~161.06 GB DSM system partition — engine default, diverges from published
    // ~10 GB/drive; stated assumption) = ~5.839 TB; x (4/6) = ~3.893 TB after parity;
    // x 0.96 (Btrfs 4% overhead, Synology-published) = ~3.737 TB.
    name: 'Synology SHR-2, 6 drives',
    topology: synology('synology_shr2'),
    drives: 6,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 3_736_920_784_896,
    tolerance: 0.01,
    source:
      'Synology SHR KB (2-drive fault tolerance) + RAID calculator (SHR-2 tracks RAID 6 for uniform drives; Btrfs 4% metadata reserve [genuinely external]); (N-2)/N ratio calculator-corroborated; 25GB/disk system partition is engine default, diverges from published ~10GB/drive (see file header honesty note)',
    url: 'https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR',
  },
  {
    // RAID F1, 6 uniform 1TB drives: dataFraction = (6-1)/6 = 0.8333 (RAID-5-class,
    // all-flash, rotating parity for SSD wear-leveling only — NOT extra redundancy;
    // RAID-5-equivalent capacity and 1-drive fault tolerance corroborated by the RAID
    // calculator + industry consensus). Pipeline: 6 TB raw usable
    // - (25GB x 6 = ~161.06 GB DSM system partition — engine default, diverges from published
    // ~10 GB/drive; stated assumption) = ~5.839 TB; x (5/6) = ~4.866 TB after parity;
    // x 0.96 (Btrfs 4% overhead, Synology-published) = ~4.671 TB.
    name: 'Synology RAID F1, 6 drives',
    topology: synology('synology_raid_f1'),
    drives: 6,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 4_671_150_981_120,
    tolerance: 0.01,
    source:
      'Synology RAID calculator (RAID F1 tracks RAID 5 capacity for uniform SSDs; Btrfs 4% metadata reserve [genuinely external]); (N-1)/N ratio calculator-corroborated (rotating parity affects wear, not capacity); 25GB/disk system partition is engine default, diverges from published ~10GB/drive (see file header honesty note)',
    url: 'https://www.synology.com/en-global/support/RAID_calculator',
  },
]
