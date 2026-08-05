# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-05

> **Read this first if you sized hardware on 1.16.x.** This release removes things, and two of
> the removals move numbers you may have quoted.
>
> | What | Impact | Why |
> |---|---|---|
> | Default hot spares | **1 → 0** | A spare is a design choice, not an assumption. Usable capacity on first load is now what your hardware actually gives. |
> | Hot spares on 8 platforms | **+20-23% usable** | S2D, Ceph, Nutanix, Longhorn, PowerFlex, PowerStore, PowerScale and ObjectScale rebuild from distributed reserve. The control was configuring something they do not have. |
> | Spare-free survival rates | **slightly lower** | Rebuild now waits out a replacement-sourcing delay when there is no dedicated spare. Only observable at elevated AFR. |
> | YAML / Ansible / Terraform export | **gone** | ZFS-only, three lines of output, not deployable. |
>
> **Shared links from 1.x still load, but one class of them now shows a different number.** The
> URL only carries values that differ from the defaults (`omitDefaults` in `configStore.ts`), so a
> link created on 1.16.x with the *then-default* one spare per server did not record `hotSpares`
> at all — and now resolves to the new default of zero. Such a link reports one drive per server
> more usable capacity than it did when it was shared. Links where the spare count was changed
> from the default are unaffected: that value was written into the URL and still is.
>
> Removed option fields are the harmless case — the schemas strip unknown keys rather than
> rejecting them, so a link carrying a deleted control still loads.
>
> **Why 2.0.0.** Twenty-four configuration controls and one export feature left the UI — ten
> across NetApp/Synology/Longhorn/BeeGFS, five across Ceph and vSAN, all five of PowerVault's
> plus two of PowerScale's, and two in the Workload panel — while the hot-spare control also
> disappeared from eight platforms that never had one. The capacity figure shown on first load
> changed for every platform that honours spares. None of that breaks a shared link, but it does
> change what the tool tells you before you touch anything, which is the contract this app
> actually has with its users.

### Added

- **Sustained (steady-state) write throughput, reported alongside the existing burst figure**
  (issue #112). Every write absorbed by a write-back fast tier (S2D's cache mirror, vSAN OSA's
  cache device, Nutanix's OpLog) eventually has to destage to the capacity tier, and none of those
  platforms publishes a numeric drain rate — so under sustained load, throughput converges on the
  capacity tier's own write capacity, not the cache's ingest rate. The tool previously reported
  only the burst number, unlabelled, as if it were steady-state. **No existing number changes**:
  `maxWriteThroughputMBs`/`maxWriteIOPS` keep their exact pre-#112 formula and values (labelled
  "Write (Burst)" in the UI when a distinct sustained figure exists). New
  `sustainedWriteThroughputMBs`/`sustainedWriteIOPS` fields on `PerformanceResult` report the
  capacity-tier-bounded figure ("Write (Sustained)"), shown as a second gauge pair only for
  configurations where it actually differs from burst — tiered S2D, tiered vSAN OSA (both
  disk-group modes), and tiered Nutanix with a cache drive selected. Untiered configurations,
  Ceph, BeeGFS, and any fast-tier-model platform with no cache drive selected report the same
  number for both (burst was already the capacity-tier-only figure there), so the UI shows a
  single gauge, not a false split. Labels and a sizing hint are translated in all four locales
  (`en`/`fr`/`de`/`it`). See `docs/ARCHITECTURE.md`'s "Burst vs. sustained write throughput" note
  for the full derivation.

- **`tests/workers/resilience.spec.ts` no longer flakes under a loaded full-suite run (#100).**
  The three heaviest Monte Carlo tests that ran multiple 4000-5000-iteration simulations per test
  (each with its own `vi.resetModules()` + worker re-import) had no explicit per-test timeout, so
  they relied on Vitest's 5000ms default. Measured under synthetic CPU contention (parallel
  full-suite run + background load), "should have much higher survival than 2-way mirror with
  same drives" reached ~2.6s, "should produce consistent results across multiple runs" ~2.1s, and
  "an odd storage-target count gets no buddy credit" ~1.6s — all with a thin, and on a
  more-constrained CI runner potentially insufficient, margin to the 5000ms cutoff. No assertion
  values were loosened (empirically verified: 0 failures across 100-300 trials per cross-run
  tolerance check in this file); each of the three now gets an explicit 15000ms timeout, the same
  treatment already applied to `beegfs_raid10 + buddy: survival does not improve as
  drivesPerTarget grows` for the analogous `--coverage`-instrumentation case.

- **Odd BeeGFS storage-target counts no longer read as a resilience bug (#68).** Buddy-mirror
  credit is correctly withheld when the storage-target count is odd (an unpaired target has no
  buddy), but that made a 5-target cluster report worse survival than a 4-target one with no
  explanation. The resilience panel now shows an explanatory note whenever a BeeGFS group
  topology (`beegfs_raid6`, `beegfs_raidz2`, `beegfs_raid10`) has buddy mirroring on and an odd
  storage-target count, telling the user an even count is needed for full buddy credit.
  Translated in `en`/`fr`/`de`/`it`. Per-group heterogeneous state (giving the unpaired target
  partial credit) was considered but not attempted: it would require the worker's group model to
  carry a per-group tolerance instead of one scalar `parityPerGroup`, touching the failure-count,
  URE, and rebuild-time logic the extensive superset-invariant proof comments in
  `resilienceWorker.ts` depend on — more than a "contained change," so the conservative UI note is
  the fix per the issue's own ruling.

- **i18n parity test now asserts placeholder preservation.** `tests/i18n/parity.spec.ts` gained a
  case per locale/namespace asserting every `{{placeholder}}` present in an `en` string is also
  present in the same key's translation, so an accent/copy pass can't silently mangle a runtime
  interpolation token the way the existing key-presence check would miss. (#86)

### Changed

- **Burst and sustained bottleneck ceilings share one derivation (#127).** `sustainedMinThroughput`
  was ~15 lines paralleling the burst chain, including its own `isNvmeDirect` ternary — so which
  links belong to the bottleneck chain was a fact stated in two places. Both now call
  `chainMinThroughput(layers, mediaLayer, mediaFigure)`: burst passes the media layer's own
  throughput, sustained passes the capacity tier's, and the layer array decides membership for
  both. vSAN ESA's absent controller is expressed once, by not being in the array.

  This is the shape that has already cost this engine twice — the S2D read blend copied into vSAN
  would have propagated a 45× overstatement to a second platform (#111), and two paths computing
  raw capacity produced a 10× error in the Hardware panel (#121). Fifteen duplicated lines in the
  bottleneck chain is the same shape, caught earlier.

  **No published number moves.** Verified by characterization before and after across tiered S2D,
  tiered vSAN OSA, tiered vSAN ESA, tiered Nutanix, untiered RAID6, Ceph, BeeGFS and untiered
  vSAN ESA — read/write/sustained throughput, read/write/sustained IOPS, media ceiling and
  bottleneck description, byte-identical on all eight. The exact-equality cases (Ceph, BeeGFS,
  untiered) stay exactly equal rather than approximately.

  The old `getMinThroughput` is gone, having had exactly one caller and no direct test. Four unit
  tests now cover the shared helper. One is a contract test rather than a live-bug test, and is
  labelled as such: every fast-tier model today yields a sustained media figure at or below the
  burst one, so substituting versus merging agree on real inputs — mutating the helper to merge
  leaves `sustained-write-throughput.spec.ts` fully green. The membership test does catch it.

- **The five-platform Dell options panel is five panels (#126).** `DellOptionsPanel.tsx` carried
  PowerFlex, PowerStore, PowerScale, ObjectScale and PowerVault in one component, when every other
  platform has its own file. It is now `PowerFlexOptionsPanel`, `PowerStoreOptionsPanel`,
  `PowerScaleOptionsPanel`, `ObjectScaleOptionsPanel` and `PowerVaultOptionsPanel` — largest 113
  lines, all under the ~200 the other platform panels sit at.

  **The naive split was the trap, and the issue said so.** Four of the five panels render the same
  compression control (a toggle plus a ratio slider that appears only when it is on), two render
  the same dedup control, and two the same snapshot-reserve slider. Five files each re-typing that
  markup would be the worse problem — the #110 sweep found four *false* hint texts in this very
  file, and duplicated markup is how a claim gets fixed in one copy and left standing in three.
  Those blocks live in `dellShared.tsx` as `DataReductionControl`, `SnapshotReserveSlider` and
  `OptionsSection`.

  **Verified by rendered-DOM equivalence, not by "the tests still pass"** — no test rendered these
  panels, so a green suite proved nothing. A temporary gate compared the old component's HTML
  against the new panels across 12 topology levels × 6 store states (compression/dedup on and off,
  each PowerStore model), 72 comparisons, all byte-identical. Confirmed falsifiable by changing one
  slider's `max`, which failed 7 of them. The gate was deleted with the old component once it had
  served its purpose.

  `TopologyPanel` also loses an `as` cast: narrowing on `topology.type` per platform lets the two
  level-dependent panels take an exact topology type instead of a widened union.

- **Eight more platforms rebuild from distributed reserve capacity, so the hot-spare control is
  gone for them.** S2D, Ceph, Nutanix, Longhorn, PowerFlex, PowerStore, PowerScale and
  ObjectScale join vSAN, which was already handled. Each vendor documents rebuild from reserved
  or free capacity rather than from dedicated spare drives — Microsoft is explicit that S2D's
  reserve capacity "serves the same function as a hot spare" but is "taken evenly from every
  drive in the pool", and Dell states outright that "dedicated hot spare drives are not
  required" on PowerStore. Where the control was shown, it configured something those platforms
  do not have.

  **Usable capacity increases on these platforms for anyone who had set a hot spare.** Measured
  at 12 drives × 4 nodes with 2 spares per node:

  | Platform | Before | After | Change |
  |---|---|---|---|
  | S2D (mirror) | 17.4 TB | 21.3 TB | +23% |
  | Ceph (3× replicated) | 11.1 TB | 13.3 TB | +20% |
  | Nutanix (RF2) | 17.7 TB | 21.3 TB | +20% |
  | Longhorn (R3) | 9.90 TB | 11.9 TB | +20% |

  Standard RAID, ZFS, PowerVault ME5, Synology, NetApp and BeeGFS keep the control — all six
  document dedicated spares, and are unaffected. ObjectScale's inclusion rests on its
  erasure-coding architecture rather than a vendor statement; that is marked as inference in the
  code rather than presented as a citation.

- **The default number of hot spares is now 0, was 1.** A hot spare is a deliberate design
  choice, not an assumption a sizing tool should make for you. The old default quietly reduced
  usable capacity on first load for every platform that honours spares, so the figure shown
  before you touched anything was smaller than your hardware gives.

  **Usable capacity increases for any configuration left at the default.** If you sized hardware
  on a previous release without changing the hot-spare slider, your figure was low:

  | Configuration | Before (1 spare/node) | After (0) | Change |
  |---|---|---|---|
  | Standard RAID 6, 8 drives | 4.95 TB | 5.94 TB | +20% |
  | ZFS raidz2, 8 drives | 4.81 TB | 5.80 TB | +21% |
  | BeeGFS RAID 6, 48 drives (12 × 4 nodes) | 29.4 TB | 39.2 TB | +33% |

  BeeGFS moves furthest, and not by coincidence: four spares across four nodes leave 44 drives,
  which does not divide by a 12-drive storage target. Three targets form and **eight drives are
  stranded**, contributing nothing. On that layout each spare cost far more than itself. The
  same arithmetic has a sharper edge worth knowing: a single node with 12 drives and one spare
  leaves 11, which forms *no* complete target — usable capacity zero.

  Pinned with exact-byte vectors rather than relational bounds
  (`tests/engines/volumetry/hotSpareDefault.spec.ts`); the 45× tiered-cache error in 1.16.0
  survived 1,391 tests because every assertion used `toBeGreaterThan`.

- **The resilience worker now tracks which node each simulated component sits on** (#113).
  Fault groups previously had no node identity, so mirror-pair membership was assigned without
  reference to placement. That is a fine approximation while failures are independent, and wrong
  the moment they are correlated: injecting group-kill logic into the old worker produced
  spurious survival collapses 41–62% of the time, because both copies of a pair could land in a
  group that then died together — an arrangement a real system would never create.

  **No published figure changes.** The node arrays are recorded and threaded through, and nothing
  reads them for any failure decision, so this release is provably behaviour-neutral rather than
  statistically indistinguishable. It is infrastructure: it unblocks #88 (modelling the fast tier
  as a shared failure domain) and any future rack or chassis fault-domain work, neither of which
  could be built correctly without it.

### Removed

- **`PLATFORM_CAPABILITIES.supportsHotSpares`, which was `true` for all fifteen platforms and so
  carried no information (#130).** Its only reader was `shouldShowControl('hotSpares', …)`, which
  no UI ever called — the hot-spare slider is gated on `DISTRIBUTED_SPARE_TOPOLOGIES`, and that
  list is now the single source of truth. Two mechanisms described hot-spare relevance; the
  vestigial one is gone.

  The two could not simply be merged, and the reason is now recorded at the surviving site rather
  than left for the next reader to rediscover: the engines genuinely subtract hot spares for
  every platform, and the zeroing happens in the calculation hooks *before* the engine is called.
  A capability flag asserting "this platform ignores hot spares" would be refuted by the
  capability probe, which drives `calculateVolumetry` directly and would still see the
  subtraction. The capability map answers "does the engine read this input"; the topology list
  answers the different question "does this platform have a spare drive to configure" — a
  vendor-architecture fact, which is why it is sourced rather than probed.

  The probe that covered the flag is kept and strengthened. It was wrapped in
  `if (caps.supportsHotSpares)` against a flag that was never false, so its `else` branch had
  never executed while implying a platform could opt out. It now asserts unconditionally that all
  fifteen types subtract — which is precisely the invariant that forces the UI decision to live
  outside the capability map.

- **The YAML / Ansible / Terraform export (#124).** 429 lines, no dedicated test, and it only
  ever knew **ZFS** — one platform of fifteen. What the ZFS path emitted was three lines:
  `zfs_ashift`, `zfs_recordsize`, and a device glob.

  The question the issue asked was whether it earned its keep, and the answer is no. Raidy sizes
  storage; it does not provision it. A Terraform fragment derived from a capacity estimate has no
  hosts, no network and no credentials, so it is not deployable — which left the feature costing
  maintenance and test surface, and standing as a place every new platform "should" be wired into.
  Expanding it was proposed during the input-panel relevance design and rejected there for the
  same reason.

  **What users keep.** The PDF and PPTX exports are untouched — a presales deliverable has an
  obvious consumer. So are the ZFS provisioning commands in the Take-away card's collapsible
  section, which are the copy-paste-able output people actually used. `zfsOptions.compressionType`
  is still live for exactly that reason.

  Removed with it: three buttons, six locale keys across all four languages, the barrel re-export,
  and the now-unreachable `controllerOptions` read in `OutputDashboard`. The Take-away export grid
  drops from four columns to two.

- **133 orphaned translation keys per locale**, left behind by removed features and by controls
  deleted earlier in this release. A new test (`tests/i18n/orphanKeys.spec.ts`) now fails on any
  key the source cannot reach, with a documented allowlist for the sixteen call sites that
  assemble keys at runtime. **This is deliberately narrower than what the raw scan reported**:
  of 284 candidates, 151 turned out to be translations shadowed by hardcoded English — deleting
  those would have erased real translations instead of fixing the bug above.

- **Four unused packages: `recharts` (8.5 MB), `js-yaml` (1.0 MB), and the redundant
  `@types/dompurify` and `@types/js-yaml`.** None was imported anywhere — the app draws its charts
  as hand-rolled SVG, builds YAML from template literals, and `dompurify` v3 ships its own types.
  The first two sat in the *production* dependency graph of a project that supply-chain-checks
  every build, so this removes attack surface, not only weight. Verified by a successful build
  plus `check:bundle-size` and `check:supply-chain`, not by grep alone. No behaviour changes.

- **Ten more inert controls, across NetApp, Synology, Longhorn and BeeGFS.** NetApp's Platform,
  ADP version and Zero Detection; Synology's Model Series, SSD Cache and Cache Mode; Longhorn's
  Over-Provisioning; and BeeGFS's Chunk Size, Number of Targets and Network fabric. The BeeGFS
  three are the original #78 precedent this whole sweep follows — real tunables with real
  hardware effects that this engine, reporting cluster aggregates, has no honest model for.
  Longhorn's Over-Provisioning was echoed into the Longhorn results card, so **that output row
  is gone too**: it displayed a number the user can no longer influence. **No calculated figure
  changes.**

- **Five more inert controls: Ceph's Backend, Encryption and Journal-on-SSD, vSAN's Encryption,
  and ZFS's Special vdev.** Each was a real platform feature the tool does not model — dm-crypt
  and vSAN DARE carry no published capacity tax, BlueStore-vs-FileStore has no per-backend
  overhead split here, FileStore's journal placement is superseded by the WAL/DB Offload setting
  that *is* modelled, and a ZFS special vdev's capacity effect depends on its own size and the
  pool's small-block mix, neither of which this tool knows. All five said as much in their own
  hint text. **No calculated figure changes.**

- **Every PowerVault configuration control, and PowerScale's SmartQuotas and SyncIQ toggles.**
  PowerVault rendered five controls — model, controller count, auto-tiering, SSD read cache and
  thin provisioning — and *all five* were inert: ME5 is modelled with one flat metadata overhead
  regardless, and each control's own hint text said "for reference only, not used in any
  calculation". With the last field gone the whole `PowerVaultOptions` object went too; it had
  been threaded through `VolumetryInput` without ever being read. PowerScale's SmartQuotas
  (access control, not a capacity multiplier) and SyncIQ (this tool sizes a single site) go for
  the same reason. **No calculated figure changes.** PowerVault still shows its RAID-level
  descriptions and the note that ME5 supports no inline compression or deduplication.

- **Two configuration controls that changed no number: the Workload panel's "Total Dataset Size"
  slider and the tiering "Cache Mode" selector.** Both were stored, serialized into every shared
  URL and echoed back onto their own control, but neither was read by any engine, worker,
  validator or hook. They escaped the #104 and #110 sweeps because neither lives in a
  `DEFAULT_*_OPTIONS` object, which is the only place the guard test looks. Cache Mode was the
  more misleading of the two: it rendered for S2D alone, directly above the Working Set slider,
  which is live. **No calculated figure changes** — this removes controls that fed nothing.
  Shared links created before this release still load: the nested option schemas strip unknown
  keys rather than rejecting them, which the new `tests/store/removedDeadFields.spec.ts` asserts
  rather than assumes.

### Fixed

- **Resilience recommendations are translated (#125).** `getRecommendations()` in
  `useResilience.ts` built its six strings in hardcoded English — "Configuration provides
  excellent data protection" and friends — so a French, German or Italian user read English
  recommendations beside a fully translated panel. The #71 sweep routed 15 validators through
  `i18n.t()` and #72 added key parity, but both missed this one: it lives in a hook, not in
  `validators.ts` or a component.

  **The translation happens at render, not where the array is built**, and that is the part worth
  keeping. `recommendations` is produced once when the worker replies and then held in state;
  calling `i18n.t()` there would freeze the language, so switching FR→DE after running a
  simulation would keep showing French. `getRecommendations` now returns i18n key suffixes and
  `ResilienceAct` translates them, which re-runs on language change.

  No `DYNAMIC_PREFIXES` entry was added to the orphan-key test even though the keys are assembled
  at runtime. The existing leaf-literal fallback already covers them — each suffix is pushed as a
  bare string literal — and it is the stronger check: a prefix entry would exempt the whole
  subtree, letting a key outlive its `push`. Verified by renaming one push, which correctly
  surfaces `resilience.recommendation.excellentProtection` as an orphan.

  The pass the issue asked for turned up three more sites of the same class, all converging on
  `PerformanceResult.bottleneckDescription`: `identifyBottleneck()` returns
  `"Bottleneck: Controller (8000 MB/s)"`, and `usePerformanceCalc` sets `'No drive selected'` and
  `'Performance calculation failed'`. Filed separately — fixing them means turning that field into
  structured data, which reaches the PDF and PPTX exports too.

- **The controller selector is hidden for vSAN ESA, and the working-set slider for vSAN OSA in
  all-flash mode.** vSAN ESA is NVMe-direct: the engine drops the Controller layer from the
  bottleneck chain and bounds IOPS by PCIe and network alone, so the selector could not change
  a result. vSAN OSA's `vsanFastTierModel` blends the two tiers by working set only on its
  hybrid branch, so the slider is inert in all-flash mode — a sub-mode gate rather than a
  platform one. The PCIe controls, which *do* bind on ESA, are unaffected. **No calculated
  figure changes.**

- **The Advanced panel's Filesystem selector is now shown only where the engine reads it.**
  `getFilesystemOverheadPercent` returns a platform constant for thirteen of the fifteen
  topology types; only standard RAID and Longhorn consult the user's choice — Longhorn via the
  switch's `default` branch, since it has no case of its own. On every other platform the
  control could be moved with no effect. Pinned by a new per-topology probe case, verified
  falsifiable: flipping the Longhorn flag makes it fail with 2.85 TB vs 2.97 TB (ext4 5% vs
  XFS 1%). **No calculated figure changes** — only the control's visibility.

- **The performance gauges were pinned at full on any modern configuration.** Their scales were
  hardcoded at 50,000 MB/s and 2,000,000 IOPS — set before the PERC13 controller recalibration
  raised limits 3.4–4.7× in 1.16.0. An 8-node NVMe cluster reports 225,600 MB/s and 38.4M IOPS,
  so all four needles sat in the stop and every arc read as full red. The gauges now scale to
  the **drives' own ceiling**, before the controller/PCIe/network chain caps it: below full, the
  chain is throttling drives you paid for; at full, the drives themselves are the limit. Colours
  run red-to-green accordingly, the inverse of before — a full gauge is now the good outcome.
  Scaling to the bottleneck was considered and rejected: throughput *is* the bottleneck by
  construction, so those gauges would have read 100% permanently.

- **Topology names, RAID level descriptions and network-speed labels are translated again.**
  Three lookup tables held English string literals while fully translated keys sat unused in
  every locale file — a French user picking RAID 0 read *"Stripe, no redundancy"* although
  `fr/topology.json` already said *"Agrégat, sans redondance"*. 80 level entries, 15 platform
  names and 7 link speeds now resolve through i18n. Six level entries had never been translated
  at all (Longhorn R2/R3 and the four BeeGFS levels, both platforms added after the level tree
  was built) and were written for all four languages, along with a missing `type.beegfs` and the
  ZFS `128K (default)` record size.

- **The Hardware panel's raw-capacity and hardware-cost summary counted one server's drives, not
  the cluster's.** The same panel renders a drive-count hint of `driveCount * serverCount`
  ("Total drives: 120"), then computed both summary figures from `driveCount` alone — so a
  10-node BeeGFS cluster with 12 drives per node announced 120 drives and priced twelve.
  Understated raw capacity and cost by the server count, a factor of 10 on that configuration.
  Reported from the running app; no test covered the panel's summary. Both figures now scale by
  `effectiveServerCount`, the same clamp the engines use, so a platform whose servers slider is
  hidden cannot pick up a stale count. **Output-dashboard figures were always correct** — they
  come from the engines, which multiply properly; only the input panel's own summary was wrong.

- **Resilience now models a replacement-sourcing delay for spare-free configurations, closing
  #93.** #80 excluded hot spares from the simulated failure population (a spare holds no data,
  so its own failure isn't a data-loss event) but left the rebuild-timing model untouched.
  Investigating #93's suggested fix — "start the rebuild timer at zero elapsed time when
  `hotSpares > 0`" — found the premise backwards: `resilienceWorker.ts` **already** starts
  rebuild the instant a drive is declared failed, unconditionally, for every configuration; there
  was never a sourcing/replacement delay to skip in the first place. So a spared configuration's
  numbers do not move at all — crediting a spare that already got instant rebuild credit is a
  no-op. What #93 actually needed was the opposite: a spare-FREE configuration is not realistic
  either, because in the real system someone has to notice the failure alert, source a
  replacement drive, and physically install it before rebuild can start — the worker had no
  concept of that wait. `resilienceWorker.ts` now adds a 1-day replacement-sourcing delay (before
  the rebuild clock starts) whenever the simulated group/pool has no dedicated hot spare
  (`hasHotSpare: false`), computed in `useResilience.ts` from the same `hotSpares > 0` signal
  (post `usesDistributedSpares` zeroing) already used to size the simulated population. The 1-day
  figure represents a next-business-day advance-parts-replacement SLA (Dell ProSupport NBD, HPE
  Foundation Care NBD are common examples) — the middle of three non-hot-spare MTTR scenarios
  published in ServeTheHome's MTTR guide (10 min notification + immediate / NBD / 7-day RMA +
  install; the NBD scenario totals ~24h45m, rounded to 1 whole day since the simulation advances
  one day per loop iteration).
  **Direction:** every spared configuration (`hasHotSpare: true`, the same as every configuration
  before this change) is numerically unchanged. Every spare-free configuration
  (`hasHotSpare: false`) now survives less often than before, because it carries a real exposure
  window that did not exist in the model previously. All ten `usesDistributedSpares` platforms
  (vSAN OSA/ESA, S2D, Ceph, Nutanix, Longhorn, PowerFlex, PowerStore, PowerScale, ObjectScale —
  none of which has a dedicated spare drive to credit) always resolve to `hasHotSpare: false` and
  therefore sit on the same, lower survival curve as any other spare-free configuration — this
  falls out of reusing the existing population-sizing signal, no platform-specific branch was
  needed.
  **Interaction with the new zero-spare default.** The hot-spare default changed from 1 to 0 in
  this same release, so the spare-free curve is now the *default* curve rather than an opt-in one:
  a first load of any platform lands on it. That is the intended pairing — a tool that assumes a
  spare nobody configured was overstating both usable capacity and survival at once. Users who do
  configure a spare get exactly the numbers they got before this change.
  **Gated by `tests/workers/resilienceReplacementDelay.spec.ts`.** The vectors below were
  measured outside the test harness and are evidence, not a gate — nothing in CI would have
  noticed the mechanism silently ceasing to work. Three seeded-PRNG tests now pin it: that
  omitting `hasHotSpare` is *exactly* the pre-#93 path (every caller predating this change omits
  it), that spare-free survives strictly less often than spared, and that the delay does not
  collapse into a short rebuild. The last is the one worth having: chaining the two countdowns
  with independent `if`s instead of `else if` makes a 1-day delay followed by a ≤1-day rebuild
  finish on the same simulated day as the triggering failure, reproducing the immediate-rebuild
  timeline exactly. Verified by mutation — under that rewrite both timelines return an identical
  0.9992, and the fix would sit in the source fully commented and do nothing.
  **Before/after vectors** (100K iterations, `Math.random` stubbed with a seeded mulberry32 PRNG
  for reproducibility; AFR stressed to 20% purely to make the mechanism observable within a
  feasible iteration count — see `tests/engines/resilience-analytic.spec.ts` for the project's
  existing precedent of stressing AFR to observe rare dual/triple-failure mechanics; noise floor
  at N=100K is roughly ±0.3 percentage points for survival rates near the middle of the range,
  tighter near the extremes):
  - Standard RAID6, 8×1TB drives: spared 99.965% → unchanged 99.965%; spare-free 99.965% →
    99.89% (down ~0.08pp).
  - ZFS raidz2, 10×1TB drives: spared 99.939% → unchanged 99.939%; spare-free 99.939% → 99.77%
    (down ~0.17pp).
  - BeeGFS `beegfs_raid6` (tiered group topology, 8 storage targets × 12 drives): spared 95.0% →
    unchanged 95.0%; spare-free 95.0% → 81.9% (down ~13.1pp — group topologies have many more
    independent fault domains than a single RAID6/raidz2 array, so the extra exposure day compounds
    across all 8 targets).
  - vSAN OSA RAID1 (distributed spares, 24 drives): always resolves `hasHotSpare: false` — 95.7%
    (hypothetical `hasHotSpare: true`, to show the credit it is correctly denied) vs. 94.6% (what
    it actually gets), confirming vSAN sits on the spare-free curve as required.
  - Real-world AFR (~1%) configurations are unaffected in any *observable* way at 100K
    iterations: the 1-day exposure extension is real but the baseline dual-failure probability is
    already far below the simulation's noise floor at that AFR, so before/after numbers are
    identical to the precision the tool reports (this matches the existing behavior of every
    other rare-event mechanic in this worker).
  Coverage on `src/workers/resilienceWorker.ts` after this change: 95.3% statements / 84.2%
  branches / 100% functions / 95.5% lines (threshold: 75%). Benchmark (`beegfs_raid10` unmerged,
  100K iterations, the worker's most expensive configuration, measured with `tsx` outside the
  test harness, 6 trials across 2 sessions): before ranged 9.7–14.0s, after (`hasHotSpare: false`)
  ranged 10.2–13.3s across the same trials — no consistent, statistically meaningful regression;
  the two extra branches and two extra per-iteration state variables (`repairPending`,
  `replacementDelayDaysRemaining`) added are within this measurement's run-to-run noise floor
  (single-process JIT/GC variance was ±15–20% run over run even on unmodified code).

- **`fr` and `de` locale strings are now consistently accented.** What looked like a deliberate
  "unaccented" convention was actually per-file drift: e.g. `fr/topology.json` carried ~420
  accented characters while `fr/common.json` had 1, and several files (`advanced`, `hardware`,
  `validation`, `workload`) had zero. French and German are user-facing languages of a Swiss
  product; unaccented copy reads as broken to a native speaker. Every `fr` and `de` string has
  been corrected to proper orthography (accents/umlauts/ß); `it` was audited too and corrected
  where it had the same gap. This is an orthography pass only — no strings were reworded or
  retranslated, no JSON keys changed, and interpolation placeholders (`{{count}}`, etc.) were
  left byte-identical. (#86)

- **Completed the #104 unconsumed-option-fields sweep (#110).** #104 removed four option fields
  that were collected from the UI and never reached any engine; building its guard test showed
  the pattern was broader. Walked every `DEFAULT_*_OPTIONS` object in `src/types/topology.ts` and
  decided each unconsumed field individually:
  - **Wired into a real calculation — moves NetApp usable capacity for some existing
    configurations:** `netAppOptions.compression`/`dedup` now gate `dataReductionRatio` in
    `capacityEnhancements.ts` (`<flag> ? ratio : 1.0`), matching every sibling platform's existing
    pattern. Previously the ratio applied unconditionally, so a configuration with both reduction
    toggles switched off but a non-1.0 `dataReductionRatio` still dialed in (e.g. left over from
    toggling compression on, entering a ratio, then toggling it back off) silently kept applying
    that stale ratio. **Usable capacity now decreases** for exactly that configuration shape — it
    correctly drops back to the ungated (1.0) figure. The shipped default is unaffected either way:
    `DEFAULT_NETAPP_OPTIONS.dataReductionRatio` is `1.0`, so a default NetApp sizing produces the
    same result before and after this fix. If you sized a NetApp configuration on 1.16.0 with
    compression and dedup both off and a data-reduction ratio above 1.0 still set, re-check it —
    every other NetApp configuration (default ratio, or reduction actually enabled) is unaffected.
    Pinned at the engine boundary in `tests/engines/volumetry.spec.ts`
    ("NetApp dataReductionRatio gating (#110)"), asserting exact `effectiveCapacity` values for
    compression-on, both-off, and dedup-on-only.
  - **Deleted, field and control together** (no UI, no engine reader, no citable rule to wire
    instead): `zfsOptions.slogDevice`/`l2arcDevice`; `nutanixOptions.replicationFactor`/
    `erasureCoding`/`ecStripe` (duplicates of what the `nutanix_*` topology level already encodes
    — RF/EC-X was never actually read from these fields, only from the level string);
    `powerFlexOptions.ecScheme`/`storagePools`/`faultSets` (the last had a live control and a
    hint claiming "Minimum 3 fault sets required for data protection" that nothing enforced);
    `objectscaleOptions.objectSizeKB` (live slider; its type comment falsely claimed it "impacts
    performance calculations" — nothing read it).
  - **Kept informational by decision**, matching the #78 BeeGFS precedent, with hint text in each
    options panel now saying so explicitly: `zfsOptions.specialVdev`; `vsanOptions.encryption`;
    `powerscaleOptions.smartQuotas`/`syncIQ`; `cephOptions.backend`/`encryption`/`journalOnSsd`;
    `longhornOptions.overProvisioningPercent`; every field on `powervaultOptions` (`model`,
    `controllers`, `tiering`, `ssdReadCache`, `thinProvisioning` — this tool models PowerVault ME5
    with one flat overhead regardless of configuration); `synologyOptions.modelSeries`/`ssdCache`/
    `cacheMode`; `netAppOptions.platform`/`adpVersion`/`zeroDetection`.
  - **Confirmed still-accurate:** `raidControllerOptions.readPolicy`/`writePolicy` were already
    documented informational-by-decision in a prior change; `vsanOptions.diskGroupMode`, flagged as
    unconsumed in the original issue, is now read by the #89 fast-tier performance models
    (released in 1.16.0), so it needed no action.
  - `powerstoreOptions.model` is not read directly by any engine, but drives `systemOverheadPercent`
    via a UI preset in `DellOptionsPanel.tsx` (`POWERSTORE_MODEL_OVERHEAD[model]`), which the
    engine does read — kept as-is, documented as indirectly wired rather than informational.
  - `tests/utils/optionFieldsConsumed.spec.ts` replaces its four-field #104 pin with a general
    sweep: every `DEFAULT_*_OPTIONS` field must be read in `src/engines/`, `src/workers/` (except
    `resilienceWorker.ts`, out of scope for this change), or one of `validators.ts`/
    `exportConfig.ts`/`TakeawayAct.tsx` — or be named in an explicit allowlist carrying its reason.
  - All removed controls' locale keys were removed from all four languages (`en`/`fr`/`de`/`it`).
    The affected Zod schemas in `src/utils/schemas.ts` are plain `z.object()` (strip unknown keys
    rather than reject), confirmed for each schema touched here, so existing shared links
    carrying a since-removed field continue to validate and simply drop that key.

### Documented

- Researched whether BeeGFS's `numTargets` and `chunkSizeKb` (issue #69) could drive a genuine
  single-stream (single-client, single-file) throughput output. Concluded no: a realistic
  single-stream ceiling needs a client link speed this app does not collect, and ThinkParQ's own
  published benchmark ("Picking the right number of targets per server for BeeGFS", March 2015)
  shows single-stream throughput does not scale linearly with `numTargets` even given that input
  — it nearly doubles from 1→2 targets, then plateaus or regresses from 2→4. Both fields stay
  labelled informational; their doc-comments in `src/types/topology.ts` now cite the research.

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
