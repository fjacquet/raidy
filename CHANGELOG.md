# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **`fr` and `de` locale strings are now consistently accented.** What looked like a deliberate
  "unaccented" convention was actually per-file drift: e.g. `fr/topology.json` carried ~420
  accented characters while `fr/common.json` had 1, and several files (`advanced`, `hardware`,
  `validation`, `workload`) had zero. French and German are user-facing languages of a Swiss
  product; unaccented copy reads as broken to a native speaker. Every `fr` and `de` string has
  been corrected to proper orthography (accents/umlauts/ß); `it` was audited too and corrected
  where it had the same gap. This is an orthography pass only — no strings were reworded or
  retranslated, no JSON keys changed, and interpolation placeholders (`{{count}}`, etc.) were
  left byte-identical. (#86)

### Added
- **i18n parity test now asserts placeholder preservation.** `tests/i18n/parity.spec.ts` gained a
  case per locale/namespace asserting every `{{placeholder}}` present in an `en` string is also
  present in the same key's translation, so an accent/copy pass can't silently mangle a runtime
  interpolation token the way the existing key-presence check would miss. (#86)

## [1.16.0] - 2026-08-04

> **Read this first if you sized hardware on 1.15.x.** Four published figures move in this
> release, in different directions and for different reasons.
>
> | What | Direction | Why |
> |---|---|---|
> | Tiered S2D read IOPS | **down ~45x** | Bug fix (#111) — the old figure was unachievable |
> | PERC controller IOPS ceiling | **up 3.4–4.7x** | Bug fix (#84) — the old column used an undocumented basis |
> | vSAN OSA / Nutanix tiered performance | **up** | New models (#89) where none existed |
> | RAID 50/60 survival | **down slightly** | Bug fix (#70) — drives that were never simulated now are |
>
> Nothing here changes usable-capacity figures.
>
> **Known limitation shipping in this release:** write-back absorption still has no drain-rate
> ceiling (#112), so sustained write throughput is overstated for tiered S2D and vSAN OSA once a
> real cache tier saturates. The reported write figure is a burst figure. Tracked, not fixed here.

### Added
- **Dell PERC H975i (PERC13) controller option** (`perc_h975i`). Broadcom SAS5132W, PCIe Gen5
  x16, RAID 0/1/5/6/10/50/60, supercapacitor-backed cache, up to 16 NVMe drives per controller.
  Rated at 12,900,000 IOPS / 56,000 MB/s per controller (Signal65 PERC13 lab testing, corroborated by StorageReview, RAID 5,
  16 NVMe, one controller). (#84)
- **BeeGFS filesystem overhead control.** `BeeGfsOptionsPanel` now exposes a slider for
  `beeGfsOptions.fsOverheadPercent` (the per-target ext4/xfs overhead, 0.5-5%, default 2%),
  matching the `min(0.5).max(5)` Zod range in `src/utils/schemas.ts` exactly. The field already
  fed `getFilesystemOverheadPercent` and usable capacity but had no UI control, so no user could
  move it off its default. Unlike `chunkSizeKb` / `numTargets` / `network`, which stay
  informational-only, this control changes a real number. (#78)
- **XFS stripe alignment now follows the capacity tier on tiered configurations.** The performance
  engine's `sunit`/`swidth` recommendation was still computed from the raw Hardware-panel drive
  count even after the media layer itself was sized from the capacity tier, so tiered S2D, vSAN
  OSA, Ceph, Nutanix and BeeGFS configurations could show a stripe width wider than the pool that
  actually holds data. Alignment now uses the same spare-adjusted capacity-tier population as the
  media layer, so the two can no longer diverge. Untiered configurations are unaffected. (#90)

### Changed
- **vSAN OSA and Nutanix hybrid tiered configurations now get a fast-tier performance model —
  their published IOPS/throughput numbers rise** (#89). Previously only S2D modelled a cache-tier
  contribution; vSAN OSA, Ceph, Nutanix and BeeGFS all fell through to a capacity-tier-only media
  layer, understating any tiered configuration where the fast tier genuinely serves reads or
  absorbs writes. Per-platform research
  (`docs/superpowers/specs/2026-08-04-fast-tier-performance-research.md`) resolved that gap for
  two of the four:
  - **vSAN OSA** reuses S2D's write-back blend, gated on `vsanOptions.diskGroupMode`: writes are
    now fully absorbed by the cache tier in both hybrid and all-flash disk groups (VMware
    documents 100% write-buffer allocation in both modes); reads blend by `workingSetPercent`
    **only in hybrid mode** — all-flash disk groups have no read cache (0% allocation, per VMware),
    so all-flash reads are unchanged.
  - **Nutanix hybrid clusters** get a new write-only model split by `randomPercent`: the OpLog
    absorbs random writes, while sequential writes bypass it for the extent pool, per Nutanix's
    documented >1.5MB-outstanding routing rule. Nutanix reads remain unmodelled — ILM tier
    promotion has no vendor-published hit-rate to anchor a working-set-style split.
  - **Ceph (WAL/DB offload) and BeeGFS (metadata targets) are unchanged** and stay deliberately
    unmodelled: Ceph's WAL/DB never serves data reads and its write-path benefit is contention
    removal, not added IOPS capacity; a BeeGFS metadata target is structurally incapable of
    serving bulk data I/O.

  Adding a platform's fast-tier model is now a table entry in `FAST_TIER_MODEL_BY_TOPOLOGY`
  (`src/engines/performance/utils/fast-tier-models.ts`), not a branch in the orchestrator.
- **`CONTROLLER_LIMITS` PERC entries recalibrated onto a documented, consistent basis** (#84).
  Throughput was already close to the real per-controller vendor figure; IOPS were 3.4–4.7x
  *below* any measured per-controller number, from an undocumented basis, so the controller layer
  of the bottleneck chain was not comparable across controllers. All four PERC entries now use
  one controller / 100% 4K random read (IOPS) / 100% 64K sequential read (throughput) / FIO /
  non-degraded volume, sourced from Tolly Report #223103 (Jan 2023):
  - `perc_h755`: IOPS 750,000 → **3,500,000** (+367%), throughput 12,000 → **14,100** MB/s (+18%)
  - `perc_h965i`: IOPS 1,200,000 → **5,148,110** (+329%), throughput 22,000 → **27,800** MB/s (+26%)
  - `perc_h755n`: IOPS 1,000,000 → **3,402,370** (+240%), throughput 14,000 → **14,108** MB/s (+1%)
  - `perc_h965in`: IOPS 1,800,000 → **6,918,729** (+284%), throughput 28,000 → **28,205** MB/s (+1%)

  **This moves the performance results of every configuration using a PERC controller** — IOPS
  results for PERC-backed configurations rise substantially, and for several configurations the
  bottleneck layer itself now shifts from the controller to the drives/media or PCIe/network
  layer, since the controller is no longer artificially the tightest ceiling in the chain. Every
  non-PERC entry (`hba_sas`, `hba_nvme`, `lsi_9500`, `lsi_9400`, `dell_hba355i`, `dell_hba355e`,
  `software`, `hardware`, `gpu`, `powervault_me5_*`, `powerstore_t`, `powerscale_node`,
  `objectscale_node`) keeps its previous value and now carries an explicit `ESTIMATED` marker in
  its comment — no published per-controller figure at this basis could be found for any of them.
  See `docs/superpowers/specs/2026-08-04-controller-limits-basis.md` for the full basis, sources,
  and rationale.
- **`useResilience` now takes the shared tiering option bag instead of four hand-listed props.**
  `s2dOptions`/`vsanOptions`/`cephOptions`/`nutanixOptions` were destructured and re-listed at the
  call site (`OutputDashboard.tsx`), in `UseResilienceOptions`, and again inside
  `tieredPlatformScope`'s call to `resolveTiering` — the exact hand-listing pattern that dropped a
  platform's options and caused issues #59 and #60. Replaced all three sites with a single
  `tieringOptions?: TieringResolverOptions` prop sourced from `useTieringOptions()`, the same
  assembler `useVolumetryCalc`, `usePerformanceCalc` and `useSustainabilityCalc` already consume,
  so a forgotten platform is no longer possible in resilience specifically: the value is threaded
  through unchanged rather than destructured and re-listed. `beeGfsOptions` did not need to stay a
  separate prop — `TieringResolverOptions` already carries it (including `drivesPerTarget`), so
  the BeeGFS resolver now reads `tieringOptions?.beeGfsOptions`. Pure refactor: no calculated
  number changes. (#92)
- **UI panels now import the canonical `as const` option arrays instead of re-declaring them.**
  `WorkloadPanel` (`BLOCK_SIZES`), `AdvancedPanel` (`NETWORK_SPEEDS`, `PCIE_GENS`, `PCIE_LANES`,
  `FS_TYPES`) and `Header` (`CARBON_REGIONS`) previously hand-wrote a second copy of the values
  already defined in `src/types/config.ts`; they now import the canonical arrays and derive their
  `<select>` options from them (an exhaustive `Record<CanonicalType, string>` label map for the
  panels with static English labels; the existing `t('carbon.regions.…')` lookup for `Header`), so
  adding a value to a canonical array fails to compile (or renders an untranslated key, for
  `Header`) until a label is supplied. `AdvancedPanel`'s `fsType` `onChange` cast was narrowed from
  a hand-inlined union to `as FsType`. `src/types/index.ts` now re-exports the value arrays
  (`BLOCK_SIZES`, `NETWORK_SPEEDS`, `PCIE_GENS`, `PCIE_LANES`, `CARBON_REGIONS`, `FS_TYPES`) and
  the `FsType` type alongside the existing type-only exports.

  Two of the duplicates found during the sweep had a different **element order** than their
  canonical counterpart: `AdvancedPanel`'s local `FS_TYPES` (`zfs` first) vs. the canonical array
  (`xfs` first), and `Header`'s local `CARBON_REGION_VALUES` (`norway`/`france` and
  `china`/`world_average` swapped) vs. canonical `CARBON_REGIONS`. Order is unobserved everywhere
  else the canonical arrays are consumed (`z.enum(...)` in `src/utils/schemas.ts`, and
  `Record<Type, …>` lookups in the performance/sustainability engines are all order-independent),
  so **the canonical arrays were reordered to match the UI**, rather than reordering the UI to
  match the canonical arrays — the UI order is the only place order is ever user-visible, and
  reordering it would have been the actual behavior change. `CARBON_REGIONS` is now
  `switzerland, norway, france, germany, usa_average, world_average, china` and `FS_TYPES` is now
  `zfs, xfs, ext4, btrfs, refs, ntfs`; both arrays carry a comment noting the order is
  display-order and must not be "tidied". Rendered `<select>` option order is unchanged in both
  panels. (#87)
- Validator alerts (`src/utils/validators.ts`) and the Longhorn capacity-details card
  (`src/components/outputs/LonghornCapacityDetails.tsx`) now route their messages through
  `i18n.t()` instead of hardcoded English, with `fr`/`de`/`it` translations added to
  `src/i18n/locales/*/validation.json` in lockstep. All interpolated values (counts, percentages,
  capacities) use i18next interpolation rather than string concatenation. (#71)
- **Documented, rather than changed, the tiered-BeeGFS drive-count divergence between volumetry
  and performance.** Volumetry rounds the capacity tier down to whole storage targets, dropping
  the "stranded" remainder that completes no target and holds no data. Performance intentionally
  does not apply that rounding: a stranded drive still exists on the bus and still draws from the
  controller/PCIe budget, so pricing it is correct for a bottleneck model even though excluding it
  is correct for a capacity model. Both engines now carry a comment cross-referencing the other's
  reasoning, and a test pins the divergence so it cannot silently become drift. No calculated
  values change. (#91)
- **Forged values in a shared link are rejected instead of silently defaulted.** `blockSize`,
  `networkSpeed`, `pcieGen`, `pcieLanes`, `carbonRegion`, `fsType` and the RAID controller were
  free-text in the URL schema, so an arbitrary string reached a lookup table, missed, and fell
  back to a default — a wrong calculation presented as a valid one. Each is now an enum derived
  from the same `as const` array its TypeScript type derives from, so the schema and the lookup
  tables are held together by the compiler. (#62)
- **`performanceThreshold` survives a shared link.** It was absent from `partialize`, so it reset
  while every other setting persisted. (#63)
- **A malformed shared link is reported instead of half-loaded.** `urlStorage.ts` claimed to
  support flat, non-enveloped payloads for backward compatibility; they have never hydrated,
  because zustand reads `deserializedStorageValue.state`. The branch and its comment are gone, and
  unknown top-level keys are now stripped rather than merged into the live store. (#64, #65)
- **"Reset to defaults" now resets the performance threshold and the two drive-picker filters.**
  They lived only in their slices' initial state, and `resetToDefaults()` merges, so the button
  silently skipped them. Defaults are now taken from the slices themselves rather than restated.

### Fixed
- **Tiered S2D (and now vSAN OSA hybrid) read IOPS/throughput were computed with an
  unachievable formula — the corrected numbers drop sharply** (#111). This is the opposite
  movement from the vSAN OSA/Nutanix increase above, and for a different reason: it's a bug fix,
  not a new model. The read blend split `workingSetPercent` of traffic to the cache tier and the
  rest to the capacity tier, then took a **weighted average of the two tiers' raw IOPS/bandwidth
  capacities** as the achievable total. That is not a throughput — both tiers must clear their own
  share of the *same* total concurrently (`shareA·T ≤ capA` and `(1−shareA)·T ≤ capB`), so the
  true achievable total is bounded by whichever tier saturates first
  (`T = min(capA / shareA, capB / (1 − shareA))`), not their weighted sum. The old formula let a
  fast cache tier's raw capacity leak into the total in proportion to how *little* traffic it
  actually served — the faster the cache, the more inflated the number (e.g. `ws=0.5`, cache
  1,000,000 IOPS, capacity 1,000 IOPS: old formula gave 500,500; the correct bound gives ~2,000).
  Both S2D's read blend and vSAN OSA hybrid's (which reused it, per #89 above) are corrected via a
  single shared `boundedTierThroughput` helper so they cannot drift apart again. Write-back
  absorption itself (`writeCapIOPS = cacheCount × cacheWriteIOPS`, unconditional and uncapped by
  any destage/drain rate) is unaffected by this fix and remains a known, separately-tracked
  simplification.
- **Resilience: hot spares are no longer simulated as data-bearing drives** (#80). The Monte Carlo
  population now excludes hot spares on the same rule volumetry and performance use
  (`usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount`, clamped at zero), on both
  the naive and the tiered path. Survival rates rise for every platform configured with spares;
  vSAN is unchanged, since it rebuilds from distributed slack rather than dedicated spare drives.
  The default configuration ships one hot spare, so the out-of-the-box number moves.
- **38 missing i18n keys across `fr`/`de`/`it` topology translations** rendered as raw i18n keys
  on screen instead of translated text: `powervault.info.*` and `powerflex.info.*` were missing
  from all three locales, `zfs.ashift512`/`ashift4k`/`ashift8k` were missing from `de`/`it`, and
  `nutanix.info.*` was missing from `de`/`it`. Added a key-parity test
  (`tests/i18n/parity.spec.ts`) that recursively diffs every locale's namespace files against the
  `en` reference in both directions (missing keys and orphan keys), so future gaps like this fail
  CI instead of shipping. (#72)
- **`HBA_REQUIRED_TOPOLOGIES` membership is now pinned by a hand-copied test snapshot.**
  `tests/types/controllerRequirement.spec.ts` previously guarded the level-aware controller rule
  only against `legacyControllerOptions`, which re-derives from `HBA_REQUIRED_TOPOLOGIES` itself
  — so it caught drift in the filter logic but not in the table's contents. Deleting `'longhorn'`
  from the table left all 1242 tests passing, silently flipping Longhorn from HBA-only to
  RAID-only. Added a literal, hand-copied expected-membership list directly in the test file
  (deliberately not imported or derived) that now fails on that exact mutation. (#75)
- **`AdvancedPanel` now has a label state for a controller requirement of `'either'`.**
  `getControllerRequirement` returns `'hba'`, `'raid'` or `'either'`, but the panel only rendered
  two states — so on `beegfs_single` the user saw the RAID-only heading, label ("Controller
  Model") and hint while the dropdown actually offered HBAs and appliance controllers too. Added
  a third `'either'` state (heading, label, hint) plus its locale strings in all four languages.
  Reworded `controller.hbaHint`, which enumerated platforms ("ZFS, vSAN, and S2D require..."), to
  state the underlying rule instead ("platforms that manage redundancy in software need direct
  disk access via an HBA"), since it was already stale for `beegfs_raidz2` and an enumeration
  goes stale every time a platform is added. No calculated number is affected — the engine always
  read the selected controller's real limits. (#74)
- **Resilience worker: `drivesPerGroup` floor-division left drives unmodelled in every group
  topology.** `Math.floor(driveCount / numGroups)` in `src/workers/resilienceWorker.ts` silently
  dropped up to `numGroups - 1` drives from every simulated group whenever
  `driveCount % numGroups != 0` — those drives could never fail, and any failure beyond total
  group capacity landed on group 0 by array-index fallback. `distributeAcrossGroups()` now spreads
  the remainder one-per-group across the first `driveCount % numGroups` groups instead, so groups
  are heterogeneous in width but every drive is modelled. Pre-existing and shared by RAID 50/60
  and every BeeGFS group level (`beegfs_raid6`, `beegfs_raidz2`, `beegfs_raid10`).
  **Moves RAID 50/60 numbers, not only BeeGFS** — measured (20,000 iterations): RAID50, 11 drives
  / 3 groups, survival 66.06% -> 60.07% (lower, correctly — the previously-unmodelled drives are
  now exposed to failure); RAID60, 14 drives / 4 groups, survival 99.980% -> 99.965%. New
  validation vectors and property-based tests (`fast-check`) in
  `tests/fixtures/resilience-vectors.ts` and `tests/workers/resilience-group-modelling.spec.ts`.
  (#70)
- **Resilience worker: group-path `bitsRead` overstated URE exposure for `beegfs_raid10`.** The
  group-topology rebuild-read formula, `(drivesPerGroup - 1) x capacity`, assumed a rebuild reads
  every other drive in the group. Correct for parity groups (RAID50/60, `beegfs_raid6`/
  `beegfs_raidz2`), but a `beegfs_raid10` mirror-pair rebuild reads only the ONE surviving partner
  in that pair. Mirrored group layouts now use a fixed 1-drive rebuild-read volume, matching the
  drive-pair mirror model's formula exactly. Safe-direction bug (overstated URE risk), so survival
  only rises. Measured (20,000 iterations, unmerged `beegfs_raid10`, 40 drives / 4 targets of 10):
  survival 9.3% -> 32.5%. New validation vector in `tests/fixtures/resilience-vectors.ts`. (#67)
- **Resilience worker: `beegfs_raid10` unmerged tolerance was pessimistic for wide targets.** The
  flat `parityPerGroup` failure counter killed an unmerged `beegfs_raid10` target at ANY 2
  failures, when a real RAID10 target of width W tolerates up to W/2 failures provided each lands
  in a distinct mirror pair. `buildGroupPairState()` now gives these groups per-pair state (flat,
  pre-sized arrays — not an array-of-arrays, to avoid allocation-heavy setup across the worker's
  100K Monte Carlo iterations): a group dies only when one specific pair loses both members.
  Safe-direction bug (understated resilience), so survival rises. At the same AFR/URE combination
  used for the #67 vector above, #66 alone barely moves the number (32.3% -> 31.6%, within Monte
  Carlo noise) because URE already dominates death there; isolated with a near-zero URE rate
  instead (20,000 iterations, unmerged, 40 drives / 4 targets of 10, moderate AFR): survival
  97.1% -> 99.50%. New validation vectors and a `fast-check` property suite for
  `buildGroupPairState` in `tests/fixtures/resilience-vectors.ts` and
  `tests/workers/resilience-group-modelling.spec.ts`. (#66)

  Also hoists the per-simulation topology/group/pair setup (`computeTopologyModel`) out of the
  100K-iteration Monte Carlo loop and into a single per-run computation, since none of it depends
  on the random failure draws — a straight perf mitigation for the extra per-pair arrays #66
  introduces, not a behavior change.

### Removed
- **Four option fields with no consumer at all** (#104), found during the #61 fraction-vs-percent
  audit. Two were fully dead in both directions — `synologyOptions.btrfsOverhead` (the engine uses
  the hardcoded `FILESYSTEM_OVERHEAD.btrfs` constant instead) and `objectscaleOptions.fillRatePercent`
  (no panel ever wrote it, no engine ever read it). Two had a visible UI control but no engine
  consumer, which is worse than a missing control because the tool implied the input mattered:
  `objectscaleOptions.networkEfficiencyFactor` ("East-West traffic factor") had no citable, real
  sizing rule connecting it to a network-bandwidth derate; `cephOptions.walDbRatio` had no
  defensible connection point either, since the WAL/DB tier's device count and size are already
  set explicitly via the Ceph tiering picker, and deriving them from a ratio would silently
  override that explicit choice rather than model anything real. Removed the fields, their Zod
  bounds, their `DEFAULT_*_OPTIONS` entries, their UI controls (`networkEfficiencyFactor`,
  `walDbRatio`), and their locale strings in all four languages. Existing shared links carrying
  any of these fields are unaffected: none of the nested platform-option Zod schemas reject
  unknown keys (only the top-level `ConfigStateSchema` differentiates known vs. unknown keys —
  the nested schemas simply strip fields they no longer declare), so a link generated by a
  previous version parses normally with the removed value silently dropped. Added
  `tests/utils/optionFieldsConsumed.spec.ts` to pin the absence of these four fields. A fully
  general guard (walk every platform's `DEFAULT_*_OPTIONS` and require an engine reader) was
  investigated and found roughly a dozen more pre-existing fields with the same unconsumed
  pattern on platforms this issue does not touch — telling genuine bugs apart from deliberately
  informational fields (the precedent set for BeeGFS's `chunkSizeKb`/`numTargets` in #78) needs
  the same per-field investigation this issue gave its four fields, a dozen times over, so that
  broader sweep is left as a follow-up rather than rushed into an unverified allowlist here.

## [1.15.1] - 2026-08-04

### Fixed
- **Tiered configurations are sized from the capacity tier in every engine.** Resilience simulated
  the Hardware panel's drive count and media for tiered S2D, vSAN OSA, Ceph and Nutanix, and the
  performance engine costed the bulk pool against the cache-tier drive for every tiered platform
  except S2D. The sustainability engine's power, CO2, TCO and flash-endurance figures had the same
  gap for tiered BeeGFS. All three now read the capacity tier through `resolveTiering`, matching
  volumetry. **Resilience numbers change for tiered S2D, vSAN OSA, Ceph and Nutanix; performance
  numbers change for tiered vSAN OSA, Ceph, Nutanix and BeeGFS; sustainability numbers change for
  tiered BeeGFS** — they were wrong before. Untiered configurations are unaffected. Fast-tier
  failure cascades and cache-tier performance contributions remain deliberately unmodelled.
  (#59, #60)

### Changed
- `useTieringOptions()` assembles the complete platform option bag once for the calculation
  hooks. Each hook previously hand-listed a subset when calling `resolveTiering`, which is the
  mistake that produced all three bugs above.

## [1.15.0] - 2026-08-04

### Added
- **BeeGFS platform support** across all four engines. BeeGFS is modeled unlike every other
  platform: the topology level (`beegfs_raid6`, `beegfs_raid10`, `beegfs_raidz2`,
  `beegfs_single`) is the storage target's **local** RAID rather than a cluster-wide efficiency
  fraction, since BeeGFS federates storage targets and has no data protection of its own.
  Cluster-level protection is Buddy Mirroring, expressed as two independent booleans
  (`storageBuddyMirror`, `metadataBuddyMirror`) rather than folded into the level. Metadata
  targets reuse the existing `TieringConfig` primitive (fast tier = MDT, counts toward raw
  capacity but never usable — the same treatment Ceph WAL/DB offload gets).
  - Volumetry: `strategies/beegfs.ts` (target-width-aware local RAID efficiency, Buddy
    Mirroring, 2% filesystem overhead) plus a **metadata-target sizing advisory**
    (`beeGfsDetails`) comparing MDT usable capacity against BeeGFS's documented 0.3–0.5%
    rule-of-thumb, an estimated file count, and a validation alert when the MDT is undersized
    or absent.
  - Performance: `strategies/beegfs.ts` (write-penalty by level, Buddy-Mirroring-aware) and a
    BeeGFS entry in the new per-platform network model (see below).
  - Resilience: wired into the Monte Carlo worker (`resilienceWorker.ts`) — parity drives by
    level, Buddy Mirroring as `mirrorCopies: 2`, storage-target count in place of `serverCount`.
  - UI: options panel (target width, Buddy Mirroring toggles, chunk size, network, MDT tiering
    via the shared `TieringPanel`), capacity detail card, and i18n across en/fr/de/it.

### Changed
- **Per-platform network model refactor** (`NETWORK_MODEL_BY_TOPOLOGY` in
  `src/engines/performance/utils/bottleneck-chain.ts`): replaced a vSAN-hardcoded branch in
  `performance/index.ts` with a topology-keyed lookup table of network-model resolvers. vSAN
  behavior is unchanged (its existing performance specs are the regression gate); BeeGFS is the
  second entry, doubling write traffic on the wire when Storage Buddy Mirroring is on. Adding a
  platform's network behavior going forward is a table entry, not another orchestrator branch.

### Fixed
- **BeeGFS is no longer classified as pure software-defined storage — the HBA rule is now
  level-aware.** `'beegfs'` was listed in `HBA_REQUIRED_TOPOLOGIES` alongside Ceph and vSAN, so
  `getControllerOptions()` offered **only** IT-mode HBAs. BeeGFS never sees the disks: each
  storage target is a *local* volume it addresses as one block device, and in the most common
  deployment that device is a hardware RAID6 volume on a PERC or LSI controller. Because the
  bottleneck chain's Controller layer reads `CONTROLLER_LIMITS[controller]`, a BeeGFS RAID6 node
  was modelled with roughly **2.7× the controller IOPS ceiling and 1.6× the throughput** it
  really has (Dell PERC H755 = 750 000 IOPS / 12 000 MB/s vs the cheapest HBA at 2 000 000 IOPS /
  19 200 MB/s) — an optimistic error. The rule now resolves through the new
  `getControllerRequirement(type, level?)`, which returns `'raid'` for `beegfs_raid6` and
  `beegfs_raid10`, `'hba'` for `beegfs_raidz2` (ZFS needs direct disk access), and `'either'` for
  `beegfs_single` (one drive per target works both ways, so the UI offers the union). Changing
  BeeGFS level re-snaps the controller to a valid one, and a validation error fires if a
  hardware-RAID BeeGFS level is loaded from a link with an HBA selected. `requiresHba` and
  `getControllerOptions` gained an optional `level` argument: **every other platform's controller
  list and numeric output are unchanged**, with or without it.
- **`NetAppOptions.snapshotReserve` unit confusion.** The field is a *fraction* —
  `overheadCalculator.ts` multiplies capacity by it directly — but its Zod bound was
  `.min(0).max(100)` and the panel slider wrote raw percent into it, so moving the slider to 5
  meant a **500%** snapshot reserve and a crafted link with `100` validated into a 100× reserve.
  The bound is now `0..1`, and the slider converts on both sides (still displayed in percent).
  The default (`0.05` = 5%) and therefore every default NetApp result is unchanged; only
  previously-nonsensical non-default slider positions move. The two `snapshotReservePercent`
  fields (PowerStore, PowerScale) were checked and are correct — percent everywhere, divided by
  100 in the engine.
  - **User-visible consequence for old shared links.** A link created *after* someone moved the
    old NetApp snapshot-reserve slider encodes a value above the new `0..1` bound, so it now
    fails validation on load. Rejection is whole-payload: the **entire** configuration resets to
    defaults, not just the NetApp options. This is correct — those links encode a ≥100% reserve
    that drives usable capacity to zero or negative — but it means such a link no longer restores
    anything. Re-share the configuration to get a valid link.
- **BeeGFS `chunkSizeKb` and `numTargets` are now labelled informational.** Both are real BeeGFS
  tunables but had no consumer anywhere in `src/engines/` — two controls a user could move with
  zero effect on any output. They are now marked informational in the panel (tooltip + hint) the
  same way `network` already was, rather than wired to a fabricated formula: `numTargets` caps
  *single-file* throughput while every performance figure here is a cluster aggregate bounded by
  the total storage-target count, and the bottleneck chain has no per-file layer for a chunk
  boundary to act on. The reasoning is recorded on the fields themselves in
  `src/types/topology.ts`. No calculated result changes.
- **Controller cache policy documented as not modelled.** `RaidControllerOptions.writePolicy`,
  `readPolicy` and `cacheSize` reach the config export but no engine, and were investigated as
  part of the BeeGFS controller work. They stay unmodelled by determination, not by omission:
  this engine reports **sustained** IOPS and throughput, and a battery/flash-backed write-back
  cache is a finite buffer — under a sustained write stream the host rate converges on the rate
  at which the cache drains to the array, so the ceiling is the back-end array's and the RAID 5/6
  read-modify-write cost is deferred, never removed. The real benefits (write latency, burst
  absorption) belong to the *unsaturated* cache, a transient the engine does not represent. The
  derivation is recorded on the `writePolicy` type. No calculated result changes.
- **BeeGFS stranded drives no longer count as usable capacity.** Usable capacity was computed
  from every drive left after hot spares, while the validator warned *"N drive(s) do not fill a
  full storage target and are stranded"* and the capacity card printed the same count. A storage
  target **is** a local RAID volume, so a partial group is not a target at all: capacity is now
  computed on `storageTargetCount × drivesPerTarget` drives only, and the stranded remainder gets
  its own "BeeGFS Stranded Drives" breakdown bucket (raw capacity still counts every drive).
  Measured overstatement: 4.2% at 5 nodes × 20 drives / `drivesPerTarget` 12, and ~92% at 23
  drives / 12. The stranded-drive validation alert now reads its count from the engine's
  `beeGfsDetails` instead of recomputing it, so the warning and the capacity card cannot name
  different numbers. BeeGFS only — no other platform's capacity moves.
- **BeeGFS resilience and capacity now describe the same cluster.** `useResilience` derived its
  drive count and fault-group count from `driveCount × serverCount`, applying neither hot spares
  nor MDT tiering, while volumetry used the hot-spare- and tiering-resolved count: 100 drives
  with 10 hot spares at `drivesPerTarget` 12 gave volumetry 7 storage targets and resilience 8
  groups, and with MDT tiering configured the worker simulated the stale Hardware-panel drive
  count (112 drives, 9 groups) against a 48-drive capacity tier. Both sides now go through the
  same `resolveBeeGfsUsableDrives` / `calculateStorageTargets` pair via the new exported
  `resolveBeeGfsSimulationScope`, and under tiering the drive capacity/URE/AFR handed to the
  worker follow the capacity tier instead of modelling MDT NVMe as capacity-tier HDD. The
  model's superset invariant is preserved — see `docs/ARCHITECTURE.md`. BeeGFS only; every other
  platform's simulation input is byte-identical.
- **Security: URL-shared configuration links were not actually validated.** Zustand's `persist`
  middleware wraps state in a `{ state, version }` envelope before `urlHashStorage` sees it, but
  validation ran against that whole envelope instead of the payload inside it. Because the
  top-level schema is passthrough with every field optional, an envelope-only object always
  validated trivially, so every Zod schema added for URL persistence was inert in production — a
  crafted link could inject out-of-range or malformed values (e.g. `driveCount: 999999999`,
  `hotSpares: 'not-a-number'`) directly into the live store. Fixed by validating the payload
  inside the detected envelope; see `docs/SECURITY.md` for detail.
- **All 15 platform `*Options` objects now round-trip through "Copy URL to Share"** —
  `vsanOptions`, `cephOptions`, `longhornOptions`, `beeGfsOptions`, `powerFlexOptions`, and
  several nested fields (`s2dOptions.tieringConfig`, `nutanixOptions.tiering`,
  `powerstoreOptions.model`/`systemOverheadPercent`) were previously missing from the store's
  `partialize`/Zod schemas and silently reset to defaults whenever a shared link was opened.
  `omitDefaults()` now strips default-valued keys before compression so realistic single-platform
  links stay well under 1KB.
- **`resetToDefaults()` now matches a fresh page load.** `getDefaultState()` previously restated
  every platform's default options as hand-typed literals instead of importing the canonical
  `DEFAULT_*_OPTIONS` constants, and had drifted on five fields:
  `s2dOptions.reserveStrategy`, `synologyOptions.cacheMode`, and three `netAppOptions` fields.
  `getDefaultState()` now derives from the same constants `topologySlice.ts` uses, so reset and
  initial state cannot diverge again. One of the five, `netAppOptions.snapshotReserve` moving
  from `5` to `0.05`, also fixes a real bug: the engine treats that field as a fraction, so the
  old reset value meant a 500% snapshot reserve.

## [1.14.0] - 2026-07-12

### Changed
- **Presales-first guided-narrative dashboard.** `OutputDashboard.tsx` was recomposed from an
  undifferentiated equal-weight card grid into a persistent headline KPI band
  (`src/components/outputs/HeadlineBand.tsx`) followed by five narrative "acts"
  (`src/components/outputs/acts/`): `CapacityAct` (Sankey/donut + breakdown + ZFS/Longhorn
  detail + Backup sub-panel), `PerformanceAct` (gauges + bottleneck chain), `ResilienceAct`
  (Monte Carlo survival), `CostAct` (power/energy/CO2/flash endurance), and `TakeawayAct`
  (export buttons as the closing CTA, with provisioning commands moved into a collapsible
  `<details>`). Performance and Resilience sit side by side on wide screens. This is a UI
  re-composition only — no calculation engine or exporter changed.
- **Capability-driven output relevance** (`src/engines/outputRelevance.ts`): pure
  `shouldShowKpi`/`shouldShowSection` predicates decide which headline tiles and sections render
  for the selected platform, reusing the v1.13.0 capability map's probe-verified flags (e.g. the
  Effective-capacity tile is hidden for RAID and shown for ZFS with compression; Longhorn shows
  no dedup framing). Not-applicable is omitted; applicable-but-zero is still shown.
- `OutputDashboard.tsx` shrank from 986 to ~249 lines as a thin orchestrator; shared
  presentational helpers `MetricCard`/`ProgressBar` were extracted to `src/components/outputs/`.
- Added `headline.*` and `acts.*` i18n keys to the `output` namespace across en/fr/de/it.

## [1.13.0] - 2026-07-12

### Added
- **External-reference validation vectors for six platforms.** S2D (Microsoft Learn), Nutanix,
  NetApp (efficiency calculator), Ceph (docs.ceph.com), Synology (RAID calculator), and Longhorn
  (longhorn.io docs) each gained a `tests/fixtures/*-vectors.ts` file exercised through a shared
  `vector-harness.ts`, plus a cross-engine resilience/performance/sustainability spot-check.
- **Platform capability map** (`src/engines/capabilities.ts`) drives input hiding: controls with
  no effect for the selected platform (e.g. compression/dedup sliders, servers/nodes for
  single-node topologies) are now hidden instead of shown-but-inert, backed by behavior-probe
  tests.

### Changed
- **PPTX export rebuilt around a pure content builder** (`src/utils/pptxContent.ts`). Slide
  content (Sankey + 2×2 gauges + stat lines) is now assembled as plain data — independent of
  `pptxgenjs` and the DOM — then rendered by `exportPptx.ts`. The export is now fully localized
  (en/fr/de/it) and unit-system aware (binary/decimal) for every byte statistic, the color
  palette is passed as a parameter instead of being read from a module-level global (purity),
  and export failures now surface in the UI instead of failing silently.

### Fixed
- **PPTX IOPS K-suffix formatting now matches the on-screen gauges' precision** (audit finding
  #12): the exported PPTX rounded K-suffix IOPS to zero decimals (e.g. `1K`) while the dashboard's
  `Speedometer`/`AnimatedCounter` show one decimal (`1.3K`) for the same value — `formatIops()`
  now uses `.toFixed(1)` so exported precision matches the dashboard.

See `.planning/phases/18-quality-audit/18-AUDIT.md` for the full findings ledger (14 findings:
fixed, logged, and deferred product decisions).

## [1.12.0] - 2026-07-08

### Added
- **Longhorn topology** (#51): SUSE Longhorn distributed block storage as a forward topology
  modeled on Ceph replicated pools. Replica-aware capacity (R2/R3), free-space guardrail
  (`F = 1 − "Storage Minimal Available %"`) and snapshot reserve, with advisory growth and
  over-provisioning readouts (never subtracted from usable). Includes an options panel
  (disk mode, minimal-available %, snapshot/growth headroom, over-provisioning), a **Longhorn
  Capacity Sizing** output card (physical usable, recommended committed data, per-node
  allocation, guardrails), `serverCount ≥ R` placement validation, URL-state persistence,
  and i18n (en/fr/de/it).

## [1.11.0] - 2026-06-26

### Added
- Expanded the drive database: 20–30 TB nearline HDDs (CMR/SMR/HAMR), 24G-SAS TLC SSDs, small SATA TLC SSDs, and E1.L/E3.L QLC NVMe rulers up to 122.88 TB. Backfilled NAND cell type (TLC/QLC) on all SSDs and removed the unused AIC form factor.

## [1.10.0] - 2026-06-26

Full audit of the S2D / Azure Local model against the
[AzureLocal-Calculator](https://github.com/schmittnieto/AzureLocal-Calculator) reference and
Microsoft Learn ([fault tolerance](https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/fault-tolerance)).

### Fixed
- **S2D storage tiers are now applied to the calculations.** Enabling "Storage Tiers" (SSD cache + HDD/SSD capacity) was silently ignored — the tiering switch lived on a redundant `enabled` flag the UI never set, so the engine always fell back to the single global drive. Tiering now activates from the platform toggle plus drive selection (the legacy `enabled` flag is no longer consulted), and the S2D panel seeds default cache/capacity drives so a result appears immediately. The capacity tier drives usable capacity and resiliency; the cache tier is excluded from usable and shown as its own band. The same root cause also silently disabled vSAN OSA disk-group tiering, Ceph WAL/DB offload, and Nutanix hybrid tiering — all now activate consistently when their drives are selected.
- **S2D rebuild reserve is now removed before the resiliency multiplier.** The reserve (1 capacity drive/server, capped at 4) is unallocated *raw* pool space, so it is now subtracted from raw capacity *before* applying the mirror/parity efficiency — matching the AzureLocal reference and Microsoft's model. Previously a raw-sized reserve was subtracted *after* the efficiency multiplier, under-counting usable capacity by ~10–30% for any reserve-enabled mirror config. The 4-drive cap and the opt-in `node_failure` strategy are unchanged.
- **Tiered S2D overhead now uses the capacity-tier drive** instead of the global drive when sizing the rebuild reserve.

### Changed
- **S2D dual parity now uses Microsoft's stepped efficiency tables.** The previous smooth `(N−2)/N` over-stated efficiency at scale (87.5% at 16 nodes). Dual parity now follows Microsoft's published Reed-Solomon/LRC steps, which differ for all-flash vs hybrid clusters: all-flash 50% (4–6) → 66.7% (7–8) → 75% (9–15) → 80% (16, LRC 12+2+1); hybrid 50% (4–6) → 66.7% (7–11) → 72.7% (12–16, LRC 8+2+1). Mirror-accelerated parity uses the same stepped efficiency for its parity portion.
- **Performance and sustainability engines are now tier-aware for S2D.** With tiering on, the performance media layer models write-back cache (writes absorbed by the cache tier; reads a working-set-weighted blend of cache and capacity); power sums both tiers and flash-endurance is computed on the SSD cache that actually absorbs the writes.

### Added
- **Azure Local infrastructure-volume reserve.** S2D usable capacity now reflects a fixed ~277 GB cluster reserve for infrastructure volumes (Arc Resource Bridge + AKS images, ClusterPerformanceHistory, system), matching the reference calculator.

## [1.9.1] - 2026-06-26

### Fixed
- **vSAN ESA adaptive RAID-5 threshold now matches VMware.** The 4+1 stripe (80% efficiency) now engages at ≥ 6 hosts (host-count only) as VMware documents — previously it required ≥ 5 hosts *and* ≥ 100 drives. 3–5 host clusters correctly stay 2+1 (67%). Resolves a known limitation noted in 1.9.0.
- **vSAN ESA RAID-6 is now a fixed 4+2 stripe.** ESA adapts only RAID-5; RAID-6 stays 4+2 (67% efficiency) regardless of cluster size. Removed the incorrect 6+2 (75%) scheme the model applied at ≥ 8 hosts. Resolves a known limitation noted in 1.9.0.

## [1.9.0] - 2026-06-25

### Added
- **S2D best-practice alerts.** Single parity now warns it is supported but not recommended for clustered S2D (`S2D_SINGLE_PARITY_DISCOURAGED`); 2-node clusters are advised to use nested resiliency (`S2D_2NODE_NESTED_RECOMMENDED`); two-way mirror shows an info recommending three-way mirror for production HA (`S2D_3WAY_RECOMMENDED`).
- **Expanded in-app platform guide for S2D and vSAN ESA.** The guide sections (`PlatformGuide.tsx` + `guide.json`, all four languages) gained resiliency/efficiency tables, replication behavior, rebuild reserve, nested resiliency, and best-practice guidance.

### Fixed
- **S2D resiliency node minimums are now validated.** A new `validateS2DResiliency` check (`src/utils/validators.ts`) enforces Microsoft's fault-domain minimums per resiliency type: three-way mirror and single parity require ≥ 3 fault domains (nodes), dual parity and mirror-accelerated parity (MAP) require ≥ 4. Each violation raises an error alert (`S2D_3WAY_MIN_NODES`, `S2D_PARITY_MIN_NODES`, `S2D_DUAL_PARITY_MIN_NODES`, `S2D_MAP_MIN_NODES`).
- **S2D mirror write penalty now scales with the copy count.** The performance engine (`src/engines/performance/strategies/s2d.ts`) previously used a flat mirror penalty; it now charges two-way = 2×, three-way = 3×, and MAP = `mirrorCopies + 0.5`, with `s2dOptions` threaded through `PerformanceInput`/`usePerformanceCalc`.
- **S2D rebuild reserve now follows Microsoft's rule.** The default `drive_failure` strategy reserves 1 capacity drive per server, capped at 4 drives cluster-wide (`capacity_raw × min(faultDomains, 4)`), instead of an uncapped per-node reserve. The reserve is also clamped to the available post-parity capacity so tiny clusters can no longer under-count usable capacity. The default `reserveStrategy` changed from `node_failure` to `drive_failure`; `node_failure` remains as an opt-in whole-node reserve.

### Changed
- **S2D fault-domain bounds tightened from 1–100 to 2–16** (`src/utils/schemas.ts`), matching the supported Microsoft S2D cluster range.

### Known limitations
- **vSAN ESA adaptive RAID-5 threshold diverges from VMware docs.** Raidy switches RAID-5 to a 4+1 stripe at ≥ 5 hosts AND ≥ 100 drives, whereas VMware documents the 4+1 threshold as ≥ 6 hosts (host-count only). Intentionally left unchanged here; flagged as a follow-up.
- **vSAN ESA RAID-6 scheme diverges from VMware docs.** Raidy models a 6+2 RAID-6 stripe at ≥ 8 hosts, whereas VMware documents ESA RAID-6 as a fixed 4+2. Intentionally left unchanged here; flagged as a follow-up.

## [1.8.0] - 2026-06-25

### Added
- **vSAN compression & deduplication now affect usable capacity.** The compression and deduplication toggles in the vSAN panel were dead — `vsanOptions` was never forwarded to the data-reduction stage and that stage had no vSAN branch, so toggling them changed nothing (both OSA and ESA). Each toggle now drives effective capacity (`C_eff = C_usable × comp × dedup`), with dedicated ratio sliders in the vSAN panel. Defaults follow ESA: compression on (1.5×), dedup off. The redundant global compression/dedup sliders are hidden for vSAN, consistent with Nutanix/Ceph/PowerStore.

### Fixed
- **vSAN no longer reserves dedicated hot spares.** vSAN (OSA and ESA) rebuilds from distributed slack space, not dedicated spare drives, yet the app defaulted to 1 hot spare and deducted a full drive's capacity from usable. Selecting a vSAN topology now forces 0 spares (enforced in the store and defensively in the volumetry/performance hooks so shared URLs cannot reintroduce one), and the hot-spares slider is replaced by an explanatory note.
- **vSAN ESA bottleneck chain no longer shows a SAS HBA.** ESA is NVMe-only with drives attached directly to PCIe, but the performance chain always inserted a controller layer and defaulted ESA to a "Generic SAS HBA". The controller layer is now dropped for ESA (the chain becomes Media → PCIe → Network), the IOPS ceiling falls back to the PCIe/network limit, and ESA defaults its controller to the NVMe HBA.

### Changed
- **Realistic vSAN network bottleneck model.** The network stage compared raw aggregate media bandwidth against a one-directional port aggregate (`speed × nodes`), so a small NVMe cluster was always flagged network-bound. The vSAN network ceiling now accounts for full-duplex links, on-the-wire compression (ESA compresses before replication), and the fraction of throughput that actually crosses the fabric (writes × replication/EC factor + remote reads). Non-vSAN topologies keep the previous model unchanged.

## [1.7.1] - 2026-05-24

### Fixed
- **Ceph compression now reduces effective capacity.** Enabling compression on a Ceph pool previously had no effect — the toggle, the algorithm selector, and the global compression slider were all dead. Effective capacity now reflects the chosen BlueStore algorithm (ZSTD 1.7×, LZ4 1.4×, Snappy 1.3×), gated by the compression toggle. The Ceph panel shows the resulting ratio, and the redundant global compression/dedup sliders are hidden for Ceph (consistent with Nutanix/PowerStore). Ceph has no native inline dedup, so only compression applies.

## [1.7.0] - 2026-05-24

### Added
- **Auto light/dark mode.** A header toggle (Auto / Light / Dark) switches the theme; Auto follows the OS (`prefers-color-scheme`) and reacts to changes. The preference persists (`raidy-theme`) and applies before first paint (no flash). Built on Tailwind's class-based `dark:` variant.
- The PowerPoint export **follows the app theme** — a light deck (white paper) in light mode, the dark deck in dark mode, with charts captured on a matching background.

## [1.6.1] - 2026-05-24

### Changed
- PowerPoint export is now a single executive one-pager instead of a 7-slide deck. The slide keeps all visuals — Sankey capacity waterfall, performance speedometers, and resilience donut — alongside a compact key-metrics grid (usable capacity, efficiency, IOPS, power, energy, CO₂, survival) and a bottleneck footer.

## [1.6.0] - 2026-05-24

### Changed
- Federated developer conventions with the sibling **vatlas** project (reference): Biome config (now identical), TypeScript layout + test type-checking via `tsconfig.test.json`, dependency versions, and the `docs/` structure.
- Upgraded Vite 7→8, `@vitejs/plugin-react` 5→6, i18next 25→26, react-i18next 16→17, jsdom 28→29; removed unused `autoprefixer`/`postcss`.
- Consolidated CI into a single hardened pipeline (`static.yml`): Node 24, SHA-pinned actions, supply-chain denylist, `npm audit` (LOW+), OSV-Scanner gate, bundle-size budgets, and a CycloneDX SBOM. Removed Snyk.
- Restructured documentation under `docs/` (ARCHITECTURE, DEVELOPMENT, TESTING, CONFIGURATION, GETTING-STARTED) with ADRs for the security gate and the intentional divergences from vatlas.

### Fixed
- PowerPoint export: the drive-detail slide now reads the correct nested fields — Active Power (`power.load_watts`) and DWPD (`reliability.dwpd`, shown only for flash). Previously rendered "undefined W" and never emitted the DWPD row.
- Resolved 170 latent type errors across the test suite, which is now type-checked in CI (the previous `typecheck` script was a no-op for app/test code).

### Security
- Bumped `dompurify` to 3.4.5 (resolves a moderate advisory). CI now fails on LOW+ advisories via both `npm audit` and OSV-Scanner, and adds a telemetry-package denylist supply-chain gate.

## [1.2.0] - 2026-02-03

### Added
- Backup Requirements calculation connecting existing retention/change rate settings to a new output card (#8)

## [1.1.0] - 2026-02-03

### Added
- Filesystem selector now affects capacity calculations (#6)
  - XFS: 1%, ext4: 5%, ZFS: 1%, Btrfs: 4%, ReFS: 2%, NTFS: 2%

### Security
- Updated jspdf to 4.1.0 (fixes 4 vulnerabilities)

## [1.0.0] - 2026-02-03

### Added
- User-defined performance capacity threshold (50-100%) for operational capacity planning (#5)
- Contextual help tooltips throughout the UI
- Sizing guide documentation
- Smart drive connectivity filtering based on topology
- Independent calculation hooks with focused dependencies for better performance
- i18n support for EN, FR, DE, IT (Swiss languages)

### Changed
- Anonymized drive database (removed vendor brand names)
- Refactored `useCalculations` hook to orchestrate independent hooks

### Fixed
- Nutanix RF2/RF3/EC efficiency calculations
- TypeScript build errors
- Edge case in standard error calculation
- Lint errors with React import suppressions

## [0.1.0] - Initial Development

### Added
- Core volumetry engine with strategy pattern for multiple platforms
- Performance engine with bottleneck analysis
- Resilience engine with Monte Carlo simulation
- Sustainability engine with power/CO2 calculations
- Support for: RAID, ZFS, vSAN, S2D, Ceph, Nutanix, Dell (PowerFlex, PowerStore, PowerScale, PowerVault), NetApp, Synology
- Sankey diagram visualization
- PDF export
- URL-based state sharing (LZ-String compression)
