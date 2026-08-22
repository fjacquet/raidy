# PowerScale / OneFS — PowerSizer-grade capacity model

Status: proposed
Date: 2026-08-22

## 1. Source of truth

`vendor capacity workbook` (Dell, 21.7 MB, macro-enabled), obtained under a vendor agreement.
Its hidden `the data` sheet holds **122,828 rows** exported from Dell's corporate
PowerSizer. The workbook states plainly:

> (vendor statement: figures are exported from PowerSizer, not computed in the workbook)

So the workbook contains no formulas worth porting. The value is the table itself, plus the
rules encoded in the visible sheets (VHS, DRR, protection availability, node-count bounds).

Columns: `Nodes, Protection, Raw TB, Usable TB, Effective Capacity TB, Incremental Usable TB,
Incremental Usable %, Storage Efficiency %, Drive Count, Node Model, Node Type, Drive Size
Calculated, Drive Size, Protection Type, Generation, Minimum Node Count, Maximum Node Count,
Node Increments`.

Coverage: 22 node models, 3 generations (Gen6 / Gen6.5 / Gen7), 3 tiers (All Flash / Hybrid /
Archive), 21 drive sizes (0.6 TB – 122.88 TB), node counts 3–252, 9 protection levels.

We treat this as authoritative. Where our own reasoning disagreed with it during analysis, the
table won — see §3, where a plausible closed form was rejected because it could not reproduce
the table exactly.

## 2. What raidy gets wrong today

`src/engines/volumetry/strategies/dell.ts` models PowerScale as `(N − M) / N` on the node count,
with seven invented levels (`powerscale_n1/n2/n2_1/n3/n4/mirror_2x/mirror_3x`).

| Config | raidy today | PowerSizer | Error |
| --- | --- | --- | --- |
| A200, 9 nodes, `+2d:1n` | 0.778 (via `n2_1`) | 0.8889 | −12.5 % |
| A200, 20 nodes, `+2n` | 0.900 | 0.8000 | +12.5 % |
| F200, 20 nodes, `+2n` | 0.900 | 0.8889 | +1.2 % |
| A200, 5 nodes, `+3n` | 0.400 | 0.2500 | +60 % |
| A200, 40 nodes, `+3n` | 0.925 | 0.7000 | +32 % |

Three separate structural faults:

1. **Drive-level protection is not modelled at all.** `+2d:1n`, `+3d:1n`, `+3d:1n1d`, `+4d:1n`,
   `+4d:2n` are five of the nine real levels and five of the most commonly sold. raidy has one
   approximation (`n2_1`) that uses the wrong formula.
2. **No stripe-width cap.** OneFS stripes max out; efficiency stops climbing. raidy climbs to
   `(N−M)/N` forever, so it over-reports on every large cluster.
3. **No neighborhood split.** Above ~20 nodes a chassis-based node pool splits, and efficiency
   *drops*. raidy shows a monotonic climb where the truth is a sawtooth.

4. **A cluster is one homogeneous pool.** Real PowerScale clusters are heterogeneous node
   pools — all-flash over hybrid over archive under one OneFS namespace — each with its own
   protection level and its own neighborhood behaviour. raidy models a single pool, which is
   not how the platform is sold or sized.

Also missing: node-model catalog, per-model DRR, VHS, protection availability gating,
node-count bounds and increments.

## 3. The model, and why it is a table

### 3.1 What we derived

Reverse-engineering the 122,828 rows produced a genuine closed form for the single-pool case.
Each level has stripe units per node `u`, FEC units `M`, node fault tolerance `nf`:

| Level | u | M | nf |
| --- | --- | --- | --- |
| `+1n` | 1 | 1 | 1 |
| `+2n` | 1 | 2 | 2 |
| `+3n` | 1 | 3 | 3 |
| `+4n` | 1 | 4 | 4 |
| `+2d:1n` | 2 | 2 | 1 |
| `+3d:1n` | 3 | 3 | 1 |
| `+3d:1n1d` | 2 | 3 | 1 |
| `+4d:1n` | 4 | 4 | 1 |
| `+4d:2n` | 2 | 4 | 2 |

```
if N < 2·nf:  eff = 1 / min(nf + 1, N)        # OneFS falls back to mirroring
else:         width = min(u·N, Wmax)          # Wmax = 18 for M ∈ {2,3}, 20 for M = 4
              eff   = (width − M) / width
```

`Wmax` for `M = 1` is unobserved: `+1n` appears only on six all-flash models (F210, F710,
F800, F810, F900, F910) and only up to 15 nodes, where it is still on the `(N−1)/N` ramp at
0.9333. The table covers what PowerSizer allows, so the cap never has to be guessed.

This is exact for every drive-level protection at every node count, and for node-level
protection below the split threshold. It reproduces the mirror fallbacks (`+4n` on 5–7 nodes =
0.20 = 5-way mirror, on 4 nodes = 0.25, on 3 nodes = 0.333) and the caps (`+2d:1n` → 16/18,
`+3d:1n` → 15/18, `+4d:1n` → 16/20).

### 3.2 Why the closed form is not enough

Node-level protection above ~20 nodes splits the pool into neighborhoods. Fitting a
neighborhood count `k(model, N)` against the table leaves a mean error of 0.2 pp, p99 of 1.7 pp,
and 604 of 3,500 `(model, node-count)` points above 0.5 pp.

The model is not merely imprecisely fitted — it is structurally wrong for some nodes. H710 at
22 nodes, `+3n`, has efficiency 0.7250. Any partition of 22 nodes into neighborhoods yields
`(22 − 3k)/22`, requiring 15.95 data nodes. No integer partition produces it. Whatever Dell
does there is not "average the neighborhoods".

**We therefore ship the table, not the formula.** The closed form survives as documentation and
as a cross-check in tests, not as the production path.

### 3.3 The table is small

Efficiency depends on `(node model, protection, node count)`. That is 25,488 distinct keys.
Encoded as `Uint16` basis-points in a flat buffer with a per-`(model, protection)` index:

- raw buffer: 79 KB
- **gzipped: 1.9 KB**
- index JSON: 5 KB (1.1 KB gz)

The data is extremely repetitive, so the exact table costs less than the approximation's code
would. There is no size argument for approximating.

230 of the 25,488 keys are drive-size dependent (spread up to 13 pp). Those get an explicit
exceptions map keyed by `(model, driveSize, protection, nodeCount)`.

### 3.4 Capacity chain

A PowerScale cluster is a set of **node pools (tiers)** — heterogeneous by design, typically
all-flash for hot data over hybrid over archive, under one OneFS filesystem. Protection,
stripe width and neighborhood splitting are all **per node pool**, so the table applies per
tier with that tier's own node count, and the cluster is the sum. The workbook sizes up to
eight tiers for exactly this reason.

Per tier `t`:

```
rawTB(t)      = nodeCount(t) × drivesPerNode(model) × rawPerDriveTB(model, driveSize)
usableTB(t)   = rawTB(t) × efficiency(model, protection, nodeCount(t)) × usableFactor(model, driveSize)
lessVHS(t)    = usableTB(t) − max(vhsByDriveCount(t), vhsByPercent(t))
effectiveTB(t)= lessVHS(t) × drr(model)
```

Cluster totals are the sums of the per-tier values. Cluster efficiency is
`Σ usable / Σ raw`, not an average of the per-tier efficiencies.

Tiers are independent: nothing in the model couples them. A tier is sizeable or it is not,
on its own.

- `rawPerDriveTB` is nominal drive size except two catalog quirks: F210 @ 15.36 → 15.00,
  F710 @ 61.44 → 61.00.
- `usableFactor` is 0.9775–0.9917, varying by `(model, driveSize)` — per-drive OneFS
  journal/metadata loss. 107 combos, a catalog field, not a formula. It is fitted by least
  squares over every row for that combo rather than taken from one row, because the workbook's
  2-decimal usable values make any single row a noisy estimate (see §8).
- **DRR is per node model**, from the workbook: 1.0 for A200, A2000, F800, H400, H500, H600;
  1.6 for A310, A3100, H710, H7100; 2.0 for the other twelve. raidy's current PowerScale
  default (`compression: true, compressionRatio: 1.5`) is invented and gets replaced.
- VHS: the workbook applies **the larger** of the drive-count reserve and the percentage
  reserve, and highlights which one won.

## 4. Data artifacts

Two generated files, plus one test fixture. All produced by a committed extraction script so
the derivation is reproducible when the partner sends a newer workbook.

### `scripts/build-powerscale-catalog.mjs`

Input: the `.xlsm` path (not committed — it is not redistributable material). Output: the two data
files below and the fixture. Documented in `docs/DEVELOPMENT.md`; run manually, not in CI.

### `src/data/powerscaleNodes.json` (~25 KB, few KB gz)

Per node model: generation, tier, `drivesPerNode`, `minNodes`, `maxNodes`, `nodeIncrement`,
`drr`, and per drive size `rawPerDriveTB` + `usableFactor`. Plus run-length encoded protection
availability and PowerSizer's *Suggested* protection, both as functions of node count (1,153
availability runs and 729 suggested runs across the 107 `(model, driveSize)` combos, over 26
distinct availability sets).

### `src/data/powerscaleEfficiency.json` (~2 KB gz)

The efficiency table (§3.3) plus the 230-entry exceptions map.

Both are imported by the PowerScale strategy only. If the eager-chunk budget in
`scripts/check-bundle-size.mjs` (420 KiB gz) tightens, they are candidates for a lazy chunk;
at present they are small enough not to need it.

### `tests/fixtures/powerscale-powersizer.csv.gz` (564 KB gz, 5.3 MB raw)

All 122,828 rows: `model, driveSize, nodes, protection, rawTB, usableTB, efficiency`.
Decompressed in the test with `node:zlib`. Not bundled — `tests/` is outside the app build.

## 5. Engine changes

### PowerScale gets its own sub-engine

Every other raidy platform is *drive-centric*: `rawCapacity = drive.capacity_raw × driveCount`,
then a single `dataFraction`. PowerScale is *node-pool-centric* and multi-tier, so it does not
fit that chain — there is no single drive, no single count, and no single efficiency.

`calculateVolumetry` therefore branches once, immediately after topology validation:

```ts
if (topology.type === 'powerscale') {
  return calculatePowerScaleVolumetry(powerscaleOptions)
}
```

The generic path is left completely untouched — no synthetic `Drive` objects, no
`driveId`/`driveCount` plumbing, no changes to any other platform's behaviour.

New module `src/engines/volumetry/powerscale/`:

- `index.ts` — orchestrator. Sizes each tier, sums, builds the breakdown and the details block.
- `efficiency.ts` — the shipped table lookup, plus the §3.1 closed form kept as a reference
  implementation used only by tests.
- `tier.ts` — sizes one tier: raw → efficiency → usableFactor → VHS → DRR.

Results follow the existing per-platform details pattern (`zfsDetails`, `beeGfsDetails`,
`longhornDetails`): a new `PowerScaleCapacityDetails` on `VolumetryResult` carrying one row per
tier plus the cluster totals.

```ts
export interface PowerScaleTierResult {
  nodeModel: string
  driveSizeTb: number
  nodeCount: number
  protection: PowerScaleProtection
  drivesPerNode: number
  rawCapacity: number
  usableCapacity: number      // after efficiency and usableFactor, before VHS
  vhsReserve: number
  vhsSource: 'driveCount' | 'percent'   // which reserve won, as the workbook highlights
  usableLessVhs: number
  effectiveCapacity: number
  efficiency: number          // storage efficiency for this pool, 0-1
  drr: number
  generation: 'Gen6' | 'Gen6.5' | 'Gen7'
  tier: 'All Flash' | 'Hybrid' | 'Archive'
  endOfLife?: string          // ISO date, when the model is EOL
}

export interface PowerScaleCapacityDetails {
  tiers: PowerScaleTierResult[]
  clusterRaw: number
  clusterUsable: number
  clusterEffective: number
  clusterEfficiency: number   // Σ usable / Σ raw
}
```

### Breakdown

The Sankey/breakdown is built from cluster totals with one `parity` segment per tier, so a
heterogeneous cluster visibly shows where capacity sits. `buildBreakdown` gains a PowerScale
branch; no other platform's segments move.

### Overheads

PowerScale no longer routes through `overheadCalculator.ts` or `capacityEnhancements.ts` —
both lose their `powerscale` branches, and `snapshotReservePercent` goes away with them (see
§6). VHS and per-model DRR are applied inside the sub-engine, per tier, because both are
per-pool quantities that the shared post-processing chain cannot express.

`capabilities.ts` sets PowerScale's `supportsCompression` / `supportsDedup` to `false` (already
false) and `hasServerCount` to `false` — node counts are per tier now, so the shared
servers slider must not appear.

### Performance / resilience / sustainability

Out of scope for this change beyond keeping them compiling and correct-by-construction.
`performance/strategies/dell.ts` and `resilienceWorker.ts` reference PowerScale levels and must
be updated for the renamed level enum (§6); they size the *first* tier only, and must say so
rather than silently modelling a heterogeneous cluster as homogeneous. Recorded in
`docs/BACKLOG.md` as follow-up work, with the node catalog now available to it.

## 6. Types, store, schema — and the URL break

`topology.level` collapses to the single value `'powerscale_onefs'`. It no longer carries
protection, because a cluster has one protection level *per node pool*, not one per cluster —
the nine real levels live in `PowerScaleProtection` on the tier. The seven invented levels
(`powerscale_n1/n2/n2_1/n3/n4/mirror_2x/mirror_3x`) are deleted.

```ts
export type PowerScaleProtection =
  | '+1n' | '+2n' | '+3n' | '+4n'
  | '+2d:1n' | '+3d:1n' | '+3d:1n1d' | '+4d:1n' | '+4d:2n'
```

`PowerScaleOptions` is replaced wholesale by a tier list:

```ts
export interface PowerScaleTier {
  nodeModel: string          // e.g. 'F710'
  driveSizeTb: number        // e.g. 15.36
  nodeCount: number
  protection: PowerScaleProtection   // '+2d:1n' etc., the nine real levels
  vhsDriveCount: number      // 0 = disabled
  vhsPercent: number         // 0 = disabled; the larger of the two reserves applies
}

export interface PowerScaleOptions {
  tiers: PowerScaleTier[]    // 1-8 entries
}
```

Everything the old shape carried goes: `compression`, `compressionRatio`, `dedup`,
`dedupRatio` (DRR is per node model now) and `snapshotReservePercent` (PowerSizer does not
reserve for snapshots, and keeping a 20 % default would put every raidy answer 20 % below the
source of truth). Per the CLAUDE.md gotcha, all five must come out of `src/utils/schemas.ts`
in the same change or URL parsing breaks.

Protection moves from `topology.level` into the tier, because a cluster has one protection
level *per pool*. `topology.level` keeps a single value used only for display and for the
platform's identity in the topology selector; the nine real levels live in
`PowerScaleProtection`. This is why the level-enum rename below is a display concern rather
than a calculation one.

**Old shared links carrying `powerscale_*` will not parse.** A migration shim in
`urlStorage.ts` runs on read: it rewrites `topology.level` to `powerscale_onefs`, and seeds a
single tier from the old state — node count from `serverCount`, protection mapped
`n1→+1n, n2→+2n, n2_1→+2d:1n, n3→+3n, n4→+4n`, with the two mirror levels falling back to
PowerSizer's *Suggested* level for the resolved model. The old drive-based state cannot name a
node model, so the shim picks the catalog model whose `drivesPerNode` and drive size best match
the old `driveId`/`driveCount`, and surfaces a toast saying the link was migrated and should be
re-checked. Deleted after one release.

Accepting the break instead would be cheaper, but it silently changes what an existing link
shows — exactly the failure mode documented in the `partialize`/`omitDefaults` gotcha.

## 7. UI

`PowerScaleOptionsPanel.tsx` becomes a tier list: up to eight rows, add/remove, one row per
node pool. Each row is a dependency chain mirroring the workbook's own left-to-right rule:

1. **Node model** (22, grouped by tier) → fixes `drivesPerNode`, generation, DRR, node bounds.
2. **Drive size** — only sizes valid for that model.
3. **Node count** — clamped to `minNodes..maxNodes`, stepped by `nodeIncrement`.
4. **Protection** — only levels available for that `(model, driveSize, nodeCount)`, defaulting
   to PowerSizer's *Suggested*. An unavailable combination is not offered rather than silently
   mis-computed.
5. **VHS** — drive-count and percentage inputs, showing which reserve applies.

A single tier is the default, so the common case stays a four-field form; the second tier is
one click away.

The shared Hardware panel's drive picker, drive count and servers slider are hidden for
PowerScale (`hasServerCount: false`), because all of it now lives per tier. Existing panels
already override shared inputs this way.

`OutputDashboard` gains a PowerScale tier table — model, drive size, nodes, protection, raw,
usable, effective, efficiency — with a totals row, driven by `PowerScaleCapacityDetails`.
The Sankey, gauges and breakdown run on cluster totals. This mirrors the workbook's own
per-tier table and running total.

EOL: `Hardware EOL` / `Software EOL` sheets become a warning badge on end-of-life node models,
shown on the offending tier row. Read-only, no calculation impact.

New i18n keys across all four locales (EN/FR/DE/IT), full key paths at call sites per the
orphan-key test's literal scan. Node model names, protection levels and generation labels stay
untranslated as technical terms.

## 8. Validation

A new `tests/engines/powerscale-powersizer.spec.ts` walks all 122,828 fixture rows as
**single-tier clusters with VHS disabled** — the configuration the workbook itself sizes.

The gate is precision-matched to what the source can actually assert:

| Quantity | Gate | Why |
|---|---|---|
| Storage efficiency | **exact**, integer basis points | We ship the vendor's own value; any drift is a regression, not rounding. |
| Raw capacity | ±0.005 TB | The workbook prints raw to 2 decimals. |
| Usable capacity | ±0.06 % relative | See below. |

Usable cannot be matched bit-exactly, and claiming otherwise would be false. The workbook
prints usable to 2 decimal places of TB and efficiency to 4 decimals, so reconstructing
`usable = raw × efficiency × usableFactor` inherits both roundings. With `usableFactor` fitted
per `(model, driveSize)` by least squares, the reconstruction lands at **max 0.053 % error,
p99 0.008 %** across all 122,828 rows — *inside the vendor's own printing precision*, since the
2-decimal rounding of usable TB alone can account for up to 0.088 %. The spec therefore also
asserts the p99 stays under 0.01 %, which is the real regression tripwire; the 0.06 % bound
only catches catastrophes.

For scale: raidy's existing PowerScale model is wrong by 12–60 % on the same rows, and its
house tolerance elsewhere is 1 %.

Multi-tier is covered separately by summation tests: a two-tier cluster must equal the sum of
the two single-tier results, which is the model's whole claim.

A second, small spec asserts the §3.1 closed form still agrees with the shipped table on every
drive-level protection and on node-level protection below the split threshold. That is the
tripwire for a bad regeneration: if a future workbook export changes shape, the closed form
and the table diverge and the test says so.

Curated vectors in `tests/fixtures/dell-vectors.ts` covering PowerScale get rewritten against
the real values; the rest of that file is untouched.

## 9. Docs

Same commit, per CLAUDE.md: `docs/ENGINES.md` (the OneFS section, with the §3.1 formulas and
the reason the table ships), `docs/ARCHITECTURE.md` (new strategy + data files),
`docs/TESTING.md` (the fixture and how to regenerate it), `docs/DEVELOPMENT.md` (the extraction
script), `CHANGELOG.md`, and a new ADR recording the decision to ship a vendor lookup table
rather than a formula — that is a genuine departure from ADR-0004's "engines are pure
functions" spirit and deserves its own record.

## 10. Risks and open items

- **The workbook is not redistributable.** The `.xlsm` is not committed. Only derived numeric data
  and the fixture are. Worth a line in the ADR about provenance and redistribution before we
  commit the fixture.
- **H710 / A310 / H7100 / A3100 (the 1.6 DRR family) behave differently** in the neighborhood
  region and are the reason the closed form was rejected. Shipping the table sidesteps this,
  but we do not understand the mechanism, so we cannot extrapolate beyond the table's coverage.
  Node counts and models outside the table return "not sizeable" rather than a guess.
- **230 drive-size-dependent efficiency keys** are handled by an exceptions map. If a future
  export grows that set substantially, the key should just become
  `(model, driveSize, protection, nodeCount)` throughout.
- **Fixture size.** 564 KB gz in the repo. Sampling would shrink it, but the exact-match gate
  is the whole point of having the source of truth.
- **Sheets deliberately not used:** `Sizing Chart`, `Node Count Calculator`, `Selling with DRR`,
  `Dashboard`, list-price/margin columns. Pricing is out of raidy's scope (ADR-0013).

## 11. Out of scope

Performance and resilience re-modelling for a heterogeneous cluster — both size the first tier
and say so; pricing and margin; OneFS SmartPools/tiering policy (which data lands on which
pool); global namespace and SmartConnect; cross-tier data movement.
