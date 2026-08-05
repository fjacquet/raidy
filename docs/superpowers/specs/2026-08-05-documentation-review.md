# Documentation review, 2026-08-05

Every claim below was checked against the code, not read. Fixed items are in this commit; open
items are decisions that are not mine to make.

---

## 1. Fixed: factual drift

### `CONFIGURATION.md` described a CI that does not exist

The worst of the set, because it is the file a newcomer opens to understand the pipeline.

It opened with *"The CI/CD pipeline is a single workflow, `.github/workflows/static.yml`"* and
described an eleven-step build job, plus *"a separate `.github/workflows/codeql.yml`"*.

**Neither file exists.** CI was federated to reusable workflows in `fjacquet/ci@v1`; the local
files are five thin callers (`ci`, `security`, `deploy`, `release`, `dependabot-automerge`). The
eleven steps live in a repository this one does not control, so reproducing them here would drift
again by definition. Rewritten to describe the delegation and to enumerate only the gates that
actually live here.

It also claimed third-party actions are *"pinned to commit SHAs"*. The local callers pin to `@v1`
tags. Dropped rather than restated, since it describes the central repo's practice.

`CLAUDE.md` carried the same `static.yml` reference.

### The dead-code gate was undocumented where it matters

`prebuild` runs `check-supply-chain && check:dead`, and `.githooks/pre-commit` runs `check:dead`.
Neither `CLAUDE.md`, `CONFIGURATION.md`, `TESTING.md` nor `GETTING-STARTED.md` mentioned it — only
`DEVELOPMENT.md` did. So a contributor could hit a failing commit or a failing build from a gate
that appeared in none of the four places they would look. Added to all of them.

`TESTING.md` also had no entry for `tests/i18n/orphanKeys.spec.ts`, the sharper half of the i18n
guarding: parity checks the four locales against `en`, orphan-keys checks `en` against the source.
A dead key passes parity forever, because all four locales agree on it.

### Stale facts

| Claim | Where | Reality |
|---|---|---|
| Recharts in the tech stack | `README.md`, `ARCHITECTURE.md` | Removed 2026-08-05, 8.5 MB unused |
| Vite 7.x | `ARCHITECTURE.md` | 8.x |
| `engines/resilience/` in the tree | `ARCHITECTURE.md` | Does not exist — the worker is in `src/workers/` |
| `engines/backup/`, `engines/shared/` absent | `ARCHITECTURE.md` | Both exist |
| `OutputDashboard.tsx` ~249 lines | `ARCHITECTURE.md` | 203 |
| `topology.ts` ~730 lines | `CLAUDE.md` | ~1000 |
| 8 i18n namespaces | `CLAUDE.md` | 10 — `help` and `guide` were missing |
| Nutanix, PowerVault | `README.md` platform list | Absent. Two of fifteen platforms invisible |
| `prebuild` runs "the supply-chain gate" | `GETTING-STARTED.md` | Runs two gates |

### A whole subsystem was undocumented

`src/components/guide/` is an in-app explanatory view, and `InfoTooltip` is used by 17 components
from a `help` namespace. `ARCHITECTURE.md` mentioned neither, which is also why its namespace count
was wrong: those two namespaces exist for the parts of the app the calculation path never touches.

Added an "In-app guidance" section. This matters beyond bookkeeping — asked whether the project
has a user guide, the honest answer is *yes, inside the app*, and no document said so.

### `doc/` and `docs/`

Two top-level directories one letter apart. `doc/spec/` held 13 vendor specification documents,
last touched January 2026, **referenced from nowhere** in any doc, README or CLAUDE.md.

Moved to `docs/vendor-specs/` with a README stating what they are and, more usefully, what they
are *not*: historical inputs that predate BeeGFS, Longhorn, PowerVault ADAPT and the vSAN ESA
recalibration. Where they and the code disagree, the code and its validation vectors win. Deleting
them would have thrown away reasoning nobody could re-derive; leaving them unreferenced meant
nobody would find it.

### Badges

Were CI and Release. Added Security and Deploy — both are real workflows whose status a reader
cannot otherwise see — and a live-demo link, which is the one thing a visitor to a browser-based
tool most wants and had to dig for.

Deliberately not added: a coverage badge (nothing publishes coverage, so it would need new
infrastructure to be honest) and a license badge (see below).

---

## 2. Open: decisions that are not mine

### There is no LICENSE

No `LICENSE` file, and no `license` field in `package.json`. A public repository with no license
is, by default, **all rights reserved** — nobody may legally fork, modify or redistribute it, which
is unlikely to be the intent for a tool published to GitHub Pages with a public issue tracker.

Not fixed here because choosing a license is a legal decision, not a documentation one. MIT or
Apache-2.0 are the conventional picks for this kind of project; Apache-2.0 additionally grants
patent rights, which matters more when the work encodes vendor-derived methods.

### The `adr/` directory implies a practice that is not followed

Two ADRs exist. Both are meta: the supply-chain gate, and intentional divergences from another
repository. **Not one records an architectural decision about the product**, though this codebase
has made several that future readers will have to reconstruct from comments:

- Strategy pattern per platform, over a switch in each engine
- URL hash as the sole persistence, with `omitDefaults` — whose consequence for old shared links
  bit this project in 2.0.0
- Monte Carlo over an analytic MTTDL model for resilience
- The resilience **superset invariant** (may understate, never overstate)
- `DISTRIBUTED_SPARE_TOPOLOGIES` as a sourced list rather than a probed capability flag (#130)
- Excluding S2D and Nutanix from the fast-tier cascade for want of a vendor statement (#88)

Each of these is currently a long comment in one file. Comments are found by people already in
that file; ADRs are found by people deciding whether to change it. Either backfill the important
ones or drop the directory — a folder that implies a practice nobody follows is worse than no
folder.

### `ARCHITECTURE.md` is 951 lines and absorbing everything

It gained four sections today alone. It is now simultaneously a directory map, a data-flow diagram,
a per-platform formula reference, a decision log and a caveat register. The decision-log parts are
what the ADR directory is for; the per-platform formulas are arguably reference material that
belongs beside the engines.

Not split here — that is a restructuring with real review cost, and it should be a deliberate
choice rather than a side effect of a sync pass.

### The CHANGELOG entries are very long

Mine included; today's additions run to hundreds of lines. For a tool whose output is *numbers
people quote in proposals*, recording why a figure moved and by how much has obvious value, and
the 2.0.0 and 2.1.0 reader warnings are the clearest example of it paying off.

But the file is 1215 lines and every release adds a page. Worth an explicit decision: keep the
depth and accept the length, or move the long-form reasoning into the specs directory and leave the
CHANGELOG a summary with links. Flagging rather than choosing.

### `CLAUDE.md` duplicates `README.md` and `ARCHITECTURE.md`

The platform list, the command reference and the architecture summary all exist in two or three
places. That duplication is precisely how the workflow filenames, the namespace count and the
`topology.ts` line count drifted — each was correct somewhere and stale elsewhere.

A pointer-based `CLAUDE.md` would drift less. Not done here because it changes how the agent
instructions read, which is your call.
