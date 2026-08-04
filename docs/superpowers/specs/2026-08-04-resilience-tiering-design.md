# Resilience and performance tiering-awareness for S2D, vSAN, Ceph, Nutanix, BeeGFS — Design

**Date**: 2026-08-04
**Status**: Approved
**Scope**: Fix `src/hooks/useResilience.ts`, `src/hooks/usePerformanceCalc.ts` and
`src/engines/performance/index.ts` to size the simulated and costed drive population from the
capacity tier, matching what volumetry already does.

## Problem

The BeeGFS work (`docs/superpowers/specs/2026-08-03-beegfs-sizing-design.md`) fixed a class of
bug for BeeGFS only, and left it explicitly noted as affecting four other platforms
(`docs/BACKLOG.md` B1/#59, B2/#60):

**`useResilience.ts`** derives the simulated population from `driveCount × effectiveServerCount`
— the Hardware panel's raw drive count — for every platform except BeeGFS. For **S2D**
(`storageTiers`), **vSAN OSA** (disk groups), **Ceph** (`walDbOffload`) and **Nutanix** (hybrid
clusters), a tiered configuration therefore simulates the wrong number of drives, with the wrong
capacity and AFR: it uses the Hardware panel's drive rather than the capacity tier's. Volumetry
(`useVolumetryCalc.ts` → `calculateVolumetry`) already resolves this correctly via
`resolveTiering`; resilience never calls it for these four platforms.

**`usePerformanceCalc.ts`** is missing `beeGfsOptions` from the `resolveTiering` options bag — but
adding it alone fixes nothing observable. `calculatePerformance`
(`src/engines/performance/index.ts`) consumes `tiering.capacityTierDrive` /
`tiering.capacityTierDriveCount` **only** inside its `topology.type === 's2d'` branch. Every other
platform falls through to an `else` that computes media IOPS and bandwidth from the raw Hardware
panel `drive` and `usableDrives`, ignoring `tiering` entirely. So a tiered vSAN OSA, Ceph or
Nutanix configuration is *already* costed against the wrong drive today — B2/#60 named only the
BeeGFS symptom of a gap that affects four platforms.

## What this is not fixing

Two things surfaced while scoping this work and were deliberately kept out:

- **Cache/fast-tier failure semantics.** On vSAN OSA, a cache device failure takes down its
  entire disk group — capacity devices included. On Ceph, a WAL/DB NVMe failure can take out
  every OSD it serves. Both are shared fault domains, not simply "excluded from the simulated
  population" the way BeeGFS's MDT is. Modelling that correctly needs per-platform failure-domain
  work, is a real scope expansion, and is not what B1/#59 asked for. This fix corrects the
  *population count* (the capacity tier, not the whole drive count) without modelling *why* the
  fast tier failing could cascade. That gap is called out explicitly in code and docs — the same
  treatment Ceph's WAL/DB offload already gets today (also not simulated).
- **Hot spares are never excluded from the simulated resilience population, for any platform** — filed
  separately as B19/#80. Found in the same function; kept separate because fixing it moves every
  platform's resilience numbers (safe direction — treating a spare as data-bearing overstates
  risk), not just the four tiered ones this design touches.

## Decision

One shared resolver, registered in the existing `SIMULATION_SCOPE_BY_TOPOLOGY` table
(`src/hooks/useResilience.ts`) for four keys — `s2d`, `vsan_osa`, `ceph`, `nutanix` — rather than
a resolver per platform. `resolveTiering` (`src/engines/shared/tiering.ts`) already dispatches
internally by `topology.type`; once it has resolved, the logic that turns a `TieredCapacityResult`
into a `PlatformSimulationScope` is identical across all four, so a per-platform resolver would be
pure duplication.

```
tieredPlatformScope({ topology, serverCount, s2dOptions, vsanOptions, cephOptions, nutanixOptions }):
  tiering = resolveTiering(topology, serverCount, { s2dOptions, vsanOptions, cephOptions, nutanixOptions })
  if not tiering: return null   // not tiered — naive path applies, unchanged
  return {
    driveCount: tiering.capacityTierDriveCount,
    groupCount: serverCount,
    mediaDrive: tiering.capacityTierDrive,
  }
```

Returning `null` for an untiered configuration means the existing naive
`driveCount × effServerCount` / `effServerCount` path is unchanged for every currently-correct
case — S2D without `storageTiers`, vSAN ESA (no disk groups), Ceph without `walDbOffload`,
Nutanix all-flash. No regression risk there by construction.

`groupCount` stays `serverCount`, unlike BeeGFS. These four platforms already carry their fault
domain through `raidLevel` (the worker's own mirror/group classification) and node count; unlike
BeeGFS, which invented the storage-target-as-fault-group concept because BeeGFS levels have no
native `mirrorCopies`-based shape at all, there is no equivalent concept to invent here.

Hot spares stay untouched **on the resilience side** — the simulated population never subtracted
them and still won't; see "What this is not fixing" above. The performance side is different:
`calculatePerformance` already subtracts them, so the new branch keeps doing so (below).

### Performance: media substitution for the non-S2D tiered platforms

`calculatePerformance`'s `else` branch gains a tiering-aware predecessor. The S2D branch is
untouched.

```
capacityDrive = tiering?.capacityTierDrive

if topology.type === 's2d' && tiering && cacheDrive && capacityDrive:
    ... unchanged write-back-cache blend ...
else if tiering && capacityDrive:
    mediaDrive   = capacityDrive
    mediaDrives  = max(0, tiering.capacityTierDriveCount - hotSpares)
    mediaIOPS    = min(mediaDrive.iops_read, mediaDrive.iops_write) * mediaDrives
    readCapIOPS  = writeCapIOPS = mediaIOPS
    readBW       = mediaDrive.bandwidth_read_mb  * mediaDrives
    writeBW      = mediaDrive.bandwidth_write_mb * mediaDrives
else:
    ... unchanged raw-drive path ...
```

`max(0, capacityTierDriveCount - hotSpares)` mirrors `volumetry/index.ts`'s `spareAdjustedDrives`
exactly — same clamp, same operands, so a tiered configuration's drive population is identical in
both engines.

S2D's `workingSetPercent` blend is **not** generalised. It encodes S2D's specific write-back cache
semantics: writes fully absorbed by the fast tier, reads split by working set. vSAN OSA's cache
tier, Ceph's WAL/DB offload (which accelerates the commit path and serves no data at all) and
Nutanix's hybrid tier each behave differently. Modelling them needs per-platform research; a
generic blend would be a guess presented as a number. This design therefore does for performance
exactly what it does for resilience: **fix the population and the media, decline to model the fast
tier's contribution.**

Untouched by construction — verified by reading their inputs, not assumed:

- Controller, PCIe and network layers scale by `serverCount` and fixed per-interface limits, never
  by drive count or tiering.
- `xfsAlignment` (`performance/index.ts`, near the end) keeps using the raw `usableDrives`. It is a
  stripe-alignment display value, not part of the bottleneck chain; making it tier-aware is a
  separate judgement call about which tier a stripe is aligned to. Left as a known inconsistency,
  called out in code.

**This moves the numbers of every already-tiered vSAN OSA, Ceph and Nutanix configuration.**
Deliberate, and the same trade as the resilience half: those numbers are wrong today. There is no
"nothing changes" guarantee for tiered configurations in this design — only for untiered ones,
where `tiering` is `null` and both branches are skipped.

### Rejected alternative

A resolver per platform (`s2dSimulationScope`, `vsanSimulationScope`, …), mirroring how BeeGFS
got its own bespoke resolver. Rejected: BeeGFS's resolver is bespoke because BeeGFS needed the
storage-target/`drivesPerTarget` concept that only it has. These four platforms need nothing
platform-specific beyond calling `resolveTiering` with the right options — one function serves
all four without loss of clarity.

## Interface changes

- `UseResilienceOptions` and the internal `SimulationScopeContext`
  (`src/hooks/useResilience.ts`) gain `s2dOptions?`, `vsanOptions?`, `cephOptions?`,
  `nutanixOptions?`, matching the existing `beeGfsOptions?` field.
- `SIMULATION_SCOPE_BY_TOPOLOGY` gains four entries pointing at the same `tieredPlatformScope`
  function.
- `src/components/layout/OutputDashboard.tsx` passes the four options through to
  `useResilience(...)`, alongside `beeGfsOptions` as it already does.
- `usePerformanceCalc.ts`: add `beeGfsOptions` to the existing `resolveTiering(...)` call. No
  interface change — the parameter already exists on the hook and is already threaded to
  `calculatePerformance`.
- `src/engines/performance/index.ts`: one `else if` branch inserted between the S2D branch and the
  existing `else`. No signature change — `tiering` and `hotSpares` are already on
  `PerformanceInput`.

## Testing

- Before/after vectors, one per platform (S2D, vSAN OSA, Ceph, Nutanix), each with a tiered
  configuration: hand-computed expected `driveCount` and `mediaDrive` characteristics
  (capacity, URE rate, AFR) from the capacity tier, checked against `tieredPlatformScope`'s
  output directly — not just against `runSimulation`'s aggregate result, so a wrong
  intermediate value cannot hide behind a coincidentally-plausible survival number.
- Regression net: for each of the four platforms, an **untiered** configuration must produce a
  `tieredPlatformScope` result of `null`, and the resulting simulation input must be byte-identical
  to what it was before this change. Mirrors how the BeeGFS fix proved isolation for RAID 50/60,
  S2D mirror/map, and the replicated platforms.
- `calculatePerformance`, one test per non-S2D tiered platform (vSAN OSA, Ceph, Nutanix, BeeGFS):
  a tiered configuration whose fast tier is fast NVMe and whose capacity tier is slow HDD must
  produce media-layer IOPS and bandwidth equal to the **hand-computed capacity-tier** values
  (`min(iops_read, iops_write) × max(0, capacityTierDriveCount − hotSpares)`, and the two
  bandwidth products), not the Hardware-panel drive's. Each test asserts a premise first — that
  the two drives' specs genuinely differ — so a passing assertion cannot be a coincidence.
- `calculatePerformance`, S2D non-regression: an existing tiered S2D vector must produce
  byte-identical output. If the S2D branch's numbers move, the new branch is being entered when
  it should not be.
- `calculatePerformance`, untiered non-regression: for each of the five platforms, an untiered
  configuration must produce byte-identical output to today's.
- No existing test for a non-tiered configuration, or for BeeGFS, may change. If a fix requires
  editing one, that is a signal to stop and re-examine, not to adjust the assertion.

## Documentation

- `docs/ARCHITECTURE.md`'s `useResilience()` section, which currently describes
  `SIMULATION_SCOPE_BY_TOPOLOGY` as having only a BeeGFS entry, is updated to list all five
  platforms and to state explicitly that cache/fast-tier failure semantics (vSAN disk-group loss,
  Ceph OSD loss via WAL/DB) are not modelled — the same limitation already documented for Ceph's
  WAL/DB tier.
- `docs/ARCHITECTURE.md`'s performance-engine section states that for tiered configurations the
  media layer is sized from the capacity tier, that only S2D models a cache-tier contribution, and
  that the other platforms' fast tiers are deliberately not modelled.
- `CHANGELOG.md`: a `### Fixed` entry covering both hooks and the performance engine, stating
  explicitly that tiered vSAN OSA, Ceph, Nutanix and BeeGFS performance and resilience numbers
  change.
- `docs/BACKLOG.md`: B1/#59 and B2/#60 are deleted (git history is the record, per the file's own
  "How to close an item" convention), not marked done.

## Out of scope (tracked separately)

- Cache/fast-tier shared-failure-domain modelling for vSAN and Ceph — not filed as a new issue;
  raised here as a design question for whoever picks it up next, since it needs platform-specific
  research before it can even be scoped.
- B19/#80 — hot spares never excluded from the simulated resilience population, for any platform.
- Per-platform cache-tier performance models (vSAN OSA read cache, Nutanix hybrid tier) — needs
  the same platform-specific research as the failure-domain work above, for the same reason.
- `xfsAlignment` computing stripe alignment from the raw drive count rather than the capacity tier.
