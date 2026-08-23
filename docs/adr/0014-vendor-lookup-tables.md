# ADR-0014: Ship the vendor's table when no closed form reproduces it

Status: accepted
Date: 2026-08-22

## Context

[ADR-0004](./0004-pure-function-engines.md) commits the calculation engines to pure functions:
given a configuration, compute a result. Every platform through 3.0 obeyed it, because every
platform's capacity arithmetic has a closed form — RAID parity, ZFS RAIDZ, vSAN erasure coding,
Ceph replication. The engine encodes the formula and the formula is the truth.

Dell PowerScale broke that. A partner supplied
`vendor capacity workbook`, a macro-enabled workbook whose hidden `the data`
sheet holds **122,828 rows** exported from Dell's PowerSizer. The workbook is explicit
about what it is:

> (vendor statement: figures are exported from PowerSizer, not computed in the workbook)

We tried to derive them anyway. The OneFS FEC model is well documented: `u` stripe units per node,
`M` FEC units, node fault tolerance `nf`, stripe `width = min(u·N, Wmax)` with `Wmax` 18 for
`M ∈ {2,3}` and 20 for `M = 4`, and a mirror fallback of `1/min(nf+1, N)` when `N < 2·nf`. That
closed form reproduces most of the table. It does not reproduce all of it, and the failures are
not roundable:

- **H710 at 22 nodes, `+3n` reads 0.7250.** That requires 15.95 data nodes out of 22. No integer
  partition of 22 nodes into neighborhoods yields it.
- **378 entries on `+3d:1n` and `+3d:1n1d` depend on the drive size**, which the closed form has
  no term for. `A200 | 8 TB | +3d:1n | 38 nodes` reads 0.8421 — 16/19, where the formula gives
  15/18.
- **`A200 | +3d:1n1d` reads 0.8363 at exactly 78 nodes** with no exception entry at all, and
  returns to 0.8333 at 80. A neighborhood boundary the published model does not expose.

Efficiency is also the term everything else multiplies through, so an approximation does not stay
small: it propagates into usable capacity, into the drive populations performance and
sustainability read, and into every euro of a TCO figure.

## Decision

**When a vendor's own sizer is the authority for a platform, and no closed form reproduces its
published numbers, ship the vendor's derived table as data and keep the closed form as a
test-only reference implementation.**

For PowerScale that means:

- `src/data/powerscaleNodes.json` and `src/data/powerscaleEfficiency.json` are generated artifacts,
  emitted by `scripts/build-powerscale-catalog.mjs`. They are never hand-edited. The Biome
  *formatter* is disabled for them (the linter is not) so that a reformat cannot disguise an edit.
- `src/engines/volumetry/powerscale/onefsFormula.ts` holds the closed form. It has **no production
  import** and must never gain one. Its job is to cross-check the shipped table in tests, so a
  regenerated table that diverges from published OneFS mechanics fails loudly.
- `tests/engines/volumetry/powerscale/powersizer.spec.ts` walks **all 122,828 rows** on every test
  run and asserts the engine reproduces them: efficiency **exactly**, at integer basis points.

The engines stay pure. A lookup against a frozen table is still a pure function; the table is an
input, not a side effect.

## Consequences

**What it bought.** Efficiency is exact rather than approximate, and "exact" is checkable — a
regression anywhere in the capacity chain turns the gate red against the vendor's own numbers
rather than against our previous output. The cost of the table is small: ~2 KB gzipped, because
efficiencies are integer basis points in a `Uint16`-shaped structure, so there was never a size
argument for approximating.

**What it cost.**

- The source workbook is not redistributable. It is **never committed** — `.gitignore` guards `*.xlsm`
  and `*.xlsb` — so regenerating requires whoever holds a copy. The generated artifacts and the
  test fixture are the committed record.
- Regeneration changes **three artifacts that must be committed together**: the two JSON files and
  `tests/fixtures/powerscale-powersizer.csv.gz`. Committing a subset means the gate validates the
  engine against a table it no longer ships.
- The table only covers what Dell publishes. A model, drive size, protection and node count the
  vendor does not publish returns `undefined` from `storageEfficiency`, and `sizeTier` returns
  `null` — **"not sizeable", never zero**. An early draft backfilled 270 such entries from the
  closed form; they were removed. A confident wrong number on a dashboard is worse than a visible
  gap, which is the whole reason this ADR exists.
- Not everything is bit-exact, and the doc says so rather than overclaiming. Raw matches to the
  workbook's own six significant figures; **usable cannot be bit-exact** — measured max divergence
  0.053%, p99 0.008%, which sits *inside* the 0.088% the workbook's own rounding produces. The
  gate asserts p99 < 0.01% as the real tripwire.
- Resilience gets no such backing. PowerSizer is a *capacity* calculator: it carries no AFR, URE or
  MTBF. The PowerScale resilience model is derived from published OneFS protection semantics and is
  labelled **NOT vendor-attested** everywhere a reader will look. Do not let a future change quietly
  imply otherwise.

## Alternatives rejected

**Fit a formula to the table.** A closed form with enough fudge factors to hit 122,828 points is
not a model, it is the table with extra steps and a worse failure mode: when it drifts, nothing
says so.

**Approximate and document the error.** Rejected on propagation. Efficiency multiplies through the
entire chain, and the audience is storage engineers sizing real purchases against the same
PowerSizer we would be disagreeing with.

**Call the vendor's API at runtime.** raidy has no backend by design; all calculation is
client-side and every configuration is shareable as a URL. A network dependency would break both.

**Refuse to support PowerScale.** It is one of the platforms users actually deploy. Omitting it
because its arithmetic is a table rather than a formula would be letting an architectural
preference decide the product's scope.
