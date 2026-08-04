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

### [B12](https://github.com/fjacquet/raidy/issues/70). `drivesPerGroup` floor-division leaves drives unmodelled

`Math.floor(driveCount / numGroups)` in the resilience worker can leave up to `numGroups - 1`
drives out of the simulated groups; failures beyond total group capacity all land in group 0.
Pre-existing and shared with RAID 50/60.

### [B20](https://github.com/fjacquet/raidy/issues/93). Hot spares get no rebuild-window credit in the resilience simulation

Fixing #80 excluded hot spares from the simulated data-bearing population (naive path and
`tieredPlatformScope`, both clamped at zero; BeeGFS already handled this in its own resolver). The
population-count side is correct now, but `src/workers/resilienceWorker.ts` still has no concept
of a standby drive shortening the rebuild exposure window: in the real system a hot spare lets a
rebuild start immediately on first failure rather than waiting for a replacement to be sourced and
installed, which shortens the window during which a second failure is catastrophic. A spared and a
spare-free configuration currently see the same rebuild-time distribution.

Safe direction (not crediting a spare is conservative, same as every other item in this section),
so not urgent.

*To close:* have the worker start the rebuild timer at zero elapsed time (rather than adding a
sourcing/replacement delay) when `hotSpares > 0` for the platform in question, with before/after
vectors showing survival-rate movement for a spared vs. spare-free configuration.

---

## How to close an item

This repo treats stale docs as a defect, not a follow-up: update the matching doc in `docs/` in
the same commit. When you close an entry here, delete it from this file in that commit rather
than marking it done — git history is the record.

For anything touching a shared calculation path, the branch convention is to **prove** no other
platform's output moved rather than assert it: compare against an independent re-implementation
of the previous behaviour, and mutate your fix to confirm a test actually fails.
