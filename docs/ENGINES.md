# Calculation engines — reference

The per-platform formulas, vendor tables and known limitations behind every number Raidy reports.

**Read this before changing a figure.** [ARCHITECTURE.md](./ARCHITECTURE.md) describes how the
pieces fit together; this describes what they compute and on whose authority. Most sections carry
the vendor citation the formula came from, and several carry a caveat about what is deliberately
*not* modelled — those are load-bearing, not hedging.

Governing decisions: engines are pure functions that never speak to the user
([ADR-0004](./adr/0004-engines-are-pure-functions.md)); each platform is a strategy, not a branch
([ADR-0003](./adr/0003-strategy-pattern-per-platform.md)); resilience may understate but never
overstate ([ADR-0006](./adr/0006-monte-carlo-and-the-superset-invariant.md)).

Validation vectors live in `tests/fixtures/*-vectors.ts`, each carrying its own sources. Capacity
figures are held within 1% of WintelGuy and the NetApp Storage Efficiency Calculator.

---

## Volumetry (`/src/engines/volumetry/`)

Calculates storage capacity and efficiency.

**Supported Topologies:**

- Standard RAID: 0, 1, 1E, 3, 4, 5, 5E, 5EE, 6, 10, 50, 60
- ZFS: Stripe, Mirror, RAID-Z1/Z2/Z3, dRAID1/2/3
- Microsoft S2D: Simple, Mirror, Parity, Dual Parity, MAP
- VMware vSAN: OSA and ESA (adaptive efficiency)
- Dell: PowerFlex, PowerStore, PowerScale, ObjectScale, PowerVault
- NetApp ONTAP: RAID-DP, RAID-TEC, ADP
- Ceph: Replicated and Erasure Coded pools
- Longhorn: SUSE/Kubernetes distributed block storage, replicated pools (R2/R3)
- BeeGFS: parallel filesystem, storage-target-local RAID6/RAID10/RAIDz2/single with optional
  Buddy Mirroring, and metadata-target sizing advisory
- Nutanix, Synology, and more

> Microsoft S2D enforces a minimum number of fault domains (nodes) per resiliency type (validated in `src/utils/validators.ts`): three-way mirror and single parity require ≥ 3, dual parity and mirror-accelerated parity (MAP) require ≥ 4. Fault domains are bounded to 2–16, the supported S2D cluster range.
>
> **Dual-parity efficiency** follows Microsoft's stepped Reed-Solomon/LRC tables (`getS2DDualParityEfficiency` in `strategies/s2d.ts`), which differ for all-flash vs hybrid clusters — all-flash: 50% (4–6) → 66.7% (7–8) → 75% (9–15) → 80% (16); hybrid: 50% (4–6) → 66.7% (7–11) → 72.7% (12–16). The orchestrator picks the table from the resiliency media (capacity tier when tiered, else the pool drive). MAP uses the same stepped efficiency for its parity portion.
>
> **Storage tiering** (S2D, vSAN OSA, Ceph WAL/DB, Nutanix hybrid) is resolved once by the shared `resolveTiering` (`src/engines/shared/tiering.ts`) and reused by all four engines, including resilience. Tiering activates from the platform toggle plus drive selection; the capacity tier drives usable capacity and resiliency, while the cache tier is excluded from usable and counted only toward raw. `resolveTiering` takes a single `TieringResolverOptions` bag (`s2dOptions`, `vsanOptions`, `cephOptions`, `nutanixOptions`, `beeGfsOptions`) rather than four-or-five separate parameters, and `useTieringOptions()` (`src/hooks/useTieringOptions.ts`) assembles that bag once from the store. `useVolumetryCalc`, `usePerformanceCalc`, `useSustainabilityCalc` and `useResilience` all consume the same hook's output as a single `tieringOptions` prop/argument rather than hand-listing the platform fields individually — hand-listing a subset was the exact mistake that dropped a platform's options and caused issues #59, #60 and #92. Adding a new tiered platform means adding it once to `TieringResolverOptions` and `useTieringOptions()`; every consumer picks it up automatically since none of them destructure the bag into named fields.
>
> **Longhorn** (`strategies/longhorn.ts`) is modeled on Ceph replicated pools: usable capacity is redundancy-limited to `1/R` (R = 2 or 3 replicas), reduced by host filesystem overhead, then narrowed by a free-space guardrail (`F = 1 − "Storage Minimal Available %"`) and a snapshot reserve (divided by the snapshot headroom). It has no native compression/dedup. Growth headroom and over-provisioning are advisory readouts only — they inform the recommended committed-data ceiling but are never subtracted from usable capacity.
>
> **BeeGFS** (`strategies/beegfs.ts`) does not fit the level-maps-to-an-efficiency-fraction shape every other platform uses. BeeGFS federates *storage targets*, and each target is itself a local RAID volume, so the modelling is deliberately unlike the rest of the engine:
>
> - **Topology level = the storage target's local RAID**, not cluster-wide protection: `beegfs_raid6`, `beegfs_raid10`, `beegfs_raidz2` (ZFS RAIDz2 target), or `beegfs_single` (bare drive, no local RAID). Local efficiency is `(drivesPerTarget − 2) / drivesPerTarget` for RAID6/RAIDz2, `0.5` for RAID10, `1` for single — `drivesPerTarget` (default 12) is an explicit input because RAID6 efficiency is meaningless without target width. Because the level describes real local hardware, it also decides the **controller class** — BeeGFS is *not* pure software-defined storage (see the controller note in the Performance Engine section below).
> - **Cluster-level protection is Buddy Mirroring**, expressed as two independent booleans in `BeeGfsOptions` rather than folded into the level enum: `storageBuddyMirror` (data, halves usable capacity when on) and `metadataBuddyMirror` (metadata, doubles the MDT capacity requirement). BeeGFS genuinely lets you mirror one without the other, which a combined level enum could not express.
> - **Capacity is computed on whole storage targets only.** A storage target *is* a local RAID volume, so drives that do not complete one ("stranded" drives) join no target and hold no data. `calculateStorageTargets` / `resolveBeeGfsUsableDrives` (`strategies/beegfs.ts`) are the single source of truth for that derivation and are shared by three surfaces that must never disagree: `calculateVolumetry`, `BeeGfsOptionsPanel` (via `deriveBeeGfsStorageTargets`), and `useResilience` (via `resolveBeeGfsSimulationScope`). Stranded drives still count toward **raw** capacity and get their own "BeeGFS Stranded Drives" breakdown bucket; the `validators.ts` stranded-drive warning reads its count from `beeGfsDetails` rather than recomputing it. **The performance engine deliberately does not apply this rounding** — a stranded drive still exists on the bus and still draws from the controller/PCIe budget, so pricing it is correct for a bottleneck model even though excluding it is correct for a capacity model. The two engines can therefore report different tiered-BeeGFS drive counts by design; see the cross-referencing comments at `beeGfsTargets` in `volumetry/index.ts` and `capUsableDrives` in `performance/index.ts` (#91).
> - **Metadata targets (MDT) reuse the shared `TieringConfig` primitive** (`src/types/topology.ts`, resolved by `src/engines/shared/tiering.ts`) instead of introducing a BeeGFS-specific concept: `fastTier` = MDT, `capacityTier` = storage targets. `resolveTiering`'s existing semantics are already exactly right for this — the fast tier counts toward **raw** capacity but never toward **usable**, the same treatment Ceph WAL/DB offload gets. A metadata-sizing advisory (`beeGfsDetails`, built in `volumetry/index.ts` following the `longhornDetails` pattern) compares MDT usable capacity against the BeeGFS-documented 0.3–0.5% rule of thumb and surfaces an estimated file count; a `validators.ts` alert fires when the MDT is undersized or absent.

**Calculations:**

- Raw capacity = drive capacity × drive count
- Parity overhead (varies by topology)
- Hot spare capacity reservation (the ten `DISTRIBUTED_SPARE_TOPOLOGIES` platforms rebuild from distributed slack space, so no dedicated spares are reserved)
- S2D rebuild reserve: the default `drive_failure` strategy reserves 1 capacity drive per server, capped at 4 drives cluster-wide (`capacity_raw × min(faultDomains, 4)`), per Microsoft's rule; an opt-in `node_failure` strategy reserves a whole node instead. The reserve is unallocated **raw** pool space, so it is removed from raw capacity **before** the resiliency efficiency multiplier (matching Microsoft / Azure Local) — reserving N raw drives costs N × efficiency of usable capacity
- S2D infrastructure reserve: a fixed ~277 GB cluster-wide reserve for Azure Local infrastructure volumes (Arc Resource Bridge + AKS images, ClusterPerformanceHistory, system), subtracted from post-efficiency usable capacity
- Filesystem overhead (per filesystem type)
- ZFS slop factor (1/32 of pool)
- Platform-specific losses
- Compression/dedup multipliers

> **Platform capability map** (`src/engines/capabilities.ts`) is the single source of truth for
> which inputs actually move the volumetry output for a given topology type. It exposes
> `getCapabilities(type)` and `shouldShowControl(control, type)` for the six
> global/cross-cutting controls whose usefulness varies by platform: `compression`, `dedup`,
> `hotSpares`, `serverCount`, `fsType`, `controller` — plus one flag read straight off
> `getCapabilities`, `drivePopulationFromCatalog`, which describes the drive picker rather than
> gating a single control. The map is probe-enforced —
> `tests/engines/capabilities.spec.ts` drives `calculateVolumetry` with each flag toggled and
> asserts the flag matches actual engine behavior (e.g. the global
> `compressionRatio`/`dedupRatio` inputs only move `effectiveCapacity` for ZFS; every other
> platform either has no data-reduction step or reduces through its own platform-specific
> options panel instead), so the map cannot silently drift from the engines it describes.
>
> `drivePopulationFromCatalog` is true only for `powerscale`, where `calculateVolumetry`
> short-circuits into `calculatePowerScaleVolumetry(powerscaleOptions)` before `driveCount` is
> read at all. Its probe doubles the drive count and asserts `rawCapacity` does not move — the
> other fourteen types double with it. It is a statement about where the *population* comes from,
> not a licence to hide the drive picker: the catalog carries no power, reliability or price, so
> the selected drive is still read by sustainability, TCO, performance and resilience. See the
> PowerScale UI notes below for how `HardwarePanel` keeps it reachable.
>
> Those four figures stay on SCREEN and leave the customer documents. `sustainabilityApplies` and
> `performanceApplies` (`src/engines/outputRelevance.ts`) gate the PDF and the deck: the vendor
> table publishes capacity and efficiency and nothing else, so power, cost, IOPS and the
> bottleneck chain answer to the reference medium rather than to the cluster — changing only that
> medium on an unchanged 3-node F210 moved drive power 87 W to 107 W and Max Read IOPS 2,028 to
> 2,280,000. Performance is also the wrong shape here: a node is an appliance, sized per node.
> While configuring, the order of magnitude is useful and the medium is one click away; on a
> deliverable, beside vendor-exact capacity, it reads as equally solid. See `docs/BACKLOG.md`.
>
> `honoursFsType` is true for `standard` **and `longhorn`** — the filesystem-overhead switch has
> no case for Longhorn, so it falls through to the `default` branch that reads the user's choice.
> `honoursController` is false only for `vsan_esa`, which is NVMe-direct and has no Controller
> layer in its bottleneck chain; its probe
> (`tests/engines/performance/controllerRelevance.spec.ts`) runs at a deliberately high drive
> count, because at realistic counts the media layer binds first and the probe would misreport
> eight platforms as controller-insensitive. The UI consumes it directly: `AdvancedPanel.tsx` hides the
> global compression/dedup sliders unless `shouldShowControl('compression'|'dedup', topology.type)`
> is true, and `HardwarePanel.tsx` hides the servers/nodes slider unless
> `shouldShowControl('serverCount', topology.type)` is true (with an additional carve-out for
> standard RAID50/60, where the same input doubles as the RAID-group count). Controls are
> hidden, not disabled, when a platform's engine ignores them — the store values are left
> untouched so a stored URL config round-trips unchanged. For `serverCount` specifically, hiding
> the control is not enough on its own: switching topology never resets the stored value, so a
> stale multi-node `serverCount` would otherwise keep silently scaling results after switching to
> a single-node platform. `effectiveServerCount(serverCount, topology)` (also in
> `src/engines/capabilities.ts`) closes that gap by clamping to `1` at the calculation-hook
> boundary (`useVolumetryCalc`, `usePerformanceCalc`, `useSustainabilityCalc`,
> `useCalculations`, `useResilience`) whenever the control is hidden — the store's `serverCount`
> itself is left untouched, so it round-trips unchanged if the user switches back.

> **Fraction-vs-percent unit audit** (issue #61, `docs/BACKLOG.md` B3, closed with no code
> change). A real bug of this shape was fixed in `[1.15.0]`:
> `netAppOptions.snapshotReserve` is a *fraction* that `overheadCalculator.ts` multiplies
> directly against capacity, but its Zod bound allowed `0..100` and the panel wrote a raw
> percent into it — a slider at 5 meant a 500% reserve. Every field in `src/types/topology.ts`
> named `*Percent`/`*Reserve`/`*Ratio`/`*Fraction`, plus every numeric option that reaches a
> multiplication against a capacity, was re-audited on the same three axes (engine use / Zod
> bound / UI write) and all agree:
>
> | Field | Engine use | Zod bound | UI write |
> |---|---|---|---|
> | `netAppOptions.snapshotReserve` | multiplies directly (fraction) | `0..1` | panel divides by 100 on write, multiplies by 100 on display |
> | `powerstoreOptions.snapshotReservePercent` | divided by 100 (percent) | `0..100` | panel writes raw percent |
> | `powerstoreOptions.systemOverheadPercent` | divided by 100 (percent) | `0..100` | panel writes raw percent |
> | `objectscaleOptions.systemOverheadPercent` | divided by 100 (percent) | `0..100` | panel writes raw percent |
> | `netAppOptions.waflOverhead` | multiplies directly (fraction) | `0..1` | panel divides by 100 on write, multiplies by 100 on display |
> | `netAppOptions.dataReductionRatio` | multiplies directly (true ratio, not a proportion) | `1..20` | panel writes raw ratio |
> | `nutanixOptions.systemOverhead` | multiplies directly (fraction) | `0..1` | panel divides by 100 on write, multiplies by 100 on display |
> | `powerFlexOptions.fgOverhead` | multiplies directly (fraction) | `0..1` | panel divides by 100 on write, multiplies by 100 on display |
> | `cephOptions.safeCapacityThreshold` | multiplies directly (fraction, default 0.85) | `0..1` | panel divides by 100 on write, multiplies by 100 on display |
> | `longhornOptions.minimalAvailablePercent` | divided by 100 (percent) | `0..100` | panel writes raw percent |
> | `longhornOptions.overProvisioningPercent` | not multiplied against capacity (advisory display only) | `0..1000` | panel writes raw percent |
> | `beeGfsOptions.fsOverheadPercent` | divided by 100 (percent) | `0.5..5` | panel writes raw percent |
> | `TieringConfig.workingSetPercent` | divided by 100 (percent) | `0..100` | panel writes raw percent |
> | `*.compressionRatio` / `*.dedupRatio` (vSAN, PowerFlex, Nutanix, PowerStore, ObjectScale, global) | multiply directly (true ratios, e.g. 1.5 = 1.5:1, not proportions of 1) | `1..10` | panels write the raw ratio value; no /100 or ×100 anywhere in this family |
>
> Every live (engine-consumed) field's three facts agree, so no code changed. This table
> originally also listed four fields with no engine consumer at all — `synologyOptions.btrfsOverhead`,
> `objectscaleOptions.fillRatePercent`, `objectscaleOptions.networkEfficiencyFactor`, and
> `cephOptions.walDbRatio` — a different bug class from the fraction/percent mismatch this audit
> was checking for. They were removed from the schema entirely in issue #104 rather than wired up:
> `btrfsOverhead` and `fillRatePercent` were unreachable in both directions (no panel ever wrote
> them, no engine ever read them); `networkEfficiencyFactor` had a control but no defensible,
> citable sizing rule connecting "East-West traffic factor" to a network-bandwidth derate (unlike
> vSAN's/BeeGFS's `NETWORK_MODEL_BY_TOPOLOGY` entries, which cite real replication mechanics);
> `walDbRatio` had no defensible connection point either — Ceph's WAL/DB tier device count and
> size are already set explicitly by the user via the tiering picker (`resolveTiering` /
> `TieringConfig`), so deriving them from a ratio would mean silently overriding that explicit
> choice rather than modeling anything real.
>
> A fifth field left this table later, for a third reason again: PowerScale's
> `snapshotReservePercent`, `compressionRatio` and `dedupRatio` were live and correctly
> wired, but the OneFS rebuild retired the generic drive-centric PowerScale path they
> belonged to. Data reduction is a published property of each node model in Dell's
> catalog (1.0, 1.6 or 2.0), not a user-set slider, and PowerSizer reserves nothing for
> snapshots — so a non-zero default would have put every raidy answer below the source of
> truth. `PowerScaleOptions` is now `{ tiers }` alone; see
> [adr/0014](./adr/0014-vendor-lookup-tables.md).
>
> **Performance, resilience and sustainability read the tier model, not the Hardware panel**
> (PowerScale has `hasServerCount: false`, so the shared drive-count/server-count sliders are
> stale for it). `powerScaleDriveTotals` (`src/engines/volumetry/powerscale/index.ts`) is the one
> place both populations are derived: `firstTierDrives`/`firstTierNodes`/`firstTierSpareDrives`
> for the FIRST node pool only, and `clusterDrives`/`clusterNodes` summed across every tier — plus
> `firstTier`, the actual `PowerScaleTier` object those first-tier numbers came from (not
> `options.tiers[0]` re-indexed independently, which can silently point at a DIFFERENT tier when
> an earlier one is unsizeable). A tier is included here under the EXACT same rule
> `calculatePowerScaleVolumetry` uses — `sizeTier(tier) !== null` — not merely "the model name
> resolves": a tier with a real model but an unpublished protection/node-count combination
> contributes nothing, the same "confidently wrong on a dashboard that looks correct" failure the
> unknown-model case already guarded against.
>
> **Performance and resilience use the first-tier fields** — a client's IOPS and a rebuild's
> exposure window are properties of the pool serving the data, not an average across
> heterogeneous pools, so `usePerformanceCalc`/`useResilience`'s `powerscale` scope resolver read
> `tiers[0]` only (in practice, `powerScaleDriveTotals`'s `firstTier`). **Sustainability sums the
> cluster fields** — power, cooling and TCO are physically additive across the whole rack, so
> `useSustainabilityCalc` reads every tier. The dashboard surfaces this split with a note
> (`output:powerscale.firstTierOnly`) whenever a cluster has more than one tier.
>
> **Write penalty** (`dellPerformanceStrategy.getWritePenalty('powerscale_onefs', tier)`, tier ==
> `powerScaleDriveTotals(...).firstTier` — never a second, independent `tiers[0]` lookup, so the
> penalty can't describe a different tier than the one the population came from) is protection-
> and node-count-aware: `STRIPE_SHAPES[protection].M + 1.5` when the pool has enough nodes to
> stripe FEC (the FEC-unit-count rule the old `+1n..+4n` levels already encoded), or the mirror
> copy count (`powerScaleMirrorCopies`, e.g. 2.0/3.0) when it doesn't — see the resilience
> paragraph below for that boundary. Falls back to a neutral 3.0 when no tier is configured.
>
> **Resilience's node-failure model is NOT vendor-attested**, unlike everything else on this
> branch: Dell's PowerSizer export is a capacity calculator and carries no AFR, URE or MTBF, so
> there is no source of truth to validate a reliability model against. `SimulationInput.
> powerScaleProtection` (threaded from `firstTier.protection`) drives a dedicated model in
> `resilienceWorker.ts`'s `computeTopologyModel`/`runSingleSimulation`, split into the two
> regimes OneFS itself uses:
>
> - **Mirror region** (`nodeCount < 2*nf`, too few nodes to stripe FEC): OneFS mirrors instead,
>   `min(nf+1, nodeCount)`-way. This reuses the EXISTING drive-pair mirror machinery
>   (`isMirror`, `assignNodesRoundRobin`) verbatim rather than inventing a parallel one — a
>   PowerScale pool in this region and a native `mirrorCopies`-driven mirror input with the same
>   derived copy count produce bit-identical survival rates under the same random stream.
> - **FEC region** (`nodeCount >= 2*nf`): a dedicated branch — neither `isGroup` (independent
>   parallel groups, any one lost = total loss) nor the flat node-blind parity count fits "one
>   flat domain, counted per node" — spends a single UNIT BUDGET (`M`): a drive failure debits 1
>   unit; a whole-node failure debits `u` units, realized (`applyPowerScaleNodeFailure`) as `u`
>   accumulated 1-unit drive debits landing on the SAME node followed by a sweep that removes the
>   rest of that node's drives as one event — not as a side effect of the first drive on it
>   dying. Loss when consumed units exceed `M`. `nf` stays in `STRIPE_SHAPES` as a
>   vendor-published cross-check (`nf == floor(M / u)` holds for all nine entries — `+3d:1n1d`'s
>   own name is the clearest instance: `u=2, M=3`, i.e. "1 node + 1 drive") but is NOT read by
>   the loss decision directly. An earlier version of this model used `nf` and `M` as two
>   independent thresholds ("more than `nf` nodes touched, OR more than `M` drives in one node")
>   and was vacuously wrong for every `+Nn` protection: with `u=1` a node's own budget is
>   exhausted by its first failed drive regardless of how many more it has, so a 15-drive-per-
>   node A200 under `+2n` was declared dead on the THIRD drive failure concentrated in one node —
>   contradicting "+Nn tolerates whole-node loss" one paragraph up. The unit budget fixes this:
>   the same A200 pool now survives losing 30 drives across its first two whole nodes and dies on
>   the third node's first drive, exactly matching the claim.
>
> `isPowerScaleMirrorRegion`/`powerScaleMirrorCopies` (`stripeShape.ts`) are the single place the
> mirror-vs-FEC boundary lives, shared by the capacity closed form (`onefsFormula.ts`, test-only),
> the write penalty, and the resilience worker, so none of the three can disagree about where it
> sits. Before this model existed, every PowerScale pool was silently simulated tolerating exactly
> one drive failure (the `getParityDrives` catch-all default), regardless of its real protection —
> a `+3n` 20-node pool that tolerates three whole nodes was simulated as dying on the second drive
> failure anywhere in the pool.
>
> `hasHotSpare` for PowerScale comes from the tier's own Virtual Hot Spare count
> (`firstTierSpareDrives > 0`), not the generic Hardware-panel hot-spares slider — that slider is
> meaningless for PowerScale (the panel is hidden), so reading it would either strand a
> configured VHS with no immediate-rebuild credit or grant credit from a leftover value a
> previously selected platform left in the store.
>
> Resilience's `mediaDrive` is deliberately left `null` for PowerScale (keeping the Hardware
> panel's drive) because the vendor catalog carries capacities but no AFR/URE/MTBF — inventing
> those would fabricate the very numbers the simulation reports. An empty or unsized tier list
> degrades every one of these figures to a defined zero state rather than throwing.
>
> **The UI mirrors the model, not the old level dropdown.** `TOPOLOGY_LEVELS.powerscale` carries
> exactly one entry (`powerscale_onefs`): protection is per node pool, so the level dropdown
> offers no protection choice at all. That table is now typed per topology type
> (`{ [T in TopologyType]: LevelOption<T>[] }`), and `TopologyPanel` builds a `Topology` through
> `topologyFrom`/`defaultTopologyFor` instead of `as Topology` — the two changes together are why
> the seven retired `powerscale_n*`/`mirror_*` levels could sit in the dropdown for months after
> the type union dropped them, and why a retired level is a compile error now.
> `PowerScaleOptionsPanel` renders 1-8 `PowerScaleTierRow`s, each a catalog-driven chain (model →
> drive size → node count → protection) that re-derives everything downstream in ONE dispatch, so
> the store can never hold — or a shared URL persist — an intermediate combination Dell does not
> publish; a pool `sizeTier` still cannot size (an old URL below a model's node floor, say) is
> flagged on its own row rather than shown as 0 TB. The Hardware panel hides its drive-count
> slider for PowerScale and takes both the drive population and the raw capacity from the
> catalog (`powerScaleDriveTotals` / `calculatePowerScaleVolumetry`), since no engine reads
> `driveCount * serverCount` for this platform. `PowerScaleTierTable` shows the per-pool split
> the cluster headline hides.
>
> **The Hardware panel collapses to a media proxy, and the picker stays reachable.** A PowerScale
> cluster is not configured by picking a SATA drive, so the connectivity filter, form-factor
> filter, drive dropdown and drive-properties card collapse behind one line — *"Reference medium:
> &lt;model&gt; — used for power, reliability and price"* — with a disclosure that reveals them
> again. Collapsed, not removed: the catalog carries capacities and efficiencies but **no power,
> no AFR/URE/MTBF and no price**, so the selected drive is still read for real by
> `calculateSustainability`'s `drivePower`, by `calculateTCO`, by the performance engine's first
> pool, and (through the store, not `SimulationInput.mediaDrive`) by the resilience worker.
> Hiding it outright would freeze four live outputs on a value the user cannot see — the defect
> this platform's panel has already had to fix twice, for the cost row and for `mirrorCopies`.
> The branch is `getCapabilities(type).drivePopulationFromCatalog`, which is probe-backed rather
> than a UI preference. **The server-power field stays visible and is relabelled per node**,
> because sustainability multiplies it by the cluster's node count.
>
> **The Advanced panel drops the two backup inputs, and the backup card goes with them.**
> `backupRetention` and `dailyChangeRate` are hidden for PowerScale and
> `backupApplies(topology)` (`src/engines/outputRelevance.ts`) is the single predicate BOTH the
> panel and `CapacityAct`'s backup card consult, so the input and the output cannot drift into
> the orphaned-dependency state above. This one is a product-scope decision, not a vendor-derived
> constraint — the backup engine reads both fields for every platform, PowerScale included, so no
> probe against engine behaviour could establish it and it is deliberately NOT a capability flag.
> Everything else stays: PUE still drives cooling, and the performance threshold still draws the
> operational-capacity marker.
>
> **The exports take a dedicated path, not a relabelled generic one.** Every other platform's
> deck and report describe "one drive model × a count"; a PowerScale cluster is 1-8 heterogeneous
> node pools, so that is the wrong *structure*, not merely the wrong label — an early stopgap that
> overrode the hardware line with a `hardwareLabel` string has been removed. `exportToPptx` and
> `exportToPdf` both dispatch on `topology.type === 'powerscale'` into
> `buildPowerScaleExportContent` (`src/utils/powerscaleExportContent.ts`), a pure builder in the
> mould of `pptxContent.ts`: no renderer types, no i18n singleton, every cell already
> locale-formatted so the two documents cannot format the same number differently.
>
> The thirteen required per-pool columns do not read on one 13.33" slide, so the builder returns
> **two** tables keyed by the same pool number — a core table (model with generation/tier, drive
> size, nodes, drives, protection, raw, usable after VHS, DRR, effective) and a derivation table
> (protection efficiency, usable before VHS, VHS reserve in bytes and as a % of raw, which of the
> two vendor VHS formulas won, usable after VHS, usable efficiency). Each gets its own slide; the
> report stacks them at 7pt. Both close with a cluster total row. EOL is deliberately not a
> column.
>
> **Two efficiency columns, two labels.** `PowerScaleTierResult.efficiency` is the vendor's
> *protection* efficiency, taken before `usableFactor` and before the VHS reserve;
> `usableLessVhs / rawCapacity` is what the pool actually delivers and is the per-pool form of
> `clusterEfficiency`. A one-pool cluster once showed 66.7% and 46.3% for the same pool under one
> heading. The export labels them **"Protection efficiency (vendor)"** and **"Usable efficiency
> (after VHS)"** — not "effective efficiency", because the same table already uses *Effective* for
> the after-DRR capacity.
>
> **One caveat, once.** The PDF and PPTX exports carry a single line
> (`common:powerScale.estimateNote`, via `catalogEstimateNote` in `src/utils/exportNotes.ts`):
> capacity and efficiency are Dell's published figures, power/reliability/price are estimates, and
> data reduction is raidy's own assumption about the data — not a value Dell publishes — with
> PowerSizer remaining the reference for a firm quote. PowerSizer is the rule and raidy is the
> shortcut — but a shortcut that refuses to estimate is not a shortcut, so no figure is suppressed
> to avoid being wrong, and the caveat is not repeated per page, per section or per row. In the
> deck it sits on the last slide, under the derivation table; in the report it sits at the end of
> the last page. A *scope* statement (`output:powerscale.firstTierOnly` — the gauges model the
> first node pool, the capacity covers the cluster) rides beside the performance figures in both
> documents; it is a statement of what is modelled, not a hedge about accuracy, and it is also
> said only once.

### PowerScale / OneFS (`src/engines/volumetry/powerscale/`)

PowerScale is the one platform whose numbers are **looked up, not derived**. See
[ADR-0014](./adr/0014-vendor-lookup-tables.md) for why, and
[the design spec](./superpowers/specs/2026-08-22-powerscale-onefs-design.md) for the full
argument.

**Stripe geometry.** Every protection maps to `{u, M, nf}` in `stripeShape.ts` — `u` stripe units
placed per node, `M` FEC units in the stripe, `nf` whole-node failures tolerated:

| Protection | `u` | `M` | `nf` |
|---|---|---|---|
| `+1n` | 1 | 1 | 1 |
| `+2n` | 1 | 2 | 2 |
| `+3n` | 1 | 3 | 3 |
| `+4n` | 1 | 4 | 4 |
| `+2d:1n` | 2 | 2 | 1 |
| `+3d:1n` | 3 | 3 | 1 |
| `+3d:1n1d` | 2 | 3 | 1 |
| `+4d:1n` | 4 | 4 | 1 |
| `+4d:2n` | 2 | 4 | 2 |

The table is self-consistent under one rule: **`nf == floor(M / u)`**, for all nine entries. A
drive failure spends one unit and a whole-node failure spends `u`, so a protection tolerates
`floor(M/u)` nodes. `+3d:1n1d` is the clearest case — its own name reads "one node plus one
drive", which is `u + 1 = 2 + 1 = 3 = M` exactly. Both the resilience simulator and the
performance write penalty spend that budget rather than carrying a second threshold.

**Stripe width** is `min(u·N, Wmax)`, where `Wmax` is 18 for `M ∈ {2,3}` and 20 for `M = 4`.

**Mirror fallback.** When `N < 2·nf` OneFS mirrors instead of striping FEC, at `1/min(nf+1, N)`.
`isPowerScaleMirrorRegion` and `powerScaleMirrorCopies` in `stripeShape.ts` are the **single**
definition of that boundary — the capacity closed form, the write penalty and the resilience
worker all import it, so they cannot drift apart.

**Neighborhoods.** Node pools split above roughly 20 nodes, so efficiency does not climb
monotonically with node count — it saws. This is one reason no closed form reproduces the vendor
table.

**Per-tier capacity chain**, per node pool:

```
rawTB(t)       = nodeCount(t) × drivesPerNode(model) × rawPerDriveTB(model, driveSize)
usableTB(t)    = rawTB(t) × efficiency(model, protection, nodeCount(t)) × usableFactor(model, driveSize)
lessVHS(t)     = usableTB(t) − max(vhsByDriveCount(t), vhsByPercent(t))
effectiveTB(t) = lessVHS(t) × drr(t)          where drr(t) = tier.drrOverride ?? model.drr
```

`efficiency` is the vendor's published protection efficiency. `usableFactor` (0.9775–0.9906 across
the catalog, never 1) is the filesystem loss. Both come from the 122,828-row table.

**Data reduction does not.** `drr(t)` is the one factor in this chain that is not a vendor-published
quantity — DRR never appears as a column of the table (see [ADR-0014](./adr/0014-vendor-lookup-tables.md)).
Each node model still carries a catalog **default** (1.0, 1.6 or 2.0, Dell's assumption that
all-flash inline compression pays off), but DRR describes the *data* a pool stores, not the
hardware it sits on — a radiology pool of already-compressed DICOM never sees a flash node's
published 2:1. `PowerScaleTier.drrOverride` lets an operator override the default **per pool**
(`PowerScaleTierRow` also offers a short list of workload presets — medical imaging, video,
encrypted data, backups, general files, virtualization, databases — that set it in one click, each
one raidy's own rule of thumb rather than a Dell figure). There is still no *global*
compression/dedup slider: one ratio across a cluster's heterogeneous pools (all-flash over hybrid
over archive) would be meaningless, which is the reason `PowerScaleOptions` carries no cluster-wide
reduction field. Because DRR sits outside the table, overriding it can never move the conformance
gate below — that gate asserts raw, usable and efficiency, never effective capacity.

**A pool the vendor does not publish is not sizeable.** `storageEfficiency` returns `undefined`
and `sizeTier` returns `null` — never zero. Unsizeable pools are dropped before any aggregate, so
a cluster total is always the sum of exactly the rows shown beside it.

## Performance (`/src/engines/performance/`)

Calculates IOPS, throughput, and identifies bottlenecks.

**Bottleneck Chain:**

```mermaid
flowchart LR
    Media["Media<br/>(drives)"] --> Controller["Controller<br/>/HBA"] --> PCIe["PCIe<br/>Bus"] --> Network
```

> vSAN ESA is NVMe-direct (drives attach straight to PCIe), so its chain omits the controller/HBA layer: Media → PCIe → Network.

> **Which controllers a topology may use** is resolved by `getControllerRequirement(type, level?)`
> in `src/types/topology.ts`, which returns `'hba'`, `'raid'` or `'either'`; `requiresHba` and
> `getControllerOptions` are thin wrappers over it, and the store's `setTopology` snaps the
> selected controller whenever the current one becomes invalid. Software-defined platforms
> (ZFS, S2D, vSAN, Ceph, PowerFlex, Nutanix, Longhorn) resolve to `'hba'` from
> `HBA_REQUIRED_TOPOLOGIES`; appliances (PowerVault, PowerStore, PowerScale, ObjectScale) get
> their fixed built-in controllers; everything else resolves to `'raid'`.
>
> **BeeGFS is the one platform whose answer depends on the *level*, not the type.** BeeGFS never
> sees the disks — each storage target is a local volume it addresses as a single block device —
> so the controller class follows the local RAID: `beegfs_raid6` and `beegfs_raid10` are
> hardware-RAID targets (`'raid'`), `beegfs_raidz2` needs an IT-mode HBA because ZFS addresses
> disks directly (`'hba'`), and `beegfs_single` (one drive per target) works behind either
> (`'either'`, so the UI offers the union). Classifying BeeGFS as pure SDS modelled a RAID6 node
> at the HBA ceiling — ~2.7× the IOPS and ~1.6× the throughput of a real PERC H755. BeeGFS
> declares no entry in `DEFAULT_CONTROLLER_BY_TOPOLOGY`: that map is keyed by type so it cannot
> express a per-level preference, and BeeGFS mandates no specific model (both mdraid and
> PERC/LSI targets are common), so the generic "keep the user's choice unless it became invalid"
> fallback applies.
>
> **`CONTROLLER_LIMITS` basis (#84).** Every entry describes ONE controller at 100% 4K random
> read for `iops` and 100% 64K sequential read for `throughputMBs`, measured with FIO on an
> optimal (non-degraded) volume. This is the basis and it does not change when a new controller
> is added — mixing a rebuild-time, degraded-mode, or multi-controller-aggregate figure into
> either field re-introduces the exact defect #84 fixed (PERC IOPS were 3.4–4.7x below any
> measured per-controller number, from an undocumented basis, while throughput was already close
> to the real figure — so the controller layer of the bottleneck chain was not comparable across
> controllers). The four PERC entries are sourced from two vendor-commissioned, independently
> verified lab reports at this exact basis: Tolly Report #223103 (Jan 2023, PERC 10/11/12 vs each
> other, FIO on RHEL 8.6) and Signal65 PERC13 lab testing (2026), corroborated by StorageReview. Every non-PERC entry
> (generic HBAs, LSI/Broadcom cards, Dell HBA355i/e, PowerVault ME5, PowerStore, PowerScale,
> ObjectScale, and the generic `software`/`hardware`/`gpu` placeholders) is marked `ESTIMATED` in
> its own comment in `CONTROLLER_LIMITS` — no published per-controller figure at this basis could
> be found for any of them at the time of the #84 audit. **Adding a new controller:** find the
> vendor's or an independent lab's per-controller FIO figure at this exact basis and cite it in
> the entry's comment; if none exists, carry the estimate forward and say so — never derive a
> number from another controller's ratio and present it as a specification. See
> `docs/superpowers/specs/2026-08-04-controller-limits-basis.md` for the full sourcing detail.
>
> **Controller cache policy is not modelled.** `RaidControllerOptions.writePolicy`, `readPolicy`
> and `cacheSize` reach the config export but no engine. A battery/flash-backed write-back cache
> is a finite buffer: under a sustained write stream the host rate converges on the rate at which
> the cache drains to the array, so the sustained ceiling is the back-end array's and the RAID
> 5/6 read-modify-write penalty is deferred, never removed. The real benefits — write latency and
> burst absorption — are properties of the *unsaturated* cache, a transient this engine does not
> model. See the doc-comment on `writePolicy` for the full derivation.

**Calculations:**

- Per-drive IOPS and bandwidth. For tiered S2D the media layer is tier-aware (first-order write-back model): writes are absorbed by the cache tier, reads are a working-set-weighted blend of cache and capacity tiers

  For a tiered configuration the Media layer is sized from the **capacity tier** — its drive specs
  and its drive count, hot spares subtracted — matching volumetry. On top of that baseline, some
  platforms also model a fast-tier contribution, looked up from
  `FAST_TIER_MODEL_BY_TOPOLOGY` (`src/engines/performance/utils/fast-tier-models.ts`), a
  `Partial<Record<TopologyType, FastTierModelResolver>>` table following the same pattern as
  `NETWORK_MODEL_BY_TOPOLOGY` below — adding a platform's fast-tier model is a table entry, not a
  new branch in the orchestrator:

  - **S2D** (its own branch in `performance/index.ts`, not the table): writes fully absorbed by
    the cache tier; reads a working-set blend of cache and capacity tiers.
  - **vSAN OSA** reuses the S2D blend, gated on `vsanOptions.diskGroupMode`: writes are fully
    absorbed by the cache tier in **both** hybrid and all-flash disk groups (VMware documents
    100% write-buffer allocation in both modes). Reads blend by `workingSetPercent`, but **only in
    hybrid mode** — an all-flash disk group dedicates 100% of its cache device to the write buffer
    and 0% to read cache, so an all-flash configuration's reads stay on the capacity-tier-only
    path unchanged.
  - **Nutanix hybrid clusters** get a write-only model, split by `randomPercent` (not the S2D
    blend — the OpLog's real split key is I/O size, not working set): the random-write share is
    absorbed by the OpLog (cache tier); the sequential-write share routes straight to the extent
    pool (capacity tier), mirroring Nutanix's documented >1.5MB-outstanding sequential-bypass
    rule. Reads are **not modelled** — ILM tier promotion is touch-count-triggered with no
    vendor-published hit-rate to anchor a `workingSetPercent`-style split.
  - **Ceph (WAL/DB offload)** and **BeeGFS (metadata targets)** have no table entry and model no
    fast-tier contribution at all, deliberately and permanently: Ceph's WAL/DB device is never in
    the data read path and its write-path effect is removing spindle contention with bulk data,
    not adding a parallel pool of write IOPS — there is no vendor-published number to turn
    "removes contention" into an IOPS delta. A BeeGFS metadata target stores only inodes,
    directory entries, and striping maps, never file content, so it is structurally incapable of
    serving bulk data I/O — folding it into the media-layer IOPS number would be a category
    error, not an approximation.

  Every model here is driven by an existing workload/topology input (`workingSetPercent`,
  `randomPercent`, `vsanOptions.diskGroupMode`) — none invents a number the app does not collect.
  See `docs/superpowers/specs/2026-08-04-fast-tier-performance-research.md` for the per-platform
  research and sourcing behind these choices (issue #89).

  > **Two-tier blends are bounded, not weighted sums** (issue #111). When a fixed fraction of
  > traffic must be served by each of two tiers concurrently (S2D/vSAN's read blend by
  > `workingSetPercent`, Nutanix's write blend by `randomPercent`), the achievable total is capped
  > by whichever tier saturates first — `T = min(capA / shareA, capB / (1 - shareA))` — not a
  > weighted average of the two tiers' capacities. A weighted sum lets the fast tier's raw
  > capacity leak into the total in proportion to how *little* traffic it serves, so the answer
  > gets more absurd the faster the cache is (e.g. `ws=0.5`, cache 1,000,000 IOPS, capacity 1,000
  > IOPS: weighted-sum formula gives 500,500; the correct bound gives ~2,000). All three blends
  > share one helper, `boundedTierThroughput` in `fast-tier-models.ts`, so they cannot drift back
  > into the wrong shape.

  > **Burst vs. sustained write throughput** (issue #112). `writeCapIOPS = cacheCount ×
  > cacheWriteIOPS` (S2D/vSAN) and the OpLog-absorbed share of Nutanix's write model are the
  > **burst** figure: what the fast tier's write-back cache/OpLog absorbs before it saturates.
  > Nothing bounded that by a destage/drain rate, so the burst number was reported as if it were
  > steady-state — correct for a burst shorter than the cache can hold, wrong for sustained load,
  > where throughput converges on the **capacity tier's own write capacity** (every byte written
  > through a fast tier eventually has to land there, and no platform — S2D, vSAN OSA, or Nutanix's
  > OpLog — publishes a numeric drain rate to model a tighter ceiling against). `PerformanceResult`
  > now reports both, clearly labelled, rather than replacing the burst figure or dropping it:
  > `maxWriteThroughputMBs`/`maxWriteIOPS` stay the burst figure (unchanged formula, unchanged
  > value), and new `sustainedWriteThroughputMBs`/`sustainedWriteIOPS` fields report the
  > capacity-tier-bounded figure, run through the same `effectiveWritePenalty` and bottleneck-chain
  > treatment as the burst figure so they're directly comparable. The sustained figure gets its own
  > infra-only bottleneck ceiling (`sustainedMinThroughput` in `performance/index.ts`) rather than
  > reusing the burst figure's `minThroughput`, which is partly derived from the burst (cache-
  > inflated) media layer and would otherwise silently uncap it. Both ceilings come from one
  > helper, `chainMinThroughput` (#127) — burst passes the media layer's own figure, sustained
  > passes the capacity tier's, and the layer array decides membership for both, so vSAN ESA's
  > absent controller is expressed once rather than restated per derivation. Only platforms with a distinct
  > fast-tier write model and a selected cache drive get a sustained figure that differs from
  > burst — tiered S2D, tiered vSAN OSA (both disk-group modes), and tiered Nutanix with a cache
  > drive selected. Everywhere else (untiered configurations, Ceph, BeeGFS, or a fast-tier-model
  > platform with no cache drive selected), burst and sustained are computed to be **exactly**
  > equal, not merely close, because the burst figure there is already the capacity-tier-only
  > baseline. `PerformanceAct` (`src/components/outputs/acts/PerformanceAct.tsx`) shows the second
  > gauge pair only when the two figures actually differ (`hasDistinctSustainedWrite`), comparing
  > the engine's own outputs rather than hard-coding a platform allowlist — so the UI stays correct
  > automatically if the engine's model changes. No new user input is required: the sustained bound
  > is derived purely from the capacity tier's own drive specs, already collected via `tiering`.
- RAID write penalty (2x for RAID1, 4x for RAID5, 6x for RAID6); S2D mirror write penalty scales with the copy count (two-way 2×, three-way 3×, MAP = `mirrorCopies + 0.5`), with `s2dOptions` threaded through `PerformanceInput`/`usePerformanceCalc`
- Controller limits (IOPS and throughput caps) — skipped for NVMe-direct topologies (vSAN ESA)
- PCIe bandwidth (lanes × generation speed)
- Network bandwidth limits — for vSAN, refined by full-duplex, on-the-wire compression, and the east-west traffic fraction (writes × replication/EC + remote reads); for BeeGFS, by write amplification from Buddy Mirroring
- XFS stripe alignment (sunit/swidth) — for a tiered configuration this also uses the
  spare-adjusted capacity-tier drive count, the same population the Media layer above uses, so the
  suggested stripe width always matches the pool that actually holds data

> **Per-platform network model** (`NETWORK_MODEL_BY_TOPOLOGY` in
> `src/engines/performance/utils/bottleneck-chain.ts`) is a
> `Partial<Record<TopologyType, NetworkModelResolver>>` lookup table that supplies the
> full-duplex multiplier, on-the-wire compression ratio, and fabric traffic fraction used by
> `calculateNetworkLimits`. Topologies with no entry fall back to the neutral default (1×
> everything, i.e. the plain aggregate-bandwidth model). This replaced a vSAN-only branch that
> was hardcoded directly in `performance/index.ts` against `bottleneck-chain.ts`; the vSAN
> resolver (`vsanNetworkModel`) was extracted unchanged into the table, and the BeeGFS resolver
> (`beeGfsNetworkModel`) was added alongside it — Buddy Mirroring doubles write traffic on the
> wire (`trafficFraction = write% × (storageBuddyMirror ? 2 : 1) + read% × 1`). Adding a
> platform's network behaviour going forward is a table entry, not another branch in the
> orchestrator.

## Resilience (`/src/workers/resilienceWorker.ts`)

Monte Carlo simulation for data loss probability.

**Runs in Web Worker** (off main thread)

**Simulates (100,000 iterations):**

- Drive failures based on AFR
- Rebuild time calculations
- URE (Unrecoverable Read Error) probability
- Correlated batch failures
- Stress-induced failures during rebuild
- Replacement-sourcing delay for spare-free configurations (#93 — see below)

**Rebuild-start timing / hot-spare credit (#93):** every configuration starts rebuilding the
instant a drive is declared failed — there is no "someone has to notice and replace the drive"
delay by default (`hasHotSpare` defaults to `true` when a `SimulationInput` omits it, e.g. the
worker's own unit tests and the analytic MTTDL cross-check in
`tests/engines/resilience-analytic.spec.ts`, which pins the pre-#93 model exactly). `useResilience.ts`
sets `hasHotSpare` explicitly from `hotSpares > 0` (the same signal, after `usesDistributedSpares`
zeroing, already used to size the simulated population per #80) — when the calling configuration
has no dedicated hot spare, the worker inserts a 1-day replacement-sourcing delay
(`REPLACEMENT_DELAY_DAYS` in `resilienceWorker.ts`, sourced from a next-business-day
advance-parts-replacement SLA) before the rebuild clock starts, tracked via `repairPending` /
`replacementDelayDaysRemaining` state parallel to `isRebuilding` / `rebuildDaysRemaining`. The two
state machines are mutually exclusive per iteration (`else if` at the day-progress site) so a
delay that elapses on the same day it started can't also consume a rebuild day in the same pass —
that collapse would silently reproduce the immediate-rebuild timeline and erase the delay. URE
checks stayed unconditional on `isRebuilding` (not gated on rebuild state): they are a one-shot
check evaluated at the failure event that exhausts a group's redundancy, and gating them on
rebuild state was tried and rejected during development — it suppressed URE risk for spare-free
configurations instead of adding exposure, moving survival the wrong direction. `hasHotSpare` is
never set for the ten `usesDistributedSpares` platforms (no dedicated spare drive exists to
credit), so they always take the spare-free delayed-rebuild path; this falls out of reusing the
existing population-sizing signal rather than a platform-specific branch. Since the hot-spare
default is 0, the remaining five platforms also start on that path until the user configures a
spare. See CHANGELOG.md "Unreleased" for before/after survival vectors.

**Node placement (#113):** every pair slot records the node holding each of its two copies
(`pairNodeA` / `pairNodeB` in `buildGroupPairState`), defaulting to one group per node. Nothing
reads these arrays for a failure decision yet, so they are behaviour-neutral by construction —
they exist because correlated-failure models cannot be built without them. Injecting group-kill
logic into a worker with no node identity produces spurious survival collapses 41-62% of the
time: both copies of a pair can sit in the group that dies, an arrangement real placement rules
(vSAN fault domains, Ceph CRUSH by host, Nutanix distinct-node replicas) never create. See
`docs/superpowers/specs/2026-08-04-fast-tier-failure-domain-design.md`.

**Group topology (RAID 50/60, every BeeGFS group level):** drives are partitioned into
`numGroups` independent fault groups via `distributeAcrossGroups()`, which spreads the
`driveCount % numGroups` remainder one-per-group across the first groups rather than dropping it
— every drive is modelled, at the cost of groups being heterogeneous in width. A group's
rebuild-read volume (and therefore its URE exposure) is computed per group from its own width,
except mirrored group layouts (`beegfs_raid10`): a RAID10 target rebuilds by reading only the
surviving mirror partner (one drive), never the whole target. Unmerged `beegfs_raid10` groups
also get dedicated per-pair state via `buildGroupPairState()` instead of the flat failure counter
every other group layout uses — a width-W target is `floor(W / 2)` independent mirror pairs (plus
one unpaired, unprotected drive if W is odd), and the target is lost only when one specific pair
loses both members, not at a fixed group-wide failure count. Buddy-merged `beegfs_raid10` groups
(two targets combined into one doubled-tolerance unit) are unaffected and keep the flat counter.
The per-simulation topology/group/pair setup (`computeTopologyModel`) is computed once per Monte
Carlo run rather than once per iteration, since none of it depends on the random failure draws.
See `tests/fixtures/resilience-vectors.ts` for measured before/after survival figures.

## Sustainability (`/src/engines/sustainability/`)

Power consumption, carbon footprint, and TCO.

**Calculations:**

- Drive power (idle + load weighted) — tier-aware for S2D: sums the cache and capacity tiers when tiering is active
- Server power
- Cooling overhead (based on PUE)
- Annual energy consumption (kWh)
- CO2 emissions (by region)
- Flash endurance (DWPD vs workload) — for hybrid S2D, computed on the SSD cache tier that absorbs the writes
- Total Cost of Ownership

---
