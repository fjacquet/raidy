# Backlog

Known limitations and deferred work, with enough context to pick each item up cold.

Each entry links to its GitHub issue. Every entry here was found during review and deliberately *not* fixed at the time, with a
recorded reason. None is a correctness emergency: the items that affect numbers all err in the
conservative direction (understating capacity, resilience or performance) or are unreachable
from the UI. Where that is not true it is stated explicitly.

Most of this was surfaced by the BeeGFS work (`docs/superpowers/specs/2026-08-03-beegfs-sizing-design.md`),
which touched enough shared code to expose pre-existing gaps.

---

## Correctness — real defects, non-blocking

### [B3](https://github.com/fjacquet/raidy/issues/61). Fraction-vs-percent unit confusion in snapshot-reserve fields

`overheadCalculator.ts` multiplies capacity by `netAppOptions.snapshotReserve` as a **fraction**.
The default is `0.05`. Two related fields are named `…Percent`
(`powerscaleOptions.snapshotReservePercent`, `powerstoreOptions.snapshotReservePercent`) and
should be audited for the same confusion.

Two instances of this bug have already been fixed: `getDefaultState()` carried `5` (a 500%
reserve on Reset), and the NetApp panel slider wrote a raw 0–20 integer straight into the
fraction field.

*To close:* audit every reserve/ratio/percent field for the unit its consumer expects. Where a
field is a fraction, bound it `0..1` in `src/utils/schemas.ts`; where it is a percent, name it
so and divide at the consumer. Add a test per field pinning the unit.

### [B4](https://github.com/fjacquet/raidy/issues/62). Free-text fields in the URL schema should be enums

In `src/utils/schemas.ts`: `blockSize`, `networkSpeed`, `pcieGen`, `pcieLanes`, `carbonRegion`,
`fsType` and `controllerOptions.controller` are typed `z.string()`. Arbitrary strings from a
crafted link reach the store. They feed lookup tables that fall back on a miss, so the impact is
a silently-defaulted calculation rather than a crash.

*To close:* replace each with `z.enum([...])` derived from the same source the lookup table uses,
so they cannot drift apart.

### [B5](https://github.com/fjacquet/raidy/issues/63). `AdvancedState.performanceThreshold` is not persisted

Absent from `partialize` in `src/store/configStore.ts`, so it resets on a shared link while every
other setting survives.

*To close:* add it to `partialize` and to `ConfigStateSchema`, with a round-trip test.

### [B6](https://github.com/fjacquet/raidy/issues/64). Dead legacy-link branch in `urlStorage.ts`

The comment at `src/store/urlStorage.ts:54-55` claims flat (non-enveloped) payloads are supported
for backward compatibility. They have never hydrated: zustand's persist reads
`deserializedStorageValue.state`, which is `undefined` for a flat object. The branch exists only
for direct-call tests.

*To close:* either wire it so legacy links genuinely load, or delete the branch and the comment.
Do not leave a comment asserting a capability the code lacks.

### [B7](https://github.com/fjacquet/raidy/issues/65). Root-level `.passthrough()` admits unknown keys into the store

`ConfigStateSchema` is passthrough at the top level, so an unknown top-level key from a URL is
merged into the live store object. Nested platform-options schemas are strict, so nested hostile
payloads are stripped. Nothing reads the unknown keys.

*To close:* decide whether passthrough is still needed (it may exist for forward compatibility
with newer links). If so, document why; if not, tighten it.

### [B19](https://github.com/fjacquet/raidy/issues/80). Resilience never excludes hot spares from the simulated population, for any platform

`src/hooks/useResilience.ts`'s naive path (every platform without a `SIMULATION_SCOPE_BY_TOPOLOGY`
entry) uses `totalDriveCount = driveCount * effServerCount` with no hot-spare subtraction. Every
hot spare is currently simulated as a data-bearing drive. Contrast with volumetry and performance,
which both subtract `hotSpares * effServerCount` (zeroed for vSAN's distributed-spare model). The
tiered-platform resolver (`tieredPlatformScope`, shared by S2D, vSAN OSA, Ceph and Nutanix) shares
the same omission — it deliberately does not subtract hot spares either, so this covers those four
code paths too, not just the naive one.

Safe direction (counting a spare as data-bearing is conservative), so not urgent — but it means
resilience currently overstates risk for every platform with `hotSpares > 0`, and understates it
for vSAN by never zeroing spares that don't exist as dedicated drives. Kept separate from tiering
work because fixing it moves every platform's resilience numbers, not just the tiered ones.

*To close:* mirror the volumetry/performance pattern — subtract
`usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount`, clamped `>= 0`, with
before/after vectors for standard RAID, ZFS, and each tiered platform.

---

## Modelling precision — safe direction, worth improving

All of these understate rather than overstate. That is deliberate: a sizing tool that overstates
resilience or capacity is worse than one that is coarse.

### [B8](https://github.com/fjacquet/raidy/issues/66). `beegfs_raid10` unmerged tolerance is pessimistic for wide targets

`src/workers/resilienceWorker.ts` gives an unmerged `beegfs_raid10` target a tolerance of 1, so
the simulation kills it at any 2 failures. A real 12-drive RAID10 target survives up to 6
failures if each lands in a distinct mirror pair. Closing this needs per-pair state inside a
group rather than a flat counter.

### [B9](https://github.com/fjacquet/raidy/issues/67). Group-path `bitsRead` overstates URE exposure for `beegfs_raid10`

Rebuild is modelled as reading `(drivesPerGroup - 1) × capacity`, but a RAID10 rebuild reads only
the surviving mirror partner.

### [B10](https://github.com/fjacquet/raidy/issues/68). Odd `serverCount` creates a visible survival discontinuity under buddy mirroring

Buddy credit is withheld when the storage-target count is odd, because an unpaired target has no
buddy. Correct and deliberately conservative, but a 5-target cluster reports worse survival than
a 4-target one, which reads as a bug to a user. Needs either heterogeneous per-group state or a
UI note explaining the cliff.

### [B11](https://github.com/fjacquet/raidy/issues/69). No single-stream throughput output — `numTargets` has nothing to bind to

BeeGFS's `numtargets` is a **per-file** stripe width, while every performance figure this tool
reports is a cluster aggregate bounded by the total storage-target count. Applying it as an
aggregate multiplier would understate real clusters by up to `storageTargetCount / numTargets`,
and would be wrongest for exactly BeeGFS's many-concurrent-file HPC case. `chunkSizeKb` likewise
shapes per-target sequential efficiency with no per-file layer to act on.

Both are consequently labelled informational in the UI rather than wired to an invented formula.

*To close:* add a genuine single-stream / per-file throughput output to the performance engine.
Then `numTargets` and `chunkSizeKb` have something honest to bind to. This is a feature, not a
bug fix.

---

## Test and tooling debt

### [B13](https://github.com/fjacquet/raidy/issues/71). i18n: hardcoded English outside the BeeGFS surface

`src/components/outputs/.../LonghornCapacityDetails.tsx` and roughly fifteen validators in
`src/utils/validators.ts` emit hardcoded English. `src/i18n/locales/*/validation.json` exists but
was unused before the BeeGFS alerts.

Note two conventions discovered during the BeeGFS i18n work, neither documented anywhere:
`fr`/`de`/`it` `validation.json` are written **without accents or umlauts**, and
`topologyConstants.ts` hardcodes English for topology type and level labels on **every** platform
— those never pass through `t()`.

*To close:* route the remaining validators through the `i18n.t()` pattern already used by the
BeeGFS alerts, and decide deliberately whether the unaccented convention should stay.

### [B14](https://github.com/fjacquet/raidy/issues/72). Roughly 34 pre-existing missing i18n keys

`powervault.info.*` and `powerflex.info.*` missing from `fr`/`de`/`it`; `zfs.ashift*` and
`nutanix.info.*` missing from `de`/`it`. They render as raw keys.

*To close:* add the missing keys, then add an i18n-parity test — the repo has none, which is why
these went unnoticed.

### [B15](https://github.com/fjacquet/raidy/issues/73). `npm run test:coverage` fails when run concurrently with another vitest process

Vitest cleans `reportsDirectory` on start, so a parallel invocation kills the coverage run with
`Something removed the coverage directory "coverage/.tmp"`. Relevant to CI job layout.

### [B16](https://github.com/fjacquet/raidy/issues/74). `AdvancedPanel` has no label state for a controller requirement of `'either'`

`getControllerRequirement` returns `'hba'`, `'raid'` or `'either'`. `AdvancedPanel` only renders
two states, so on `beegfs_single` the user sees the heading "RAID Controller", the label
"Controller Model" and the hint *"Hardware RAID controllers manage disk redundancy"* while the
dropdown offers HBAs and appliance controllers as well. The list itself is correct and the engine
reads the selected controller's real limits, so no number is affected — but the panel reads as
wrong.

Related, pre-existing: `controller.hbaHint` says "ZFS, vSAN, and S2D require direct disk access
via HBA" and is now also shown for `beegfs_raidz2`, which it does not mention. Also pre-existing:
the union list for `'either'` includes appliance controllers, the same way
`getControllerOptions('standard')` always has (`isHba: false`, unqualified filter). Fixing that
for BeeGFS alone would be inconsistent; fixing it globally moves `standard`'s list.

*To close:* add a third label state plus its four locale strings, and reword `hbaHint` to be
platform-agnostic.

### [B17](https://github.com/fjacquet/raidy/issues/75). The controller-requirement test net is circular on table membership

`tests/types/controllerRequirement.spec.ts` guards the level-aware controller rule by comparing
against a `legacyControllerOptions` helper — but that helper re-derives from
`HBA_REQUIRED_TOPOLOGIES`, the very table the rule reads. It catches drift in the *filter logic
and signature*; it does not catch drift in the *table contents*.

Measured: deleting `'longhorn'` from `HBA_REQUIRED_TOPOLOGIES` leaves **all 1242 tests passing**,
silently flipping Longhorn from HBA-only to RAID-only. (Deleting `'ceph'` fails exactly one test,
and only because an unrelated pre-existing validator spec happens to cover it.)

*To close:* add a hardcoded expected-membership assertion for `HBA_REQUIRED_TOPOLOGIES` — the one
place where a hand-copied snapshot is the right tool, precisely because it must not share a
source with the thing it validates.

---

### [B18](https://github.com/fjacquet/raidy/issues/78). `BeeGfsOptions.fsOverheadPercent` feeds a real calculation but has no UI control

`fsOverheadPercent` (default `2`) is consumed by `getFilesystemOverheadPercent`
(`src/engines/volumetry/overhead/filesystem-overhead.ts`) and reaches usable capacity through
`overheadCalculator.ts` — but `BeeGfsOptionsPanel.tsx` renders no control for it, so no user can
move it off its default.

This is the inverse of `chunkSizeKb` / `numTargets` / `network`, which are user-settable and
explicitly documented as informational. `fsOverheadPercent` changes a real number and is
unreachable. It costs a store field, a `DEFAULT_BEEGFS_OPTIONS` entry, a Zod range check, a
URL-persistence slot and several test fixtures, for a value that is always `2`.

*To close:* decide which it is — a planned slider left out of the panel (add the control plus
its four locale strings), or over-engineering (replace with a `0.02` constant the way the Ceph
case is written, and drop the field). Leaving it as an unreachable configuration surface is not
a resolution.

## How to close an item

This repo treats stale docs as a defect, not a follow-up: update the matching doc in `docs/` in
the same commit. When you close an entry here, delete it from this file in that commit rather
than marking it done — git history is the record.

For anything touching a shared calculation path, the branch convention is to **prove** no other
platform's output moved rather than assert it: compare against an independent re-implementation
of the previous behaviour, and mutate your fix to confirm a test actually fails.
