# Presales-First Dashboard — Guided-Narrative Layout — Design

**Date:** 2026-07-12
**Status:** Draft — awaiting review
**Author:** Claude (brainstormed with Frédéric Jacquet)
**Builds on:** `2026-07-11-quality-audit-ui-relevance-design.md` (v1.13.0). That
cycle validated every platform's numbers against external references and hid
no-op *inputs* via a capability map, but explicitly kept *"changing the
two-pane Cockpit layout itself"* **out of scope**. This is that deferred cycle,
now with trustworthy numbers to build on.

## 1. Problem Statement

The right-hand `OutputDashboard` (986 lines, one monolithic component) renders
results as an **undifferentiated grid of equal-weight cards**: Capacity,
ZFS/Longhorn detail, Performance gauges, Power, Backup, Bottleneck, Resilience,
Commands, Export. Everything shouts at the same volume. A presales engineer —
the tool's stated primary user — has to hunt across nine same-sized cards for
the three or four numbers a customer actually asks about, and the provisioning
commands (an engineering handoff detail) sit at the same altitude as usable
capacity (the headline).

Two consequences:

1. **No hierarchy, no story.** The layout doesn't reflect how a sizing
   conversation actually flows (how much do I get → is it fast enough → is it
   safe → what does it cost → give me the deck).
2. **Irrelevant readouts still render.** Output relevance is ad-hoc: some cards
   self-hide by `value > 0` (which can wrongly hide a true zero or wrongly show
   a not-applicable field), others by scattered `topology.type === …` checks.
   The input-side capability map has no output-side counterpart, so e.g.
   compression/dedup framing can surface for platforms where it means nothing.

## 2. Goals

- Reshape the output into a **guided narrative** — a top-to-bottom sizing story
  with a persistent headline band — so the numbers a customer asks about are
  always at a glance and the detail reads in conversational order.
- Optimize for the **self-serve engineer preparing a quote/deck**: density is
  welcome, everything stays reachable without click-to-expand friction, and the
  headline numbers update live as inputs change (fast iteration is the priority,
  not a projector "present mode").
- Extend the **capability map to the output side** so every KPI tile, act, and
  breakdown segment declares a relevance predicate — not-applicable readouts are
  omitted (Longhorn has no dedup; HDD configs have no flash endurance; erasure
  coded platforms have no hot-spare overhead), and the predicate is
  data-driven and test-backed, matching the input-side precedent.
- **Re-sequence the input accordion** to mirror the narrative build order, kept
  lightweight (multi-open accordion, no wizard gating).
- **Decompose the monolith**: split `OutputDashboard.tsx` into one focused
  component per narrative act plus the headline band, each consuming results +
  relevance and independently testable.
- Preserve all existing functionality: every current number, chart, export, and
  the Monte-Carlo simulation behavior remain; this is a re-composition, not a
  feature change.

## 3. Non-Goals

- **No engine/calculation changes.** Engines stay pure; numbers are already
  validated. If a value looks wrong it's a separate finding, not this cycle.
- **No new platforms, exports, or metrics.** We re-present existing data.
- **No projector/present mode, no customer-self-serve teaching mode.** Audience
  is the engineer preparing a deck (see §7 audience note). A future cycle can
  add a present mode if wanted.
- **No input-control redesign.** The left panel is *re-sequenced*, not
  re-built; individual panels (Topology, Hardware, Workload, Advanced, Drive
  Properties) keep their internals.
- **No change to URL persistence, i18n namespaces' meaning, or the store
  shape.** New i18n keys are additive.

## 4. Chosen Approach — Headline Band + Narrative Acts (Approach B)

Rejected alternatives:

- **A — Linear single-column scroll.** Purest narrative, but wastes horizontal
  space on wide monitors and forces heavy scrolling — fights the self-serve
  engineer who wants everything at once.
- **C — Tabbed acts.** Cleanest per-act, but hides numbers behind tabs, which
  directly fights fast iteration and glanceability.

**B** is the only structure that satisfies both "guided narrative" and "density
fine / everything visible / fast iteration."

### 4.1 The narrative arc

Five acts, in sizing-conversation order:

1. **Capacity** — the #1 presales question ("how much do I actually get?").
2. **Performance** — "is it fast enough for my workload?"
3. **Resilience** — "how safe is my data?"
4. **Cost & Sustainability** — "what does it cost to run?"
5. **Take it away** — export the deck / share the URL / hand off to engineers.

### 4.2 Headline band (persistent KPI strip)

A full-width band above the acts, carrying up to six glance tiles. Each tile is
**capability-filtered** (§5) — the band shows only tiles meaningful for the
current platform, so its column count adapts (never renders an empty or `N/A`
tile). Candidate tiles, in priority order:

| Tile | Source | Shown when |
|------|--------|-----------|
| Usable capacity | `volumetry.usableCapacity` | always |
| Effective capacity | `volumetry.effectiveCapacity` | platform actually applies compression/dedup **and** effective ≠ usable (RAID: omit — it equals usable) |
| Efficiency | `volumetry.efficiency` | always |
| Peak IOPS | `max(performance.maxReadIOPS, maxWriteIOPS)` | always |
| Annual survival | `resilienceResult.survivalPercent` | after a simulation has run; before that, a compact "run" affordance sits in the tile's place |
| Annual cost | `sustainability.annualEnergyKwh` / `annualCO2Kg` | always (which of energy vs CO₂ is the headline is settled in §8 open questions) |

De-dup rule: the band is the **glance**; the act is the **explanation**. A
number in the band still appears in its act, but the act adds context (units,
breakdown, tooltip) the band omits.

### 4.3 Act layout (responsive, full width)

- **Act 1 Capacity** — full-width. Hero: usable + effective (large type).
  Sankey (desktop) / donut + breakdown list (tablet/mobile), as today. ZFS and
  Longhorn platform-detail cards fold in here as the platform-specific
  expansion of this act rather than free-floating cards. Backup requirement (if
  present) attaches here as a capacity-adjacent sub-panel.
- **Act 2 Performance + Act 3 Resilience** — side by side on wide screens
  (`xl:grid-cols-2`), stacked below. Performance keeps the four gauges; the
  bottleneck-chain analysis becomes a supporting "why" detail *within* this act
  (demoted from its own equal card). Resilience keeps the survival hero, risk
  metrics, run button, and recommendations.
- **Act 4 Cost & Sustainability** — full-width or paired with Act 5. Power
  breakdown, annual energy, CO₂, and flash endurance (flash only).
- **Act 5 Take it away** — the closing call-to-action. Export buttons
  (PDF/PPTX/YAML/Ansible/Terraform) promoted as the prominent finish. The
  provisioning **commands** block is demoted into a collapsible "for your
  engineers" sub-panel here — it's a handoff artifact, not part of the customer
  story.

An ASCII sketch of the wide-screen composition:

```
┌──────────────────────────────────────────────────────────────┐
│  HEADLINE BAND:  Usable │ Effective │ Eff% │ Peak IOPS │ ...   │
├──────────────────────────────────────────────────────────────┤
│  ACT 1 — CAPACITY (full width)                                 │
│  [ hero usable / effective ]   [ Sankey ]   [ breakdown ]      │
│  └ ZFS / Longhorn detail (platform-specific) · Backup sub-panel│
├───────────────────────────────┬──────────────────────────────┤
│  ACT 2 — PERFORMANCE          │  ACT 3 — RESILIENCE           │
│  [ 4 gauges ]                 │  [ survival hero ]            │
│  └ bottleneck "why" (detail)  │  [ risk metrics · run · recs ]│
├───────────────────────────────┴──────────────────────────────┤
│  ACT 4 — COST & SUSTAINABILITY (full width)                    │
│  [ power breakdown · energy · CO₂ · flash endurance* ]         │
├──────────────────────────────────────────────────────────────┤
│  ACT 5 — TAKE IT AWAY                                          │
│  [ PDF ][ PPTX ][ YAML ][ Ansible ][ Terraform ]              │
│  └ ▸ Provisioning commands (collapsible, "for your engineers") │
└──────────────────────────────────────────────────────────────┘
        * flash endurance tile shown only for flash media
```

## 5. Capability-Driven Output Relevance

### Principle

Every headline tile, act, sub-detail, and breakdown segment must be meaningful
for the current selection. If it is not applicable, it is **omitted** (not shown
as zero, not shown as `N/A`). This is the v1.13.0 input-relevance principle
applied to output.

### Mechanism

Extend the existing single source of truth in `src/engines/capabilities.ts`
rather than inventing a parallel system. Two changes:

1. **Add output-oriented flags** to `PlatformCapabilities` where relevance is a
   property of the *platform* (topology type). Candidates, each to be validated
   against engine behavior by the probe suite before being trusted:
   - `hasParityOverhead` — parity/erasure segment is meaningful (false for pure
     mirror/replication platforms).
   - `hasHotSpareOverhead` — mirrors `supportsHotSpares` but for the output
     segment; likely reuse `supportsHotSpares`.
   - `hasZfsBreakdown` / `hasLonghornBreakdown` — platform detail act (these are
     already type-gated; formalize as flags for consistency).
   - Reuse existing `supportsCompression` / `supportsDedup` for the
     effective-capacity tile and any compression framing.

2. **Add a relevance helper layer** — e.g. `shouldShowKpi(kpi, ctx)` and
   `shouldShowSection(section, ctx)` — that combines (a) capability flags and
   (b) genuine result presence. The critical distinction the current
   `value > 0` filtering gets wrong: **not-applicable → omit** vs **applicable
   but genuinely zero → show with context**. Relevance that depends on data
   rather than platform (flash endurance depends on the *drive media*, not the
   topology) stays keyed off result presence (`sustainability.flashEndurance`
   truthy), documented as such.

### Self-verification

Every new platform-keyed flag is asserted by the capability probe suite
(`tests/engines/capabilities.spec.ts`) exactly as the input flags are — the
map cannot silently drift from engine behavior. Relevance predicates that
combine flags + presence get their own unit tests (given results X and platform
Y, section shows/hides).

## 6. Input Panel Re-Sequence

Lightweight, per the chosen "reordered accordion, multi-open" direction:

- Re-order `InputSidebar` accordion sections to the narrative build order:
  **Topology (platform) → Hardware → Workload → Advanced (cost) → Drive
  Properties**. (Today: Topology, Hardware, Workload, Advanced, Drive
  Properties — already close; confirm the final order and default-open set.)
- Keep multi-open (the `Set<string>` state already supports it); revisit the
  default-open set so the first acts' inputs are open on load.
- No changes to individual panel internals.

## 7. Cockpit / Shell

Audience is the **self-serve engineer preparing a deck**, so we do *not* build a
full-screen present mode this cycle. Shell changes are minimal:

- The two-pane `Cockpit` and mobile bottom-nav (`config` / `report` / `guide`)
  stay. The narrative lives inside the existing `report` pane.
- Optional (low priority, flagged for the plan): a collapse-inputs affordance so
  the narrative can use full width when the engineer is reading rather than
  editing. Include only if it's cheap; otherwise defer.

## 8. Component Decomposition

Break the 986-line `OutputDashboard.tsx` into focused units under
`src/components/outputs/` (or a new `outputs/acts/` sub-dir):

| Component | Responsibility | Consumes |
|-----------|----------------|----------|
| `HeadlineBand` | The KPI strip; capability-filtered tiles | volumetry, performance, resilience, sustainability, relevance |
| `CapacityAct` | Hero + Sankey/donut + breakdown + ZFS/Longhorn detail + backup | volumetry, backup |
| `PerformanceAct` | Gauges + bottleneck "why" detail | performance |
| `ResilienceAct` | Survival hero, risk metrics, run button, recs | resilience hook |
| `CostAct` | Power, energy, CO₂, flash endurance | sustainability |
| `TakeawayAct` | Export buttons + collapsible commands | export handlers, topology |

`OutputDashboard` becomes a thin orchestrator: pull results + relevance, render
`HeadlineBand` then the acts in order. Export handlers and the resilience hook
move to the acts (or a small shared hook) that own them. Shared presentational
helpers (`MetricCard`, `ProgressBar`) move to `src/components/outputs/` shared
modules rather than living inside the monolith.

Each act is understandable and testable in isolation: given a results object and
a relevance verdict, it renders its section. This is also why the file was hard
to work in — one 986-line component doing nine jobs.

## 9. i18n, Accessibility, Testing

- **i18n**: new section/act headings and any new labels are additive keys in the
  `output` namespace across en/fr/de/it. No key meanings change. The PPTX/PDF
  exporters read their own label set (already i18n'd in v1.13.0) and are
  unaffected by on-screen re-composition — but §11 verification confirms
  exported values still match the re-composed dashboard.
- **Accessibility**: acts get semantic headings (`<section>` + `<h2>`/`<h3>`) so
  the narrative is a real document outline, not just visual order. Preserve the
  44px mobile tap targets and existing tooltip affordances.
- **Testing**: component tests per act (render with representative results,
  assert hero numbers and that not-applicable sections are absent). Relevance
  predicates unit-tested. Capability probe suite extended for new flags.
  Coverage thresholds must not regress. No engine tests change.

## 10. Delivery Plan

Reviewable PRs in dependency order:

1. **Output relevance layer** — extend `capabilities.ts` with output flags +
   `shouldShowKpi`/`shouldShowSection`, probe + unit tests. No UI change yet.
2. **Decompose OutputDashboard** — extract the act components and shared helpers
   with *current* layout preserved (pure refactor, behavior identical; tests
   green). De-risks the visual change from the structural one.
3. **Headline band + narrative composition** — introduce `HeadlineBand`,
   re-sequence acts into the Approach-B layout, wire relevance so tiles/sections
   omit when not applicable.
4. **Input accordion re-sequence** — reorder sections + default-open set.
5. **Docs sync** — update `docs/ARCHITECTURE.md` (UI Layout section),
   `README.md`, `CHANGELOG.md` in the same PRs that change behavior, per repo
   policy.

## 11. Verification

- End-to-end in a real browser (both themes, at least one multi-node platform
  and one single-node/RAID platform, one flash and one HDD config): confirm the
  narrative renders, not-applicable sections are absent (e.g. Longhorn shows no
  dedup framing, HDD shows no flash-endurance), and headline tiles match their
  acts.
- Export a PPTX and a PDF and confirm the values still equal the on-screen
  dashboard (guards the re-composition against silently breaking the exporters).
- Run the Monte-Carlo simulation and confirm the survival tile + Resilience act
  behave as before.

## 12. Open Questions (settle during planning, not blocking approval)

1. **Cost headline metric** — annual energy (kWh), annual CO₂ (kg), or TCO, for
   the band tile? (Act 4 shows all; the band shows one.)
2. **Effective-capacity tile** — omit entirely for platforms where
   effective ≡ usable (RAID), or always show and let it equal usable? Spec
   currently says omit (avoids a redundant tile).
3. **Collapse-inputs affordance** (§7) — include this cycle or defer?
4. **Backup placement** — capacity-adjacent sub-panel (current spec) vs its own
   small act. Current spec attaches it to Act 1.

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Decompose PR silently changes behavior | PR 2 is a pure refactor with layout unchanged and tests green before PR 3 touches visuals |
| Relevance flags drift from engine reality | New flags asserted by the existing self-verifying probe suite |
| Re-composition breaks exporters | §11 export-parity verification in a real browser |
| "Omit when not applicable" hides a genuine zero | Relevance layer distinguishes not-applicable (omit) from applicable-but-zero (show with context); unit-tested |
| Scope creep into a present mode / input redesign | Explicit non-goals (§3); present mode and input-control redesign are future cycles |
