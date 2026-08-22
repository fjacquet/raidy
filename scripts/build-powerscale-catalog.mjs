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
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

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
const tsv = execFileSync(
  'uv',
  ['run', '--quiet', '--with', 'openpyxl', 'python3', '-c', PY, xlsm],
  {
    maxBuffer: 512 * 1024 * 1024,
    encoding: 'utf8',
  },
)

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
    console.error(
      `efficiency out of range: ${r[C.model]}/${r[C.protection]}/${r[C.nodes]} = ${eff}`,
    )
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

  models[model] ??= {
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
  }
  const m = models[model]
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
  const byKeyKey = `${r[C.model]}|${r[C.protection]}`
  if (!byKey.has(byKeyKey)) byKey.set(byKeyKey, new Map())
  const seen = byKey.get(byKeyKey)
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

// --- mirror-fallback backfill: extend curves down to each model's floor
//
// PowerSizer's own export only lists node counts where a level is actually
// offered, which for many (model, protection) pairs starts well above where
// OneFS's own behaviour is already well-defined — below the FEC threshold it
// falls back to full mirroring, and the reference closed form (see
// docs/superpowers/specs/2026-08-22-powerscale-onefs-design.md §3.1) is exact
// there. Task 3's lookup (`storageEfficiency`) is a straight table read with no
// formula fallback of its own, so those low-node-count values must be baked
// into the shipped curve, not computed at runtime.
const NF = {
  '+1n': 1,
  '+2n': 2,
  '+3n': 3,
  '+4n': 4,
  '+2d:1n': 1,
  '+3d:1n': 1,
  '+3d:1n1d': 1,
  '+4d:1n': 1,
  '+4d:2n': 2,
}
const STRIPE_U = {
  '+1n': 1,
  '+2n': 1,
  '+3n': 1,
  '+4n': 1,
  '+2d:1n': 2,
  '+3d:1n': 3,
  '+3d:1n1d': 2,
  '+4d:1n': 4,
  '+4d:2n': 2,
}
const FEC_UNITS = {
  '+1n': 1,
  '+2n': 2,
  '+3n': 3,
  '+4n': 4,
  '+2d:1n': 2,
  '+3d:1n': 3,
  '+3d:1n1d': 3,
  '+4d:1n': 4,
  '+4d:2n': 4,
}
const WIDTH_CAP = { 1: 18, 2: 18, 3: 18, 4: 20 }
const closedFormEff = (protection, n) => {
  const nf = NF[protection]
  if (n < 2 * nf) return 1 / Math.min(nf + 1, n)
  const width = Math.min(STRIPE_U[protection] * n, WIDTH_CAP[FEC_UNITS[protection]] ?? 20)
  return (width - FEC_UNITS[protection]) / width
}
for (const [key, curve] of Object.entries(curves)) {
  const [model, protection] = key.split('|')
  const floor = models[model].minNodes
  if (floor < curve.from) {
    const prefix = []
    for (let n = floor; n < curve.from; n++)
      prefix.push(Math.round(closedFormEff(protection, n) * 10000))
    curve.bp = [...prefix, ...curve.bp]
    curve.from = floor
  }
}

// --- protection availability and PowerSizer's Suggested level, RLE over node count
const avail = new Map()
const sugg = new Map()
for (const r of rows) {
  const k = `${r[C.model]}|${r[C.driveSize]}`
  const n = Number(r[C.nodes])
  if (!avail.has(k)) avail.set(k, new Map())
  const perN = avail.get(k)
  ;(perN.get(n) ?? perN.set(n, new Set()).get(n)).add(r[C.protection])
  if (r[C.protType] === 'Suggested')
    (sugg.get(k) ?? sugg.set(k, new Map()).get(k)).set(n, r[C.protection])
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
// The sheet's header row is offset (titles start around column I) and isn't at
// a fixed row/col, so we locate 'Platform Name' / 'EOL Date' by scanning. With
// data_only=True, openpyxl already resolves date cells to Python datetimes (not
// Excel serials) — models not yet EOL'd carry the literal text '(blank)', which
// we simply skip rather than trying to parse as a date.
const EOL_PY = `
import sys, openpyxl, datetime
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb['Hardware EOL']
rows = list(ws.iter_rows(values_only=True))
name_col = eol_col = None
for row in rows:
    for j, cell in enumerate(row):
        if cell == 'Platform Name':
            name_col = j
        if cell == 'EOL Date':
            eol_col = j
    if name_col is not None and eol_col is not None:
        break
if name_col is None or eol_col is None:
    sys.exit('could not locate Platform Name / EOL Date columns in Hardware EOL sheet')
for row in rows:
    name = row[name_col] if name_col < len(row) else None
    eol = row[eol_col] if eol_col < len(row) else None
    if not name or not isinstance(eol, datetime.datetime):
        continue
    sys.stdout.write(f'{name}\\t{eol.date().isoformat()}\\n')
`
const eolTsv = execFileSync(
  'uv',
  ['run', '--quiet', '--with', 'openpyxl', 'python3', '-c', EOL_PY, xlsm],
  {
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'utf8',
  },
)

for (const line of eolTsv.split('\n').filter(Boolean)) {
  const [platform, iso] = line.split('\t')
  if (!platform || !iso) continue
  const id = platform.replace(/^(Isilon|PowerScale)\s+/i, '').trim()
  if (models[id]) models[id].endOfLife = iso
}

writeFileSync(
  'src/data/powerscaleNodes.json',
  `${JSON.stringify({ generatedFrom: 'vendor capacity workbook', rowCount: rows.length, models, availability, protectionSets }, null, 0)}\n`,
)
writeFileSync(
  'src/data/powerscaleEfficiency.json',
  `${JSON.stringify({ curves, exceptions }, null, 0)}\n`,
)

// --- test fixture: every vendor row, gzipped
const csv = rows
  .map((r) =>
    [r[C.model], r[C.driveSize], r[C.nodes], r[C.protection], r[C.raw], r[C.usable], r[C.eff]].join(
      ',',
    ),
  )
  .join('\n')
writeFileSync(
  'tests/fixtures/powerscale-powersizer.csv.gz',
  gzipSync(Buffer.from(`${csv}\n`), { level: 9 }),
)

console.log(
  `wrote catalog (${Object.keys(models).length} models), efficiency (${Object.keys(curves).length} curves), fixture (${rows.length} rows)`,
)
