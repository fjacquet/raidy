/**
 * BeeGFS capacity test vectors — sourced from ThinkParQ / BeeGFS documentation.
 *
 * BeeGFS has no data protection of its own: each storage target is a local RAID
 * volume (the topology level says which one), and cluster-level protection is
 * Buddy Mirroring — synchronous replication between pairs of targets, costing
 * exactly 2x capacity:
 *   "chunks of buddy mirrored files are written to two targets and thus
 *   consumed disk space is twice their size"
 *   https://doc.beegfs.io/latest/system_design/system_requirements.html
 *
 * RAID6 storage targets: 10-12 drives is the recommended balance between
 * capacity, resilience and performance.
 *   https://doc.beegfs.io/latest/advanced_topics/storage_tuning.html
 *
 * Metadata targets (not exercised by capacity vectors below, see
 * tests/engines/volumetry/beegfs.spec.ts for the mdtDetails advisory):
 * 0.3-0.5% of total capacity is the ThinkParQ rule of thumb, and 500 GB of
 * ext4 metadata capacity holds roughly 150 million files.
 *   https://doc.beegfs.io/latest/advanced_topics/metadata_tuning.html
 *
 * expectedUsable is compared against VolumetryResult.usableCapacity, i.e. AFTER
 * the local-RAID + Buddy Mirroring data fraction AND AFTER the BeeGFS filesystem
 * overhead layer (the ext4/xfs under each storage target, `beeGfsOptions
 * .fsOverheadPercent`, default 2% — `src/engines/volumetry/overhead/filesystem-overhead.ts`).
 * The engine applies these in order
 * (`src/engines/volumetry/index.ts`, `src/engines/volumetry/strategies/beegfs.ts`):
 *   1. capacityAfterParity = rawCapacity x dataFraction
 *        dataFraction = localRaidFraction(level, drivesPerTarget) x (storageBuddyMirror ? 0.5 : 1)
 *        localRaidFraction: raid6/raidz2 -> (width-2)/width, raid10 -> 0.5, single -> 1
 *   2. usableCapacity = capacityAfterParity x (1 - fsOverheadPercent/100)   [default 2%]
 *
 * All vectors use `testDrive1TB` (1 TB decimal drives, no hot spares), so:
 *   raw = drives x 1 TB
 *   expectedUsable = raw x dataFraction x 0.98
 */
import type { BeeGfsTopology, Topology } from '@/types/topology'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function beegfs(level: BeeGfsTopology): Topology {
  return { type: 'beegfs', level }
}

const STORAGE_TUNING_URL = 'https://doc.beegfs.io/latest/advanced_topics/storage_tuning.html'
const SYSTEM_REQUIREMENTS_URL =
  'https://doc.beegfs.io/latest/system_design/system_requirements.html'

export const beegfsVectors: PlatformVector[] = [
  {
    // RAID6, 12 drives, drivesPerTarget 12 (one whole target), no Buddy Mirroring:
    // dataFraction = (12-2)/12 = 10/12. 12 TB raw x 10/12 = 10 TB after parity;
    // x 0.98 (2% BeeGFS fs overhead) = 9.8 TB.
    name: 'BeeGFS RAID6, 12 drives, drivesPerTarget 12, no buddy',
    topology: beegfs('beegfs_raid6'),
    drives: 12,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 9_800_000_000_000,
    tolerance: 0.01,
    source:
      'BeeGFS storage tuning (RAID6 10-12 drives recommended) — no data protection of its own',
    url: STORAGE_TUNING_URL,
    overrides: {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 12, storageBuddyMirror: false },
    },
  },
  {
    // RAID6, 24 drives across 2 nodes, drivesPerTarget 12 (two whole targets), Buddy
    // Mirroring on: dataFraction = 10/12 x 0.5 = 5/12. 24 TB raw x 5/12 = 10 TB after
    // parity; x 0.98 = 9.8 TB. Buddy Mirroring's exact 2x cost is ThinkParQ-published.
    name: 'BeeGFS RAID6, 24 drives, 2 nodes, drivesPerTarget 12, buddy on',
    topology: beegfs('beegfs_raid6'),
    drives: 24,
    serverCount: 2,
    driveSize: TB,
    expectedUsable: 9_800_000_000_000,
    tolerance: 0.01,
    source:
      'BeeGFS storage tuning (RAID6 target width) + system requirements (Buddy Mirroring costs exactly 2x)',
    url: SYSTEM_REQUIREMENTS_URL,
    overrides: {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 12, storageBuddyMirror: true },
    },
  },
  {
    // RAID10, 12 drives, drivesPerTarget 12 (default), no Buddy Mirroring: dataFraction =
    // 0.5 (mirrored stripes). 12 TB raw x 0.5 = 6 TB after parity; x 0.98 = 5.88 TB.
    name: 'BeeGFS RAID10, 12 drives, no buddy',
    topology: beegfs('beegfs_raid10'),
    drives: 12,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 5_880_000_000_000,
    tolerance: 0.01,
    source: 'BeeGFS system requirements (storage targets are local RAID volumes; RAID10 = 50%)',
    url: SYSTEM_REQUIREMENTS_URL,
    overrides: { beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: false } },
  },
  {
    // RAID10, 24 drives across 2 nodes, Buddy Mirroring on: dataFraction = 0.5 x 0.5 =
    // 0.25. 24 TB raw x 0.25 = 6 TB after parity; x 0.98 = 5.88 TB.
    name: 'BeeGFS RAID10, 24 drives, 2 nodes, buddy on',
    topology: beegfs('beegfs_raid10'),
    drives: 24,
    serverCount: 2,
    driveSize: TB,
    expectedUsable: 5_880_000_000_000,
    tolerance: 0.01,
    source: 'BeeGFS system requirements (RAID10 local mirror x Buddy Mirroring exact 2x cost)',
    url: SYSTEM_REQUIREMENTS_URL,
    overrides: { beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, storageBuddyMirror: true } },
  },
  {
    // Single disk targets, 24 drives across 2 nodes, drivesPerTarget 1, Buddy Mirroring
    // on: dataFraction = 1 x 0.5 = 0.5 (no local redundancy, only Buddy Mirroring).
    // 24 TB raw x 0.5 = 12 TB after parity; x 0.98 = 11.76 TB.
    name: 'BeeGFS single-disk targets, 24 drives, 2 nodes, buddy on',
    topology: beegfs('beegfs_single'),
    drives: 24,
    serverCount: 2,
    driveSize: TB,
    expectedUsable: 11_760_000_000_000,
    tolerance: 0.01,
    source:
      'BeeGFS system requirements (bare-drive storage targets rely entirely on Buddy Mirroring for redundancy)',
    url: SYSTEM_REQUIREMENTS_URL,
    overrides: {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 1, storageBuddyMirror: true },
    },
  },
  {
    // RAID6, 10 drives, drivesPerTarget 10 (one whole target): dataFraction = (10-2)/10 =
    // 8/10 = 0.8. 10 TB raw x 0.8 = 8 TB after parity; x 0.98 = 7.84 TB. Demonstrates
    // drivesPerTarget sensitivity — RAID6 efficiency depends on target width.
    name: 'BeeGFS RAID6, 10 drives, drivesPerTarget 10',
    topology: beegfs('beegfs_raid6'),
    drives: 10,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 7_840_000_000_000,
    tolerance: 0.01,
    source: 'BeeGFS storage tuning (RAID6 target width directly sets dual-parity efficiency)',
    url: STORAGE_TUNING_URL,
    overrides: {
      beeGfsOptions: { ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 10, storageBuddyMirror: false },
    },
  },
]
