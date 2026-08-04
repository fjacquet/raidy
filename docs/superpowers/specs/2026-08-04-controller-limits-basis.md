# CONTROLLER_LIMITS: a consistent per-controller basis, and PERC H975i — Design

**Date**: 2026-08-04
**Status**: Approved
**Scope**: `src/types/topology.ts` (`CONTROLLER_LIMITS`, `RAID_CONTROLLER_TYPES`). Closes #84.

## Problem

`CONTROLLER_LIMITS` in `src/types/topology.ts` is the per-controller ceiling the performance
engine (`src/engines/performance/index.ts`) uses for the Controller layer of the bottleneck
chain (Media → Controller → PCIe → Network). It mixed two bases:

- **Throughput** was roughly the vendor per-controller figure.
- **IOPS** were 3.4–4.7x *below* any measured per-controller number, from an undocumented basis.

The issue's own numbers were partly misattributed — it cited a rebuild-time (degraded-volume)
IOPS figure as if it were steady-state — but the underlying defect was real and independently
confirmed against a different, correctly-attributed source (see below): the IOPS column was not
comparable to the throughput column, and neither was comparable across controllers. Some PERC
entries sat near their real ceiling; others sat at a fifth of it. Since this table feeds a
bottleneck *comparison* across controller choices, an inconsistent basis makes the comparison
itself meaningless — a configuration's controller ceiling depended on which controller was
picked in a way that did not reflect the hardware.

This surfaced when adding the Dell PERC H975i (PERC13): its real measured IOPS would have been
~4.8x above `perc_h965in`, a step that does not exist in the hardware, so the choice was either
fix the basis or bake the inconsistency in deeper by derating the new card to match.

## Decision — one documented basis, sourced per entry

**Basis: one controller, 100% 4K random read for `iops`, 100% 64K sequential read for
`throughputMBs`, FIO, on an optimal (non-degraded) volume.**

This is now a comment block directly above `CONTROLLER_LIMITS` in `src/types/topology.ts`, so
the basis travels with the table and cannot silently drift when the next controller is added.

### PERC entries — recalibrated, sourced

Both sources measure at the stated basis, one controller, independently verified:

- **Tolly Report #223103** (January 2023), "Dell PowerEdge RAID Controller 12 (PERC 12) 16th
  Generation Server Performance vs PERC 11 & PERC 10" — commissioned by Dell, testing by
  Broadcom, verified by Tolly, FIO on RHEL 8.6. SAS results: 16x 24G SAS SSD, one controller
  (Table 2, tests 1 and 2). NVMe results: 8 NVMe SSDs, one controller (Table 4, tests 14 and 15).
- **Signal65 PERC13 lab testing** (2026), corroborated by StorageReview's PERC13 review, "Meet PERC13: The Gen5 NVMe HW RAID Breakthrough"
  — lab-validated on PowerEdge 17G, RAID 5, 16 NVMe drives, one controller.

| Key | Controller | iops (old → new) | throughputMBs (old → new) | Source |
|---|---|---|---|---|
| `perc_h755` | PERC11 SAS (H755) | 750,000 → **3,500,000** | 12,000 → **14,100** | Tolly #223103 Table 2, tests 2 & 1, PERC 11 col. |
| `perc_h755n` | PERC11 NVMe (H755N) | 1,000,000 → **3,402,370** | 14,000 → **14,108** | Tolly #223103 Table 4, tests 15 & 14, PERC 11 col. |
| `perc_h965i` | PERC12 SAS (H965i) | 1,200,000 → **5,148,110** | 22,000 → **27,800** | Tolly #223103 Table 2, tests 2 & 1, PERC 12 col. |
| `perc_h965in` | PERC12 NVMe (H965iN) | 1,800,000 → **6,918,729** | 28,000 → **28,205** | Tolly #223103 Table 4, tests 15 & 14, PERC 12 col. |
| `perc_h975i` | PERC13 NVMe (H975i) — new | — → **12,900,000** | — → **56,000** | Signal65 PERC13 lab testing / StorageReview, RAID5, 16 NVMe. |

Values are used exactly as measured — not rounded, not "harmonised" between entries. The odd
figures (e.g. `3,402,370`) are measurements; their oddness is the evidence they were measured
rather than estimated.

`perc_h975i` is new: Dell PERC H975i, Broadcom SAS5132W, PCIe Gen5 x16, RAID 0/1/5/6/10/50/60,
supercapacitor-backed cache, up to 16 NVMe drives per controller, `isHba: false`. Added to
`RAID_CONTROLLER_TYPES` (which drives `ControllerType` and, transitively, the `Record` shape of
`CONTROLLER_LIMITS`, so TypeScript enforces exhaustiveness at every consumer) and to
`CONTROLLER_LIMITS` with display name `Dell PERC H975i (PERC13)`.

### Non-PERC entries — audited, all remain estimates

Every other entry (`hba_sas`, `hba_nvme`, `lsi_9500`, `lsi_9400`, `dell_hba355i`,
`dell_hba355e`, `software`, `hardware`, `gpu`, `powervault_me5_single`, `powervault_me5_dual`,
`powerstore_t`, `powerscale_node`, `objectscale_node`) was searched for a published
per-controller figure at the stated basis. None was found:

- **Bare HBAs** (`hba_sas`, `hba_nvme`, `lsi_9500`, `lsi_9400`, `dell_hba355i`, `dell_hba355e`):
  vendor datasheets for pass-through HBAs (Broadcom 9500-8i, 9400-8i; Dell's HBA355 User's
  Guide) publish port/device counts and interface speeds, not FIO IOPS/throughput numbers — an
  HBA has no RAID engine of its own to characterize that way.
- **PowerVault ME5**: the spec sheet publishes aggregate array throughput (12 GB/s read /
  10 GB/s write) and community-reported RAID5 IOPS (~12K), neither controller-count-normalized
  nor at this FIO basis.
- **PowerStore T / PowerScale / ObjectScale**: Dell publishes appliance- or cluster-level
  marketing IOPS figures (e.g. PowerStore 5200T = 7.5M IOPS), not a per-controller/per-node
  breakdown at this basis.
- **`software`, `hardware`, `gpu`**: these are deliberately generic categories, not tied to one
  product, so no single spec applies.

Each of these entries keeps its previous value unchanged and now carries an explicit
`// ESTIMATED — …` comment in `CONTROLLER_LIMITS` stating what was searched for and why the
figure is unsourced. **None of these values was derived from the PERC ratios** — that would
present an estimate as a specification, which is the same error #84 fixes for the PERC column.
If a genuine per-controller figure at this basis is found later, the fix is: replace the value,
cite the source, remove the `ESTIMATED` marker.

## Why the old IOPS column was wrong

The old PERC IOPS values (750K / 1.2M / 1.0M / 1.8M) were 3.4–4.7x below the Tolly-measured
per-controller IOPS at the stated basis, while the old throughput values were already close to
the Tolly figures. That split — one column near the real number, the other column a consistent
fraction of it — is the signature of a basis mismatch (e.g. a degraded/rebuild-time IOPS figure,
or one normalized across multiple controllers) rather than of independent measurement error.
Whatever the original basis was, it was never documented, so it could not be verified or
reproduced; recalibrating onto one documented, sourced basis removes the ambiguity for every
future controller added to this table.

## Consequence: bottleneck identity can change

The Controller-layer ceiling only constrains a configuration if it is the binding layer in the
chain (Media → Controller → PCIe → Network). Since PERC IOPS/throughput both moved sharply
upward, a configuration that used to be Controller-bound can now be bound by a different layer
instead — most likely Media (the drives), since PCIe Gen4/5 and modern network fabrics were
already well above the old PERC ceilings in most configurations.

Verified with `calculatePerformance` for a config designed to isolate the controller as the
binding layer pre-fix (`testSsdNvme` fixture, `driveCount: 24`, `serverCount: 1`,
`standard`/`RAID5`, `100%` random read, `4K` blocks, PCIe Gen5 x16, 400GbE network — so PCIe
and Network sit far above every PERC figure, old or new, and only Media and Controller compete):

| Controller | Media IOPS ceiling (this config) | Old Controller IOPS | New Controller IOPS | IOPS-ceiling driver: before → after |
|---|---|---|---|---|
| `perc_h755` | ~3,600,000 | 750,000 | 3,500,000 | Controller → **still Controller** (3.5M just under the 3.6M media ceiling in this config) |
| `perc_h965i` | ~3,600,000 | 1,200,000 | 5,148,110 | Controller → **Media** (5.15M now exceeds the 3.6M media ceiling) |
| `perc_h755n` | ~3,600,000 | 1,000,000 | 3,402,370 | Controller → **still Controller** (3.40M just under the 3.6M media ceiling) |
| `perc_h965in` | ~3,600,000 | 1,800,000 | 6,918,729 | Controller → **Media** (6.92M now exceeds the 3.6M media ceiling) |

Throughput tells a related but distinct story for the same config (Media throughput ceiling
~14,062 MB/s): `perc_h965i` (old 22,000 MB/s) and `perc_h965in` (old 28,000 MB/s) were already
throughput-bound by Media even before the fix, since their old throughput figures were already
above this config's media ceiling — only their IOPS ceiling moved the binding layer. `perc_h755`
(12,000 → 14,100 MB/s) and `perc_h755n` (14,000 → 14,108 MB/s) cross the media throughput
ceiling as a direct result of the recalibration, so their reported bottleneck layer (from
`identifyBottleneck`) flips from Controller to Media too.

**Net effect**: for every recalibrated PERC, IOPS results for PERC-backed configurations rise
substantially (+240% to +367%), and for the two NVMe/higher-tier controllers (`perc_h965i`,
`perc_h965in`) the IOPS ceiling driver changes from Controller to Media in configurations where
the drives can sustain enough IOPS to expose it. Users comparing "before vs. after" on a
PERC-backed, IOPS-heavy configuration will see materially higher numbers and, in some cases, a
different layer reported as the bottleneck.

## Verification

- `rtk npm run lint:fix && rtk npm run typecheck && rtk npx vitest run` — all clean, 1376 tests
  passing across 69 files.
- Two pre-existing tests pinned the old `perc_h755` figures as literal values and were updated
  to assert the defect fix instead of the defect:
  - `tests/types/controllerRequirement.spec.ts` — `CONTROLLER_LIMITS.perc_h755.iops` assertion
    updated from `750_000` to `3_500_000`; comment updated to describe the new basis instead of
    claiming the old figure as "well below the HBA ceiling" (both old and new figures are below
    the HBA ceiling, so the test's conclusion is unchanged, only its cited numbers moved).
  - `tests/engines/performance/beegfs-controller.spec.ts` — `layer.iops`/`layer.throughputMBs`
    assertions for a PERC H755 BeeGFS RAID6 target updated from `750_000`/`12_000` to
    `3_500_000`/`14_100`; header comment updated to cite the new figures and the Tolly basis.
  - No other test asserted a `CONTROLLER_LIMITS` value; the ratio-based assertions in both files
    (`> 2.7`, `> 1.6`) still hold with the new numbers and needed no change.
