# ADR 0007 — Sourced lists and probed flags answer different questions

- **Status:** Accepted
- **Date:** 2026-08-05
- **Closes:** [#130](https://github.com/fjacquet/raidy/issues/130)

## Context

A control that cannot change any number is worse than no control: it invites the user to tune
something and then ignores them. Raidy hides such controls per platform, and there are two
mechanisms for deciding which — which looked like an inconsistency worth removing.

- `PLATFORM_CAPABILITIES` (`src/engines/capabilities.ts`) — flags consumed by
  `shouldShowControl`, each asserted against real engine behaviour by a probe suite.
- `DISTRIBUTED_SPARE_TOPOLOGIES` (`src/types/topology.ts`) — a list of the ten platforms that
  rebuild from distributed reserve capacity, each with a vendor citation.

The obvious cleanup is to fold the list into the capability map. It does not work, and the reason
generalises.

## Decision

**Keep both, because they answer different questions.**

- The capability map answers *"does the engine read this input"*. It is **probed**: every flag is
  asserted against `calculateVolumetry` or `calculatePerformance`, so it cannot drift from the
  code.
- `DISTRIBUTED_SPARE_TOPOLOGIES` answers *"does this platform have such a thing to configure"*.
  That is a vendor-architecture fact, so it is **sourced**, not probed.

`PLATFORM_CAPABILITIES.supportsHotSpares` was deleted: it was `true` for all fifteen platforms, so
it carried no information, and its only reader was never called.

## Consequences

**A flag cannot express the hot-spare case, and the failure is instructive.** The engines really do
subtract hot spares for every platform; the zeroing happens in the calculation *hooks*, before the
engine is called. So a flag saying "this platform ignores hot spares" would be refuted by the
probe — which drives the engine directly and would still observe the subtraction. The flag would
be describing the hooks while claiming to describe the engine.

**A probe cannot express a vendor fact.** No amount of running the code tells you whether PowerStore
ships dedicated spare drives. That is Dell's documentation.

**Sourced lists carry their evidence inline, including its absence.** Each of the ten entries names
its vendor statement; ObjectScale is marked `INFERRED, not sourced` because its erasure-coding
architecture implies it but no vendor says so. The same discipline applies in
`SHARED_FAST_TIER_TOPOLOGIES` (#88), where S2D and Nutanix are *excluded* precisely because no
vendor documents the cascade — the absentees are the point of the list.

**Probes must be able to fail.** The hot-spare probe was wrapped in `if (caps.supportsHotSpares)`
against a flag that was never false, so its `else` branch had never executed while the shape
implied a platform could opt out. It now asserts unconditionally. When adding a flag, verify the
probe refutes it when flipped — `honoursFsType` for Longhorn was found exactly that way, and two
careful readings of the code had missed it.

## Alternatives rejected

- **Fold the list into the capability map.** Would require moving the hot-spare zeroing from the
  hooks into the engines first. Possible, but it buys uniformity at the cost of making the engines
  responsible for a UI decision.
- **Delete the capability map, source everything.** Loses the property that makes the map
  trustworthy: it is checked against the code on every test run.
