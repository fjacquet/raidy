---
phase: 18-quality-audit
started: 2026-07-11
status: in-progress
spec: docs/superpowers/specs/2026-07-11-quality-audit-ui-relevance-design.md
---

# Phase 18: Value & Export Quality Audit — Findings

Extends phase 02 (`.planning/phases/02-calculation-validation/02-RESEARCH.md`).
Covered by phase 02 (regression only): RAID, ZFS, vSAN, Dell, performance.
Newly audited here: S2D, Nutanix, NetApp, Ceph, Synology, Longhorn + PPTX export.

## Findings Ledger

| # | Platform/Area | Tag | Severity | Description | Reference (source + URL) | Status |
|---|---------------|-----|----------|-------------|--------------------------|--------|
| 1 | S2D | untested | — | No external-reference vector coverage before phase 18. Added 4 vectors (3-way mirror, single parity [engine-formula analog — no MS-published fraction exists], dual parity @7 FDs hybrid, mirror-accelerated parity @7 FDs). All pass at 0.00% deviation — no engine change needed. | Microsoft Learn plan-volumes / fault-tolerance / mirror-accelerated-parity (URLs in Reference Cases → S2D) | untested → now covered |
| 2 | Nutanix | untested | — | No external-reference vector coverage before phase 18. Added 4 vectors (RF2, RF3, EC-X RF2-like 4:1, EC-X RF3-like 4:2); all four resiliency fractions match the Nutanix Bible's Book of AOS Data Efficiency (2X/3X overhead prose + EC-X strip-size multipliers) exactly. All pass at 0.00% deviation — no engine change needed. The 10% systemOverhead + 1.5% fs overhead layer is an engine-formula analog (Nutanix does not publish a single fixed capacity-overhead %; see honesty note). | Nutanix Bible — Book of AOS Data Efficiency (URL in Reference Cases → Nutanix) | untested → now covered |
| 3 | Nutanix | value-misleading | minor | `src/types/topology.ts` comments `nutanix_ec_rf3` as "6:2 striping", but 6:2 = 6/(6+2) = 75% — a different strip size. The strategy (`src/engines/volumetry/strategies/nutanix.ts`) implements 4:2 = 4/(4+2) = 66.7%, matching the Nutanix Bible's default RF3-like strip. Implemented value is correct; the topology.ts comment label is wrong. Comment-only — no numeric output affected. | Nutanix Bible — Book of AOS Data Efficiency (default RF3-like strip 4/2, "1.5x overhead vs RF3's 3x"): https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html | open (comment fix deferred; logged in Task 4) |
| 4 | NetApp | untested | — | No external-reference vector coverage before phase 18. Added 3 vectors (RAID-DP 8 drives, RAID-DP 24 drives, RAID-TEC 24 drives). The parity-drive fraction ((N-2)/N RAID-DP, (N-3)/N RAID-TEC) and the 5% default snapshot reserve are genuinely NetApp-published and match the engine exactly. All 3 pass at 0.00% deviation — no engine change needed for the tested paths. | docs.netapp.com sizing-raid-groups-concept, default-raid-policies-aggregates-concept, manage-snapshot-copy-reserve-concept (URLs in Reference Cases → NetApp) | untested → now covered |
| 5 | NetApp | value-misleading | moderate | `DEFAULT_NETAPP_OPTIONS.waflOverhead = 0.015` (1.5%, UI slider capped 1-3%) is named after, but does not represent, ONTAP's real WAFL aggregate reserve, which is a fixed, non-user-configurable **10%** of aggregate size (5% only for >=30 TB aggregates on AFF/FAS500f since 9.12.1, all FAS since 9.14.1). The engine's "waflOverhead" is actually playing the same role as the small ~1-2% generic filesystem-metadata layer used for other topologies (xfs/ext4/zfs/vsan/ceph/nutanix fs-overhead in `filesystem-overhead.ts`), not the much larger real ONTAP reserve. Not fixed: the field is used consistently as a small fs-metadata analog throughout the engine and UI (slider range 1-3%), so retargeting it to 10% would be a product/UX design change, not a bug fix, and is out of scope for this task. Flagged for follow-up decision. | kb.netapp.com/on-prem/ontap/Ontap_OS/OS-KBs/ONTAP_Space_Usage; kb.netapp.com/.../Why_is_my_aggregate_showing_10_percent_less_total_space_than_expected | open (design decision deferred) |
| 6 | Ceph | untested | — | No external-reference vector coverage before phase 18. Added 4 vectors (replicated size=2, replicated size=3, EC 4+2, EC 8+3). Replicated data fraction (raw/size) and EC data fraction (k/(k+m)) match `src/engines/volumetry/strategies/ceph.ts` exactly; `DEFAULT_CEPH_OPTIONS.safeCapacityThreshold = 0.85` matches Ceph's documented `mon_osd_nearfull_ratio` default exactly. All 4 pass at 0.00% deviation — no engine change needed. The 2% BlueStore fs-overhead layer (`filesystem-overhead.ts:83-85`) is an engine-formula analog — no docs.ceph.com page publishes a flat BlueStore metadata-overhead constant; see honesty note. | docs.ceph.com/en/reef/rados/operations/pools, docs.ceph.com/en/reef/rados/operations/erasure-code, docs.ceph.com/en/reef/rados/configuration/mon-config-ref (URLs in Reference Cases → Ceph) | untested → now covered |
| 7 | Synology | untested | — | No external-reference vector coverage before phase 18. Added 3 vectors (SHR 4 drives, SHR-2 6 drives, RAID F1 6 drives; all uniform-size drives — mixed-size SHR is out of scope, see below). SHR ((N-1)/N, 1-drive fault tolerance per SHR KB), SHR-2 ((N-2)/N, 2-drive fault tolerance per SHR KB), and RAID F1 ((N-1)/N, RAID-5-class capacity with rotating parity for SSD wear-leveling only) match `src/engines/volumetry/strategies/proprietary.ts:16-32` exactly; the general (N-k)/N ratios are corroborated by the RAID calculator's behavior + industry consensus (the KB documents fault tolerance and minimum drive counts, not the general formula). The 4% Btrfs fs-overhead layer is genuinely Synology-published (RAID calculator page: Btrfs volumes reserve 4% for metadata) and matches `FILESYSTEM_OVERHEAD.btrfs = 0.04` exactly. All 3 pass at 0.00% deviation — no engine change needed. The vectors use the engine's 25 GB/disk system-partition default as a stated assumption (diverges from the published ~10 GB/drive — see finding #8). Mixed-size SHR is out of scope (tiered internal RAID groups, not a simple (N-k)/N ratio). | kb.synology.com/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR, synology.com/en-global/support/RAID_calculator (URLs in Reference Cases → Synology) | untested → now covered |
| 8 | Synology | value-wrong | major | Synology system partition default 25 GB/drive vs vendor-published ~10 GB/drive: the Synology RAID Calculator page explicitly states "Each drive in the RAID must reserve approximately 10 GB of system space", but `DEFAULT_SYNOLOGY_OPTIONS.systemPartitionSize` (`src/types/topology.ts:696`) defaults to 25 GiB/drive — a real, quantified ~2.5× divergence in the default. User-adjustable in the UI; default divergence deferred as product decision (precedent: finding #5). | Synology RAID Calculator: https://www.synology.com/en-global/support/RAID_calculator | open |
| 9 | Synology | value-wrong | minor | The engine's Synology-with-ext4 path uses the generic `FILESYSTEM_OVERHEAD.ext4 = 0.05` (5%) constant (`src/engines/volumetry/overhead/filesystem-overhead.ts:112-116`, `src/types/topology.ts:718`), but Synology publishes 2% for ext4 volumes on the RAID Calculator page. Not exercised by the Task 7 vectors (btrfs is the Synology default) — follow-up. | Synology RAID Calculator: https://www.synology.com/en-global/support/RAID_calculator | open |

Tags: value-wrong (>1% off reference) · value-misleading (right number, wrong label/unit) · untested (no vector coverage)

## Reference Cases

### Covered platforms (regression)

| Suite | Date | Pass | Fail | Status |
|-------|------|------|------|--------|
| tests/engines/volumetry.spec.ts | 2026-07-11 | 318 | 0 | PASS |

One subsection per platform, added by Tasks 3–8. Each case records: config,
external source, expected value, engine value, deviation %.

### S2D (Task 3 — 2026-07-11)

Fixture: `tests/fixtures/s2d-vectors.ts` · Spec: `tests/engines/volumetry/vectors/s2d.spec.ts`

Microsoft publishes only the *resiliency efficiency fraction* (mirror/parity table).
Expected values below apply that fraction on top of the engine's documented reserve
pipeline so the comparison is apples-to-apples:
raw − rebuild reserve (min(faultDomains, 4) whole drives, pre-parity, per
`DEFAULT_S2D_OPTIONS.reserveStrategy = 'drive_failure'`) → × efficiency fraction →
− 277 GB infra-volume reserve (post-parity) → × 0.98 (ReFS fs overhead).
Drive: `testDrive1TB` (HDD ⇒ engine selects the *hybrid* dual-parity stepped table).

| Config | MS efficiency fraction | Source | Expected usable (bytes) | Engine (bytes) | Deviation |
|--------|-----------------------|--------|------------------------|----------------|-----------|
| 3-way mirror, 12×1 TB, 4 servers (mirrorCopies=3) | 33.3% (1/3) | [Plan volumes — mirror efficiency](https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/plan-volumes) | 2 341 873 333 333 | 2 341 873 333 333 | 0.00% |
| Single parity, 16×1 TB, 4 servers (faultDomains=4) — **engine-formula analog, see honesty note** | 75% ((N−1)/N, RAID-5 analogy) | [Fault tolerance — single parity (qualitative only)](https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/fault-tolerance) | 8 548 540 000 000 | 8 548 540 000 000 | 0.00% |
| Dual parity, 16×1 TB, 7 servers (faultDomains=7, hybrid) | 66.7% (RS 4+2, 7–11 FDs) | [Fault tolerance & storage efficiency](https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/fault-tolerance) | 7 568 540 000 000 | 7 568 540 000 000 | 0.00% |
| Mirror-accelerated parity, 16×1 TB, 7 servers (20/80 tiering, mirrorCopies=2) | 63.3% (0.2/2 + 0.8×2/3) | [Mirror-accelerated parity (ReFS)](https://learn.microsoft.com/en-us/windows-server/storage/refs/mirror-accelerated-parity) | 7 176 540 000 000 | 7 176 540 000 000 | 0.00% |

Result: 4/4 PASS (tolerance 1%). Regression: `tests/engines/volumetry.spec.ts` 318/318 PASS.
No change to `src/engines/volumetry/**` — engine matched every Microsoft efficiency fraction.

Note: the MAP 20/80 mirror:parity split is Microsoft's *typical* configuration (the ratio is
tunable per volume); the vector validates the engine's documented 20/80 model, not a fixed
Microsoft constant. The 277 GB infra reserve and rebuild-reserve sizing are engine policy
sourced in code comments (Azure Local docs); this task validated the resiliency fractions.

**Honesty note (single parity):** Microsoft documents single parity only qualitatively on the
fault-tolerance page ("keeps only one bitwise parity symbol … most closely resembles RAID-5")
and publishes **no numeric single-parity efficiency fraction** anywhere on Learn (re-verified
via Perplexity, 2026-07-11). The (N−1)/N value is the standard RAID-5 analogy — the same
formula the engine implements — so this vector is an *engine-formula analog* (regression pin),
not an independent external validation. Externally validated vectors: 3/4 (3-way mirror,
dual parity, MAP); coverage should not be overstated as 4/4 external.

### Nutanix (Task 4 — 2026-07-11)

Fixture: `tests/fixtures/nutanix-vectors.ts` · Spec: `tests/engines/volumetry/vectors/nutanix.spec.ts`

The Nutanix Bible's Book of AOS Data Efficiency
(https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) states RF2/RF3 as 2X/3X
overhead multipliers in its EC-X comparison prose (fractions derive as 1/multiplier) and gives
EC-X strip sizes with their overhead multipliers — this is the genuinely externally-validated
part of each vector. Known inconsistency: `src/types/topology.ts` labels `nutanix_ec_rf3` as
"6:2 striping" (= 75%), but the strategy implements the Bible's 4:2 default (= 66.7%) — see
ledger finding #3 (value-misleading, minor; comment-only). It does NOT publish a single fixed "system overhead %" for CVM/AOS metadata as applied
uniformly to usable capacity (see honesty note below); that layer is engine policy
(`DEFAULT_NUTANIX_OPTIONS.systemOverhead = 0.10`) applied consistently on top of the validated
fraction, plus the engine's 1.5% Nutanix fs overhead
(`src/engines/volumetry/overhead/filesystem-overhead.ts`). Drive: `testDrive1TB`.

Pipeline: raw usable × resiliency data fraction (validated) → × 0.90 (systemOverhead, engine
policy) → × 0.985 (1.5% Nutanix fs overhead, engine policy).

| Config | Nutanix Bible data fraction | Source | Expected usable (bytes) | Engine (bytes) | Deviation |
|--------|------------------------------|--------|-------------------------|-----------------|-----------|
| RF2, 12×1 TB, 3 servers | 50% (1/2) | [Book of AOS Data Efficiency](https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) | 5 319 000 000 000 | 5 319 000 000 000 | 0.00% |
| RF3, 15×1 TB, 5 servers | 33.3% (1/3) | [Book of AOS Data Efficiency](https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) | 4 432 500 000 000 | 4 432 500 000 000 | 0.00% |
| EC-X RF2 (4:1 strip), 24×1 TB, 6 servers | 80% (4/5, "1.25x vs RF2's 2x", 6+ nodes) | [Book of AOS Data Efficiency](https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) | 17 020 800 000 000 | 17 020 800 000 000 | 0.00% |
| EC-X RF3 (4:2 strip), 32×1 TB, 8 servers | 66.7% (4/6, "1.5x vs RF3's 3x", 8+ nodes) | [Book of AOS Data Efficiency](https://www.nutanixbible.com/4h-book-of-aos-data-efficiency.html) | 18 912 000 000 000 | 18 912 000 000 000 | 0.00% |

Result: 4/4 PASS (tolerance 1%). Regression: `tests/engines/volumetry.spec.ts` 318/318 PASS.
No change to `src/engines/volumetry/**` — the engine's `nutanixStrategy.calculateDataFraction`
(RF2=0.5, RF3=1/3, EC-RF2=4/5, EC-RF3=4/6) matches the Nutanix Bible's published overhead
multipliers exactly.

**Honesty note (system/fs overhead layer):** Nutanix does not publish a single fixed
"system overhead %" applied to usable capacity. Public sources describe CVM/AOS reservations
as a mix of fixed per-node GiB reservations (Nutanix Home ~60 GiB, Cassandra/AES metadata
~15 GiB/SSD up to 4 SSDs, dynamic OpLog — per the Nutanix Bible's Book of Basics: Drive
Breakdown, https://www.nutanixbible.com/2i-book-of-basics-drive-breakdown.html) and a separate
~10-15% CVM *compute* (CPU/RAM) reservation that does not apply to storage capacity at all
(verified via Perplexity, 2026-07-11). `DEFAULT_NUTANIX_OPTIONS.systemOverhead = 0.10` and the
1.5% Nutanix fs overhead constant are therefore engine-formula analogs (regression pins), not
independently-sourced numbers — actual per-cluster reservation is proprietary/Sizer-driven.
Externally validated vectors: 4/4 for the *resiliency data fraction* (the number that
dominates usable capacity); 0/4 for the systemOverhead/fs-overhead layer specifically —
coverage should not be overstated as fully external end-to-end.

### NetApp (Task 5 — 2026-07-11)

Fixture: `tests/fixtures/netapp-vectors.ts` · Spec: `tests/engines/volumetry/vectors/netapp.spec.ts`

The engine's documented formula (`src/engines/volumetry/index.ts:75`):
`C_eff = (C_raw − RAID_overhead) × (1 − snap%) × DRR × (1 − WAFL%)`.
DRR (`netAppOptions.dataReductionRatio`) is applied after `usableCapacity` (in
`applyCompressionDedup`), so with the harness's neutral default (1.0) it does not affect
`expectedUsable`. Drive: `testDrive1TB`. `DEFAULT_NETAPP_OPTIONS`: `snapshotReserve = 0.05`,
`waflOverhead = 0.015`, `dataReductionRatio = 1.0`.

Two of the formula's three layers are genuinely NetApp-published:

- **Parity fraction** — ONTAP docs state a fixed parity-drive count per RAID group,
  independent of group size: RAID-DP = 2 parity drives/group
  ([sizing-raid-groups-concept](https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html),
  corroborated by [Flackbox](https://www.flackbox.com/raid-groups-and-aggregates-on-netapp-ontap):
  16-disk group → 14 TB usable / 2 TB parity); RAID-TEC = 3 parity drives/group
  ([default-raid-policies-aggregates-concept](https://docs.netapp.com/us-en/ontap/disks-aggregates/default-raid-policies-aggregates-concept.html)).
  Matches `src/engines/volumetry/strategies/proprietary.ts` exactly: `(usableDrives-2)/usableDrives`
  (RAID-DP), `(usableDrives-3)/usableDrives` (RAID-TEC).
- **Snapshot reserve** — ONTAP's default volume Snapshot copy reserve is 5%
  ([manage-snapshot-copy-reserve-concept](https://docs.netapp.com/us-en/ontap/data-protection/manage-snapshot-copy-reserve-concept.html)),
  matching `DEFAULT_NETAPP_OPTIONS.snapshotReserve = 0.05` exactly.

Pipeline: raw usable × parity fraction (validated) → × 0.95 (5% snapshot reserve, validated) →
× 0.985 (1.5% WAFL-overhead layer, engine-formula analog — see honesty note).

| Config | Parity fraction | Source | Expected usable (bytes) | Engine (bytes) | Deviation |
|--------|------------------|--------|--------------------------|-----------------|-----------|
| RAID-DP, 8 drives, 1 server | 75% ((8−2)/8) | [Sizing RAID groups](https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html) | 5 614 500 000 000 | 5 614 500 000 000 | 0.00% |
| RAID-DP, 24 drives, 1 server | 91.67% ((24−2)/24) | [Sizing RAID groups](https://docs.netapp.com/us-en/ontap/disks-aggregates/sizing-raid-groups-concept.html) | 20 586 500 000 000 | 20 586 500 000 000 | 0.00% |
| RAID-TEC, 24 drives, 1 server | 87.5% ((24−3)/24) | [Default RAID policies](https://docs.netapp.com/us-en/ontap/disks-aggregates/default-raid-policies-aggregates-concept.html) | 19 650 750 000 000 | 19 650 750 000 000 | 0.00% |

Result: 3/3 PASS (tolerance 1%). Regression: `tests/engines/volumetry.spec.ts` 318/318 PASS.
No change to `src/engines/volumetry/**` — the engine's parity-fraction formula and default
snapshot reserve match NetApp's published values exactly.

**Honesty note (WAFL-overhead layer):** ONTAP's real WAFL reserve is a fixed,
non-user-configurable **10%** of aggregate size for aggregates <30 TB (5% for >=30 TB
aggregates on AFF/FAS500f since ONTAP 9.12.1, all FAS since 9.14.1) —
[kb.netapp.com/ONTAP_Space_Usage](https://kb.netapp.com/on-prem/ontap/Ontap_OS/OS-KBs/ONTAP_Space_Usage),
[kb.netapp.com — 10% less space than expected](https://kb.netapp.com/on-prem/ontap/Ontap_OS/OS-KBs/Why_is_my_aggregate_showing_10_percent_less_total_space_than_expected).
`DEFAULT_NETAPP_OPTIONS.waflOverhead = 0.015` (1.5%) does not represent this real reserve; the
UI (`NetAppOptionsPanel.tsx`) caps the slider at 1-3%, confirming the engine deliberately models
`waflOverhead` as a small, generic filesystem-metadata layer — the same role played by the
xfs/ext4/zfs/vsan/ceph/nutanix fs-overhead constants for other topologies
(`src/engines/volumetry/overhead/filesystem-overhead.ts`) — not ONTAP's real, much larger,
non-configurable aggregate reserve. This is a naming collision with real ONTAP terminology
(finding #5, value-misleading, moderate), not a numeric defect in how the field is used
internally, so it was not changed as part of this task; retargeting it to 10% would be a
product/UX decision affecting the UI's documented 1-3% range and is deferred.
Externally validated vectors: 3/3 for the *parity fraction* and *snapshot reserve* layers (the
two dominant terms); 0/3 for the WAFL-overhead layer specifically — coverage should not be
overstated as fully external end-to-end.

### Ceph (Task 6 — 2026-07-11)

Fixture: `tests/fixtures/ceph-vectors.ts` · Spec: `tests/engines/volumetry/vectors/ceph.spec.ts`

The engine's pipeline for Ceph (`src/engines/volumetry/index.ts:228-247`):
`usableCapacity = rawUsableCapacity × dataFraction × (1 − filesystemOverhead) × safeCapacityThreshold`,
where `dataFraction` is `1/size` (replicated) or `k/(k+m)` (EC,
`src/engines/volumetry/strategies/ceph.ts`), `filesystemOverhead` is a flat 2% BlueStore
metadata constant (`src/engines/volumetry/overhead/filesystem-overhead.ts:83-85`), and
`safeCapacityThreshold` defaults to 0.85 (`DEFAULT_CEPH_OPTIONS`). Drive: `testDrive1TB` (1 TB).

APPLES-TO-APPLES: docs.ceph.com and community calculators typically express raw→usable
*before* any nearfull headroom — `mon_osd_nearfull_ratio` is documented as a `HEALTH_WARN`
threshold, not a capacity-planning discount. `expectedUsable` below is stated **post-nearfull**
(i.e. includes the × 0.85 multiplier) to match `VolumetryResult.usableCapacity` directly; each
vector's inline comment shows the pre-nearfull ("raw external") intermediate value so the two
conventions are never conflated.

Two of the pipeline's three layers are genuinely Ceph-published:

- **Replicated data fraction** — `size` (replica count, default 3) is documented as the pool
  parameter controlling usable = raw/size.
  [docs.ceph.com/rados/operations/pools](https://docs.ceph.com/en/reef/rados/operations/pools/).
  Matches `ceph.ts`: `1 / replicationFactor` (hardcoded 1/2, 1/3 for `ceph_replicated_2/3`).
- **EC data fraction** — "overhead factor (space amplification) = (k+m)/k", with a worked 4,2
  example (1.5× overhead ⇒ 4/6 efficiency).
  [docs.ceph.com/rados/operations/erasure-code](https://docs.ceph.com/en/reef/rados/operations/erasure-code).
  Matches `ceph.ts`: `ecK / (ecK + ecM)` (hardcoded 4/6, 8/11 for `ceph_ec_4_2`, `ceph_ec_8_3`).
- **Nearfull ratio** — `mon_osd_nearfull_ratio` default = 0.85, documented in the Ceph Monitor
  Config Reference.
  [docs.ceph.com/rados/configuration/mon-config-ref](https://docs.ceph.com/en/reef/rados/configuration/mon-config-ref/).
  Matches `DEFAULT_CEPH_OPTIONS.safeCapacityThreshold = 0.85` exactly.

Pipeline: raw usable × data fraction (validated) → × 0.98 (2% BlueStore fs-overhead layer,
engine-formula analog — see honesty note) → × 0.85 (nearfull ratio, validated).

| Config | Data fraction | Source | Expected usable (bytes) | Engine (bytes) | Deviation |
|--------|----------------|--------|--------------------------|-----------------|-----------|
| Replicated size=2, 6 drives / 3 nodes | 50% (1/2) | [Pools](https://docs.ceph.com/en/reef/rados/operations/pools/) | 2 499 000 000 000 | 2 499 000 000 000 | 0.00% |
| Replicated size=3 (default), 12 drives / 4 nodes | 33.3% (1/3) | [Pools](https://docs.ceph.com/en/reef/rados/operations/pools/) | 3 332 000 000 000 | 3 332 000 000 000 | 0.00% |
| Erasure coded 4+2, 12 drives / 6 nodes | 66.7% (4/6) | [Erasure code](https://docs.ceph.com/en/reef/rados/operations/erasure-code) | 6 664 000 000 000 | 6 664 000 000 000 | 0.00% |
| Erasure coded 8+3, 22 drives / 11 nodes | 72.7% (8/11) | [Erasure code](https://docs.ceph.com/en/reef/rados/operations/erasure-code) | 13 328 000 000 000 | 13 328 000 000 000 | 0.00% |

Result: 4/4 PASS (tolerance 1%). Regression: `tests/engines/volumetry.spec.ts` 318/318 PASS.
No change to `src/engines/volumetry/**` — the replicated/EC data-fraction formulas and the
default nearfull ratio match Ceph's published values exactly.

**Honesty note (BlueStore fs-overhead layer):** the 2% filesystem-overhead constant applied for
`topology.type === 'ceph'` (`filesystem-overhead.ts:83-85`, code comment "~1-2% for metadata,
OSD journals") is an [engine-formula analog], not an independently published Ceph number — no
docs.ceph.com page states a flat BlueStore metadata-overhead percentage; real overhead varies
with object/OSD count, `bluestore_min_alloc_size`, and RocksDB/WAL sizing. It plays the same
generic small-fs-overhead role documented for xfs/ext4/zfs/vsan/nutanix elsewhere in the same
file (identical pattern to NetApp's `waflOverhead`, finding #5 above). It is included in
`expectedUsable` because it is part of what the engine actually returns in
`VolumetryResult.usableCapacity`, but is not itself externally validated.
Externally validated vectors: 4/4 for the *data-fraction* and *nearfull-ratio* layers (the two
dominant, genuinely Ceph-published terms); 0/4 for the BlueStore fs-overhead layer specifically —
coverage should not be overstated as fully external end-to-end.

### Synology (Task 7 — 2026-07-11)

Fixture: `tests/fixtures/synology-vectors.ts` · Spec: `tests/engines/volumetry/vectors/synology.spec.ts`

The engine's pipeline for Synology (`src/engines/volumetry/index.ts:163-210`,
`src/engines/volumetry/overhead/overheadCalculator.ts:210`):
`usableCapacity = ((rawUsableCapacity − systemPartitionSize × usableDrives) × dataFraction) × (1 − btrfsOverhead)`,
where `dataFraction` is `(N-1)/N` (SHR, RAID F1) or `(N-2)/N` (SHR-2)
(`src/engines/volumetry/strategies/proprietary.ts:16-32`), `systemPartitionSize` defaults to
25 GB/disk (`DEFAULT_SYNOLOGY_OPTIONS`), and `btrfsOverhead` is a flat 4% constant
(`FILESYSTEM_OVERHEAD.btrfs`, `src/types/topology.ts:717`). Drive: `testDrive1TB` (1 TB).

UNIFORM DRIVES ONLY: all vectors use identical-size drives, where SHR/SHR-2 reduce to the simple
(N-1)/N and (N-2)/N ratios below. Mixed-size SHR builds internal RAID tiers of different widths
and does not reduce to a single ratio — out of scope for this fixture.

Of the pipeline's three layers, one is genuinely Synology-published, one is
calculator-corroborated, and one diverges from the vendor-published value:

- **Btrfs 4% metadata reserve (genuinely Synology-published)** — the Synology RAID Calculator
  page itself states that Btrfs volumes reserve 4% for metadata (ext4 volumes: 2%). Matches
  `FILESYSTEM_OVERHEAD.btrfs = 0.04` (`src/types/topology.ts:717`) exactly.
  [synology.com/support/RAID_calculator](https://www.synology.com/en-global/support/RAID_calculator).
  (Side finding #9: the engine's Synology-with-ext4 path uses the generic 5% ext4 constant
  instead of Synology's published 2% — not exercised here, btrfs is the default.)
- **SHR/SHR-2/RAID F1 parity efficiency (calculator-corroborated)** — Synology's SHR KB
  ([kb.synology.com/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR](https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR))
  documents SHR's 1-drive and SHR-2's 2-drive fault tolerance and minimum drive counts, but does
  **not** publish the general (N-1)/N / (N-2)/N usable-capacity formula in prose (the community
  forum post citing it is user-generated and is not relied on). The general formula for uniform
  drives is corroborated by the RAID Calculator's behavior (SHR tracks RAID 5, SHR-2 tracks
  RAID 6, RAID F1 tracks RAID 5 capacity — F1's rotating parity redistributes SSD wear, it does
  not add redundancy) plus industry consensus for single-/dual-parity schemes.
  Matches `proprietary.ts` exactly: `synology_shr` → `(usableDrives-1)/usableDrives`,
  `synology_shr2` → `(usableDrives-2)/usableDrives`, `synology_raid_f1` →
  `(usableDrives-1)/usableDrives`.
- **DSM system partition (diverges from published value)** — the RAID Calculator page explicitly
  states "Each drive in the RAID must reserve approximately 10 GB of system space", but the
  engine default `DEFAULT_SYNOLOGY_OPTIONS.systemPartitionSize` is 25 GiB/drive (~2.5× the
  published figure; finding #8, value-wrong/major, open). The vectors below use the engine's
  25 GB default as a **stated assumption** so they validate the parity + fs-overhead pipeline —
  they do NOT externally validate the system-partition layer.

Pipeline: raw usable − 25 GB/disk system partition (engine default, stated assumption — diverges
from published ~10 GB/drive, finding #8) → × data fraction (calculator-corroborated) →
× 0.96 (4% Btrfs fs-overhead, Synology-published).

| Config | Data fraction | Source | Expected usable (bytes) | Engine (bytes) | Deviation |
|--------|----------------|--------|--------------------------|-----------------|-----------|
| SHR (SHR-1), 4 drives | 75% ((N-1)/N) | [SHR KB](https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR) | 2 802 690 588 672 | 2 802 690 588 672 | 0.00% |
| SHR-2, 6 drives | 66.7% ((N-2)/N) | [SHR KB](https://kb.synology.com/en-ph/DSM/tutorial/What_is_Synology_Hybrid_RAID_SHR) | 3 736 920 784 896 | 3 736 920 784 896 | 0.00% |
| RAID F1, 6 drives | 83.3% ((N-1)/N) | [RAID calculator](https://www.synology.com/en-global/support/RAID_calculator) | 4 671 150 981 120 | 4 671 150 981 120 | 0.00% |

Result: 3/3 PASS (tolerance 1%). Regression: `tests/engines/volumetry.spec.ts` 318/318 PASS.
No change to `src/engines/volumetry/**` — the SHR/SHR-2/RAID F1 data-fraction formulas match
the calculator-corroborated capacity semantics exactly, and the 4% Btrfs constant matches
Synology's published value exactly.

**Honesty note:** The Btrfs 4% layer is genuinely Synology-published (RAID Calculator page)
and matches `FILESYSTEM_OVERHEAD.btrfs = 0.04` exactly. The system-partition layer is NOT
externally validated: Synology publishes ~10 GB/drive on the same page, while the engine
default is 25 GiB/drive — a real, quantified ~2.5× divergence (finding #8, value-wrong/major,
deferred as product decision, precedent finding #5). The vectors validate the parity + fs
pipeline with the engine's 25 GB default as a stated assumption. The parity (N-k)/N ratios are
labeled calculator-corroborated (+ industry consensus), not "Synology-documented formula" —
the SHR KB documents fault tolerance and minimum drive counts only.
Externally validated vectors: 3/3 for the *Btrfs fs-overhead* layer (Synology-published) and
the *parity-efficiency* layer (calculator-corroborated); 0/3 for the system-partition layer
(known divergence, stated assumption) — coverage should not be overstated as fully external
end-to-end.

## Spot-Checks (Task 9)

## PPTX E2E Evidence (Task 14)
