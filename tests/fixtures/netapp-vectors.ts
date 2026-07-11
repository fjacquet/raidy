/**
 * NetApp ONTAP RAID-DP / RAID-TEC Test Vectors — sources recorded per vector and in
 * .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is BEFORE compression/dedup (DRR), AFTER parity + snapshot reserve +
 * WAFL fs overhead — i.e. compared against VolumetryResult.usableCapacity. The engine's
 * documented formula (src/engines/volumetry/index.ts:75) is:
 *   C_eff = (C_raw - RAID_overhead) × (1 - snap%) × DRR × (1 - WAFL%)
 * DRR (netAppOptions.dataReductionRatio) is applied later, in applyCompressionDedup — the
 * harness default (dataReductionRatio: 1.0, neutral) keeps expectedUsable comparable to
 * usableCapacity directly, so DRR is not part of these vectors.
 *
 * PARITY FRACTION (genuinely externally validated): NetApp's own ONTAP docs and sizing
 * guidance state a fixed parity-drive count per RAID group, independent of group size:
 *   - RAID-DP (double parity): 2 dedicated parity drives per RAID group.
 *     https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html
 *     (corroborated by https://www.flackbox.com/raid-groups-and-aggregates-on-netapp-ontap,
 *     16-disk RAID-DP group example: 14 TB usable / 2 TB parity)
 *   - RAID-TEC (triple erasure coding): 3 dedicated parity drives per RAID group (row +
 *     diagonal + anti-diagonal parity), ONTAP's default/required policy for HDD local tiers
 *     with disks >= 6-10 TB.
 *     https://docs.netapp.com/us-en/ontap/disks-aggregates/default-raid-policies-aggregates-concept.html
 * These match src/engines/volumetry/strategies/proprietary.ts exactly:
 *   netapp_raid_dp:  (usableDrives - 2) / usableDrives
 *   netapp_raid_tec: (usableDrives - 3) / usableDrives
 * (The engine treats the configured drive count as a single RAID group; real ONTAP deployments
 * span multiple RAID groups per aggregate at the group-size limits NetApp documents, but the
 * per-group parity-drive count — the number validated here — is size-independent.)
 *
 * SNAPSHOT RESERVE (genuinely externally validated): ONTAP's default volume Snapshot copy
 * reserve is 5% of volume space.
 * https://docs.netapp.com/us-en/ontap/data-protection/manage-snapshot-copy-reserve-concept.html
 * This matches DEFAULT_NETAPP_OPTIONS.snapshotReserve = 0.05 exactly (src/types/topology.ts).
 *
 * WAFL OVERHEAD (HONESTY NOTE — engine-formula analog, NOT independently validated as the
 * real WAFL reserve): ONTAP's actual WAFL filesystem reserve is a fixed, non-user-configurable
 * **10%** of aggregate (local tier) size for aggregates under 30 TB (reduced to 5% only for
 * >=30 TB aggregates on AFF/FAS500f since ONTAP 9.12.1, and all FAS platforms since 9.14.1):
 *   https://kb.netapp.com/on-prem/ontap/Ontap_OS/OS-KBs/ONTAP_Space_Usage
 *   https://kb.netapp.com/on-prem/ontap/Ontap_OS/OS-KBs/Why_is_my_aggregate_showing_10_percent_less_total_space_than_expected
 * DEFAULT_NETAPP_OPTIONS.waflOverhead = 0.015 (1.5%) does NOT match this documented 10%/5%
 * aggregate reserve — the UI (NetAppOptionsPanel.tsx) caps the slider at 1-3%, confirming the
 * engine intentionally models "waflOverhead" as a small, generic filesystem-metadata layer
 * (the same role xfs/ext4/zfs/vsan/ceph/nutanix fs-overhead constants play for other
 * topologies — see src/engines/volumetry/overhead/filesystem-overhead.ts), not ONTAP's real,
 * much larger, non-configurable aggregate WAFL reserve. This is logged as a value-misleading
 * finding in 18-AUDIT.md (name collision with real ONTAP terminology; engine behavior itself
 * is internally consistent and not a numeric defect requiring a fix). These vectors therefore
 * apply the engine's own documented waflOverhead default (1.5%) on top of the two genuinely
 * externally-validated layers (parity fraction, snapshot reserve) — the fs-overhead layer is
 * an engine-formula analog, not an independent NetApp-published number.
 */
import type { ProprietaryRaid, Topology } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

export type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function netapp(level: Extract<ProprietaryRaid, `netapp_${string}`>): Topology {
  return { type: 'proprietary', level }
}

export const netappVectors: PlatformVector[] = [
  {
    // RAID-DP: 2 parity drives/group -> (8-2)/8 = 75% data fraction (docs.netapp.com).
    // Pipeline: 8 TB raw usable x 0.75 = 6 TB after parity; x 0.95 (5% snapshot reserve,
    // docs.netapp.com default) = 5.7 TB; x 0.985 (1.5% engine WAFL-overhead analog) =
    // 5.6145 TB.
    name: 'NetApp RAID-DP, 8 drives (small aggregate)',
    topology: netapp('netapp_raid_dp'),
    drives: 8,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 5_614_500_000_000,
    tolerance: 0.01,
    source:
      'docs.netapp.com sizing-raid-groups-concept (RAID-DP = 2 parity drives/group) + manage-snapshot-copy-reserve-concept (5% default snapshot reserve); WAFL fs-overhead layer is engine-formula analog [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html',
  },
  {
    // RAID-DP: 2 parity drives/group -> (24-2)/24 = 91.667% data fraction.
    // Pipeline: 24 TB raw usable x (22/24) = 22 TB after parity; x 0.95 = 20.9 TB;
    // x 0.985 = 20.5865 TB.
    name: 'NetApp RAID-DP, 24 drives (large aggregate)',
    topology: netapp('netapp_raid_dp'),
    drives: 24,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 20_586_500_000_000,
    tolerance: 0.01,
    source:
      'docs.netapp.com sizing-raid-groups-concept (RAID-DP = 2 parity drives/group) + manage-snapshot-copy-reserve-concept (5% default snapshot reserve); WAFL fs-overhead layer is engine-formula analog [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html',
  },
  {
    // RAID-TEC: 3 parity drives/group -> (24-3)/24 = 87.5% data fraction
    // (default-raid-policies-aggregates-concept.html).
    // Pipeline: 24 TB raw usable x 0.875 = 21 TB after parity; x 0.95 = 19.95 TB;
    // x 0.985 = 19.65075 TB.
    name: 'NetApp RAID-TEC, 24 drives',
    topology: netapp('netapp_raid_tec'),
    drives: 24,
    serverCount: 1,
    driveSize: TB,
    expectedUsable: 19_650_750_000_000,
    tolerance: 0.01,
    source:
      'docs.netapp.com default-raid-policies-aggregates-concept (RAID-TEC = 3 parity drives/group) + manage-snapshot-copy-reserve-concept (5% default snapshot reserve); WAFL fs-overhead layer is engine-formula analog [engine-formula analog] (see file header honesty note)',
    url: 'https://docs.netapp.com/us-en/ontap/disks-aggregates/default-raid-policies-aggregates-concept.html',
  },
]
