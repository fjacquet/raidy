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


*Nothing open.* B21 (#88) closed 2026-08-05; see `docs/superpowers/specs/2026-08-05-fast-tier-failure-domain-design.md` for what was deliberately left out of it.

## PowerScale performance and resilience size the first node pool only

`usePerformanceCalc` and `useResilience` read `tiers[0]` (via `powerScaleDriveTotals`'s
`firstTier`); only sustainability sums every pool. This was deliberate — a client's IOPS and a
rebuild's exposure window are properties of the pool serving the data, and averaging an all-flash
F210 pool with an archive A200 pool describes no real hardware. But a user with a heterogeneous
cluster sees performance for one pool and power for all of them, which the dashboard notes but
does not model. Modelling it properly means letting a workload name the pool it lands on.

## Remove the pre-3.1 PowerScale URL migration shim

`migratePowerScaleState` in `src/store/urlStorage.ts` rewrites links that carry protection in
`topology.level` into the tier model. It cannot recover the node model an old link intended — no
3.0 link named one — so it seeds the default and toasts the user to re-check. **Remove it one
release after 3.1**, along with `LEGACY_PROTECTION` and the migration's tests. After that a 3.0
link resets to defaults, which is the honest outcome once the shim's guess is more misleading than
a clean slate.

## PowerScale rebuild time uses the selected drive, not the pool's

`PlatformSimulationScope.mediaDrive` is `Drive | null`, all-or-nothing. PowerScale leaves it
`null` — correct, since the vendor catalog carries no AFR/URE/MTBF to simulate with — so the
simulation falls back to the Hardware panel's selected drive, including its **capacity**. The
tier knows its own `driveSizeTb`, so an 8 TB A200 pool can be simulated with a 960 GB rebuild
window. Fixing it means widening the scope type, which touches every platform's resolver.

The same root cause reaches further than rebuild time: `useSustainabilityCalc` derives PowerScale
power, CO₂ and TCO from the selected generic drive's `power` and `cost_usd` against the catalog's
drive count, so an all-flash F210 pool is powered and priced as whatever drive sits in the
Hardware panel. That figure reaches the dashboard's Cost act, not just the resilience card.

## OneFS SmartPools tiering policy is unmodelled

Pools are sized independently. Real clusters move data between them on policy, so a SmartPools
file-pool policy changes the effective capacity split without changing any pool's geometry.

---

## How to close an item

This repo treats stale docs as a defect, not a follow-up: update the matching doc in `docs/` in
the same commit. When you close an entry here, delete it from this file in that commit rather
than marking it done — git history is the record.

For anything touching a shared calculation path, the branch convention is to **prove** no other
platform's output moved rather than assert it: compare against an independent re-implementation
of the previous behaviour, and mutate your fix to confirm a test actually fails.
