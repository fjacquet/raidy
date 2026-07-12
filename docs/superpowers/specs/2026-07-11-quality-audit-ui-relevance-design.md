# Quality Audit, PPTX Verification & UI Relevance — Design

**Date:** 2026-07-11
**Status:** Draft — awaiting review
**Author:** Claude (brainstormed with Frédéric Jacquet)

## 1. Problem Statement

Three quality concerns have accumulated:

1. **Value trust.** The engines cover 10 platforms, but external validation
   (phase 02) only produced test vectors for RAID, ZFS, vSAN, Dell, and
   performance. S2D, Nutanix, NetApp, Ceph, Synology, and Longhorn have **no
   fixture vectors** — their capacity/efficiency numbers have never been
   checked against an external reference.
2. **PPTX drift and defects.** The shipped PPTX export is a single dense
   one-pager (theme-following, Sankey + 2×2 gauges + stat lines), but
   `.planning/phases/17-pptx-content/17-VERIFICATION.md` still verifies the
   obsolete 7-slide deck. The one-pager also has known code defects (see §4).
3. **UI noise.** Input controls and dashboard readouts are shown regardless of
   whether they mean anything for the selected platform (e.g., sliders whose
   strategy ignores them, flash-endurance readouts for HDD configs). The
   Longhorn fix (b25f608, "hide no-op data-efficiency sliders") set the right
   precedent, but only for one platform.

**Primary use case** driving decisions: presales / customer sizing — build a
config, read off trustworthy headline numbers, export a deck or share a URL.

## 2. Goals

- Every displayed and exported value is validated against an external
  reference (≤1 % deviation, the project's stated target) or explicitly
  flagged as an estimate.
- The generated PPTX is verified end-to-end (real browser, real file, both
  themes) and its values match the on-screen dashboard.
- Controls and readouts that are no-ops or meaningless for the current
  platform are hidden, driven by one declarative capability map.
- Engines remain strictly pure functions; every fix lands with a regression
  vector or property-based test.
- Specs and docs describe what actually ships (stale docs are defects).

**Out of scope:** new platforms, new export formats, changing the two-pane
Cockpit layout itself (we adapt content visibility, not structure).

## 3. Workstream A — Value Correctness Audit

### Method

For each platform, compare three sources:

| Source | Where |
|--------|-------|
| Engine strategy code | `src/engines/volumetry/strategies/*` (and peers) |
| Existing test vectors | `tests/fixtures/*-vectors.ts` |
| External reference | WintelGuy, NetApp efficiency calculator, vendor sizing docs — fetched fresh via Perplexity/Context7, never from memory |

### Scope split (builds on phase 02, no rework)

- **Covered platforms** (RAID, ZFS, vSAN, Dell, performance): regression
  re-validation only — confirm nothing drifted since `02-RESEARCH.md`; spot
  new code paths added after phase 02.
- **Uncovered platforms** (S2D, Nutanix, NetApp, Ceph, Synology, Longhorn):
  full reference validation + new baseline vector files
  (`s2d-vectors.ts`, `nutanix-vectors.ts`, `netapp-vectors.ts`,
  `ceph-vectors.ts`, `synology-vectors.ts`, `longhorn-vectors.ts`).

### Test-vector-first (TDD)

Each validated reference case becomes a fixture vector **before** any fix. If
the engine disagrees with the reference by more than 1 %, write the failing
vector first, then fix the strategy. Baseline vectors are written even where
values are already correct — that is the anti-flakiness dividend.

### Spot-checks beyond volumetry

- **Performance:** bottleneck-chain math for one hybrid and one all-flash
  config against vendor throughput specs.
- **Resilience:** Monte Carlo survival probability vs an analytic MTTDL
  approximation for RAID-5 and RAID-6.
- **Sustainability:** power/CO₂ arithmetic plus one carbon-region factor
  against a published source.

### Output

A severity-ranked findings document extending the phase-02 lineage. Each
finding is tagged one of:

- `value-wrong` — number deviates > 1 % from reference
- `value-misleading` — right number, wrong label/unit/context
- `untested` — no vector coverage

## 4. Workstream B — PPTX Quality (End-to-End + Code)

### End-to-end verification

1. Start the Vite dev server; load a config with a trusted phase-02 vector
   (e.g., RAID-5, 10 drives) so on-screen values are themselves validated.
2. Trigger the export via browser automation, in **both light and dark
   themes**.
3. Unzip the `.pptx`, inspect slide XML and embedded images.
4. Assert: every slide number equals the dashboard value; charts embed;
   collapsed panels degrade to the fallback text (not a crash); the
   resilience row appears only when the simulation has run.

### Known code defects to fix (confirm during e2e)

| Defect | Location | Fix |
|--------|----------|-----|
| Hardcoded English strings (`'drives'`, `'servers'`, `'Raw'`, `'Usable'`, `'Max Read'`, …) bypass 4-locale i18n | `src/utils/exportPptx.ts` | Move all slide labels to `output.json` (en/fr/de/it) |
| `unitSystem` accepted in `ExportConfig` but never read — deck always decimal TB | `src/utils/exportPptx.ts` (`bytesToTB`) | Honor the user's unit setting via `@utils/units` |
| Module-level mutable `let brand` (hidden state, impure) | `src/utils/exportPptx.ts` | Pass the palette as a parameter through the slide builders |
| Export failures only reach the console | `OutputDashboard.tsx` handler | Surface a user-visible error toast |

## 5. Workstream C — UI Relevance Pass

### Principle

Every input control and output readout must be meaningful for the current
selection. If changing a control affects no result, or a readout is undefined
for the platform, it is **hidden** (not disabled) — the Longhorn precedent,
applied systematically.

### Mechanism: platform capability map

One declarative `capabilities` map keyed by topology type, living beside the
strategies in `src/engines/` so it versions with the calculation logic it
mirrors. Example flags: `supportsCompression`, `supportsDedup`,
`supportsHotSpares`, `hasFlashEndurance`, `hasServerCount`,
`usesErasureCoding`.

- Input panels and dashboard readouts consult the map declaratively — no
  scattered `if (topology.type === …)` conditionals.
- The map is a pure data structure, testable in isolation.
- Each entry is backed by a test asserting the strategy genuinely ignores the
  hidden input (the flag can never silently lie).

### Process

The audit's platform-by-platform pass (Workstream A) produces the inventory of
no-op controls and meaningless readouts per platform. Each confirmed no-op
becomes: capability flag + hidden control + ignoring-input test.

## 6. Workstream D — Docs & Spec Sync

- Supersede `17-VERIFICATION.md`'s 7-slide description with the shipped
  one-pager reality (note in `.planning/`, per gsd conventions).
- Update `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md` wherever they
  still describe the 7-slide deck or omit the capability map.
- Doc updates ship in the same commit as the code they describe.

## 7. Anti-Flakiness Hardening (cross-cutting)

- Audit `src/engines/**` for hidden state: `Date.now()`, `i18n.language`,
  locale-dependent formatting, DOM reads inside calculation paths. Anything
  found moves to the call boundary.
- Every fix lands with a fixture vector or `fast-check` property test.
- Coverage threshold (75 % on engines/workers/utils) must not regress.

## 8. Delivery Plan

Reviewable PRs in dependency order:

1. **Audit findings document** (no code) — the severity-ranked report.
2. **Value fixes + baseline vectors** — one commit per platform.
3. **PPTX fixes** — i18n, unit system, purity, error toast; includes the
   e2e verification evidence.
4. **Capability map + UI relevance** — map, hidden controls, ignoring-input
   tests.
5. **Docs sync** — woven into each PR above, per repo policy.

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| External references disagree with each other | Prefer vendor primary docs; record the chosen source per vector in the fixture comment |
| Vendor formulas are proprietary/undocumented (Nutanix, NetApp) | Flag affected readouts as estimates in the UI rather than presenting false precision |
| Capability map drifts from strategy behavior | Ignoring-input tests make each flag self-verifying |
| PPTX e2e is browser-dependent and slow | Keep it a manual/scripted verification step, not CI; CI keeps unit-level slide-builder tests |
