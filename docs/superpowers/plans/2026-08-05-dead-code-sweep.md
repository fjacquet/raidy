# Dead-Code Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every dependency, file, export and translation key nothing reaches, and install a gate so the next one cannot accumulate unnoticed.

**Architecture:** Knip supplies the import graph that TypeScript and Biome do not build, and its first failing run *is* the work list for the deletion tasks. The gate lands last, once the report is clean, at `.githooks/pre-commit` via `core.hooksPath` — no husky. Translation keys stay outside Knip's reach and get a bespoke test beside the existing i18n parity specs.

**Tech Stack:** Knip 6, TypeScript 5 strict, Biome, Vitest, react-i18next (4 locales), plain git hooks.

**Spec:** `docs/superpowers/specs/2026-08-05-dead-code-sweep-design.md`

## Global Constraints

- Branch: `chore/dead-code-sweep`, rebased onto `feat/input-panel-relevance` (PR #131). Do not work on `main`.
- Prefix every shell command with `rtk`, including inside `&&` chains (project convention).
- Biome: 2-space indent, 100-char width, single quotes, semicolons as-needed. Run `rtk npm run lint:fix` before each commit.
- Any locale change touches **all four** of `en`, `fr`, `de`, `it`, or the i18n parity test fails. `fr`/`de`/`it` carry full accents (settled in #86).
- Docs stay in sync in the **same commit**: changes to config, dependencies or CI-adjacent behaviour update `docs/` and `CHANGELOG.md`.
- **No calculated figure may change.** Nothing in this plan touches a calculation. A moved number means something was reachable after all — stop and report rather than adjusting an expectation.
- Verification after every task: `rtk npm run lint && rtk npm run typecheck && rtk npm test`. The baseline is **1592 passing**.
- React `*Props` interfaces keep their `export`. This is decided; do not re-litigate it per file.

---

### Task 1: Adopt Knip and let it name the work

Knip supplies what the toolchain cannot: an import graph. Its first run is expected to **fail**, and that failure is the work list for Tasks 2–4.

**Files:**
- Modify: `package.json` (devDependency + `check:dead` script)
- Create: `knip.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run check:dead`, used by Tasks 2–4 to verify their deletions and by Task 5 as the hook's payload.

- [ ] **Step 1: Install Knip as a devDependency**

```bash
rtk npm install --save-dev knip@^6
```

Knip is 1.9 MB across 13 direct dependencies. That is the trade the spec accepts against removing 9.5 MB from `dependencies` in Task 2 — worth restating in the commit message, because a reviewer seeing "adds a dependency" in a dead-code PR deserves the arithmetic.

- [ ] **Step 2: Write the config**

Create `knip.json`:

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": [
    "src/main.tsx",
    "src/workers/resilienceWorker.ts",
    "scripts/*.mjs",
    "vite.config.ts",
    "vitest.config.ts"
  ],
  "project": ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
  "ignoreDependencies": [],
  "ignore": ["src/vite-env.d.ts"]
}
```

`resilienceWorker.ts` is listed as an entry point because Vite loads it via `new Worker(new URL(...))`, which Knip cannot follow — omitting it would report the whole worker as unused.

- [ ] **Step 3: Add the script**

In `package.json` `scripts`, after `check:bundle-size`:

```json
"check:dead": "knip"
```

- [ ] **Step 4: Run it and capture the report**

```bash
rtk npm run check:dead
```

Expected: **FAIL**, listing unused dependencies, files and exports. Save the output verbatim into the task report — Tasks 2, 3 and 4 each consume one section of it.

If Knip reports something this plan does not anticipate, do **not** delete it silently. Add it to the report and flag it: the plan's list was built from hand-rolled scans that got barrels and in-file-only exports wrong, so Knip finding *more* is expected, and each addition needs the same per-category proof as the rest.

- [ ] **Step 5: Commit**

```bash
rtk npm run lint:fix
rtk git add package.json package-lock.json knip.json
rtk git commit -m "chore: add knip to find what the file-scoped linters cannot

TypeScript's noUnusedLocals/noUnusedParameters and Biome's noUnusedImports/
noUnusedVariables are all on, and all file-scoped. None builds an import graph,
so unused exports, unimported files and dead dependencies are invisible to every
check this project runs.

check:dead currently FAILS. That report is the work list for the deletions that
follow."
```

---

### Task 2: Remove the two unused dependencies

`recharts` (8.5 MB) and `js-yaml` (1.0 MB) sit in `dependencies` and are imported nowhere. The app hand-rolls its SVG charts (`SankeyDiagram`, `Speedometer`, `DonutChart`) and builds YAML from template literals in `src/utils/exportConfig.ts`.

Both are production dependencies in a project that runs `check-supply-chain.mjs` on every build, so this is supply-chain surface as much as weight.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `npm run check:dead` from Task 1.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Prove both are unreachable before removing them**

```bash
rtk grep -rn "recharts" src/ tests/ scripts/ vite.config.ts vitest.config.ts
rtk grep -rn "js-yaml" src/ tests/ scripts/
```

Expected: **zero hits** for both. If either returns a hit, STOP and report — the spec's premise is wrong for that package.

- [ ] **Step 2: Remove them**

```bash
rtk npm uninstall recharts js-yaml
```

- [ ] **Step 3: Verify the build, the bundle budget and the supply chain**

```bash
rtk npm run build && rtk npm run check:bundle-size && rtk npm run check:supply-chain
```

Expected: all three pass. The build is the real test here — if anything imported either package through a path the greps missed, it fails to resolve.

- [ ] **Step 4: Confirm Knip no longer reports them**

```bash
rtk npm run check:dead
```

Expected: the "Unused dependencies" section is gone. Other sections may still fail; Tasks 3 and 4 clear those.

- [ ] **Step 5: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: 1592 passing, unchanged.

- [ ] **Step 6: Add the CHANGELOG entry**

Under `## [Unreleased]`, in a `### Removed` block:

```markdown
- **Two unused production dependencies: `recharts` (8.5 MB) and `js-yaml` (1.0 MB).** Neither was
  imported anywhere — the app draws its charts as hand-rolled SVG and builds YAML from template
  literals. Both sat in the production dependency graph of a project that supply-chain-checks
  every build. No behaviour changes; nothing referenced them.
```

- [ ] **Step 7: Commit**

```bash
rtk git add package.json package-lock.json CHANGELOG.md
rtk git commit -m "chore(deps)!: remove unused recharts and js-yaml

Neither is imported anywhere. The app hand-rolls its SVG charts and builds YAML
from template literals.

Both were in \`dependencies\`, so this is supply-chain surface, not just weight -
9.5 MB removed from the production graph of a project that runs a supply-chain
check on every build.

Verified by build, check:bundle-size and check:supply-chain, not by grep alone."
```

---

### Task 3: Delete the dead file and the three dead functions

Each symbol below occurs exactly once repo-wide: its own declaration.

| Target | Location |
|---|---|
| `TopologyProvider`, `useTopologyContext` (whole file, 48 lines) | `src/components/inputs/topology-options/shared/TopologyContext.tsx` |
| `getMinIOPS` | `src/engines/performance/utils/bottleneck-chain.ts` |
| `formatPercent` | `src/i18n/formatters.ts` |
| `formatBytesLocalized` | `src/i18n/formatters.ts` |

`formatNumber` and `formatCurrency` in the same file are **live** — do not touch them.

**Files:**
- Delete: `src/components/inputs/topology-options/shared/TopologyContext.tsx`
- Modify: `src/engines/performance/utils/bottleneck-chain.ts`, `src/i18n/formatters.ts`

**Interfaces:**
- Consumes: `npm run check:dead` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Re-prove each target is unreferenced**

```bash
rtk grep -rn "TopologyProvider\|useTopologyContext" src/ tests/ | grep -v "shared/TopologyContext.tsx"
rtk grep -rn "getMinIOPS" src/ tests/
rtk grep -rn "formatPercent\|formatBytesLocalized" src/ tests/
```

Expected: **empty**, except the declarations themselves in the second and third commands. Any other hit means STOP and report.

- [ ] **Step 2: Delete them**

```bash
rtk git rm src/components/inputs/topology-options/shared/TopologyContext.tsx
```

Then remove `getMinIOPS` (with its doc comment) from `bottleneck-chain.ts`, and `formatPercent` and `formatBytesLocalized` (with their doc comments) from `formatters.ts`.

If `src/components/inputs/topology-options/shared/` is now empty, remove the directory too.

- [ ] **Step 3: Verify nothing broke**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: 1592 passing. `noUnusedLocals` catches any import left dangling by the deletions.

- [ ] **Step 4: Confirm Knip agrees**

```bash
rtk npm run check:dead
```

Expected: the unused-files and unused-exports sections shrink by exactly these four entries.

- [ ] **Step 5: Commit**

```bash
rtk npm run lint:fix
rtk git add -A
rtk git commit -m "chore: delete one dead file and three dead functions

TopologyContext.tsx (TopologyProvider + useTopologyContext, 48 lines),
getMinIOPS, formatPercent and formatBytesLocalized. Each occurred exactly once
repo-wide: its own declaration.

formatNumber and formatCurrency share formatters.ts and are live - left alone."
```

---

### Task 4: Strip superfluous exports from engine-internal symbols

Knip reports symbols exported but used only inside their own file. **React `*Props` interfaces keep their `export`** — the convention serves consumers that do not exist yet, and stripping it would touch nearly every component to produce diff rather than clarity.

What remains after that exclusion is a small set of engine and utility types. Removing `export` there narrows the public surface of each module to what other modules actually use.

**Files:**
- Modify: whichever files Knip's unused-exports section names, excluding any symbol whose name ends in `Props`.

**Interfaces:**
- Consumes: `npm run check:dead` from Task 1.
- Produces: nothing.

- [ ] **Step 1: List the candidates and split them**

```bash
rtk npm run check:dead
```

From the "Unused exports" and "Unused exported types" sections, build two lists:

- **Keep**: every name ending in `Props` (e.g. `CapacityActProps`, `TieringPanelProps`, `CapacityRowProps`).
- **Strip**: everything else (e.g. `BackupInput`, `OverheadResult`, `BreakdownEntry`, `NetworkModelContext`).

Write both lists into the task report. A reviewer needs to see what was spared as much as what was cut.

- [ ] **Step 2: Add the Props exclusion to the config so the report stays actionable**

In `knip.json`, add:

```json
  "ignoreExportsUsedInFile": { "interface": true, "type": true }
```

This tells Knip not to report a type or interface that IS used within its own file, which is exactly the `*Props` case — the component below uses its own props type. Re-run `check:dead` and confirm the `*Props` entries disappear from the report while the genuinely unused ones remain.

- [ ] **Step 3: Strip `export` from each name on the strip list**

Remove only the `export` keyword. Do not move, rename or reorder the declarations — a reviewer should be able to read this diff as a single mechanical change.

- [ ] **Step 4: Verify**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: 1592 passing. `typecheck` is the real gate: if any stripped symbol was imported elsewhere, it fails to resolve.

- [ ] **Step 5: Commit**

```bash
rtk npm run lint:fix
rtk git add -A
rtk git commit -m "chore: stop exporting engine types used only in their own file

Narrows each module's public surface to what other modules actually import.

React *Props interfaces deliberately keep their export: it is an established
convention serving consumers that do not exist yet, and stripping it would touch
nearly every component to produce diff rather than clarity. knip.json encodes
that exclusion via ignoreExportsUsedInFile so the report stays actionable."
```

---

### Task 5: Gate it at pre-commit

A one-off cleanup rots. `recharts` was unused for a long time and nothing was going to surface it.

**No husky.** `git config core.hooksPath .githooks` from an npm `prepare` script — which `npm install` runs — arms a fresh clone with no dependency to manage. Taking a dependency to police dependencies would be a poor trade in this PR of all PRs.

**Files:**
- Create: `.githooks/pre-commit`
- Modify: `package.json` (`prepare` script, `prebuild` chain)
- Modify: `docs/DEVELOPMENT.md`

**Interfaces:**
- Consumes: `npm run check:dead` from Task 1, now passing.
- Produces: the hook; Task 6's i18n test is enforced by the normal test run, not by this hook.

- [ ] **Step 1: Confirm the report is clean first**

```bash
rtk npm run check:dead
```

Expected: **PASS**. A hook installed while the check still fails would block every commit including the one that installs it.

- [ ] **Step 2: Write the hook**

Create `.githooks/pre-commit`:

```sh
#!/bin/sh
# Dead-code gate. See docs/superpowers/specs/2026-08-05-dead-code-sweep-design.md
#
# Unused exports, unimported files and dead dependencies are invisible to
# TypeScript's noUnusedLocals and Biome's noUnusedVariables, both of which are
# file-scoped. This is the only check that builds an import graph.
#
# Bypass with `git commit --no-verify` when you must; `prebuild` runs the same
# check, so a bypassed commit still fails at build time rather than silently.
npm run check:dead
```

```bash
rtk chmod +x .githooks/pre-commit
```

- [ ] **Step 3: Arm it from `prepare`, and add the build-time backstop**

In `package.json` `scripts`:

```json
"prepare": "git config core.hooksPath .githooks",
"prebuild": "node scripts/check-supply-chain.mjs && npm run check:dead",
```

`prepare` runs on `npm install`, so a fresh clone is armed without a manual step. `prebuild` covers what the hook cannot: `--no-verify`, and any path that reaches a build without a commit.

- [ ] **Step 4: Arm the hook in this working copy and prove it fires**

```bash
rtk npm run prepare
rtk git config core.hooksPath
```

Expected: prints `.githooks`.

- [ ] **Step 5: Demonstrate falsifiability — do not skip this**

Add a dead export to a source file:

```ts
export function deliberatelyDeadProbe(): void {}
```

Append it to `src/i18n/formatters.ts`, stage it, and attempt a commit:

```bash
rtk git add src/i18n/formatters.ts
rtk git commit -m "probe: this must be rejected"
```

Expected: **the commit is rejected**, and the output names `deliberatelyDeadProbe`. Quote the message in the task report, then remove the probe function and confirm a commit succeeds.

A gate nobody has seen fail is a gate nobody knows works.

- [ ] **Step 6: Document it**

In `docs/DEVELOPMENT.md`, add to the quality-gates section:

```markdown
### Dead-code gate

`npm run check:dead` (Knip) reports unused exports, unimported files and unused
dependencies — the class TypeScript's `noUnusedLocals` and Biome's
`noUnusedVariables` cannot see, because both are file-scoped and neither builds
an import graph.

It runs at two points: `.githooks/pre-commit` (armed by `npm install` via the
`prepare` script setting `core.hooksPath`) and `prebuild`. The second exists so
that `git commit --no-verify` defers the failure rather than avoiding it.

New entry point that Knip cannot follow — a `new Worker(new URL(...))`, a lazy
route — goes in `knip.json`'s `entry` array, with a comment saying why.
```

- [ ] **Step 7: Commit**

```bash
rtk npm run lint:fix
rtk git add .githooks package.json docs/DEVELOPMENT.md
rtk git commit -m "chore: gate dead code at pre-commit and prebuild

.githooks/pre-commit armed by core.hooksPath from an npm prepare script, so a
fresh clone is armed by npm install. No husky - taking a dependency to police
dependencies is a poor trade in this PR of all PRs.

prebuild runs the same check, so --no-verify defers the failure rather than
avoiding it.

Falsifiability demonstrated: a deliberately dead export was added and the commit
was rejected naming it, then removed."
```

---

### Task 6: An i18n orphan test with a dynamic-prefix allowlist

Knip cannot see translation keys. A scan for orphans finds 117 candidates out of 1,034 English keys, and **the raw list contains live keys** — 16 call sites build keys dynamically.

The failure mode justifies the care: a wrongly deleted key does not crash. i18next renders the key's own name into the interface, in a language the developer may not read, and no existing test asserts against that.

**Files:**
- Create: `tests/i18n/orphanKeys.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `DYNAMIC_PREFIXES`, consumed by Task 7 to decide which keys may be deleted.

- [ ] **Step 1: Write the test**

Create `tests/i18n/orphanKeys.spec.ts`:

```ts
/**
 * Every translation key must be reachable from the source, or be covered by a documented
 * dynamic prefix.
 *
 * The failure mode this guards is quiet: i18next renders a missing key's own name into the UI
 * rather than throwing, so a wrongly deleted key ships as `formFactor.u2` on screen, in a
 * language the developer may not read, with every test still green.
 *
 * Sixteen call sites build keys at runtime, so a literal-text scan alone would condemn live
 * keys. Each prefix below names one of those sites and the set that feeds it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Same discovery pattern as parity.spec.ts next door: node:fs, no glob library.
// Do NOT reach for tinyglobby — it exists here only as a transitive dependency of
// Knip, and depending on someone else's transitive dep is how a test breaks on an
// unrelated upgrade.
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'src', 'i18n', 'locales')

/**
 * Key prefixes assembled at runtime. A key under one of these is exempt from the literal scan
 * because the scan structurally cannot see it — not because nobody checked.
 */
const DYNAMIC_PREFIXES: Record<string, string> = {
  'connectivity.': 'HardwarePanel.tsx:52 — t(`connectivity.${value}`) over CONNECTIVITY_VALUES',
  'formFactor.': 'HardwarePanel.tsx:62 — t(`formFactor.${value}`) over FORM_FACTOR_VALUES',
  'tiering.s2d.': 'TieringPanel.tsx:47-50 — t(`tiering.${platform}.*`)',
  'tiering.vsan.': 'TieringPanel.tsx:47-50 — t(`tiering.${platform}.*`)',
  'tiering.ceph.': 'TieringPanel.tsx:47-50 — t(`tiering.${platform}.*`)',
  'tiering.beegfs.': 'TieringPanel.tsx:47-50 — t(`tiering.${platform}.*`)',
  'carbon.regions.': 'Header.tsx:26 — t(`carbon.regions.${region}`)',
  'theme.': 'ThemeToggle.tsx:97-101 — t(`theme.${pref}`)',
  'resilience.process.': 'ResilienceGuide.tsx:25 — t(`resilience.process.${step}`)',
  'capacity.beegfs.statusValue.':
    'BeeGfsCapacityDetails.tsx:80 — t(`capacity.beegfs.statusValue.${status}`)',
  'pptx.labels.': 'pptxContent.ts:49 — t(`output:pptx.labels.${key}`)',
}

/**
 * Whole namespaces addressed through a wrapper that takes an arbitrary key. Call sites pass
 * literals, so most keys still appear in the scan — but the wrapper means a key can be reached
 * without its full path ever being written out.
 */
const DYNAMIC_NAMESPACES: Record<string, string> = {
  validation: 'validators.ts:26 — i18n.t(`validation:${key}`) via the tv() wrapper',
  pdf: 'exportPdf.ts:45 — i18n.t(`pdf:${key}`) via its t() wrapper',
}

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null
      ? flatten(v as Record<string, unknown>, key)
      : [key]
  })
}

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectTsFiles(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const SOURCE = collectTsFiles(join(REPO_ROOT, 'src'))
  .map((f) => readFileSync(f, 'utf-8'))
  .join('\n')

const NAMESPACES = readdirSync(join(LOCALES_DIR, 'en'))
  .filter((f) => f.endsWith('.json'))
  .sort()

describe('every translation key is reachable', () => {
  for (const nsFile of NAMESPACES) {
    const ns = nsFile.replace('.json', '')
    if (ns in DYNAMIC_NAMESPACES) continue

    it(`${ns} has no orphan keys`, () => {
      const keys = flatten(JSON.parse(readFileSync(join(LOCALES_DIR, 'en', nsFile), 'utf-8')))
      const orphans = keys.filter((key) => {
        if (Object.keys(DYNAMIC_PREFIXES).some((p) => key.startsWith(p))) return false
        const leaf = key.split('.').pop() ?? key
        return !SOURCE.includes(key) && !SOURCE.includes(`'${leaf}'`)
      })

      expect(
        orphans,
        `Orphan keys in ${ns}. Either delete them from all four locales, or — if a key is ` +
          `assembled at runtime — add its prefix to DYNAMIC_PREFIXES with the call site that ` +
          `builds it.`,
      ).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Run it and record the true orphan list**

```bash
rtk npx vitest run tests/i18n/orphanKeys.spec.ts
```

Expected: **FAIL**, with a per-namespace list. This list — not the 117-candidate raw scan — is what Task 7 deletes. Copy it verbatim into the task report.

- [ ] **Step 3: Sanity-check the exemptions actually work**

Confirm `formFactor.u2`, `formFactor.e3s` and `formFactor.m2` are **absent** from the failure output. All three are live via the `formFactor.` prefix, and all three appeared in the naive scan. If they show up as orphans, `DYNAMIC_PREFIXES` is not being applied — fix that before going further, or Task 7 will delete live keys.

- [ ] **Step 4: Commit the test, still failing, with the deletions to follow**

Committing a red test is deliberate here: it records the finding separately from the fix, so a reviewer can see what was found before seeing what was done about it.

```bash
rtk npm run lint:fix
rtk git add tests/i18n/orphanKeys.spec.ts
rtk git commit -m "test(i18n): fail on translation keys nothing reaches

Knip cannot see translation keys, and a naive literal scan condemns live ones:
sixteen call sites build keys at runtime, and the raw scan flagged formFactor.u2,
.e3s and .m2 as orphans when all three are reached via t(\`formFactor.\${value}\`).

DYNAMIC_PREFIXES names each such site and the set feeding it, so an exemption is
a documented fact rather than a shrug.

This test FAILS as committed. The keys it names are deleted in the next commit -
recorded separately so the finding is legible apart from the fix.

The failure mode is why this is a test and not a one-off script: a missing key
does not throw, it renders its own name into the UI."
```

---

### Task 7: Delete the orphan keys across four locales

**Files:**
- Modify: `src/i18n/locales/{en,fr,de,it}/*.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the orphan list produced by Task 6's failing run.
- Produces: nothing.

- [ ] **Step 1: Delete each orphan key from all four locales**

Work from Task 6's list only. For each key, remove it from `en`, `fr`, `de` and `it`. Removing from fewer than four fails the parity test — which is the intended backstop, not an obstacle.

Preserve accents in `fr`/`de`/`it` in any surrounding content you touch (#86).

- [ ] **Step 2: Run the whole i18n suite**

```bash
rtk npx vitest run tests/i18n
```

Expected: **all pass**, including the new orphan test, the parity test and the placeholder-preservation test.

- [ ] **Step 3: Demonstrate the guard is falsifiable**

Add a key that nothing references to `src/i18n/locales/en/common.json`:

```json
"deliberatelyOrphanedProbe": "probe"
```

Run `rtk npx vitest run tests/i18n/orphanKeys.spec.ts`. Expected: **FAIL**, naming `deliberatelyOrphanedProbe`. Quote the message in the task report, then remove the probe and confirm green.

- [ ] **Step 4: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: 1592 passing plus the new i18n cases. **No calculated figure may change** — deleting an unreferenced string cannot move a number.

- [ ] **Step 5: CHANGELOG**

Add to the `### Removed` block created in Task 2:

```markdown
- **Orphaned translation keys across all four locales.** Strings nothing rendered, left behind by
  earlier feature removals. A new test (`tests/i18n/orphanKeys.spec.ts`) now fails on any key the
  source cannot reach, with an explicit allowlist for the sixteen call sites that assemble keys at
  runtime — so the next orphan is caught at commit time rather than accumulating.
```

- [ ] **Step 6: Commit**

```bash
rtk npm run lint:fix
rtk git add src/i18n CHANGELOG.md
rtk git commit -m "i18n: delete orphaned keys across four locales

Strings nothing renders, left behind by earlier feature removals. Deleted from
en/fr/de/it together - the parity test enforces that, and is the backstop for
this whole task.

Falsifiability demonstrated: an unreferenced probe key was added and the orphan
test named it, then removed."
```

---

## Self-Review

**Spec coverage.** Category 1 (dependencies) → Task 2. Category 2 (dead files and functions) → Task 3. Category 3 (superfluous exports, `*Props` excluded) → Task 4. Category 4 (i18n orphans) → Tasks 6 and 7. The gate → Task 5. Knip adoption, which the spec names as the mechanism for categories 1–3 → Task 1. Every spec section maps to a task.

**Placeholders.** Two steps deliberately depend on a report rather than a hard-coded list: Task 4's strip list and Task 7's key list, both produced by a preceding task's failing run. That is the point of running the tool first — hard-coding those lists here would enshrine the same hand-rolled-scan errors the spec exists to avoid. Both steps say exactly where the list comes from and how to split it.

**Type consistency.** `check:dead` is defined in Task 1 and consumed by 2, 3, 4 and 5. `DYNAMIC_PREFIXES` is defined in Task 6 and consumed by Task 7. `knip.json` is created in Task 1 and extended in Task 4 with `ignoreExportsUsedInFile`.

**Ordering.** Knip must come first because its output *is* the work list. The gate must come last because a hook installed while the check fails would block the commit that installs it — Task 5 Step 1 checks for exactly that. The i18n pair sits after the gate because it is enforced by the test suite, not by the hook, and so does not interact with it.

**One risk the plan carries deliberately.** Task 1 may surface findings this plan does not anticipate — the reconnaissance behind the spec used hand-rolled scans that got barrel files and in-file-only exports wrong. Step 4 of Task 1 says to report those rather than delete them silently. More findings is the expected outcome of using a real tool, not a sign the plan is broken.
