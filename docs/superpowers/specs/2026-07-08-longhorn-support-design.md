# Longhorn support — design

Date: 2026-07-08
Status: approved (brainstorming) → ready for implementation plan
Issue: [#51 "suse longhorn"](https://github.com/fjacquet/raidy/issues/51)

## Context

Issue #51 is a Longhorn capacity-planning specification. Longhorn (SUSE Storage) is
cloud-native distributed **block** storage for Kubernetes: each volume is synchronously
replicated to `R` full copies, one per storage node, stored as thin-provisioned sparse
files. The issue frames sizing as a single formula:

```
Raw Capacity Target = U × R × S × G ÷ F
```

where `U` = usable app data, `R` = replica count (2 or 3), `S` = snapshot headroom (~1.20),
`G` = growth headroom (~1.20), `F` = free-space factor (0.75 root-disk / 0.90 dedicated-disk).

Raidy is a **forward** simulator: hardware (drives × count × servers) + topology → usable
capacity. The issue is written *inverse* (target usable → raw to buy), but solving the
formula for usable gives `U = Raw × F ÷ (R·S·G)`, which is expressible in the forward model.
Structurally Longhorn is almost identical to Ceph's replicated pools (`1/R` efficiency + a
free-space guardrail), which is already a first-class topology.

### Vendor-doc validation (Perplexity → longhorn.io + documentation.suse.com)

- **Replicas** are full sparse copies, one per node; physical efficiency ≈ `1/R` when
  ignoring snapshots and assuming near-full volumes. *(documented)*
- **`F` maps to a real setting** — Longhorn's *"Storage Minimal Available Percentage"*,
  default **25%**. Docs say dedicated disk → **10%**, root disk → **25%** + over-provisioning
  100%. So the issue's `F = 0.75 / 0.90` is literally `1 − minimalAvailable%`. It behaves like
  Ceph's nearfull guardrail (a scheduling reduction). *(documented)*
- **`S` (snapshots)** genuinely consumes physical per-replica disk (snapshot chains live
  inside each replica), but Longhorn publishes **no fixed percentage** — the 1.20 is a
  planning assumption, hence a tunable, not a constant. *(real consumer, tunable %)*
- **`G` (growth)** has no physical basis — nothing in Longhorn consumes disk for future
  growth. Advisory only. *(planning only)*
- **Over-provisioning** (SUSE default **100%**, upstream Longhorn **200%**) is a
  thin-provisioning *scheduling* multiplier — it over-*commits* logical volume size and does
  **not** reduce physical usable capacity. The issue's own formula correctly excludes it.
  Modeled as a displayed guardrail, never as a capacity multiplier. *(scheduling-only)*

## Goals

- Add **Longhorn** as a first-class forward topology, modeled on Ceph's replicated pools.
- Put the design work on **capacity (volumetry)**; surface every number the issue asks for
  (raw, physical usable, recommended committed data, per-node allocation, guardrails).
- Give performance / resilience / sustainability correct-but-generic replica-based behavior
  reusing existing patterns, so no engine breaks.

## Non-goals

- No inverse "sizing calculator" UX / separate mode — the issue's numbers are surfaced inside
  the forward model.
- No bespoke Longhorn performance tuning beyond the replication write-penalty already used for
  Ceph replicated pools.
- No backup-repository, DR-target, or Kubernetes CPU/memory/network sizing (explicitly out of
  scope in the issue).
- No native compression/dedup (Longhorn block storage has none).

## Topology levels

Two levels, mirroring Ceph's `ceph_replicated_2` / `ceph_replicated_3`:

| Level          | Replicas `R` | Efficiency | Notes                              |
|----------------|--------------|------------|------------------------------------|
| `longhorn_r2`  | 2            | `1/2`      | efficiency-oriented production     |
| `longhorn_r3`  | 3            | `1/3`      | default when ≥ 3 storage nodes     |

Decided: **no `longhorn_r1`** (dev/test, no redundancy) in v1 — the issue treats replica count
as a 2-or-3 design decision. Can be added later.

**Validation:** require `serverCount ≥ R` (replica placement needs one node per replica),
matching the issue's acceptance criterion on node count. Emits a topology validation error
otherwise, consistent with the existing `validateTopology` flow.

## Options panel (`LonghornOptions`)

```ts
interface LonghornOptions {
  /** Disk deployment model — presets the two fields below */
  diskMode: 'dedicated' | 'root'
  /** Longhorn "Storage Minimal Available %" (0–100) → F = 1 − pct/100.
   *  Default 25 (root) / 10 (dedicated). [documented] */
  minimalAvailablePercent: number
  /** Snapshot headroom S ≥ 1.0, default 1.20 — reserves physical snapshot-chain space. */
  snapshotHeadroom: number
  /** Growth headroom G ≥ 1.0, default 1.20 — ADVISORY only, never subtracted from usable. */
  growthHeadroom: number
  /** Storage Over-Provisioning % — advisory display only. Default 100 (root) / 200 (dedicated). */
  overProvisioningPercent: number
}
```

`diskMode` is the primary toggle; flipping it presets `minimalAvailablePercent` and
`overProvisioningPercent` to the documented defaults, while both stay user-editable
(matching the issue: dedicated *may* reduce to 10%; root *shall* remain 25%).

`DEFAULT_LONGHORN_OPTIONS` = `{ diskMode: 'dedicated', minimalAvailablePercent: 10,
snapshotHeadroom: 1.2, growthHeadroom: 1.2, overProvisioningPercent: 200 }`
(dedicated disks are the documented production preference).

## Capacity pipeline (the core)

Applied in this order; each step is a distinct breakdown slice (Sankey). Order is fixed so
slices are non-overlapping (the multiplications themselves are commutative).

```
Raw = drive.capacity_raw × driveCount    (standard non-tiered path; driveCount is cluster-wide,
                                          as the existing engine already treats it. serverCount
                                          is NOT a raw multiplier — it drives the ≥ R validation
                                          and the per-node split only. Longhorn is non-tiered in v1.)
  → redundancy overhead   × (1/R)             replica copies
  → free-space reserve    × F  (= 1 − minAvail%)  Ceph-nearfull-style guardrail
  → snapshot reserve      × (1/S)              real per-replica snapshot chains
  → host filesystem overhead  −  (xfs/ext4)    node data disk is formatted; standard engine step
  = PHYSICAL USABLE
```

- **Host filesystem overhead: included** (decided). The node's data disk is really formatted
  (xfs/ext4) and Longhorn writes sparse files onto it; this reuses the engine's standard
  `filesystemOverhead` step. It makes Raidy marginally more conservative than the issue's pure
  formula — acceptable and more accurate.
- **Compression / dedup: not applied** — `applyCompressionDedup` passes Longhorn through
  unchanged (Longhorn is block storage with no native data reduction).
- **Growth & over-provisioning: never subtract** — surfaced as advisory readouts below.

Implementation notes:
- `dataFraction = 1/R` lives in `longhornStrategy.calculateDataFraction` (parity/redundancy
  slice), exactly like `cephStrategy`.
- The free-space reserve reuses the Ceph "safe capacity" mechanism in `volumetry/index.ts`
  (`usableCapacity × F`, producing a `longhornFreeSpaceReserve` breakdown slice analogous to
  `cephSafeCapacityReduction`).
- The snapshot reserve is a new reduction `usableCapacity × (1/S)`, producing a
  `longhornSnapshotReserve` slice.

## Advisory readouts (`LonghornCapacityDetails`)

New optional result field, analogous to `ZfsCapacityDetails`:

```ts
interface LonghornCapacityDetails {
  physicalUsable: number            // bytes — safe app-data ceiling incl. snapshots
  recommendedCommittedData: number  // physicalUsable ÷ G — commit today, leave growth room
  perNodeUsable: number             // physicalUsable ÷ serverCount
  replicaCount: number
  minimalAvailablePercent: number
  overProvisioningPercent: number   // displayed guardrail
  diskMode: 'dedicated' | 'root'
}
```

These populate the "Design Output Format" summary the issue requires (usable target, replica
count, headroom factors, per-node allocation, guardrails).

## Validation vector (proves the model)

The issue's worked example — 10 TiB usable, R=3, S=1.20, G=1.20, F=0.75 → **57.6 TiB raw** —
reproduces exactly in the forward direction and becomes a fixture test:

```
given Raw = 57.6 TiB, R = 3, F = 0.75, S = 1.20
  physical usable          = 57.6 × (1/3) × 0.75 × (1/1.20) = 12.0 TiB
  recommended committed    = 12.0 ÷ 1.20 (G)                = 10.0 TiB ✓  (= issue's U)
```

(The 12.0 = `U × S` snapshot-inclusive ceiling; the 10.0 = the growth-adjusted commit target.
Host-FS overhead is disabled in this vector so it checks the pure replica/guardrail math; a
second vector exercises the FS step.)

## Other engines (generic, reuse Ceph patterns)

- **Performance** (`performance/strategies/longhorn.ts` + latency utils): write penalty = `R`,
  reads scale with replica/OSD count; latency = replication path (2× media + network + CPU
  replication overhead). ~10-line strategy mirroring `ceph.ts`.
- **Resilience** (`resilienceWorker.ts`): replicated redundancy, survives `R − 1` concurrent
  failures — mapped like `ceph_replicated_R`.
- **Sustainability**: already drive-count-based; works unchanged.

## Files touched (mirrors the Ceph footprint)

- **Types**: `src/types/topology.ts` — add `'longhorn'` to `TopologyType`, `LonghornTopology`
  level union, `Topology` union member, `LonghornOptions`, add to `HBA_REQUIRED_TOPOLOGIES`.
  `src/types/results.ts` — `LonghornCapacityDetails`, optional field on `VolumetryResult`.
- **Volumetry**: `strategies/longhorn.ts` (new); `helpers/calculationHelpers.ts` (register
  strategy + options); `index.ts` (free-space + snapshot reductions, `longhornDetails`, skip
  compression/dedup, input plumbing); `breakdown/buildBreakdown.ts` (new slices).
- **Performance**: `strategies/longhorn.ts` (new) + registration; `utils.ts` latency branch.
- **Resilience**: `workers/resilienceWorker.ts` — replicated redundancy mapping.
- **Store**: `store/slices/topologySlice.ts` — `longhornOptions` state, setter,
  `DEFAULT_LONGHORN_OPTIONS`.
- **UI**: `components/inputs/topology-options/LonghornOptionsPanel.tsx` (new);
  `topologyConstants.ts` (level labels/metadata); wire panel where `CephOptionsPanel` renders.
- **i18n**: `src/i18n/locales/{en,fr,de,it}/topology.json` — level names, descriptions,
  option labels.
- **Tests**: `tests/engines/volumetry/longhorn.spec.ts` + fixture vectors (the 57.6 TiB
  reproduction above, plus an FS-overhead vector and a `serverCount < R` validation vector).
- **Docs (same commit)**: `docs/ARCHITECTURE.md` platform list, `CLAUDE.md` project-overview
  platform list, `CHANGELOG.md`, `README.md`.

## Acceptance criteria (from the issue, mapped)

- Raw target computed by the §"Capacity pipeline" method — ✅ forward model.
- Replica count explicitly chosen — ✅ topology level `longhorn_r2` / `longhorn_r3`.
- Disk model identified — ✅ `diskMode` toggle.
- Free-space protection aligned to operating model — ✅ `minimalAvailablePercent` drives `F`.
- Snapshot retention/headroom documented — ✅ `snapshotHeadroom` (S).
- Node count supports replica placement — ✅ `serverCount ≥ R` validation.
- Growth included — ✅ `growthHeadroom` (G) advisory readout.
- Final recommendation is a deployable design value — ✅ raw + per-node allocation surfaced.
