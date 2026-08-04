# Resilience: exclude hot spares from the simulated population — Design

**Date**: 2026-08-04
**Status**: Approved
**Scope**: `src/hooks/useResilience.ts`. Closes #80.

## Problem

Volumetry and performance both remove hot spares from the drive population they compute on.
Resilience does not. `useResilience.ts:443`:

```ts
const totalDriveCount = scope ? scope.driveCount : driveCount * effServerCount
```

Neither branch subtracts spares:

- the **naive path** (`driveCount * effServerCount`) covers every platform absent from
  `SIMULATION_SCOPE_BY_TOPOLOGY` — standard RAID, ZFS, vSAN ESA, Synology, Longhorn, PowerFlex,
  PowerStore, PowerScale, ObjectScale, PowerVault, NetApp, Dell;
- **`tieredPlatformScope`** (`:189`) returns `tiering.capacityTierDriveCount` unadjusted, covering
  S2D, vSAN OSA, Ceph and Nutanix. Its doc comment at `:169-171` records the omission as
  deliberate-pending-#80.

Only `resolveBeeGfsSimulationScope` subtracts, via `resolveBeeGfsUsableDrives`.

A hot spare holds no data. Simulating it as a data-bearing member inflates the failure population,
so the panel reports a worse survival rate than the configuration has. The default configuration
ships `hotSpares: 1` (`topologySlice.ts:69`), so this is the nominal case, not an edge case.

## Decision — one rule, the one the other two engines already use

```ts
const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount
```

Verbatim from `useVolumetryCalc.ts:80` and `usePerformanceCalc.ts:77`. Not a new convention — the
same one, applied to the third engine.

Applied at two sites:

1. **Naive path** — `Math.max(0, driveCount * effServerCount - totalHotSpares)`.
2. **`tieredPlatformScope`** — `Math.max(0, tiering.capacityTierDriveCount - totalHotSpares)`,
   mirroring `src/engines/volumetry/index.ts:178`, which clamps the identical quantity the
   identical way. `tieredPlatformScope` already receives `hotSpares` and `topology` in its
   `SimulationScopeContext`; no signature changes.

**BeeGFS is untouched.** `resolveBeeGfsSimulationScope` already applies the rule through its own
resolver, and re-applying it at the call site would subtract twice.

`groupCount` does not change. Spares are drives, not fault groups; a node with a spare is still a
node.

## Consequences, stated plainly

**vSAN does not move.** `usesDistributedSpares` returns true for `vsan_osa` and `vsan_esa`, so
`totalHotSpares` is 0 and the population is unchanged. This makes the rule the *reason* vSAN is
unchanged rather than an accident of the missing subtraction — worth a test, since the two are
indistinguishable from today's numbers.

**Every other platform's survival rate rises** whenever `hotSpares > 0`. Fewer simulated drives
means fewer failure draws. This is the correct direction — a spare's failure is not a data-loss
event — but it is a visible change to a headline number and belongs in the CHANGELOG.

**What this still does not model.** A real hot spare also *shortens the rebuild window*, which is
its main contribution to resilience. The worker has no concept of a standby drive and does not
credit it. So the model moves from "pessimistic, by counting spares as data-bearing" to
"optimistic on a different axis, by ignoring the rebuild-window benefit". The change is justified
by consistency with the other two engines and by the population being physically correct, not by
the resulting number being complete. Record the remaining gap in `docs/BACKLOG.md` rather than
letting the fix imply the model is now whole.

**The superset invariant holds.** `resolveBeeGfsSimulationScope`'s doc comment already argues
this for spares: excluding a drive that holds no data makes the simulated failure set exact, and
exact ⊇ real. The same argument covers the two sites here.

## Testing

New spec `tests/hooks/useResilienceHotSpares.spec.ts`, using the existing `installMockWorker`
fixture to capture `SimulationInput.driveCount`:

- **Naive path, standard RAID** — `driveCount: 12`, `serverCount: 2`, `hotSpares: 1` posts 22,
  not 24. Fails against current code.
- **Naive path, ZFS** — same arithmetic on a second non-tiered platform, guarding against a fix
  that keys on topology type instead of applying to the default branch.
- **`hotSpares: 0` invariance** — the population is exactly `driveCount * effServerCount`, so the
  change cannot have shifted a configuration that has no spares.
- **vSAN ESA (naive) and vSAN OSA (tiered)** with `hotSpares: 3` — population unchanged, proving
  the `usesDistributedSpares` branch is what holds it rather than the absent subtraction.
- **Tiered path** — an S2D configuration with tiering on and `hotSpares: 1` posts
  `capacityTierDriveCount - serverCount`.
- **Degenerate clamp** — `hotSpares >= driveCount` posts 0, never a negative and never a
  fabricated drive. Mirrors the pinned BeeGFS behaviour in `useResilienceScope.spec.ts:94`.
- **BeeGFS unchanged** — a BeeGFS case with spares posts the same population as before, proving
  no double subtraction.

Existing resilience specs (`useResilienceScope`, `useResilienceTieredScope`,
`useResilienceMediaDrive`) must pass unedited. Any of them that asserts an unadjusted population
with `hotSpares > 0` is asserting the defect — escalate rather than edit.

## Documentation

- `CHANGELOG.md`: a `### Fixed` entry for #80 naming the direction of the change.
- `docs/ARCHITECTURE.md`, resilience section: the simulated population excludes hot spares, on the
  same rule as the other two engines.
- `docs/BACKLOG.md`: record the unmodelled rebuild-window benefit.
- Delete the "hot spares are not subtracted here" paragraph at `useResilience.ts:169-171` and
  replace it with what the code now does.

## Out of scope

- #88 (fast tier as a shared failure domain) — the next cycle.
- Modelling the spare's effect on rebuild time; that is a worker change, not a population change.
