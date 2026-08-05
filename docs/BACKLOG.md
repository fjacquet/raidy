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

---

## How to close an item

This repo treats stale docs as a defect, not a follow-up: update the matching doc in `docs/` in
the same commit. When you close an entry here, delete it from this file in that commit rather
than marking it done — git history is the record.

For anything touching a shared calculation path, the branch convention is to **prove** no other
platform's output moved rather than assert it: compare against an independent re-implementation
of the previous behaviour, and mutate your fix to confirm a test actually fails.
