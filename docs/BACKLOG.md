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


### [B21](https://github.com/fjacquet/raidy/issues/88). The fast tier is not modelled as a shared failure domain

The only entry in this file that errs in the **unsafe** direction, so it is called out rather than
filed with the conservative ones above.

#82 made the Monte Carlo simulation size its population from the *capacity* tier for tiered S2D,
vSAN OSA, Ceph and Nutanix. It corrected WHICH drives are simulated without modelling WHY a
fast-tier failure could cascade — and for two of those platforms it does:

- **vSAN OSA** — "vSAN interprets the failure of a single flash caching device as a failure of the
  entire disk group", and both cache and capacity devices in that group are marked degraded
  ([Broadcom techdocs](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-monitoring/handling-failures-and-troubleshooting-virtual-san/handling-failures-in-virtual-san/failure-handling-in-virtual-san/a-flash-caching-device-is-not-accessible.html)).
  A disk group is one cache device plus one to seven capacity devices.
- **Ceph** — "a corrupt block.db file will impact all OSDs which are included in that block.db
  file" ([Red Hat Ceph Storage Operations Guide](https://docs.redhat.com/en/documentation/red_hat_ceph_storage/3/html/operations_guide/handling-a-disk-failure)).

The simulation reports survival as though the fast tier could not fail at all, which **overstates**
resilience for those two. S2D and Nutanix are not in this list: their fast tiers are write-back
cache whose loss is not documented as taking the capacity tier with it — that needs its own
sourcing before either is included.

Design and options: `docs/superpowers/specs/2026-08-05-fast-tier-failure-domain-design.md`.

---

## How to close an item

This repo treats stale docs as a defect, not a follow-up: update the matching doc in `docs/` in
the same commit. When you close an entry here, delete it from this file in that commit rather
than marking it done — git history is the record.

For anything touching a shared calculation path, the branch convention is to **prove** no other
platform's output moved rather than assert it: compare against an independent re-implementation
of the previous behaviour, and mutate your fix to confirm a test actually fails.
