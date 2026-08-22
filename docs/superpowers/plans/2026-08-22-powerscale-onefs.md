# PowerScale / OneFS PowerSizer-grade Capacity Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raidy's approximate PowerScale model with a PowerSizer-exact, multi-node-pool OneFS capacity engine driven by a derived Dell node catalog and efficiency table.

**Architecture:** PowerScale stops going through raidy's drive-centric generic volumetry path and gets its own sub-engine under `src/engines/volumetry/powerscale/`. A cluster is 1–8 node pools (tiers); each tier is sized independently from a shipped lookup table keyed by `(nodeModel, protection, nodeCount)`, then summed. Two generated data files (`powerscaleNodes.json`, `powerscaleEfficiency.json`) carry the vendor truth; a 122,828-row fixture proves the engine reproduces it exactly.

**Tech Stack:** TypeScript (strict), Vitest, Zustand, react-i18next, Biome, Vite. Node ≥ 20 for the extraction script (uses `node:zlib`, `node:fs`). Extraction uses `uv run --with openpyxl python3` — do not hand-roll an XLSX parser.

**Spec:** `docs/superpowers/specs/2026-08-22-powerscale-onefs-design.md`

## Global Constraints

- **The `.xlsm` is not redistributable and MUST NOT be committed.** Only derived numeric data and the test fixture are committed. A `*.xlsm` / `*.xlsb` entry goes in `.gitignore` as a guard.
- Biome: 2-space indent, 100-char line width, single quotes, semicolons as-needed. Run `npm run lint:fix` before every commit.
- `noUnusedImports: error`, `noUnusedVariables: error`, `useConst: error`. Dead code fails `npm run check:dead` (pre-commit hook AND prebuild).
- Docs stay in sync **in the same commit** as the code they describe. Stale docs are a defect.
- i18n: write **full literal key paths** at call sites — never `` t(`prefix.${x}.body`) ``. All four locales (en, fr, de, it) get every new key.
- Removing a field from an options object requires deleting it from `src/utils/schemas.ts` in the same change, or URL parsing breaks.
- Component tests that render input panels must stub `window.matchMedia`.
- Path aliases: `@/*`, `@engines/*`, `@components/*`, `@store/*`, `@types/*`, `@utils/*`, `@data/*`, `@hooks/*`.
- Capacities are **bytes** (decimal) throughout raidy's engines. The vendor table is in **TB (decimal, 1e12)**. Convert at the boundary, once, in the catalog loader.
- Run `npm run check:dead` on the main checkout, never inside `.claude/worktrees/*` (it fails spuriously there).
- **`npm test` is `vitest` in WATCH mode and will hang a non-interactive session.** Always use `npm run test:run -- <path>` for a single pass. Never run bare `npm test`.

---

## File Structure

**Created:**
- `scripts/build-powerscale-catalog.mjs` — one-off extraction from the `.xlsm` into the three artifacts below. Not run in CI.
- `src/data/powerscaleNodes.json` — generated node catalog (models, drive sizes, bounds, DRR, usableFactor, protection availability RLE).
- `src/data/powerscaleEfficiency.json` — generated efficiency table + drive-size exceptions.
- `src/data/powerscaleCatalog.ts` — typed accessors over both JSON files. The only module that knows their on-disk shape.
- `src/engines/volumetry/powerscale/index.ts` — cluster orchestrator (sum of tiers).
- `src/engines/volumetry/powerscale/tier.ts` — sizes one node pool.
- `src/engines/volumetry/powerscale/efficiency.ts` — table lookup.
- `src/engines/volumetry/powerscale/onefsFormula.ts` — §3.1 closed form, reference implementation used by tests only.
- `src/engines/volumetry/powerscale/stripeShape.ts` — per-protection stripe geometry, shared by the reference formula and the performance write-penalty model.
- `tests/fixtures/powerscale-powersizer.csv.gz` — all 122,828 vendor rows.
- `tests/engines/volumetry/powerscale/*.spec.ts` — unit + fixture-gate specs.
- `src/components/inputs/topology-options/PowerScaleTierRow.tsx` — one tier's four-field chain.
- `src/components/output/PowerScaleTierTable.tsx` — per-tier output table.
- `docs/adr/0014-vendor-lookup-tables.md` — ADR for shipping a vendor table instead of a formula.

**Modified:**
- `src/types/topology.ts` — `PowerScaleProtection`, `PowerScaleTier`, `PowerScaleOptions`, level collapse, defaults.
- `src/types/results.ts` — `PowerScaleTierResult`, `PowerScaleCapacityDetails`, `VolumetryResult.powerScaleDetails`.
- `src/utils/schemas.ts` — PowerScale topology + options schemas.
- `src/store/slices/topologySlice.ts` — tier add/remove/update actions.
- `src/store/urlStorage.ts` — legacy-link migration shim.
- `src/engines/volumetry/index.ts` — early branch to the sub-engine.
- `src/engines/volumetry/strategies/dell.ts` — drop the PowerScale branch.
- `src/engines/volumetry/helpers/calculationHelpers.ts` — drop the `powerscale` case.
- `src/engines/volumetry/overhead/overheadCalculator.ts` — drop `powerscaleSnapshotReserve`.
- `src/engines/volumetry/postProcessing/capacityEnhancements.ts` — drop the PowerScale branch.
- `src/engines/volumetry/breakdown/buildBreakdown.ts` — drop `powerscaleSnapshotReserve`.
- `src/engines/capabilities.ts` — `hasServerCount: false` for PowerScale.
- `src/engines/performance/strategies/dell.ts` — protection-driven write penalty.
- `src/engines/performance/index.ts` — `powerscaleOptions` on `PerformanceInput`.
- `src/workers/resilienceWorker.ts` — compile under the new level shape.
- `src/hooks/useResilience.ts` — PowerScale simulation-scope resolver (first node pool).
- `src/hooks/usePerformanceCalc.ts` — first-node-pool population.
- `src/hooks/useSustainabilityCalc.ts` — cluster-wide population.
- `src/components/inputs/topology-options/PowerScaleOptionsPanel.tsx` — tier list.
- `src/components/inputs/topology-options/topologyConstants.ts` — single level entry.
- `src/components/layout/OutputDashboard.tsx` — mount the tier table.
- `src/i18n/locales/{en,fr,de,it}/topology.json` + `output.json` — new keys, old ones deleted.
- `.gitignore` — `*.xlsm` guard.
- `docs/ENGINES.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/DEVELOPMENT.md`, `docs/BACKLOG.md`, `CHANGELOG.md`.

---

### Task 1: Extraction script and generated data

Produces the vendor data raidy will ship. Nothing else can start without it.

**Files:**
- Create: `scripts/build-powerscale-catalog.mjs`
- Create: `src/data/powerscaleNodes.json` (generated)
- Create: `src/data/powerscaleEfficiency.json` (generated)
- Create: `tests/fixtures/powerscale-powersizer.csv.gz` (generated)
- Modify: `.gitignore`
- Test: `tests/data/powerscaleData.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the two JSON files, whose exact shapes are:

```jsonc
// powerscaleNodes.json
{
  "generatedFrom": "vendor capacity workbook",
  "rowCount": 122828,
  "models": {
    "F710": {
      "generation": "Gen7",
      "tier": "All Flash",
      "drivesPerNode": 10,
      "minNodes": 3,
      "maxNodes": 252,
      "nodeIncrement": 1,
      "drr": 2.0,
      "driveSizes": {
        "15.36": { "rawPerDriveTb": 15.36, "usableFactor": 0.9916 }
      }
    }
  },
  // index into `protectionSets`, run-length encoded over node count
  "availability": {
    "F710|15.36": { "a": [[3, 0], [9, 4]], "s": [[3, "+2d:1n"]] }
  },
  "protectionSets": [["+2d:1n", "+3d:1n"], ["..."]]
}
```

```jsonc
// powerscaleEfficiency.json
{
  // basis points (efficiency x 10000), one entry per node count from `from`
  "curves": { "F710|+2d:1n": { "from": 3, "bp": [6667, 7500, 8000] } },
  // the 230 keys where efficiency depends on drive size too
  "exceptions": { "H710|15.36|+3n|22": 7250 }
}
```

- [ ] **Step 1: Write the failing test**

`tests/data/powerscaleData.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import efficiency from '@/data/powerscaleEfficiency.json'
import nodes from '@/data/powerscaleNodes.json'

describe('PowerScale generated data', () => {
  it('covers all 22 node models', () => {
    expect(Object.keys(nodes.models)).toHaveLength(22)
    expect(nodes.models).toHaveProperty('F710')
    expect(nodes.models).toHaveProperty('A2000')
  })

  it('records the vendor row count it was derived from', () => {
    expect(nodes.rowCount).toBe(122828)
  })

  it('carries per-model DRR from the workbook', () => {
    expect(nodes.models.A200.drr).toBe(1)
    expect(nodes.models.H710.drr).toBe(1.6)
    expect(nodes.models.F710.drr).toBe(2)
  })

  it('applies the two raw-capacity catalog quirks', () => {
    expect(nodes.models.F210.driveSizes['15.36'].rawPerDriveTb).toBe(15)
    expect(nodes.models.F710.driveSizes['61.44'].rawPerDriveTb).toBe(61)
  })

  it('has an efficiency curve per (model, protection) pair present in the source', () => {
    expect(efficiency.curves['A200|+2n'].bp[0]).toBe(3333) // 3 nodes, mirror fallback
    expect(efficiency.curves['A200|+2d:1n'].from).toBe(3)
  })

  it('records the drive-size-dependent exceptions', () => {
    expect(efficiency.exceptions['H710|15.36|+3n|22']).toBe(7250)
  })

  it('carries end-of-life dates for the models the EOL sheet covers', () => {
    // 'Isilon A200' in the Hardware EOL sheet maps to catalog id 'A200'
    expect(nodes.models.A200.endOfLife).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/data/powerscaleData.spec.ts`
Expected: FAIL — `Cannot find module '@/data/powerscaleNodes.json'`

- [ ] **Step 3: Write the extraction script**

`scripts/build-powerscale-catalog.mjs`. Reads the `.xlsm` via a `uv`-run Python helper (openpyxl in read-only mode; the workbook is 21.7 MB with a 73.6 MB worksheet, so streaming is required), then writes the three artifacts.

```js
#!/usr/bin/env node
// Derives raidy's PowerScale data from Dell's capacity-calculator workbook.
//
// The workbook is not redistributable and is NEVER committed. Pass its path:
//   node scripts/build-powerscale-catalog.mjs ~/path/vendor capacity workbook
//
// Its hidden `the data` sheet holds 122,828 rows exported from Dell's
// PowerSizer. The workbook itself says the numbers are "derived
// directly from PowerSizer. They are not direct calculations" — so we extract
// the table rather than porting formulas.
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const xlsm = process.argv[2]
if (!xlsm) {
  console.error('usage: build-powerscale-catalog.mjs <path-to.xlsm>')
  process.exit(1)
}

// openpyxl read-only streaming; emits TSV on stdout.
const PY = `
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb['the data']
for row in ws.iter_rows(values_only=True):
    if row[0] is None: continue
    sys.stdout.write('\\t'.join('' if c is None else str(c) for c in row) + '\\n')
`
const tsv = execFileSync('uv', ['run', '--quiet', '--with', 'openpyxl', 'python3', '-c', PY, xlsm], {
  maxBuffer: 512 * 1024 * 1024,
  encoding: 'utf8',
})

const lines = tsv.split('\n').filter(Boolean)
const header = lines[0].split('\t')
const col = (name) => header.indexOf(name)
const C = {
  nodes: col('Nodes'),
  protection: col('Protection'),
  raw: col('Raw TB'),
  usable: col('Usable TB'),
  eff: col('Storage Efficiency %'),
  driveCount: col('Drive Count'),
  model: col('Node Model'),
  type: col('Node Type'),
  driveSize: col('Drive Size'),
  effective: col('Effective Capacity TB'),
  protType: col('Protection Type'),
  gen: col('Generation'),
  minNodes: col('Minimum Node Count'),
  maxNodes: col('Maximum Node Count'),
  increment: col('Node Increments'),
}
const rows = lines.slice(1).map((l) => l.split('\t'))
if (rows.length !== 122828) {
  console.error(`expected 122828 data rows, got ${rows.length} — workbook shape changed`)
  process.exit(1)
}

// Efficiency must be a fraction. openpyxl returns the underlying float rather
// than the displayed percentage, so this should always hold — but a silent
// x100 would corrupt every basis-point value in the shipped table, so assert
// rather than trust.
for (const r of rows) {
  const eff = Number(r[C.eff])
  if (!(eff >= 0 && eff <= 1)) {
    console.error(`efficiency out of range: ${r[C.model]}/${r[C.protection]}/${r[C.nodes]} = ${eff}`)
    process.exit(1)
  }
}

const models = {}
const curves = {}
const exceptions = {}
const availability = {}
const protectionSets = []
const setIndex = new Map()

// --- per-model metadata and per-(model,driveSize) raw/usable factors
for (const r of rows) {
  const model = r[C.model]
  const ds = r[C.driveSize]
  const nodes = Number(r[C.nodes])
  const raw = Number(r[C.raw])
  const usable = Number(r[C.usable])
  const eff = Number(r[C.eff])
  const drives = Number(r[C.driveCount])

  const m = (models[model] ??= {
    generation: r[C.gen],
    tier: r[C.type],
    drivesPerNode: drives,
    minNodes: Number(r[C.minNodes]),
    maxNodes: Number(r[C.maxNodes]),
    nodeIncrement: Number(r[C.increment]),
    // drr is filled in after the scan, from the modal ratio across every row
    // for this model — a single row is 2-decimal-rounded and can be off.
    drr: 0,
    _drr: [],
    driveSizes: {},
  })
  if (usable > 0) m._drr.push(Number((Number(r[C.effective]) / usable).toFixed(2)))
  // rawPerDriveTb is the *actual* capacity the sizer used, which differs from the
  // nominal drive size for two catalog entries (F210 @ 15.36 -> 15, F710 @ 61.44 -> 61).
  m.driveSizes[ds] ??= {
    rawPerDriveTb: Number((raw / (nodes * drives)).toFixed(4)),
    usableFactor: 0,
  }
  // usableFactor is per-drive OneFS journal/metadata loss: usable = raw x eff x factor.
  //
  // Fitted by LEAST SQUARES over every row for this (model, driveSize), not
  // averaged and not read off one row: the workbook prints usable to 2 decimals
  // of TB, so a single row is a noisy estimate and small-capacity rows are the
  // noisiest. Least squares weights the large, well-resolved rows correctly.
  const slot = m.driveSizes[ds]
  slot._num = (slot._num ?? 0) + raw * eff * usable
  slot._den = (slot._den ?? 0) + (raw * eff) ** 2
}
// Data reduction ratio is a fixed vendor constant per model (1.0, 1.6 or 2.0).
// Take the mode, not the first row: the workbook's 2-decimal rounding makes
// small configurations noisy.
for (const m of Object.values(models)) {
  const counts = new Map()
  for (const v of m._drr) counts.set(v, (counts.get(v) ?? 0) + 1)
  m.drr = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  delete m._drr
  for (const ds of Object.values(m.driveSizes)) {
    ds.usableFactor = Number((ds._num / ds._den).toFixed(6))
    delete ds._num
    delete ds._den
  }
}

// --- efficiency curves keyed (model, protection), with drive-size exceptions
//
// Two passes. The first finds (model, protection, nodes) keys where efficiency
// ALSO depends on drive size (230 of 25,488). The second builds the curves, and
// writes an explicit exception for EVERY drive size at a conflicting key — not
// just the one that lost a race, which would leave the winner's value silently
// dependent on row order.
const conflicts = new Set()
const firstSeen = new Map()
for (const r of rows) {
  const k = `${r[C.model]}|${r[C.protection]}|${Number(r[C.nodes])}`
  const bp = Math.round(Number(r[C.eff]) * 10000)
  if (!firstSeen.has(k)) firstSeen.set(k, bp)
  else if (firstSeen.get(k) !== bp) conflicts.add(k)
}

const byKey = new Map()
for (const r of rows) {
  const n = Number(r[C.nodes])
  const bp = Math.round(Number(r[C.eff]) * 10000)
  const conflictKey = `${r[C.model]}|${r[C.protection]}|${n}`
  if (conflicts.has(conflictKey)) {
    exceptions[`${r[C.model]}|${r[C.driveSize]}|${r[C.protection]}|${n}`] = bp
    continue
  }
  const seen = (byKey.get(`${r[C.model]}|${r[C.protection]}`) ??= new Map())
  seen.set(n, bp)
}
for (const [key, seen] of byKey) {
  const ns = [...seen.keys()].sort((a, b) => a - b)
  const from = ns[0]
  const bpArr = []
  let prev = seen.get(from)
  for (let n = from; n <= ns[ns.length - 1]; n++) {
    prev = seen.get(n) ?? prev
    bpArr.push(prev)
  }
  curves[key] = { from, bp: bpArr }
}

// --- protection availability and PowerSizer's Suggested level, RLE over node count
const avail = new Map()
const sugg = new Map()
for (const r of rows) {
  const k = `${r[C.model]}|${r[C.driveSize]}`
  const n = Number(r[C.nodes])
  const perN = (avail.get(k) ??= new Map())
  ;(perN.get(n) ?? perN.set(n, new Set()).get(n)).add(r[C.protection])
  if (r[C.protType] === 'Suggested') (sugg.get(k) ?? sugg.set(k, new Map()).get(k)).set(n, r[C.protection])
}
for (const [k, perN] of avail) {
  const a = []
  let prevIdx = null
  for (const n of [...perN.keys()].sort((x, y) => x - y)) {
    const sig = [...perN.get(n)].sort().join(',')
    let idx = setIndex.get(sig)
    if (idx === undefined) {
      idx = protectionSets.length
      setIndex.set(sig, idx)
      protectionSets.push(sig.split(','))
    }
    if (idx !== prevIdx) {
      a.push([n, idx])
      prevIdx = idx
    }
  }
  const s = []
  let prevS = null
  const sm = sugg.get(k) ?? new Map()
  for (const n of [...sm.keys()].sort((x, y) => x - y)) {
    if (sm.get(n) !== prevS) {
      s.push([n, sm.get(n)])
      prevS = sm.get(n)
    }
  }
  availability[k] = { a, s }
}

// --- end-of-life dates from the `Hardware EOL` sheet
// Platform names read 'Isilon A200' / 'PowerScale F600'; catalog ids are 'A200'.
// Dates are Excel serials (days since 1899-12-30).
const EOL_PY = `
import sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb['Hardware EOL']
for row in ws.iter_rows(values_only=True):
    cells = [c for c in row if c is not None]
    if len(cells) >= 3:
        sys.stdout.write('\t'.join(str(c) for c in cells) + '\n')
`
const eolTsv = execFileSync('uv', ['run', '--quiet', '--with', 'openpyxl', 'python3', '-c', EOL_PY, xlsm], {
  maxBuffer: 32 * 1024 * 1024,
  encoding: 'utf8',
})
const serialToIso = (serial) =>
  new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000).toISOString().slice(0, 10)

for (const line of eolTsv.split('\n').filter(Boolean)) {
  const cells = line.split('\t')
  const platform = cells[0]
  const eolSerial = cells[2]
  if (!platform || !/^\d+$/.test(eolSerial ?? '')) continue
  const id = platform.replace(/^(Isilon|PowerScale)\s+/i, '').trim()
  if (models[id]) models[id].endOfLife = serialToIso(eolSerial)
}

writeFileSync(
  'src/data/powerscaleNodes.json',
  `${JSON.stringify({ generatedFrom: 'vendor capacity workbook', rowCount: rows.length, models, availability, protectionSets }, null, 0)}\n`,
)
writeFileSync('src/data/powerscaleEfficiency.json', `${JSON.stringify({ curves, exceptions }, null, 0)}\n`)

// --- test fixture: every vendor row, gzipped
const csv = rows
  .map((r) =>
    [r[C.model], r[C.driveSize], r[C.nodes], r[C.protection], r[C.raw], r[C.usable], r[C.eff]].join(','),
  )
  .join('\n')
writeFileSync('tests/fixtures/powerscale-powersizer.csv.gz', gzipSync(Buffer.from(`${csv}\n`), { level: 9 }))

console.log(`wrote catalog (${Object.keys(models).length} models), efficiency (${Object.keys(curves).length} curves), fixture (${rows.length} rows)`)
```

- [ ] **Step 4: Add the gitignore guard**

Append to `.gitignore`:

```gitignore
# not redistributable sizing workbooks — never commit. Derived data lives in
# src/data/powerscale*.json, regenerated by scripts/build-powerscale-catalog.mjs
*.xlsm
*.xlsb
```

- [ ] **Step 5: Generate the data**

Run: `node scripts/build-powerscale-catalog.mjs ~/Library/CloudStorage/OneDrive-Home/vendor capacity workbook`
Expected: `wrote catalog (22 models), efficiency (... curves), fixture (122828 rows)`

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:run -- tests/data/powerscaleData.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Verify the .xlsm cannot be committed**

Run: `git status --porcelain --ignored | grep xlsm || echo "no xlsm tracked"`
Expected: the workbook path is absent from tracked/staged files.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-powerscale-catalog.mjs src/data/powerscaleNodes.json src/data/powerscaleEfficiency.json tests/fixtures/powerscale-powersizer.csv.gz tests/data/powerscaleData.spec.ts .gitignore
git commit -m "feat(powerscale): derive node catalog and efficiency table from PowerSizer data"
```

---

### Task 2: Typed catalog accessors

Wraps the generated JSON so no other module knows its on-disk shape, and converts TB → bytes once.

**Files:**
- Create: `src/data/powerscaleCatalog.ts`
- Test: `tests/data/powerscaleCatalog.spec.ts`

**Interfaces:**
- Consumes: `src/data/powerscaleNodes.json`, `src/data/powerscaleEfficiency.json` (Task 1).
- Produces:

```ts
export type PowerScaleGeneration = 'Gen6' | 'Gen6.5' | 'Gen7'
export type PowerScaleNodeTier = 'All Flash' | 'Hybrid' | 'Archive'

export interface PowerScaleModel {
  id: string
  generation: PowerScaleGeneration
  tier: PowerScaleNodeTier
  drivesPerNode: number
  minNodes: number
  maxNodes: number
  nodeIncrement: number
  drr: number
  driveSizesTb: number[]
  /** ISO date from the workbook's Hardware EOL sheet; absent when not listed. */
  endOfLife?: string
}

export function listModels(): PowerScaleModel[]
export function getModel(id: string): PowerScaleModel | undefined
export function listDriveSizes(modelId: string): number[]
export function rawPerDriveBytes(modelId: string, driveSizeTb: number): number
export function usableFactor(modelId: string, driveSizeTb: number): number
export function availableProtections(modelId: string, driveSizeTb: number, nodeCount: number): PowerScaleProtection[]
export function suggestedProtection(modelId: string, driveSizeTb: number, nodeCount: number): PowerScaleProtection | undefined
```

- [ ] **Step 1: Write the failing test**

`tests/data/powerscaleCatalog.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  availableProtections,
  getModel,
  listDriveSizes,
  listModels,
  rawPerDriveBytes,
  suggestedProtection,
  usableFactor,
} from '@/data/powerscaleCatalog'

describe('powerscaleCatalog', () => {
  it('lists all 22 models', () => {
    expect(listModels()).toHaveLength(22)
  })

  it('exposes model metadata', () => {
    const m = getModel('F710')
    expect(m?.generation).toBe('Gen7')
    expect(m?.tier).toBe('All Flash')
    expect(m?.drivesPerNode).toBe(10)
    expect(m?.drr).toBe(2)
  })

  it('returns undefined for an unknown model rather than throwing', () => {
    expect(getModel('NOPE')).toBeUndefined()
  })

  it('lists drive sizes ascending', () => {
    const sizes = listDriveSizes('F710')
    expect(sizes.length).toBeGreaterThan(0)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes)
  })

  it('converts raw drive capacity to decimal bytes, honouring catalog quirks', () => {
    expect(rawPerDriveBytes('F710', 15.36)).toBe(15_360_000_000_000)
    // F710 @ 61.44 TB is sized as 61 TB by PowerSizer
    expect(rawPerDriveBytes('F710', 61.44)).toBe(61_000_000_000_000)
  })

  it('returns the per-drive usable factor', () => {
    expect(usableFactor('F710', 15.36)).toBeCloseTo(0.9916, 3)
  })

  it('gates protections by node count', () => {
    const at3 = availableProtections('F200', 1.92, 3)
    const at30 = availableProtections('F200', 1.92, 30)
    expect(at3.length).toBeGreaterThan(0)
    expect(at30.length).toBeGreaterThanOrEqual(at3.length)
    expect(at30).toContain('+2d:1n')
  })

  it('returns PowerSizer suggested protection', () => {
    expect(suggestedProtection('F200', 1.92, 3)).toBe('+2d:1n')
  })

  it('returns an empty protection list for an unknown combination', () => {
    expect(availableProtections('F200', 999, 3)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/data/powerscaleCatalog.spec.ts`
Expected: FAIL — `Cannot find module '@/data/powerscaleCatalog'`

- [ ] **Step 3: Write the implementation**

`src/data/powerscaleCatalog.ts`:

```ts
/**
 * Typed accessors over the generated PowerScale vendor data.
 *
 * This is the ONLY module that knows the on-disk shape of
 * `powerscaleNodes.json` / `powerscaleEfficiency.json`, and the only place
 * TB (the vendor's unit) becomes bytes (raidy's unit).
 *
 * Data is derived from Dell's PowerSizer via
 * `scripts/build-powerscale-catalog.mjs`. See
 * docs/superpowers/specs/2026-08-22-powerscale-onefs-design.md.
 */
import nodesData from '@/data/powerscaleNodes.json'
import type { PowerScaleProtection } from '@/types/topology'

const TB = 1_000_000_000_000

export type PowerScaleGeneration = 'Gen6' | 'Gen6.5' | 'Gen7'
export type PowerScaleNodeTier = 'All Flash' | 'Hybrid' | 'Archive'

export interface PowerScaleModel {
  id: string
  generation: PowerScaleGeneration
  tier: PowerScaleNodeTier
  drivesPerNode: number
  minNodes: number
  maxNodes: number
  nodeIncrement: number
  drr: number
  driveSizesTb: number[]
}

interface RawDriveSize {
  rawPerDriveTb: number
  usableFactor: number
}
interface RawModel {
  generation: PowerScaleGeneration
  tier: PowerScaleNodeTier
  drivesPerNode: number
  minNodes: number
  maxNodes: number
  nodeIncrement: number
  drr: number
  endOfLife?: string
  driveSizes: Record<string, RawDriveSize>
}
interface RawCatalog {
  models: Record<string, RawModel>
  availability: Record<string, { a: [number, number][]; s: [number, string][] }>
  protectionSets: string[][]
}

const catalog = nodesData as unknown as RawCatalog

const MODELS: PowerScaleModel[] = Object.entries(catalog.models)
  .map(([id, m]) => ({
    id,
    generation: m.generation,
    tier: m.tier,
    drivesPerNode: m.drivesPerNode,
    minNodes: m.minNodes,
    maxNodes: m.maxNodes,
    nodeIncrement: m.nodeIncrement,
    drr: m.drr,
    endOfLife: m.endOfLife,
    driveSizesTb: Object.keys(m.driveSizes)
      .map(Number)
      .sort((a, b) => a - b),
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

const BY_ID = new Map(MODELS.map((m) => [m.id, m]))

export function listModels(): PowerScaleModel[] {
  return MODELS
}

export function getModel(id: string): PowerScaleModel | undefined {
  return BY_ID.get(id)
}

export function listDriveSizes(modelId: string): number[] {
  return BY_ID.get(modelId)?.driveSizesTb ?? []
}

function driveSizeEntry(modelId: string, driveSizeTb: number): RawDriveSize | undefined {
  const model = catalog.models[modelId]
  if (!model) return undefined
  // Keys are the workbook's own decimal strings ('15.36', '2'), so match numerically.
  const key = Object.keys(model.driveSizes).find((k) => Number(k) === driveSizeTb)
  return key === undefined ? undefined : model.driveSizes[key]
}

export function rawPerDriveBytes(modelId: string, driveSizeTb: number): number {
  return (driveSizeEntry(modelId, driveSizeTb)?.rawPerDriveTb ?? 0) * TB
}

export function usableFactor(modelId: string, driveSizeTb: number): number {
  return driveSizeEntry(modelId, driveSizeTb)?.usableFactor ?? 1
}

/** Value of a run-length series at `nodeCount`, or undefined below its first breakpoint. */
function rleAt<T>(runs: [number, T][], nodeCount: number): T | undefined {
  let found: T | undefined
  for (const [from, value] of runs) {
    if (from > nodeCount) break
    found = value
  }
  return found
}

export function availableProtections(
  modelId: string,
  driveSizeTb: number,
  nodeCount: number,
): PowerScaleProtection[] {
  const entry = catalog.availability[`${modelId}|${driveSizeTb}`]
  if (!entry) return []
  const idx = rleAt(entry.a, nodeCount)
  if (idx === undefined) return []
  return (catalog.protectionSets[idx] ?? []) as PowerScaleProtection[]
}

export function suggestedProtection(
  modelId: string,
  driveSizeTb: number,
  nodeCount: number,
): PowerScaleProtection | undefined {
  const entry = catalog.availability[`${modelId}|${driveSizeTb}`]
  if (!entry) return undefined
  return rleAt(entry.s, nodeCount) as PowerScaleProtection | undefined
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/data/powerscaleCatalog.spec.ts && npm run typecheck`
Expected: PASS, 9 tests. Typecheck clean. (`PowerScaleProtection` is added in Task 4 — if typecheck fails on that import, add the type union to `src/types/topology.ts` now; it is a three-line addition and Task 4 will build on it.)

- [ ] **Step 5: Commit**

```bash
git add src/data/powerscaleCatalog.ts tests/data/powerscaleCatalog.spec.ts src/types/topology.ts
git commit -m "feat(powerscale): typed accessors over the generated node catalog"
```

---

### Task 3: Efficiency lookup and the OneFS reference formula

**Files:**
- Create: `src/engines/volumetry/powerscale/efficiency.ts`
- Create: `src/engines/volumetry/powerscale/onefsFormula.ts`
- Test: `tests/engines/volumetry/powerscale/efficiency.spec.ts`

**Interfaces:**
- Consumes: `src/data/powerscaleEfficiency.json` (Task 1), `PowerScaleProtection` (Task 2/4).
- Produces:

```ts
// efficiency.ts
export function storageEfficiency(
  modelId: string,
  driveSizeTb: number,
  protection: PowerScaleProtection,
  nodeCount: number,
): number | undefined   // 0-1, or undefined when the vendor table has no such combination

// onefsFormula.ts — reference only, never called in production code
export function onefsClosedForm(protection: PowerScaleProtection, nodeCount: number): number
export const DRIVE_LEVEL_PROTECTIONS: PowerScaleProtection[]
```

- [ ] **Step 1: Write the failing test**

`tests/engines/volumetry/powerscale/efficiency.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { storageEfficiency } from '@/engines/volumetry/powerscale/efficiency'
import { DRIVE_LEVEL_PROTECTIONS, onefsClosedForm } from '@/engines/volumetry/powerscale/onefsFormula'

describe('storageEfficiency', () => {
  it('reads the vendor table', () => {
    expect(storageEfficiency('A200', 8, '+2n', 20)).toBeCloseTo(0.8, 4)
    expect(storageEfficiency('F200', 1.92, '+2n', 20)).toBeCloseTo(0.8889, 4)
  })

  it('applies mirror fallback values below the FEC threshold', () => {
    // +4n on 5 nodes is 5-way mirroring, not (5-4)/5
    expect(storageEfficiency('A200', 8, '+4n', 5)).toBeCloseTo(0.2, 4)
  })

  it('honours drive-size-dependent exceptions', () => {
    expect(storageEfficiency('H710', 15.36, '+3n', 22)).toBeCloseTo(0.725, 4)
  })

  it('returns undefined for a combination the vendor table does not cover', () => {
    expect(storageEfficiency('A200', 8, '+1n', 3)).toBeUndefined()
    expect(storageEfficiency('NOPE', 8, '+2n', 10)).toBeUndefined()
  })
})

describe('onefsClosedForm (reference implementation)', () => {
  it('matches the table for every drive-level protection', () => {
    for (const p of DRIVE_LEVEL_PROTECTIONS) {
      for (let n = 3; n <= 60; n++) {
        const table = storageEfficiency('A200', 8, p, n)
        if (table === undefined) continue
        expect(onefsClosedForm(p, n)).toBeCloseTo(table, 3)
      }
    }
  })

  it('matches the table for node-level protection below the neighborhood split', () => {
    for (let n = 3; n < 20; n++) {
      const table = storageEfficiency('A200', 8, '+2n', n)
      if (table === undefined) continue
      expect(onefsClosedForm('+2n', n)).toBeCloseTo(table, 3)
    }
  })

  it('reproduces the documented stripe caps', () => {
    expect(onefsClosedForm('+2d:1n', 40)).toBeCloseTo(16 / 18, 4)
    expect(onefsClosedForm('+3d:1n', 40)).toBeCloseTo(15 / 18, 4)
    expect(onefsClosedForm('+4d:1n', 40)).toBeCloseTo(16 / 20, 4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/efficiency.spec.ts`
Expected: FAIL — `Cannot find module '@/engines/volumetry/powerscale/efficiency'`

- [ ] **Step 3: Write the implementation**

`src/engines/volumetry/powerscale/onefsFormula.ts`:

```ts
/**
 * OneFS FEC stripe model — REFERENCE IMPLEMENTATION, tests only.
 *
 * Production lookups go through `efficiency.ts`, which reads Dell's own
 * numbers. This closed form is kept because it explains them, and because a
 * divergence between the two is the tripwire for a bad data regeneration.
 *
 * It is exact for every drive-level protection at every node count, and for
 * node-level protection below the neighborhood split (~20 nodes). Above that,
 * node pools split into neighborhoods in a way no closed form reproduced —
 * H710 at 22 nodes with +3n is 0.7250, which needs 15.95 data nodes and so
 * admits no integer neighborhood partition. That is why the table ships.
 *
 * u  = stripe units placed per node
 * M  = FEC (protection) units in the stripe
 * nf = node failures tolerated
 */
import type { PowerScaleProtection } from '@/types/topology'

interface StripeShape {
  u: number
  M: number
  nf: number
}

const SHAPES: Record<PowerScaleProtection, StripeShape> = {
  '+1n': { u: 1, M: 1, nf: 1 },
  '+2n': { u: 1, M: 2, nf: 2 },
  '+3n': { u: 1, M: 3, nf: 3 },
  '+4n': { u: 1, M: 4, nf: 4 },
  '+2d:1n': { u: 2, M: 2, nf: 1 },
  '+3d:1n': { u: 3, M: 3, nf: 1 },
  '+3d:1n1d': { u: 2, M: 3, nf: 1 },
  '+4d:1n': { u: 4, M: 4, nf: 1 },
  '+4d:2n': { u: 2, M: 4, nf: 2 },
}

/** Maximum protection-group width, by FEC unit count. */
const WIDTH_CAP: Record<number, number> = { 1: 18, 2: 18, 3: 18, 4: 20 }

export const DRIVE_LEVEL_PROTECTIONS: PowerScaleProtection[] = [
  '+2d:1n',
  '+3d:1n',
  '+3d:1n1d',
  '+4d:1n',
  '+4d:2n',
]

export function onefsClosedForm(protection: PowerScaleProtection, nodeCount: number): number {
  const shape = SHAPES[protection]
  if (!shape || nodeCount <= 0) return 0
  const { u, M, nf } = shape
  // Too few nodes for FEC: OneFS mirrors instead, capped by the nodes available.
  if (nodeCount < 2 * nf) return 1 / Math.min(nf + 1, nodeCount)
  const width = Math.min(u * nodeCount, WIDTH_CAP[M] ?? 20)
  return (width - M) / width
}
```

`src/engines/volumetry/powerscale/efficiency.ts`:

```ts
/**
 * Storage-efficiency lookup against Dell's PowerSizer export.
 *
 * Efficiency is a function of (node model, protection, node count). 230 of the
 * 25,488 keys also depend on drive size; those live in `exceptions` and win.
 * Values are stored as basis points to keep the table integral and compact.
 */
import efficiencyData from '@/data/powerscaleEfficiency.json'
import type { PowerScaleProtection } from '@/types/topology'

interface Curve {
  from: number
  bp: number[]
}
interface EfficiencyTable {
  curves: Record<string, Curve>
  exceptions: Record<string, number>
}

const table = efficiencyData as unknown as EfficiencyTable

export function storageEfficiency(
  modelId: string,
  driveSizeTb: number,
  protection: PowerScaleProtection,
  nodeCount: number,
): number | undefined {
  const exception = table.exceptions[`${modelId}|${driveSizeTb}|${protection}|${nodeCount}`]
  if (exception !== undefined) return exception / 10000

  const curve = table.curves[`${modelId}|${protection}`]
  if (!curve) return undefined
  const idx = nodeCount - curve.from
  if (idx < 0 || idx >= curve.bp.length) return undefined
  return curve.bp[idx] / 10000
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/efficiency.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engines/volumetry/powerscale tests/engines/volumetry/powerscale
git commit -m "feat(powerscale): PowerSizer efficiency lookup with OneFS reference formula"
```

---

### Task 4: Types, schema, store, and the URL migration

The breaking change. Everything that names the old PowerScale shape moves in one commit so the repo never sits in a half-migrated state.

**Files:**
- Modify: `src/types/topology.ts`
- Modify: `src/types/results.ts`
- Modify: `src/utils/schemas.ts`
- Modify: `src/store/slices/topologySlice.ts`
- Modify: `src/store/urlStorage.ts`
- Test: `tests/store/powerscaleMigration.spec.ts`, `tests/utils/schemas.spec.ts` (extend)

**Interfaces:**
- Consumes: `listModels`, `suggestedProtection` (Task 2).
- Produces:

```ts
export type PowerScaleProtection =
  | '+1n' | '+2n' | '+3n' | '+4n'
  | '+2d:1n' | '+3d:1n' | '+3d:1n1d' | '+4d:1n' | '+4d:2n'

export interface PowerScaleTier {
  nodeModel: string
  driveSizeTb: number
  nodeCount: number
  protection: PowerScaleProtection
  vhsDriveCount: number
  vhsPercent: number
}

export interface PowerScaleOptions {
  tiers: PowerScaleTier[]
}

export const POWERSCALE_MAX_TIERS = 8
export const DEFAULT_POWERSCALE_TIER: PowerScaleTier
export const DEFAULT_POWERSCALE_OPTIONS: PowerScaleOptions

// topologySlice actions
addPowerScaleTier: () => void
removePowerScaleTier: (index: number) => void
updatePowerScaleTier: (index: number, patch: Partial<PowerScaleTier>) => void
```

- [ ] **Step 1: Write the failing test**

`tests/store/powerscaleMigration.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { migratePowerScaleState } from '@/store/urlStorage'

describe('migratePowerScaleState', () => {
  it('leaves non-PowerScale state untouched', () => {
    const state = { topology: { type: 'zfs', level: 'raidz2' } }
    expect(migratePowerScaleState(state)).toBe(state)
  })

  it('collapses the old level and seeds one tier', () => {
    const migrated = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_n2' },
      serverCount: 12,
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 15,
    }) as { topology: { level: string }; powerscaleOptions: { tiers: unknown[] } }

    expect(migrated.topology.level).toBe('powerscale_onefs')
    expect(migrated.powerscaleOptions.tiers).toHaveLength(1)
    expect(migrated.powerscaleOptions.tiers[0]).toMatchObject({
      nodeCount: 12,
      protection: '+2n',
    })
  })

  it('maps every old level to its real protection', () => {
    const cases: [string, string][] = [
      ['powerscale_n1', '+1n'],
      ['powerscale_n2', '+2n'],
      ['powerscale_n2_1', '+2d:1n'],
      ['powerscale_n3', '+3n'],
      ['powerscale_n4', '+4n'],
    ]
    for (const [level, protection] of cases) {
      const m = migratePowerScaleState({
        topology: { type: 'powerscale', level },
        serverCount: 10,
      }) as { powerscaleOptions: { tiers: { protection: string }[] } }
      expect(m.powerscaleOptions.tiers[0].protection).toBe(protection)
    }
  })

  it('falls back to the suggested protection for the removed mirror levels', () => {
    const m = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_mirror_3x' },
      serverCount: 10,
    }) as { powerscaleOptions: { tiers: { protection: string }[] } }
    expect(m.powerscaleOptions.tiers[0].protection).toMatch(/^\+/)
  })

  it('clamps a migrated node count into the model bounds', () => {
    const m = migratePowerScaleState({
      topology: { type: 'powerscale', level: 'powerscale_n2' },
      serverCount: 1,
    }) as { powerscaleOptions: { tiers: { nodeCount: number }[] } }
    expect(m.powerscaleOptions.tiers[0].nodeCount).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/store/powerscaleMigration.spec.ts`
Expected: FAIL — `migratePowerScaleState is not exported`

- [ ] **Step 3: Update the types**

In `src/types/topology.ts`, replace the `PowerScaleTopology` union and `PowerScaleOptions`:

```ts
/**
 * Dell PowerScale topology. A cluster is a set of node pools (tiers), each with
 * its own protection level, so `level` carries no protection — it exists only to
 * identify the platform. Protection lives on `PowerScaleTier`.
 */
export type PowerScaleTopology = 'powerscale_onefs'

/**
 * OneFS protection levels as PowerSizer names them.
 * `+Nn` tolerates N node failures; `+Nd:1n` tolerates N drive failures or 1 node;
 * `+3d:1n1d` tolerates 3 drives, or 1 node plus 1 drive.
 */
export type PowerScaleProtection =
  | '+1n'
  | '+2n'
  | '+3n'
  | '+4n'
  | '+2d:1n'
  | '+3d:1n'
  | '+3d:1n1d'
  | '+4d:1n'
  | '+4d:2n'

/** One PowerScale node pool. */
export interface PowerScaleTier {
  /** Catalog model id, e.g. 'F710'. */
  nodeModel: string
  /** Drive size in decimal TB, as the vendor catalog names it. */
  driveSizeTb: number
  nodeCount: number
  protection: PowerScaleProtection
  /** Virtual Hot Spare expressed in whole drives. 0 disables. */
  vhsDriveCount: number
  /** Virtual Hot Spare expressed as a percentage of usable. 0 disables. */
  vhsPercent: number
}

/**
 * PowerScale cluster configuration.
 *
 * No compression/dedup fields: the data-reduction ratio is a property of the
 * node model in Dell's catalog (1.0, 1.6 or 2.0), not a user-set slider.
 * No snapshot reserve: PowerSizer does not reserve for snapshots, and a
 * non-zero default would put every answer below the source of truth.
 */
export interface PowerScaleOptions {
  tiers: PowerScaleTier[]
}

export const POWERSCALE_MAX_TIERS = 8

export const DEFAULT_POWERSCALE_TIER: PowerScaleTier = {
  nodeModel: 'F210',
  driveSizeTb: 1.92,
  nodeCount: 3,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}

export const DEFAULT_POWERSCALE_OPTIONS: PowerScaleOptions = {
  tiers: [DEFAULT_POWERSCALE_TIER],
}
```

- [ ] **Step 4: Update the schema**

In `src/utils/schemas.ts`, replace the PowerScale topology branch and add the options schema:

```ts
  z.object({
    type: z.literal('powerscale'),
    level: z.literal('powerscale_onefs'),
  }),
```

```ts
/**
 * PowerScale options schema.
 *
 * Nested `z.object()` strips unknown keys but REQUIRES declared ones, so the
 * removed compression/dedup/snapshot fields must not reappear here — a link
 * carrying them is migrated in `urlStorage.ts`, not validated here.
 */
const PowerScaleTierSchema = z.object({
  nodeModel: z.string().min(1).max(16),
  driveSizeTb: z.number().positive().finite(),
  // 3 is the smallest node count any catalog model supports; a crafted link
  // with fewer would find no efficiency curve and silently size to zero.
  nodeCount: z.number().int().min(3).max(252),
  protection: z.enum([
    '+1n',
    '+2n',
    '+3n',
    '+4n',
    '+2d:1n',
    '+3d:1n',
    '+3d:1n1d',
    '+4d:1n',
    '+4d:2n',
  ]),
  vhsDriveCount: z.number().int().min(0).max(64),
  vhsPercent: z.number().min(0).max(50).finite(),
})

const PowerScaleOptionsSchema = z.object({
  tiers: z.array(PowerScaleTierSchema).min(1).max(8),
})
```

Wire `PowerScaleOptionsSchema` in wherever the old PowerScale options schema was referenced.

- [ ] **Step 5: Add the store actions**

In `src/store/slices/topologySlice.ts`, replace `setPowerScaleOptions` in the interface and implementation:

```ts
  addPowerScaleTier: () => void
  removePowerScaleTier: (index: number) => void
  updatePowerScaleTier: (index: number, patch: Partial<PowerScaleTier>) => void
```

```ts
  addPowerScaleTier: () =>
    set((state) => {
      if (state.powerscaleOptions.tiers.length >= POWERSCALE_MAX_TIERS) return state
      return {
        powerscaleOptions: {
          tiers: [...state.powerscaleOptions.tiers, { ...DEFAULT_POWERSCALE_TIER }],
        },
      }
    }),

  removePowerScaleTier: (index) =>
    set((state) => {
      // A cluster always has at least one node pool.
      if (state.powerscaleOptions.tiers.length <= 1) return state
      return {
        powerscaleOptions: {
          tiers: state.powerscaleOptions.tiers.filter((_, i) => i !== index),
        },
      }
    }),

  updatePowerScaleTier: (index, patch) =>
    set((state) => ({
      powerscaleOptions: {
        tiers: state.powerscaleOptions.tiers.map((tier, i) =>
          i === index ? { ...tier, ...patch } : tier,
        ),
      },
    })),
```

- [ ] **Step 6: Write the migration shim**

In `src/store/urlStorage.ts`, add and export:

```ts
/**
 * Migrate a pre-3.1 PowerScale link.
 *
 * Old links carry protection in `topology.level` and a single implicit node
 * pool sized by `serverCount`. They cannot name a node model, so we seed the
 * default model and clamp the node count into its bounds. Delete this shim one
 * release after 3.1.
 */
const LEGACY_PROTECTION: Record<string, PowerScaleProtection> = {
  powerscale_n1: '+1n',
  powerscale_n2: '+2n',
  powerscale_n2_1: '+2d:1n',
  powerscale_n3: '+3n',
  powerscale_n4: '+4n',
}

export function migratePowerScaleState(state: unknown): unknown {
  if (typeof state !== 'object' || state === null) return state
  const s = state as Record<string, unknown>
  const topology = s.topology as { type?: string; level?: string } | undefined
  if (topology?.type !== 'powerscale') return state
  if (topology.level === 'powerscale_onefs') return state

  const model = getModel(DEFAULT_POWERSCALE_TIER.nodeModel)
  const rawNodes = typeof s.serverCount === 'number' ? s.serverCount : DEFAULT_POWERSCALE_TIER.nodeCount
  const nodeCount = Math.min(
    model?.maxNodes ?? 252,
    Math.max(model?.minNodes ?? 3, Math.round(rawNodes)),
  )

  const protection =
    LEGACY_PROTECTION[topology.level ?? ''] ??
    suggestedProtection(DEFAULT_POWERSCALE_TIER.nodeModel, DEFAULT_POWERSCALE_TIER.driveSizeTb, nodeCount) ??
    DEFAULT_POWERSCALE_TIER.protection

  toast.info('Shared link migrated', {
    description:
      'This link used the previous PowerScale model. The node pool was rebuilt with a default node model — please re-check it.',
    duration: 8000,
  })

  return {
    ...s,
    topology: { type: 'powerscale', level: 'powerscale_onefs' },
    powerscaleOptions: {
      tiers: [{ ...DEFAULT_POWERSCALE_TIER, nodeCount, protection }],
    },
  }
}
```

Call it in `getItem`, between envelope parsing and `validateUrlState`:

```ts
      const validated = validateUrlState(migratePowerScaleState(parsed.state))
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:run -- tests/store/powerscaleMigration.spec.ts tests/utils && npm run typecheck`
Expected: migration spec PASS. Typecheck will now report errors in `dell.ts`, `overheadCalculator.ts`, `capacityEnhancements.ts`, `PowerScaleOptionsPanel.tsx`, `performance/strategies/dell.ts` and `resilienceWorker.ts` — those are Tasks 6–10. **Record the exact list**; it is the checklist for the remaining work.

- [ ] **Step 8: Commit**

```bash
git add src/types src/utils/schemas.ts src/store tests/store/powerscaleMigration.spec.ts
git commit -m "feat(powerscale)!: tier-based cluster options, protection per node pool

BREAKING CHANGE: topology.level collapses to powerscale_onefs and protection
moves into PowerScaleOptions.tiers[]. Pre-3.1 links are migrated on read."
```

---

### Task 5: Tier sizing

One node pool, end to end. Pure function, no store, no React.

**Files:**
- Create: `src/engines/volumetry/powerscale/tier.ts`
- Test: `tests/engines/volumetry/powerscale/tier.spec.ts`

**Interfaces:**
- Consumes: `rawPerDriveBytes`, `usableFactor`, `getModel` (Task 2); `storageEfficiency` (Task 3); `PowerScaleTier` (Task 4).
- Produces:

```ts
export function sizeTier(tier: PowerScaleTier): PowerScaleTierResult | null
// null when the vendor catalog has no such combination
```

- [ ] **Step 1: Write the failing test**

`tests/engines/volumetry/powerscale/tier.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTier } from '@/types/topology'

const base: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 3,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}

describe('sizeTier', () => {
  it('reproduces a PowerSizer row exactly', () => {
    // Vendor row: F200, 1.92 TB, 3 nodes, +2d:1n -> raw 23.04 TB, usable 15.16 TB
    const r = sizeTier(base)
    expect(r).not.toBeNull()
    expect(r?.rawCapacity).toBeCloseTo(23.04e12, -8)
    expect(r?.usableCapacity ?? 0).toBeGreaterThan(15.1e12)
    expect(r?.usableCapacity ?? 0).toBeLessThan(15.25e12)
  })

  it('applies the per-model data reduction ratio', () => {
    const r = sizeTier(base)
    expect(r?.drr).toBe(2)
    expect(r?.effectiveCapacity).toBeCloseTo((r?.usableLessVhs ?? 0) * 2, -6)
  })

  it('uses a DRR of 1.0 for models without inline reduction', () => {
    const r = sizeTier({ ...base, nodeModel: 'A200', driveSizeTb: 8, nodeCount: 10, protection: '+2n' })
    expect(r?.drr).toBe(1)
    expect(r?.effectiveCapacity).toBeCloseTo(r?.usableLessVhs ?? 0, -6)
  })

  it('reserves virtual hot spare drives at the vendor 2.2 multiplier', () => {
    // Workbook: VHS by drives = vhsDriveCount x driveSizeTb x 2.2, on the
    // NOMINAL drive size - not scaled by efficiency or usableFactor.
    const r = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 2, vhsPercent: 0 })
    expect(r?.vhsReserve).toBeCloseTo(2 * 1.92 * 2.2 * 1e12, -6)
    expect(r?.vhsSource).toBe('driveCount')
  })

  it('applies the larger of the two virtual hot spare reserves', () => {
    const byDrives = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 2, vhsPercent: 1 })
    expect(byDrives?.vhsSource).toBe('driveCount')

    const byPercent = sizeTier({ ...base, nodeCount: 10, vhsDriveCount: 1, vhsPercent: 25 })
    expect(byPercent?.vhsSource).toBe('percent')
    expect(byPercent?.usableLessVhs ?? 0).toBeCloseTo((byPercent?.usableCapacity ?? 0) * 0.75, -6)
  })

  it('never lets the reserve drive usable capacity negative', () => {
    const r = sizeTier({ ...base, nodeCount: 3, vhsDriveCount: 999 })
    expect(r?.usableLessVhs).toBe(0)
    expect(r?.effectiveCapacity).toBe(0)
  })

  it('returns null for a combination the vendor catalog does not cover', () => {
    expect(sizeTier({ ...base, protection: '+1n', nodeModel: 'A200' })).toBeNull()
    expect(sizeTier({ ...base, nodeModel: 'NOPE' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/tier.spec.ts`
Expected: FAIL — `Cannot find module '@/engines/volumetry/powerscale/tier'`

- [ ] **Step 3: Write the implementation**

`src/engines/volumetry/powerscale/tier.ts`:

```ts
/**
 * Sizes one PowerScale node pool.
 *
 *   raw       = nodes x drivesPerNode x rawPerDrive
 *   usable    = raw x efficiency x usableFactor
 *   lessVHS   = usable - max(vhsByDriveCount, vhsByPercent)
 *   effective = lessVHS x drr(model)
 *
 * Every factor comes from Dell's PowerSizer export; none is computed here.
 */
import { getModel, rawPerDriveBytes, usableFactor } from '@/data/powerscaleCatalog'
import type { PowerScaleTierResult } from '@/types/results'
import type { PowerScaleTier } from '@/types/topology'
import { storageEfficiency } from './efficiency'

/** Decimal TB, the unit the vendor catalog uses. */
const TB = 1_000_000_000_000

export function sizeTier(tier: PowerScaleTier): PowerScaleTierResult | null {
  const model = getModel(tier.nodeModel)
  if (!model) return null

  const efficiency = storageEfficiency(
    tier.nodeModel,
    tier.driveSizeTb,
    tier.protection,
    tier.nodeCount,
  )
  if (efficiency === undefined) return null

  const perDrive = rawPerDriveBytes(tier.nodeModel, tier.driveSizeTb)
  if (perDrive <= 0) return null

  const rawCapacity = tier.nodeCount * model.drivesPerNode * perDrive
  const usableCapacity = rawCapacity * efficiency * usableFactor(tier.nodeModel, tier.driveSizeTb)

  // Virtual Hot Spare, taken verbatim from the workbook (PowerScale Calculator L7/N7/Q7):
  //
  //   VHS by drives  = vhsDriveCount x driveSizeTb x 2.2
  //   VHS by percent = usable x vhsPercent
  //   usable less VHS = usable - (whichever reserve is larger)
  //
  // The 2.2 is a flat vendor constant applied to the NOMINAL drive size. It is
  // deliberately not multiplied by efficiency or usableFactor - the workbook
  // does neither, and "correcting" it to align units would diverge from the
  // source of truth.
  const vhsByDrives = tier.vhsDriveCount * tier.driveSizeTb * 2.2 * TB
  const vhsByPercent = usableCapacity * (tier.vhsPercent / 100)
  const vhsSource: PowerScaleTierResult['vhsSource'] =
    vhsByDrives >= vhsByPercent ? 'driveCount' : 'percent'
  const vhsReserve = Math.min(usableCapacity, Math.max(vhsByDrives, vhsByPercent))

  const usableLessVhs = Math.max(0, usableCapacity - vhsReserve)

  return {
    nodeModel: tier.nodeModel,
    driveSizeTb: tier.driveSizeTb,
    nodeCount: tier.nodeCount,
    protection: tier.protection,
    drivesPerNode: model.drivesPerNode,
    rawCapacity,
    usableCapacity,
    vhsReserve,
    vhsSource,
    usableLessVhs,
    effectiveCapacity: usableLessVhs * model.drr,
    efficiency,
    drr: model.drr,
    generation: model.generation,
    tier: model.tier,
    endOfLife: model.endOfLife,
  }
}
```

Add `PowerScaleTierResult` and `PowerScaleCapacityDetails` to `src/types/results.ts` exactly as specified in the design doc §5, and add `powerScaleDetails?: PowerScaleCapacityDetails` to `VolumetryResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/tier.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engines/volumetry/powerscale/tier.ts src/types/results.ts tests/engines/volumetry/powerscale/tier.spec.ts
git commit -m "feat(powerscale): size one node pool from the vendor catalog"
```

---

### Task 6: Cluster orchestrator and engine branch

**Files:**
- Create: `src/engines/volumetry/powerscale/index.ts`
- Modify: `src/engines/volumetry/index.ts`
- Modify: `src/engines/volumetry/breakdown/buildBreakdown.ts`
- Test: `tests/engines/volumetry/powerscale/cluster.spec.ts`

**Interfaces:**
- Consumes: `sizeTier` (Task 5).
- Produces:

```ts
export function calculatePowerScaleVolumetry(options: PowerScaleOptions): VolumetryResult
```

- [ ] **Step 1: Write the failing test**

`tests/engines/volumetry/powerscale/cluster.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTier } from '@/types/topology'

const flash: PowerScaleTier = {
  nodeModel: 'F200',
  driveSizeTb: 1.92,
  nodeCount: 6,
  protection: '+2d:1n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}
const archive: PowerScaleTier = {
  nodeModel: 'A200',
  driveSizeTb: 8,
  nodeCount: 12,
  protection: '+2n',
  vhsDriveCount: 0,
  vhsPercent: 0,
}

describe('calculatePowerScaleVolumetry', () => {
  it('sizes a single-tier cluster as that tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash] })
    const t = sizeTier(flash)
    expect(r.rawCapacity).toBe(t?.rawCapacity)
    expect(r.usableCapacity).toBe(t?.usableLessVhs)
  })

  it('sums a heterogeneous cluster tier by tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    const a = sizeTier(flash)
    const b = sizeTier(archive)
    expect(r.rawCapacity).toBeCloseTo((a?.rawCapacity ?? 0) + (b?.rawCapacity ?? 0), -6)
    expect(r.usableCapacity).toBeCloseTo((a?.usableLessVhs ?? 0) + (b?.usableLessVhs ?? 0), -6)
    expect(r.effectiveCapacity).toBeCloseTo(
      (a?.effectiveCapacity ?? 0) + (b?.effectiveCapacity ?? 0),
      -6,
    )
  })

  it('reports cluster efficiency as total usable over total raw, not an average', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    expect(r.efficiency).toBeCloseTo((r.usableCapacity / r.rawCapacity) * 100, 6)
  })

  it('exposes one details row per tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    expect(r.powerScaleDetails?.tiers).toHaveLength(2)
    expect(r.powerScaleDetails?.tiers[1].nodeModel).toBe('A200')
  })

  it('drops a tier the catalog cannot size and keeps the rest', () => {
    const r = calculatePowerScaleVolumetry({
      tiers: [flash, { ...archive, nodeModel: 'NOPE' }],
    })
    expect(r.powerScaleDetails?.tiers).toHaveLength(1)
    expect(r.rawCapacity).toBe(sizeTier(flash)?.rawCapacity)
  })

  it('returns a zero state when no tier can be sized', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [{ ...flash, nodeModel: 'NOPE' }] })
    expect(r.rawCapacity).toBe(0)
    expect(r.usableCapacity).toBe(0)
    expect(r.efficiency).toBe(0)
    expect(r.breakdown).toEqual([])
  })

  it('builds one parity breakdown segment per tier', () => {
    const r = calculatePowerScaleVolumetry({ tiers: [flash, archive] })
    const parity = r.breakdown.filter((b) => b.category === 'parity')
    expect(parity).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/cluster.spec.ts`
Expected: FAIL — `Cannot find module '@/engines/volumetry/powerscale'`

- [ ] **Step 3: Write the orchestrator**

`src/engines/volumetry/powerscale/index.ts`:

```ts
/**
 * PowerScale cluster volumetry.
 *
 * A cluster is 1-8 node pools (tiers), each sized independently against Dell's
 * PowerSizer export and then summed. Tiers are genuinely independent: OneFS
 * protection, stripe width and neighborhood splitting are all per node pool.
 *
 * PowerScale does not go through the generic drive-centric path in
 * `../index.ts` — there is no single drive, no single count and no single
 * efficiency to feed it.
 */
import type { PowerScaleTierResult, VolumetryResult } from '@/types/results'
import type { PowerScaleOptions } from '@/types/topology'
import { buildPowerScaleBreakdown } from '../breakdown/buildBreakdown'
import { sizeTier } from './tier'

const ZERO_STATE: VolumetryResult = {
  rawCapacity: 0,
  parityOverhead: 0,
  hotSpareOverhead: 0,
  filesystemOverhead: 0,
  slopOverhead: 0,
  usableCapacity: 0,
  effectiveCapacity: 0,
  efficiency: 0,
  breakdown: [],
}

export function calculatePowerScaleVolumetry(options: PowerScaleOptions): VolumetryResult {
  const tiers = options.tiers
    .map(sizeTier)
    .filter((t): t is PowerScaleTierResult => t !== null)

  if (tiers.length === 0) return { ...ZERO_STATE }

  const rawCapacity = tiers.reduce((sum, t) => sum + t.rawCapacity, 0)
  const usableCapacity = tiers.reduce((sum, t) => sum + t.usableLessVhs, 0)
  const effectiveCapacity = tiers.reduce((sum, t) => sum + t.effectiveCapacity, 0)
  const parityOverhead = tiers.reduce(
    (sum, t) => sum + (t.rawCapacity - t.usableCapacity),
    0,
  )
  const hotSpareOverhead = tiers.reduce((sum, t) => sum + t.vhsReserve, 0)

  return {
    rawCapacity,
    parityOverhead,
    hotSpareOverhead,
    filesystemOverhead: 0,
    slopOverhead: 0,
    usableCapacity,
    effectiveCapacity,
    efficiency: rawCapacity > 0 ? (usableCapacity / rawCapacity) * 100 : 0,
    breakdown: buildPowerScaleBreakdown(tiers, usableCapacity),
    powerScaleDetails: {
      tiers,
      clusterRaw: rawCapacity,
      clusterUsable: usableCapacity,
      clusterEffective: effectiveCapacity,
      clusterEfficiency: rawCapacity > 0 ? usableCapacity / rawCapacity : 0,
    },
  }
}
```

Add `buildPowerScaleBreakdown(tiers, usableCapacity)` to `src/engines/volumetry/breakdown/buildBreakdown.ts`, emitting one `usable` segment plus, per tier, a `parity` segment labelled with the model and protection and a `hotSpare` segment when `vhsReserve > 0`. Follow the existing segment shape in that file exactly.

- [ ] **Step 4: Branch in the main engine**

In `src/engines/volumetry/index.ts`, immediately after `validateTopology`:

```ts
  // PowerScale is node-pool-centric and multi-tier: it has no single drive,
  // drive count or efficiency, so it does not fit the generic chain below.
  if (topology.type === 'powerscale') {
    return calculatePowerScaleVolumetry(powerscaleOptions)
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:run -- tests/engines/volumetry && npm run typecheck`
Expected: cluster spec PASS, 7 tests. Existing volumetry specs still pass except any that assert the old PowerScale behaviour — update those to the new shape (they should now construct tiers).

- [ ] **Step 6: Commit**

```bash
git add src/engines/volumetry tests/engines/volumetry
git commit -m "feat(powerscale): multi-tier cluster orchestrator with per-tier breakdown"
```

---

### Task 7: Retire the generic PowerScale paths

The old branches are now unreachable. `check:dead` will fail until they are gone.

**Files:**
- Modify: `src/engines/volumetry/strategies/dell.ts`
- Modify: `src/engines/volumetry/helpers/calculationHelpers.ts`
- Modify: `src/engines/volumetry/overhead/overheadCalculator.ts`
- Modify: `src/engines/volumetry/postProcessing/capacityEnhancements.ts`
- Modify: `src/engines/volumetry/breakdown/buildBreakdown.ts`
- Modify: `src/engines/capabilities.ts`
- Modify: `src/engines/performance/strategies/dell.ts`
- Modify: `src/workers/resilienceWorker.ts`
- Test: `tests/engines/capabilities.spec.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 4–6.
- Produces: no new exports; removes `powerscaleSnapshotReserve` from `OverheadResult`.

- [ ] **Step 1: Write the failing test**

Extend `tests/engines/capabilities.spec.ts`:

```ts
  it('hides the shared servers slider for PowerScale, whose nodes are per tier', () => {
    expect(PLATFORM_CAPABILITIES.powerscale.hasServerCount).toBe(false)
  })

  it('keeps compression and dedup off for PowerScale — DRR is a node-model property', () => {
    expect(PLATFORM_CAPABILITIES.powerscale.supportsCompression).toBe(false)
    expect(PLATFORM_CAPABILITIES.powerscale.supportsDedup).toBe(false)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/engines/capabilities.spec.ts`
Expected: FAIL — `expected true to be false` on `hasServerCount`.

- [ ] **Step 3: Remove the dead branches**

1. `src/engines/volumetry/strategies/dell.ts`: delete the `if (level.startsWith('powerscale_'))` block and the `DellPowerscaleOptions` interface. Update the file's doc comment to drop PowerScale and say where it went.
2. `src/engines/volumetry/helpers/calculationHelpers.ts`: delete the `case 'powerscale':` from the options switch, and remove `'powerscale'` from the `dellStrategy` group in `getStrategy` — PowerScale never reaches `getDataFraction` now. If that leaves the `powerscale` case unhandled, `assertNever` will catch it at compile time; return `raidStrategy` is **wrong** — instead keep `case 'powerscale':` mapped to `dellStrategy` with a comment that it is unreachable, or add it to a dedicated `never` guard. Prefer: keep the case, add `// unreachable: handled before getDataFraction, see volumetry/index.ts`.
3. `src/engines/volumetry/overhead/overheadCalculator.ts`: delete `powerscaleSnapshotReserve` from `OverheadResult`, its computation, its subtraction in `capacityForFs`, its term in `totalOverhead`, its return-object entry, and `powerscaleOptions` from `OverheadInput`.
4. `src/engines/volumetry/postProcessing/capacityEnhancements.ts`: delete the `if (topology.type === 'powerscale')` block and `powerscaleOptions` from the options parameter.
5. `src/engines/volumetry/breakdown/buildBreakdown.ts`: delete `powerscaleSnapshotReserve` from the input and its segment.
6. `src/engines/volumetry/index.ts`: remove the now-unused destructured `powerscaleSnapshotReserve` and the `powerscaleOptions` arguments passed to `calculateOverheads` / `applyCompressionDedup`.
7. `src/engines/capabilities.ts`: set `powerscale.hasServerCount` to `false`, and update the comment block above `PLATFORM_CAPABILITIES` to say PowerScale's node counts are per tier.

- [ ] **Step 4: Make performance and resilience compile**

`src/engines/performance/strategies/dell.ts` and `src/workers/resilienceWorker.ts` reference
the deleted level strings. Get them compiling here — delete the dead `powerscale_n*` cases and
have `getWritePenalty` return its existing `3.0` default for `powerscale_onefs` — and leave a
marker:

```ts
// TODO(Task 8): PowerScale protection moved to the tier. Until this reads the
// tier's protection, every level prices at the default penalty.
```

**Do not stop here.** A default penalty for all nine protection levels is wrong, and the
populations these engines read are stale the moment Task 7 hides the Hardware panel. Task 8
fixes both; this step only keeps the tree green between commits.

- [ ] **Step 5: Run the full gates**

Run: `npm run lint:fix && npm run typecheck && npm run test:run && npm run check:dead`
Expected: all clean. `check:dead` must report no unused exports — run it on the main checkout, not a worktree.

- [ ] **Step 6: Commit**

```bash
git add src/engines src/workers tests/engines/capabilities.spec.ts
git commit -m "refactor(powerscale): retire the generic drive-centric PowerScale paths"
```

---

### Task 8: Wire performance, resilience and sustainability to the tier model

**Why this is not optional.** Task 7 hides the shared Hardware panel for PowerScale
(`hasServerCount: false`), but three other engines still derive their populations from
`driveCount * effServerCount` — the very inputs the panel no longer sets. Left alone they read
stale or default values and silently produce numbers for a cluster nobody configured. This is
worse than being wrong: it is confidently wrong on a dashboard that looks correct.

Scope differs per engine, deliberately:

- **Performance and resilience** model the **first node pool only**. Both are per-pool
  physical phenomena and raidy has no concept of a workload spread across heterogeneous pools;
  modelling a mixed cluster as one homogeneous pool would invent a result. Say so in the UI.
- **Sustainability** sums **every tier**. Power, cooling and TCO are additive across the whole
  cluster, so first-tier-only would understate a multi-tier cluster's footprint by design.

**Files:**
- Modify: `src/hooks/useResilience.ts`
- Modify: `src/hooks/usePerformanceCalc.ts`
- Modify: `src/hooks/useSustainabilityCalc.ts`
- Modify: `src/engines/performance/index.ts`
- Modify: `src/engines/performance/strategies/dell.ts`
- Create: `src/engines/volumetry/powerscale/stripeShape.ts`
- Test: `tests/hooks/powerscaleScopes.spec.ts`, `tests/engines/performance.spec.ts` (extend)

**Interfaces:**
- Consumes: `getModel` (Task 2), `PowerScaleOptions` / `PowerScaleTier` (Task 4).
- Produces:

```ts
// stripeShape.ts — shared by the closed-form reference AND the performance engine
export interface StripeShape { u: number; M: number; nf: number }
export const STRIPE_SHAPES: Record<PowerScaleProtection, StripeShape>

// powerscale/index.ts
export function powerScaleDriveTotals(options: PowerScaleOptions): {
  firstTierDrives: number
  firstTierNodes: number
  firstTierSpareDrives: number
  clusterDrives: number
  clusterNodes: number
}
```

- [ ] **Step 1: Write the failing test**

`tests/hooks/powerscaleScopes.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
import type { PowerScaleOptions } from '@/types/topology'

// F200 has 4 drives/node, A200 has 15.
const twoTier: PowerScaleOptions = {
  tiers: [
    {
      nodeModel: 'F200',
      driveSizeTb: 1.92,
      nodeCount: 6,
      protection: '+2d:1n',
      vhsDriveCount: 2,
      vhsPercent: 0,
    },
    {
      nodeModel: 'A200',
      driveSizeTb: 8,
      nodeCount: 12,
      protection: '+2n',
      vhsDriveCount: 0,
      vhsPercent: 0,
    },
  ],
}

describe('powerScaleDriveTotals', () => {
  it('reports the first tier for per-pool engines', () => {
    const t = powerScaleDriveTotals(twoTier)
    expect(t.firstTierNodes).toBe(6)
    expect(t.firstTierDrives).toBe(24) // 6 nodes x 4 drives
    expect(t.firstTierSpareDrives).toBe(2)
  })

  it('sums every tier for cluster-wide engines', () => {
    const t = powerScaleDriveTotals(twoTier)
    expect(t.clusterNodes).toBe(18) // 6 + 12
    expect(t.clusterDrives).toBe(204) // 24 + 180
  })

  it('ignores tiers naming an unknown model rather than counting them as zero-drive nodes', () => {
    const t = powerScaleDriveTotals({
      tiers: [twoTier.tiers[0], { ...twoTier.tiers[1], nodeModel: 'NOPE' }],
    })
    expect(t.clusterNodes).toBe(6)
    expect(t.clusterDrives).toBe(24)
  })

  it('returns zeroes for an empty tier list rather than throwing', () => {
    const t = powerScaleDriveTotals({ tiers: [] })
    expect(t).toEqual({
      firstTierDrives: 0,
      firstTierNodes: 0,
      firstTierSpareDrives: 0,
      clusterDrives: 0,
      clusterNodes: 0,
    })
  })
})
```

Extend `tests/engines/performance.spec.ts`:

```ts
  it('derives the PowerScale write penalty from the protection stripe shape', () => {
    // penalty = FEC units + 1.5, the rule the pre-existing +1n..+4n values follow
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs', { protection: '+1n' })).toBe(2.5)
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs', { protection: '+2n' })).toBe(3.5)
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs', { protection: '+4n' })).toBe(5.5)
    // drive-level levels carry the same FEC count as their node-level peers
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs', { protection: '+2d:1n' })).toBe(3.5)
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs', { protection: '+4d:2n' })).toBe(5.5)
  })

  it('falls back to a neutral penalty when no protection is supplied', () => {
    expect(dellPerformanceStrategy.getWritePenalty('powerscale_onefs')).toBe(3.0)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/hooks/powerscaleScopes.spec.ts tests/engines/performance.spec.ts`
Expected: FAIL — `powerScaleDriveTotals` is not exported; `getWritePenalty` ignores its second argument.

- [ ] **Step 3: Extract the shared stripe shape**

Move the `SHAPES` map out of `onefsFormula.ts` into
`src/engines/volumetry/powerscale/stripeShape.ts` so the performance engine and the reference
formula cannot drift apart:

```ts
/**
 * OneFS stripe geometry per protection level.
 *
 * u  = stripe units placed per node
 * M  = FEC (protection) units in the stripe
 * nf = node failures tolerated
 *
 * Shared by the capacity reference formula and the performance write-penalty
 * model, so the two can never disagree about what '+3d:1n1d' means.
 */
import type { PowerScaleProtection } from '@/types/topology'

export interface StripeShape {
  u: number
  M: number
  nf: number
}

export const STRIPE_SHAPES: Record<PowerScaleProtection, StripeShape> = {
  '+1n': { u: 1, M: 1, nf: 1 },
  '+2n': { u: 1, M: 2, nf: 2 },
  '+3n': { u: 1, M: 3, nf: 3 },
  '+4n': { u: 1, M: 4, nf: 4 },
  '+2d:1n': { u: 2, M: 2, nf: 1 },
  '+3d:1n': { u: 3, M: 3, nf: 1 },
  '+3d:1n1d': { u: 2, M: 3, nf: 1 },
  '+4d:1n': { u: 4, M: 4, nf: 1 },
  '+4d:2n': { u: 2, M: 4, nf: 2 },
}
```

`onefsFormula.ts` imports `STRIPE_SHAPES` instead of declaring its own.

- [ ] **Step 4: Add the totals helper**

Append to `src/engines/volumetry/powerscale/index.ts`:

```ts
/**
 * Drive and node populations for the engines that do not compute capacity.
 *
 * Performance and resilience use the FIRST tier: both are per-node-pool
 * physical phenomena, and raidy cannot express a workload spread across
 * heterogeneous pools. Sustainability uses the cluster totals: power and TCO
 * are additive.
 */
export function powerScaleDriveTotals(options: PowerScaleOptions) {
  let clusterDrives = 0
  let clusterNodes = 0
  let firstTierDrives = 0
  let firstTierNodes = 0
  let firstTierSpareDrives = 0
  let seenFirst = false

  for (const tier of options.tiers) {
    const model = getModel(tier.nodeModel)
    // A tier naming an unknown model contributes nothing; counting its nodes
    // with zero drives would understate density everywhere downstream.
    if (!model) continue
    const drives = tier.nodeCount * model.drivesPerNode
    clusterDrives += drives
    clusterNodes += tier.nodeCount
    if (!seenFirst) {
      firstTierDrives = drives
      firstTierNodes = tier.nodeCount
      firstTierSpareDrives = tier.vhsDriveCount
      seenFirst = true
    }
  }

  return { firstTierDrives, firstTierNodes, firstTierSpareDrives, clusterDrives, clusterNodes }
}
```

- [ ] **Step 5: Wire the resilience scope resolver**

`src/hooks/useResilience.ts` already dispatches per platform through
`SIMULATION_SCOPE_BY_TOPOLOGY` (a `Partial<Record<Topology['type'], SimulationScopeResolver>>`
at line 223). Add `powerscaleOptions` to `SimulationScopeContext` and register a resolver.

A resolver returns a `PlatformSimulationScope`, which requires `mediaDrive`. Return **`null`**
for it — that is the contract's "keep the Hardware panel's drive", and it is the right answer
here: the vendor catalog carries capacities but no AFR, URE or MTBF, so the Hardware panel's
drive remains the only source of reliability characteristics. Do not synthesise a drive with
invented reliability numbers.

```ts
  /**
   * PowerScale: the population comes from the FIRST node pool's catalog geometry,
   * never from the Hardware panel — that panel is hidden for PowerScale, so its
   * driveCount/serverCount are stale defaults.
   *
   * `mediaDrive: null` keeps the Hardware panel's drive for reliability: the
   * vendor catalog gives capacities, not AFR/URE/MTBF, and inventing those
   * would fabricate the very numbers the simulation reports.
   *
   * Nodes are the failure-isolation groups: OneFS protection is per node pool
   * and `+Nn` tolerates whole-node loss.
   */
  powerscale: ({ powerscaleOptions }) => {
    if (!powerscaleOptions) return null
    const { firstTierDrives, firstTierNodes, firstTierSpareDrives } =
      powerScaleDriveTotals(powerscaleOptions)
    if (firstTierDrives === 0) return { driveCount: 0, groupCount: 1, mediaDrive: null }
    return {
      driveCount: Math.max(0, firstTierDrives - firstTierSpareDrives),
      groupCount: firstTierNodes,
      mediaDrive: null,
    }
  },
```

Thread `powerscaleOptions` into the context at the call site (line ~495) the same way
`tieringOptions` is threaded today. Do **not** call `useConfigStore.getState()` inside the
resolver: these resolvers are pure functions of their context, and reaching into the store
would break that and make them untestable.

- [ ] **Step 6: Wire the performance hook and write penalty**

In `src/hooks/usePerformanceCalc.ts`, after `effServerCount` is computed, override for
PowerScale:

```ts
    // PowerScale sizes from the first node pool's catalog geometry: the shared
    // Hardware panel is hidden for this platform, so driveCount/serverCount are
    // stale. Performance for a heterogeneous cluster is not modelled — see
    // docs/BACKLOG.md.
    const psTotals =
      topology.type === 'powerscale' ? powerScaleDriveTotals(powerscaleOptions) : null

    const totalDriveCount = psTotals ? psTotals.firstTierDrives : driveCount * effServerCount
    const totalHotSpares = psTotals
      ? psTotals.firstTierSpareDrives
      : usesDistributedSpares(topology.type)
        ? 0
        : hotSpares * effServerCount
    const nodeCount = psTotals ? psTotals.firstTierNodes : effServerCount
```

Use `nodeCount` wherever `effServerCount` was passed as the server count, add
`powerscaleOptions` to the hook's store destructuring and to its `useMemo` dependency array,
and add `powerscaleOptions?: PowerScaleOptions` to `PerformanceInput` in
`src/engines/performance/index.ts`, passing it through `getRaidWritePenalty` as `options`.

In `src/engines/performance/strategies/dell.ts`, replace the five deleted `powerscale_*` cases
with a single protection-driven branch:

```ts
  getWritePenalty(level: string, options?: unknown): number {
    // PowerScale protection now lives on the tier, not the level. The penalty
    // follows the FEC unit count the pre-existing +1n..+4n values already
    // encoded: 2.5, 3.5, 4.5, 5.5 for M = 1..4, i.e. M + 1.5. Drive-level
    // levels carry the same FEC count as their node-level peers, so +2d:1n
    // prices like +2n — which is also what the old powerscale_n2_1 case did.
    if (level === 'powerscale_onefs') {
      const protection = (options as { protection?: PowerScaleProtection } | undefined)?.protection
      if (!protection) return 3.0
      return STRIPE_SHAPES[protection].M + 1.5
    }
    switch (level) {
      // ... PowerStore, ObjectScale, PowerFlex, PowerVault cases unchanged
    }
  },
```

`calculateIOPS` in the same file calls `this.getWritePenalty(level)` with no options — pass its
`_options` through (and rename it to `options`), or PowerScale silently falls back to 3.0.

- [ ] **Step 7: Wire the sustainability hook**

In `src/hooks/useSustainabilityCalc.ts`, override with **cluster** totals:

```ts
    // Power, cooling and TCO are additive across node pools, so sustainability
    // counts EVERY tier — unlike performance and resilience, which model the
    // first pool only.
    const psTotals =
      topology.type === 'powerscale' ? powerScaleDriveTotals(powerscaleOptions) : null

    const totalDriveCount = psTotals ? psTotals.clusterDrives : driveCount * effServerCount
    const nodeCount = psTotals ? psTotals.clusterNodes : effServerCount
```

Use `nodeCount` where `effServerCount` fed the server count, and add `powerscaleOptions` to the
destructuring and the `useMemo` dependencies.

- [ ] **Step 8: Surface the first-tier limitation in the UI**

The dashboard must not present first-pool performance and resilience as cluster-wide. Add a
note beneath the tier table when `tiers.length > 1`, keyed
`t('powerscale.firstTierOnly')` in `output.json`:

> "Performance and resilience figures model the first node pool only. Capacity, power and cost
> cover the whole cluster."

- [ ] **Step 9: Run the gates**

Run: `npm run test:run -- tests/hooks tests/engines/performance.spec.ts && npm run typecheck && npm run lint`
Expected: PASS. Confirm no remaining reference to a deleted `powerscale_n*` level:
`grep -rn "powerscale_n1\|powerscale_n2\|powerscale_n3\|powerscale_n4\|powerscale_mirror" src/ tests/` returns nothing.

- [ ] **Step 10: Commit**

```bash
git add src/hooks src/engines tests/hooks/powerscaleScopes.spec.ts tests/engines/performance.spec.ts
git commit -m "fix(powerscale): drive performance, resilience and sustainability from the tier model"
```

---

### Task 9: The PowerSizer conformance gate

The proof. 122,828 vendor rows, at the precision the source can actually support.

**Files:**
- Test: `tests/engines/volumetry/powerscale/powersizer.spec.ts`
- Modify: `docs/TESTING.md`

**Interfaces:**
- Consumes: `sizeTier` (Task 5), `calculatePowerScaleVolumetry` (Task 6), the fixture (Task 1).
- Produces: nothing.

**Precision, and why it is not uniform.** Efficiency ships verbatim from the vendor, so it is
compared **exactly** as integer basis points. Raw is `nodes x drivesPerNode x rawPerDrive`, so
it is compared to the workbook's 2-decimal TB. Usable is *reconstructed* as
`raw x efficiency x usableFactor` and therefore inherits both the 4-decimal rounding of
efficiency and the 2-decimal rounding of usable, so it is compared **relatively**: max 0.06 %,
and — the tripwire that actually catches regressions — p99 under 0.01 %. Measured
reconstruction error across all rows is max 0.053 %, p99 0.008 %, which is inside the 0.088 %
that the workbook's own 2-decimal rounding can produce. Do not tighten usable to an absolute
bound; it cannot pass and the failure would be the workbook's, not the engine's.

- [ ] **Step 1: Write the failing test**

`tests/engines/volumetry/powerscale/powersizer.spec.ts`:

```ts
/**
 * PowerSizer conformance gate.
 *
 * Walks every row Dell's sizer produced and asserts our engine reproduces it.
 * Each row is a single-tier cluster with VHS disabled - the configuration the
 * workbook itself sizes. Multi-tier is proven separately by summation.
 *
 * Efficiency is an EXACT match: we ship the vendor's own numbers, so any drift
 * is a regression. Usable is compared relatively, because reconstructing it
 * from a 4-decimal efficiency and a fitted factor cannot beat the workbook's
 * own 2-decimal printing. See the task notes for the measured envelope.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { calculatePowerScaleVolumetry } from '@/engines/volumetry/powerscale'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { PowerScaleTierResult } from '@/types/results'
import type { PowerScaleProtection, PowerScaleTier } from '@/types/topology'

interface VendorRow {
  model: string
  driveSizeTb: number
  nodes: number
  protection: PowerScaleProtection
  rawTb: number
  usableTb: number
  efficiency: number
}

const TB = 1_000_000_000_000

function loadFixture(): VendorRow[] {
  const csv = gunzipSync(
    readFileSync(new URL('../../../fixtures/powerscale-powersizer.csv.gz', import.meta.url)),
  ).toString('utf8')
  return csv
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [model, driveSizeTb, nodes, protection, rawTb, usableTb, efficiency] = line.split(',')
      return {
        model,
        driveSizeTb: Number(driveSizeTb),
        nodes: Number(nodes),
        protection: protection as PowerScaleProtection,
        rawTb: Number(rawTb),
        usableTb: Number(usableTb),
        efficiency: Number(efficiency),
      }
    })
}

const rows = loadFixture()

function size(row: VendorRow): PowerScaleTierResult | null {
  return sizeTier({
    nodeModel: row.model,
    driveSizeTb: row.driveSizeTb,
    nodeCount: row.nodes,
    protection: row.protection,
    vhsDriveCount: 0,
    vhsPercent: 0,
  })
}

describe('PowerSizer conformance', () => {
  it('loaded the full vendor export', () => {
    expect(rows).toHaveLength(122828)
  })

  it('can size every row the vendor can size', () => {
    const unsizeable = rows
      .filter((row) => size(row) === null)
      .slice(0, 10)
      .map((r) => `${r.model}/${r.driveSizeTb}/${r.nodes}/${r.protection}`)
    expect(unsizeable).toEqual([])
  })

  it('reproduces storage efficiency exactly', () => {
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t) continue
      // Both sides are the same 4-decimal vendor value; compare as basis points.
      if (Math.round(t.efficiency * 10000) !== Math.round(row.efficiency * 10000)) {
        misses.push(
          `${row.model}/${row.driveSizeTb}/${row.nodes}/${row.protection}: got ${t.efficiency}, want ${row.efficiency}`,
        )
        if (misses.length > 10) break
      }
    }
    expect(misses).toEqual([])
  })

  it('reproduces raw capacity to the workbook precision', () => {
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t) continue
      // The workbook prints raw to 2 decimals of TB.
      if (Math.abs(t.rawCapacity / TB - row.rawTb) > 0.005) {
        misses.push(
          `${row.model}/${row.driveSizeTb}/${row.nodes}: raw ${t.rawCapacity / TB} != ${row.rawTb}`,
        )
        if (misses.length > 10) break
      }
    }
    expect(misses).toEqual([])
  })

  it('reproduces usable capacity inside the workbook rounding envelope', () => {
    const errors: number[] = []
    const misses: string[] = []
    for (const row of rows) {
      const t = size(row)
      if (!t || row.usableTb <= 0) continue
      const rel = Math.abs(t.usableLessVhs / TB - row.usableTb) / row.usableTb
      errors.push(rel)
      if (rel > 0.0006) {
        misses.push(
          `${row.model}/${row.driveSizeTb}/${row.nodes}/${row.protection}: usable ${t.usableLessVhs / TB} != ${row.usableTb} (${(rel * 100).toFixed(4)}%)`,
        )
      }
    }
    expect(misses.slice(0, 10)).toEqual([])

    // The real regression tripwire: the bulk of rows must be far tighter than
    // the outer bound. Measured at authoring time: p99 = 0.008%.
    errors.sort((a, b) => a - b)
    const p99 = errors[Math.floor(errors.length * 0.99)]
    expect(p99).toBeLessThan(0.0001)
  })

  it('sums multi-tier clusters from sampled vendor rows', () => {
    const picks = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]]
    const tiers: PowerScaleTier[] = picks.map((row) => ({
      nodeModel: row.model,
      driveSizeTb: row.driveSizeTb,
      nodeCount: row.nodes,
      protection: row.protection,
      vhsDriveCount: 0,
      vhsPercent: 0,
    }))
    const cluster = calculatePowerScaleVolumetry({ tiers })
    const expectedRaw = tiers.reduce((sum, t) => sum + (sizeTier(t)?.rawCapacity ?? 0), 0)
    const expectedUsable = tiers.reduce((sum, t) => sum + (sizeTier(t)?.usableLessVhs ?? 0), 0)
    expect(cluster.rawCapacity).toBeCloseTo(expectedRaw, -6)
    expect(cluster.usableCapacity).toBeCloseTo(expectedUsable, -6)
  })
})
```

- [ ] **Step 2: Run the gate**

Run: `npm run test:run -- tests/engines/volumetry/powerscale/powersizer.spec.ts`
Expected: PASS, 6 tests. Failures name the exact `(model, driveSize, nodes, protection)`.
**Fix the engine or the extraction — never loosen a tolerance to get green.** If the p99
assertion fails, the `usableFactor` fit regressed (check that Task 1 uses least squares, not a
mean); if the efficiency assertion fails, the table or the lookup is wrong.

- [ ] **Step 3: Document the fixture**

Add to `docs/TESTING.md`:

```markdown
### PowerScale PowerSizer conformance

`tests/engines/volumetry/powerscale/powersizer.spec.ts` walks all 122,828 rows
of Dell's PowerSizer export (`tests/fixtures/powerscale-powersizer.csv.gz`,
564 KB gzipped). Each row is treated as a single-tier cluster with VHS disabled
- the configuration the source workbook sizes.

Precision differs per quantity, deliberately:

| Quantity | Gate | Why |
|---|---|---|
| Storage efficiency | exact (basis points) | Shipped verbatim from the vendor. |
| Raw capacity | +/- 0.005 TB | The workbook prints raw to 2 decimals. |
| Usable capacity | +/- 0.06 % relative, p99 < 0.01 % | Reconstructed from a 4-decimal efficiency; the workbook's own 2-decimal usable rounding is worth up to 0.088 %. |

Regenerate the fixture with:

    node scripts/build-powerscale-catalog.mjs <path-to.xlsm>

The source workbook is not redistributable and is never committed; `.gitignore`
blocks `*.xlsm`. Only the derived data and this fixture live in the repo.
```

- [ ] **Step 4: Commit**

```bash
git add tests/engines/volumetry/powerscale/powersizer.spec.ts docs/TESTING.md
git commit -m "test(powerscale): conformance gate against all 122,828 PowerSizer rows"
```

---

### Task 10: UI — tier list, output table, i18n

**Files:**
- Create: `src/components/inputs/topology-options/PowerScaleTierRow.tsx`
- Create: `src/components/output/PowerScaleTierTable.tsx`
- Modify: `src/components/inputs/topology-options/PowerScaleOptionsPanel.tsx`
- Modify: `src/components/inputs/topology-options/topologyConstants.ts`
- Modify: `src/components/layout/OutputDashboard.tsx`
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json`, `.../output.json`
- Test: `tests/components/PowerScaleOptionsPanel.spec.tsx`

**Interfaces:**
- Consumes: catalog accessors (Task 2), store actions (Task 4), `PowerScaleCapacityDetails` (Task 5).
- Produces: no exported logic.

- [ ] **Step 1: Write the failing test**

`tests/components/PowerScaleOptionsPanel.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PowerScaleOptionsPanel } from '@/components/inputs/topology-options/PowerScaleOptionsPanel'
import { useConfigStore } from '@/store'

// jsdom has no matchMedia; InfoTooltip reaches it via useIsTouchDevice.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  useConfigStore.setState({
    powerscaleOptions: {
      tiers: [
        {
          nodeModel: 'F210',
          driveSizeTb: 1.92,
          nodeCount: 3,
          protection: '+2d:1n',
          vhsDriveCount: 0,
          vhsPercent: 0,
        },
      ],
    },
  })
})

describe('PowerScaleOptionsPanel', () => {
  it('renders one row per node pool', () => {
    render(<PowerScaleOptionsPanel />)
    expect(screen.getAllByRole('combobox', { name: /node model/i })).toHaveLength(1)
  })

  it('adds a node pool up to the eight-tier limit', () => {
    render(<PowerScaleOptionsPanel />)
    const add = screen.getByRole('button', { name: /add node pool/i })
    for (let i = 0; i < 10; i++) fireEvent.click(add)
    expect(useConfigStore.getState().powerscaleOptions.tiers).toHaveLength(8)
  })

  it('will not remove the last node pool', () => {
    render(<PowerScaleOptionsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /remove node pool/i }))
    expect(useConfigStore.getState().powerscaleOptions.tiers).toHaveLength(1)
  })

  it('offers only protections valid for the selected combination', () => {
    render(<PowerScaleOptionsPanel />)
    const options = screen
      .getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t?.startsWith('+'))
    // F210 @ 1.92 TB with 3 nodes cannot do +1n
    expect(options).not.toContain('+1n')
  })

  it('clamps node count into the model bounds', () => {
    render(<PowerScaleOptionsPanel />)
    const input = screen.getByRole('spinbutton', { name: /node count/i })
    fireEvent.change(input, { target: { value: '1' } })
    expect(useConfigStore.getState().powerscaleOptions.tiers[0].nodeCount).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- tests/components/PowerScaleOptionsPanel.spec.tsx`
Expected: FAIL — no "add node pool" button exists.

- [ ] **Step 3: Build the tier row**

`src/components/inputs/topology-options/PowerScaleTierRow.tsx`. Every control derives from the
one to its left, and changing the model re-derives everything downstream **in one dispatch**,
so the row can never sit in a combination the vendor catalog does not cover.

```tsx
/**
 * One PowerScale node pool.
 *
 * The controls form a dependency chain - model, then drive size, then node
 * count, then protection - mirroring the source workbook's own left-to-right
 * selection rule. Each step narrows the next, so an unsizeable combination is
 * never offered rather than being silently mis-computed.
 */
import { useTranslation } from 'react-i18next'
import {
  availableProtections,
  getModel,
  listDriveSizes,
  listModels,
  suggestedProtection,
} from '@/data/powerscaleCatalog'
import { useConfigStore } from '@/store'
import type { PowerScaleTier } from '@/types/topology'

interface Props {
  tier: PowerScaleTier
  index: number
  canRemove: boolean
}

/** Clamp to the model's bounds and snap to its node increment. */
function clampNodes(modelId: string, requested: number): number {
  const model = getModel(modelId)
  if (!model) return requested
  const stepped =
    model.minNodes +
    Math.round((requested - model.minNodes) / model.nodeIncrement) * model.nodeIncrement
  return Math.min(model.maxNodes, Math.max(model.minNodes, stepped))
}

export function PowerScaleTierRow({ tier, index, canRemove }: Props) {
  const { t } = useTranslation('topology')
  const { updatePowerScaleTier, removePowerScaleTier } = useConfigStore()

  const model = getModel(tier.nodeModel)
  const driveSizes = listDriveSizes(tier.nodeModel)
  const protections = availableProtections(tier.nodeModel, tier.driveSizeTb, tier.nodeCount)

  /** Re-derive every downstream field so the row is always a valid combination. */
  const selectModel = (nodeModel: string) => {
    const sizes = listDriveSizes(nodeModel)
    const driveSizeTb = sizes.includes(tier.driveSizeTb) ? tier.driveSizeTb : (sizes[0] ?? 0)
    const nodeCount = clampNodes(nodeModel, tier.nodeCount)
    const allowed = availableProtections(nodeModel, driveSizeTb, nodeCount)
    const protection = allowed.includes(tier.protection)
      ? tier.protection
      : (suggestedProtection(nodeModel, driveSizeTb, nodeCount) ?? allowed[0] ?? tier.protection)
    updatePowerScaleTier(index, { nodeModel, driveSizeTb, nodeCount, protection })
  }

  const selectDriveSize = (driveSizeTb: number) => {
    if (!Number.isFinite(driveSizeTb) || driveSizeTb <= 0) return
    const allowed = availableProtections(tier.nodeModel, driveSizeTb, tier.nodeCount)
    const protection = allowed.includes(tier.protection)
      ? tier.protection
      : (suggestedProtection(tier.nodeModel, driveSizeTb, tier.nodeCount) ??
        allowed[0] ??
        tier.protection)
    updatePowerScaleTier(index, { driveSizeTb, protection })
  }

  const selectNodeCount = (requested: number) => {
    // Clearing the field yields NaN; storing it would cascade NaN through
    // sizeTier into every dashboard number.
    if (!Number.isFinite(requested) || requested <= 0) return
    const nodeCount = clampNodes(tier.nodeModel, requested)
    const allowed = availableProtections(tier.nodeModel, tier.driveSizeTb, nodeCount)
    const protection = allowed.includes(tier.protection)
      ? tier.protection
      : (suggestedProtection(tier.nodeModel, tier.driveSizeTb, nodeCount) ??
        allowed[0] ??
        tier.protection)
    updatePowerScaleTier(index, { nodeCount, protection })
  }

  const modelId = `powerscale-tier-${index}`

  return (
    <fieldset className="space-y-2 rounded border border-slate-700 p-3">
      <legend className="px-1 text-sm font-medium">
        {t('powerscale.tier.heading', { index: index + 1 })}
        {model?.endOfLife ? (
          <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-200">
            {t('powerscale.tier.eol')} {model.endOfLife}
          </span>
        ) : null}
      </legend>

      <label htmlFor={`${modelId}-model`}>{t('powerscale.tier.nodeModel')}</label>
      <select
        id={`${modelId}-model`}
        value={tier.nodeModel}
        onChange={(e) => selectModel(e.target.value)}
      >
        {(['All Flash', 'Hybrid', 'Archive'] as const).map((group) => (
          <optgroup key={group} label={group}>
            {listModels()
              .filter((m) => m.tier === group)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} ({m.generation})
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <label htmlFor={`${modelId}-drive`}>{t('powerscale.tier.driveSize')}</label>
      <select
        id={`${modelId}-drive`}
        value={tier.driveSizeTb}
        onChange={(e) => selectDriveSize(Number(e.target.value))}
      >
        {driveSizes.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <label htmlFor={`${modelId}-nodes`}>{t('powerscale.tier.nodeCount')}</label>
      <input
        id={`${modelId}-nodes`}
        type="number"
        value={tier.nodeCount}
        min={model?.minNodes ?? 3}
        max={model?.maxNodes ?? 252}
        step={model?.nodeIncrement ?? 1}
        onChange={(e) => selectNodeCount(Number(e.target.value))}
      />

      <label htmlFor={`${modelId}-protection`}>{t('powerscale.tier.protection')}</label>
      <select
        id={`${modelId}-protection`}
        value={tier.protection}
        onChange={(e) =>
          updatePowerScaleTier(index, { protection: e.target.value as PowerScaleTier['protection'] })
        }
      >
        {protections.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <label htmlFor={`${modelId}-vhs-drives`}>{t('powerscale.tier.vhsDriveCount')}</label>
      <input
        id={`${modelId}-vhs-drives`}
        type="number"
        min={0}
        max={64}
        value={tier.vhsDriveCount}
        onChange={(e) =>
          updatePowerScaleTier(index, {
            vhsDriveCount: Math.max(0, Number(e.target.value) || 0),
          })
        }
      />

      <label htmlFor={`${modelId}-vhs-percent`}>{t('powerscale.tier.vhsPercent')}</label>
      <input
        id={`${modelId}-vhs-percent`}
        type="number"
        min={0}
        max={50}
        value={tier.vhsPercent}
        onChange={(e) =>
          updatePowerScaleTier(index, {
            vhsPercent: Math.min(50, Math.max(0, Number(e.target.value) || 0)),
          })
        }
      />

      <button
        type="button"
        onClick={() => removePowerScaleTier(index)}
        disabled={!canRemove}
        aria-label={t('powerscale.tier.remove')}
      >
        {t('powerscale.tier.remove')}
      </button>
    </fieldset>
  )
}
```

- [ ] **Step 4: Rewrite the panel and the level constant**

`src/components/inputs/topology-options/PowerScaleOptionsPanel.tsx`:

```tsx
/**
 * Dell PowerScale options - a cluster of 1-8 node pools (tiers).
 *
 * PowerScale clusters are heterogeneous by design: all-flash over hybrid over
 * archive, under one OneFS namespace. Protection, stripe width and neighborhood
 * splitting are all per node pool, so each tier is configured and sized on its
 * own and the cluster is their sum.
 */
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@/store'
import { POWERSCALE_MAX_TIERS } from '@/types'
import { OptionsSection } from './dellShared'
import { PowerScaleTierRow } from './PowerScaleTierRow'

export function PowerScaleOptionsPanel() {
  const { t } = useTranslation('topology')
  const { powerscaleOptions, addPowerScaleTier } = useConfigStore()
  const tiers = powerscaleOptions.tiers

  return (
    <OptionsSection title={t('powerscale.title')}>
      {tiers.map((tier, index) => (
        <PowerScaleTierRow
          // Tiers are positional and reorderable only by add/remove, so the
          // index is the identity here.
          key={`powerscale-tier-${index}`}
          tier={tier}
          index={index}
          canRemove={tiers.length > 1}
        />
      ))}

      <button
        type="button"
        onClick={addPowerScaleTier}
        disabled={tiers.length >= POWERSCALE_MAX_TIERS}
        aria-label={t('powerscale.tier.add')}
      >
        {t('powerscale.tier.add')}
      </button>
    </OptionsSection>
  )
}
```

`topologyConstants.ts`: replace the seven `powerscale` entries with one:

```ts
  powerscale: [
    {
      value: 'powerscale_onefs',
      labelKey: 'powerscale.onefs.label',
      descriptionKey: 'powerscale.onefs.description',
    },
  ],
```

- [ ] **Step 5: Build the output table**

`src/components/output/PowerScaleTierTable.tsx`:

```tsx
/**
 * Per-node-pool capacity table for a PowerScale cluster.
 *
 * A heterogeneous cluster's headline number hides where the capacity actually
 * sits, so the tiers are shown individually with a cluster total - the same
 * layout the source workbook uses.
 */
import { useTranslation } from 'react-i18next'
import type { PowerScaleCapacityDetails } from '@/types/results'
import { formatCapacity } from '@/utils/format'

interface Props {
  details: PowerScaleCapacityDetails
}

export function PowerScaleTierTable({ details }: Props) {
  const { t } = useTranslation('output')

  return (
    <div className="overflow-x-auto">
      <table>
        <caption>{t('powerscale.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('powerscale.column.nodeModel')}</th>
            <th scope="col">{t('powerscale.column.driveSize')}</th>
            <th scope="col">{t('powerscale.column.nodes')}</th>
            <th scope="col">{t('powerscale.column.protection')}</th>
            <th scope="col">{t('powerscale.column.raw')}</th>
            <th scope="col">{t('powerscale.column.usable')}</th>
            <th scope="col">{t('powerscale.column.effective')}</th>
            <th scope="col">{t('powerscale.column.efficiency')}</th>
          </tr>
        </thead>
        <tbody>
          {details.tiers.map((tier, index) => (
            <tr key={`${tier.nodeModel}-${tier.driveSizeTb}-${index}`}>
              <th scope="row">
                {tier.nodeModel}
                {tier.endOfLife ? (
                  <span className="ml-2 rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-200">
                    {t('powerscale.eol', { date: tier.endOfLife })}
                  </span>
                ) : null}
              </th>
              <td>{tier.driveSizeTb}</td>
              <td>{tier.nodeCount}</td>
              <td>{tier.protection}</td>
              <td>{formatCapacity(tier.rawCapacity)}</td>
              <td>{formatCapacity(tier.usableLessVhs)}</td>
              <td>{formatCapacity(tier.effectiveCapacity)}</td>
              <td>{(tier.efficiency * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              {t('powerscale.total')}
            </th>
            <td>{formatCapacity(details.clusterRaw)}</td>
            <td>{formatCapacity(details.clusterUsable)}</td>
            <td>{formatCapacity(details.clusterEffective)}</td>
            <td>{(details.clusterEfficiency * 100).toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

Mount it in `OutputDashboard.tsx`:

```tsx
{topology.type === 'powerscale' && volumetry.powerScaleDetails ? (
  <PowerScaleTierTable details={volumetry.powerScaleDetails} />
) : null}
```

Use whatever capacity formatter `OutputDashboard.tsx` already imports rather than adding one;
if it is not `formatCapacity` from `@/utils/format`, match the existing import.

- [ ] **Step 6: Add i18n keys in all four locales**

Delete the seven old `powerscale.n*` / `powerscale.mirror_*` blocks. Add, in `en/topology.json` (and translate for fr/de/it):

```json
  "powerscale": {
    "title": "PowerScale Cluster",
    "onefs": {
      "label": "OneFS",
      "description": "Scale-out NAS. Protection is set per node pool."
    },
    "tier": {
      "heading": "Node pool {{index}}",
      "nodeModel": "Node model",
      "driveSize": "Drive size (TB)",
      "nodeCount": "Node count",
      "protection": "Protection",
      "vhsDriveCount": "Virtual hot spare (drives)",
      "vhsPercent": "Virtual hot spare (%)",
      "add": "Add node pool",
      "remove": "Remove node pool",
      "eol": "End of life"
    }
  }
```

And in `en/output.json` (translate for fr/de/it):

```json
  "powerscale": {
    "tableCaption": "Capacity by node pool",
    "total": "Cluster total",
    "eol": "EOL {{date}}",
    "column": {
      "nodeModel": "Node model",
      "driveSize": "Drive size (TB)",
      "nodes": "Nodes",
      "protection": "Protection",
      "raw": "Raw",
      "usable": "Usable",
      "effective": "Effective",
      "efficiency": "Efficiency"
    }
  }
```

Write every key at its call site as a full literal string — `t('powerscale.tier.nodeModel')`, never a template — so `tests/i18n/orphanKeys.spec.ts` can see it. Node model ids, protection levels and generation labels stay untranslated: they are technical identifiers.

- [ ] **Step 7: Run the tests**

Run: `npm run test:run -- tests/components tests/i18n && npm run typecheck && npm run lint`
Expected: PASS. The orphan-key spec must find no unused or missing keys in any of the four locales.

- [ ] **Step 8: Commit**

```bash
git add src/components src/i18n tests/components/PowerScaleOptionsPanel.spec.tsx
git commit -m "feat(powerscale): node-pool tier list and per-tier output table"
```

---

### Task 11: Documentation and ADR

**Files:**
- Create: `docs/adr/0014-vendor-lookup-tables.md`
- Modify: `docs/ENGINES.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `docs/BACKLOG.md`, `docs/adr/README.md`, `CHANGELOG.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Write the ADR**

`docs/adr/0014-vendor-lookup-tables.md` — status accepted, dated 2026-08-22. Context: ADR-0004 says engines are pure functions; PowerScale now ships a vendor lookup table. Decision: when a vendor's own sizer is the authority and no closed form reproduces it, ship the derived table and keep the closed form as a test-only reference. Consequences: the table must be regenerable (`scripts/build-powerscale-catalog.mjs`), the source workbook is never committed, and a conformance gate proves the engine matches. Include the H710/22-node/`+3n` = 0.7250 counterexample as the concrete reason.

- [ ] **Step 2: Update ENGINES.md**

New PowerScale section: the stripe model table from spec §3.1, the mirror fallback, the width caps, the neighborhood split, why the table ships, the per-tier capacity chain, and per-model DRR. Link the spec and ADR-0014.

- [ ] **Step 3: Update ARCHITECTURE.md**

Note that PowerScale branches out of the generic volumetry path into `src/engines/volumetry/powerscale/`, and that this is the one platform whose input model is node-pool-centric rather than drive-centric.

- [ ] **Step 4: Update DEVELOPMENT.md**

Document the extraction script: what it needs, how to run it, that the workbook is not redistributable and gitignored, and that regenerating changes three artifacts which must be committed together.

- [ ] **Step 5: Update BACKLOG.md**

Two entries: PowerScale performance and resilience currently size the first node pool only; and OneFS SmartPools tiering policy is unmodelled.

- [ ] **Step 6: Update CLAUDE.md gotchas**

Add: "**PowerScale does not use the generic volumetry path** — `calculateVolumetry` returns early into `powerscale/`. Adding a shared overhead there will silently skip PowerScale." And: "**`src/data/powerscale*.json` are generated** — edit `scripts/build-powerscale-catalog.mjs` and regenerate; hand edits are lost."

- [ ] **Step 7: Update CHANGELOG.md**

Under a new version heading, with a `BREAKING` note for the URL shape change and the migration shim's one-release lifetime.

- [ ] **Step 8: Run the full gate**

Run: `npm run lint && npm run typecheck && npm run test:run && npm run check:dead && npm run build && npm run check:bundle-size`
Expected: all clean, and the eager chunk still inside its 420 KiB gz budget.

- [ ] **Step 9: Commit**

```bash
git add docs CHANGELOG.md CLAUDE.md
git commit -m "docs(powerscale): engine reference, ADR-0014, extraction workflow"
```
