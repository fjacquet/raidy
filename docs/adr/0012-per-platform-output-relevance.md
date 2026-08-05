# ADR 0012 — Outputs are filtered per platform, like inputs

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

A dashboard showing every metric for every platform shows some that are meaningless. An effective
capacity tile for standard RAID reports the same value as usable, because RAID has no data
reduction. A dedup framing for Longhorn describes something Longhorn does not do.

The same reasoning had already been applied to *inputs* — a control that cannot change any number
is worse than no control ([ADR-0007](./0007-sourced-lists-over-probed-flags.md)).

## Decision

`src/engines/outputRelevance.ts` exposes `shouldShowKpi(kpi, ctx)` and
`shouldShowSection(section, ctx)`. The dashboard consults them, so headline tiles and narrative
sections appear only where they carry information.

The dashboard itself is a **guided narrative** — a persistent KPI band followed by five acts
(Capacity, Performance, Resilience, Cost, Take-away) — rather than an undifferentiated card grid,
because that is the order a sizing conversation goes in.

## Consequences

- Two relevance mechanisms now exist, one for inputs and one for outputs, deliberately separate:
  input relevance asks whether the engine reads a value, output relevance whether a computed value
  means anything for the platform.
- Hiding is preferred to greying out. A disabled control still invites the question "why can't I
  set this"; an absent one does not.
- Every new platform needs an entry in both, and a missing entry fails open — the tile appears.
  That is the safe direction (a meaningless tile, not a missing one), but it means the default is
  not automatically correct.

## Alternatives rejected

- **Show everything, explain in tooltips.** Tried in effect, and it is how the panels accumulated
  hint text saying "for reference only, not used in any calculation" — a control followed by a
  sentence explaining it does nothing is worse than no control. Twenty-four of those were deleted
  in v2.0.0.
- **Per-platform dashboard components.** Fifteen dashboards to keep in sync.
