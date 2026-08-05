# ADR 0006 — Monte Carlo resilience, bounded by a superset invariant

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

Resilience is the number people quote in proposals: "this configuration survives the year with
five nines". Getting it optimistically wrong is the most expensive failure this tool can have —
it tells someone their data is safer than it is.

Closed-form MTTDL is the classical approach, but it assumes independent failures and a single
protection layer. Raidy has to model correlated batch failures, URE during rebuild, rebuild
windows that lengthen without a hot spare, per-group tolerance in RAID 50/60 and BeeGFS targets,
per-pair tolerance in mirrored group layouts, node-aware replica placement, and shared fast-tier
failure domains. Each is a conditional on the state of a specific simulated year.

## Decision

**Monte Carlo**, in a Web Worker (`src/workers/resilienceWorker.ts`), 100K iterations by default,
simulating one year day by day.

**Bounded by an invariant:** the simulated failure set must always be a **superset** of the
physically real one. The tool may understate resilience; it must never overstate it.

An analytic MTTDL cross-check (`tests/engines/resilience-analytic.spec.ts`) pins the simple cases
where the closed form is valid, so the simulation cannot drift away from theory unnoticed.

## Consequences

**The invariant decides design arguments, not taste.** Worked examples:

- Hot spares and stranded drives are excluded from the population — they hold no data, so their
  failure is genuinely not a loss event. Exact, and exact ⊇ real.
- When not even one whole BeeGFS target forms, every remaining usable drive goes into one
  over-wide group: more failure-prone than any real target, so on the safe side.
- Buddy-mirror credit is withheld entirely for an odd target count, because merging
  `floor(n/2)` units would pool the unpaired target's drives and hide it. Deliberately pessimistic,
  and visible enough to users that it needed a UI note (#68).
- The fast-tier cascade (#88) is node-blind: forced failures can land on two replicas of the same
  pair, which real placement forbids. It overstates harm, so it is allowed to ship — but the
  dual-failure figures are labelled an upper bound, not an estimate.

**Randomness makes tests awkward, and the workarounds are non-obvious.** Vectors assert direction
and wide bands rather than exact rates. Where an exact comparison is needed, `Math.random` is
replaced with a seeded mulberry32 — by **plain assignment, never `vi.spyOn`**, because a spy
records every call and this worker draws millions per run, exhausting the heap before any
assertion executes.

**AFR is routinely stressed far above real-world rates in tests.** At ~1% AFR the probability of a
second failure during rebuild sits below the Monte Carlo noise floor at any feasible iteration
count, so a mechanism can be real and unobservable. Tests that need to see one raise AFR to 5–20%
and say so.

## Alternatives rejected

- **Closed-form MTTDL only.** Cannot express correlated failures, per-group tolerance, or a
  rebuild window that changes with configuration. Kept as a cross-check on the cases where it is
  valid.
- **Running on the main thread.** 100K iterations blocks the UI for seconds.
