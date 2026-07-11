/**
 * Nutanix AOS Test Vectors — sources recorded per vector and in
 * .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is BEFORE compression/dedup, AFTER parity + system overhead + fs overhead —
 * i.e. compared against VolumetryResult.usableCapacity.
 *
 * RESILIENCY FRACTION (genuinely externally validated): the Nutanix Bible — Book of AOS Data
 * Efficiency (https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) states
 * RF2/RF3 as 2X/3X overhead multipliers in its EC-X comparison prose (the fractions derive
 * as 1/multiplier), and gives EC-X strip sizes with their overhead multipliers:
 *   - RF2 (2 copies): 2X overhead → 1/2 = 50% data of raw (raw ÷ 2).
 *   - RF3 (3 copies): 3X overhead → 1/3 = 33.3% data of raw (raw ÷ 3).
 *   - EC-X default RF2-like strip = 4/1 (4 data : 1 parity): data fraction = 4/(4+1) = 80%,
 *     described as "1.25x overhead vs RF2's 2x" for clusters of 6+ nodes.
 *   - EC-X default RF3-like strip = 4/2 (4 data : 2 parity): data fraction = 4/(4+2) = 66.7%,
 *     described as "1.5x overhead vs RF3's 3x", the Bible's ≥8-node worked-example default.
 * KNOWN INCONSISTENCY: src/types/topology.ts comments `nutanix_ec_rf3` as "6:2 striping",
 * but a 6:2 strip is a DIFFERENT strip size: 6/(6+2) = 75%, not 66.7%. The strategy
 * (src/engines/volumetry/strategies/nutanix.ts) actually implements 4:2 → 4/6 = 66.7%,
 * matching the Nutanix Bible default. The 6:2 label in topology.ts is a pre-existing
 * mislabel, logged as a value-misleading finding in 18-AUDIT.md; these vectors validate the
 * implemented 4:2 fraction.
 * These four fractions match src/engines/volumetry/strategies/nutanix.ts exactly (0.5, 1/3,
 * 4/5, 4/6) and are the genuinely externally-validated part of each vector below.
 *
 * SYSTEM / CVM OVERHEAD (HONESTY NOTE — engine-formula analog, NOT independently validated):
 * Nutanix does NOT publish a single fixed "system overhead %" applied uniformly to usable
 * capacity. Public sources (Nutanix Bible "Book of Basics — Drive Breakdown"
 * https://www.nutanixbible.com/2i-book-of-basics-drive-breakdown.html; portal.nutanix.com KB
 * 1557) describe CVM/AOS overhead as a mix of (a) fixed per-node GiB reservations (Nutanix
 * Home ~60 GiB across the first two SSDs, Cassandra/AES metadata ~15 GiB per SSD up to 4
 * SSDs, i.e. 30-60 GiB total, plus dynamically-sized OpLog), and (b) a separate ~10-15% CVM
 * compute (CPU/RAM) reservation that does not apply to storage capacity at all. None of these
 * resolve to DEFAULT_NUTANIX_OPTIONS.systemOverhead = 0.10 (a flat 10% of post-parity
 * capacity) as a single citable number — Nutanix's real reservation is proprietary/sizing-tool
 * driven (Nutanix Sizer). Each vector therefore applies the engine's own documented overhead
 * pipeline (systemOverhead 10% of capacityAfterParity, then 1.5% Nutanix fs overhead from
 * src/engines/volumetry/overhead/filesystem-overhead.ts) on top of the externally-validated
 * resiliency fraction, so the comparison is apples-to-apples for the fraction being validated
 * — but the systemOverhead/fsOverhead layer itself is an engine assumption within the
 * documented range, not an independently-sourced number. See 18-AUDIT.md honesty note for the
 * count of genuinely externally-validated values vs. engine-formula analogs.
 *
 * Realistic serverCount per vector follows Nutanix Bible cluster-size guidance for the EC-X
 * strip defaults: EC-X RF2-like (4/1, 1.25x overhead) requires 6+ nodes for the default strip;
 * EC-X RF3-like (4/2, 1.5x overhead) requires 8+ nodes for the default strip.
 */
import type { NutanixTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

export type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function nutanix(level: NutanixTopology): Topology {
  return { type: 'nutanix', level }
}

export const nutanixVectors: PlatformVector[] = [
  {
    // Nutanix Bible: RF2 = 50% data fraction (raw ÷ 2).
    // Pipeline: 12 TB raw usable × 0.5 = 6 TB after parity; × 0.90 (systemOverhead) = 5.4 TB;
    // × 0.985 (1.5% Nutanix fs overhead) = 5.319 TB.
    name: 'Nutanix RF2, 12 drives, 3 servers',
    topology: nutanix('nutanix_rf2'),
    drives: 12,
    serverCount: 3,
    driveSize: TB,
    expectedUsable: 5_319_000_000_000,
    tolerance: 0.01,
    source:
      'Nutanix Bible — Book of AOS Data Efficiency (RF2 = 1/2 data fraction); system/fs overhead layer is engine-formula analog (see file header honesty note)',
    url: 'https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html',
  },
  {
    // Nutanix Bible: RF3 = 33.3% data fraction (raw ÷ 3). FT2 (RF3) sizing commonly assumes
    // 5+ node clusters (N+2 resiliency headroom).
    // Pipeline: 15 TB raw usable × (1/3) = 5 TB after parity; × 0.90 = 4.5 TB; × 0.985 = 4.4325 TB.
    name: 'Nutanix RF3, 15 drives, 5 servers',
    topology: nutanix('nutanix_rf3'),
    drives: 15,
    serverCount: 5,
    driveSize: TB,
    expectedUsable: 4_432_500_000_000,
    tolerance: 0.01,
    source:
      'Nutanix Bible — Book of AOS Data Efficiency (RF3 = 1/3 data fraction); system/fs overhead layer is engine-formula analog (see file header honesty note)',
    url: 'https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html',
  },
  {
    // Nutanix Bible: EC-X RF2-like default strip = 4/1 → 80% data fraction (4/5), documented
    // as "1.25x overhead vs RF2's 2x" for clusters of 6+ nodes.
    // Pipeline: 24 TB raw usable × 0.8 = 19.2 TB after parity; × 0.90 = 17.28 TB; × 0.985 =
    // 17.0208 TB.
    name: 'Nutanix EC-X RF2 (4:1 strip), 24 drives, 6 servers',
    topology: nutanix('nutanix_ec_rf2'),
    drives: 24,
    serverCount: 6,
    driveSize: TB,
    expectedUsable: 17_020_800_000_000,
    tolerance: 0.01,
    source:
      'Nutanix Bible — Book of AOS Data Efficiency (EC-X default RF2-like 4/1 strip = 4/(4+1) = 80% data fraction, 1.25x overhead vs RF2, 6+ node clusters); system/fs overhead layer is engine-formula analog (see file header honesty note)',
    url: 'https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html',
  },
  {
    // Nutanix Bible: EC-X RF3-like default strip = 4/2 → 66.7% data fraction (4/6),
    // documented as "1.5x overhead vs RF3's 3x", requiring 8+ node clusters for the default
    // strip size.
    // Pipeline: 32 TB raw usable × (4/6) = 21.3333... TB after parity; × 0.90 = 19.2 TB;
    // × 0.985 = 18.912 TB.
    name: 'Nutanix EC-X RF3 (4:2 strip), 32 drives, 8 servers',
    topology: nutanix('nutanix_ec_rf3'),
    drives: 32,
    serverCount: 8,
    driveSize: TB,
    expectedUsable: 18_912_000_000_000,
    tolerance: 0.01,
    source:
      'Nutanix Bible — Book of AOS Data Efficiency (EC-X default RF3-like 4/2 strip = 4/(4+2) = 66.7% data fraction, 1.5x overhead vs RF3, 8+ node clusters); system/fs overhead layer is engine-formula analog (see file header honesty note)',
    url: 'https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html',
  },
]
