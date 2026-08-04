# Resilience tiering-awareness for S2D, vSAN, Ceph, Nutanix — Design

**Date**: 2026-08-04
**Status**: Approved
**Scope**: Fix `src/hooks/useResilience.ts` and `src/hooks/usePerformanceCalc.ts` to resolve
tiering for the four platforms that support it, matching what volumetry already does.

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

**`usePerformanceCalc.ts`** already resolves tiering correctly for all four — it is missing only
`beeGfsOptions` from the `resolveTiering` options bag, so a BeeGFS configuration with metadata
targets enabled is costed for performance against the Hardware panel's drive instead of the
capacity tier's. This is a one-line omission, not a design gap.

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
- **Hot spares are never excluded from the simulated population, for any platform** — filed
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

Hot spares are untouched by this design — see "What this is not fixing" above.

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
- `usePerformanceCalc`: one test asserting a tiered BeeGFS configuration's performance output
  differs from the same configuration untiered (the input reaching `calculatePerformance` uses
  the capacity-tier drive), mirroring the existing volumetry test for the same case.
- No existing test for a non-tiered configuration, or for BeeGFS, may change. If a fix requires
  editing one, that is a signal to stop and re-examine, not to adjust the assertion.

## Documentation

- `docs/ARCHITECTURE.md`'s `useResilience()` section, which currently describes
  `SIMULATION_SCOPE_BY_TOPOLOGY` as having only a BeeGFS entry, is updated to list all five
  platforms and to state explicitly that cache/fast-tier failure semantics (vSAN disk-group loss,
  Ceph OSD loss via WAL/DB) are not modelled — the same limitation already documented for Ceph's
  WAL/DB tier.
- `CHANGELOG.md`: a `### Fixed` entry for both hooks.
- `docs/BACKLOG.md`: B1/#59 and B2/#60 are deleted (git history is the record, per the file's own
  "How to close an item" convention), not marked done.

## Out of scope (tracked separately)

- Cache/fast-tier shared-failure-domain modelling for vSAN and Ceph — not filed as a new issue;
  raised here as a design question for whoever picks it up next, since it needs platform-specific
  research before it can even be scoped.
- B19/#80 — hot spares never excluded from the simulated resilience population, for any platform.
