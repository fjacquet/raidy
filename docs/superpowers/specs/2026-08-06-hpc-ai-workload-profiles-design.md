# HPC / AI Workload Profiles

**Date**: 2026-08-06
**Status**: Approved, ready for planning
**Source**: `beegfs_workload_configuration_recommendations.md` (field feedback on the BeeGFS workflow)

## Problem

The workload panel offers four presets — Database (OLTP), File Server, Video Streaming, Backup
Target — hardcoded as inline `onClick` bodies in `src/components/inputs/WorkloadPanel.tsx`. None of
them describes a workload BeeGFS is deployed for. BeeGFS serves HPC scratch, AI training and
checkpointing, genomics, and EDA; it is not the preferred architecture for transactional databases
or general-purpose file serving. A user sizing a BeeGFS cluster is offered only presets that
misrepresent their workload, and the neutral default (70 % read, 50 % random, 64K) is shaped for
general-purpose block storage rather than large sequential parallel I/O.

## Goals

1. Offer six HPC/AI profiles when the selected topology is BeeGFS.
2. Hide profiles that do not fit the selected platform, rather than showing ten buttons everywhere.
3. Move the neutral default to values realistic for parallel filesystem workloads.
4. Support the block sizes those profiles need (`512K` is absent from the enum today).

## Non-goals

- Profiles do not set `dailyWriteVolume`. Every other engine constant traces to a vendor
  specification; a per-profile daily-write figure would have no such source, and the current
  presets do not set it either.
- No change to any calculation engine beyond adding `512K` to the block-size byte table.
- No reclassification of platforms other than BeeGFS. Ceph and Longhorn arguably serve HPC too;
  that is a one-line change to the class map when someone has a reason to make it.

## Design

### Profile catalogue — `src/data/workloadProfiles.ts`

Presets become data rather than inline handlers.

```ts
export type ProfileClass = 'hpc' | 'general'

export interface WorkloadProfile {
  id: string
  /** Full literal i18n path — see "Why literal keys" below. */
  labelKey: string
  class: ProfileClass
  readPercent: number
  randomPercent: number
  blockSize: BlockSize
}

export const WORKLOAD_PROFILES: readonly WorkloadProfile[] = [ /* table below */ ]
```

| id | Read % | Random % | Block | Class |
|---|---:|---:|---:|---|
| `aiTraining` | 70 | 30 | 512K | hpc |
| `aiCheckpointing` | 20 | 10 | 1M | hpc |
| `hpcScratch` | 60 | 20 | 1M | hpc |
| `genomics` | 65 | 40 | 256K | hpc |
| `edaCae` | 55 | 35 | 256K | hpc |
| `aiInference` | 80 | 25 | 512K | hpc |
| `database` | 70 | 80 | 8K | general |
| `fileServer` | 90 | 20 | 128K | general |
| `videoStreaming` | 95 | 10 | 1M | general |
| `backup` | 20 | 5 | 1M | general |

The four `general` rows reproduce the existing buttons exactly — this refactor must not change what
they do. The six `hpc` rows come from the source document. That document gives block-size *ranges*
(for example "512K to 1M"); `blockSize` is an enum, so each profile takes a single value from within
its range, chosen for the dominant characteristic: throughput-bound profiles take the larger end,
mixed-pipeline profiles the smaller.

### Platform classification

```ts
/** Exhaustive over TopologyType — a new platform fails to compile until it is classed. */
export const TOPOLOGY_PROFILE_CLASSES: Record<TopologyType, readonly ProfileClass[]> = {
  beegfs: ['hpc'],
  standard: ['general'],
  zfs: ['general'],
  s2d: ['general'],
  proprietary: ['general'],
  vsan_osa: ['general'],
  vsan_esa: ['general'],
  ceph: ['general'],
  powerflex: ['general'],
  powerstore: ['general'],
  powerscale: ['general'],
  objectscale: ['general'],
  nutanix: ['general'],
  powervault: ['general'],
  longhorn: ['general'],
}
```

The value is an array, not a single class, so a platform that genuinely serves both audiences can
be given `['hpc', 'general']` without reworking the type.

**This map does not belong in `src/engines/capabilities.ts`.** Every flag in that file is asserted
against real engine behaviour by `tests/engines/capabilities.spec.ts`, which is what stops it
drifting. Workload fit is an editorial judgement with no engine behaviour to probe. Adding an
unprobeable flag would weaken the invariant that makes that file trustworthy.

### Why literal keys

`labelKey` holds a complete path (`'presets.aiTraining'`), not a prefix assembled at the call site.
`tests/i18n/orphanKeys.spec.ts` scans all of `src/**/*.{ts,tsx}` for literal key substrings, so a
literal in the data file is visible to the scan — the same mechanism that keeps
`resilience.recommendation.*` honest without an exemption. A template such as
``t(`presets.${id}.label`)`` would be invisible and would require a `DYNAMIC_PREFIXES` entry, which
exempts the whole subtree and is the weaker check.

### `512K` block size

- `src/types/config.ts:26` — add `'512K'` to `BLOCK_SIZES` between `'256K'` and `'1M'`.
- `src/engines/performance/index.ts:73` — add `'512K': 524288` to `BLOCK_SIZE_BYTES`.
- `WorkloadPanel.tsx` — add `'512K': '512K'` to `BLOCK_SIZE_LABELS` and a `hint512k` line.

`BLOCK_SIZE_BYTES` and `BLOCK_SIZE_LABELS` are both `Record<BlockSize, …>`, so the compiler names
every site that needs updating. `src/utils/schemas.ts:377` builds its enum from `BLOCK_SIZES` and
needs no edit — URL parsing accepts the new value automatically.

### Default workload values

`src/store/slices/workloadSlice.ts`:

| Field | Before | After |
|---|---|---|
| `readPercent` | 70 | 60 |
| `randomPercent` | 50 | 25 |
| `blockSize` | `'64K'` | `'512K'` |
| `dailyWriteVolume` | 1 TB | 1 TB (unchanged) |

**This rewrites existing shared URLs.** `partialize` runs `omitDefaults`, so a hash created today
carries nothing for a field left at its default; after this change that same link renders at the new
value. The repository has done this once before — `hotSpares` 1→0 shipped in v2.0.0 — and the
precedent is a major version bump. This change ships the same way: `package.json` 2.1.0 → 3.0.0,
with a `CHANGELOG.md` entry that names the URL effect explicitly rather than only the new defaults.

### Panel behaviour

`WorkloadPanel` reads `topology.type` from the store, resolves its allowed classes through
`TOPOLOGY_PROFILE_CLASSES`, and renders only the matching profiles. Clicking one calls
`setReadPercent`, `setRandomPercent`, and `setBlockSize` — the same three setters as today, now
driven from the table.

- BeeGFS: six HPC profiles. Database, File Server, Video Streaming and Backup are not rendered.
- Every other platform: the existing four, visually and behaviourally unchanged.

The section heading is topology-conditional: `presets.labelHpc` ("HPC / AI Workload Profile") when
the topology's class array includes `'hpc'`, the existing `presets.label` otherwise. The guidance
sentence from the source document renders beneath the grid under that same condition:

> BeeGFS is generally optimized for parallel HPC and AI workloads such as scratch space, training
> data access, and checkpointing. It is not typically the preferred choice for transactional
> databases, general-purpose file serving, or standard video streaming workloads.

Hiding rather than dimming the poor-fit profiles is a deliberate choice over the source document's
"mark as not recommended". The panel stays at four to six buttons on every platform, and a user who
wants to model an OLTP workload on BeeGFS can still set the three sliders by hand — the escape
hatch survives without the visual cost.

### Internationalisation

New keys in `src/i18n/locales/{en,fr,de,it}/workload.json`:

- `presets.aiTraining`, `presets.aiCheckpointing`, `presets.hpcScratch`, `presets.genomics`,
  `presets.edaCae`, `presets.aiInference`
- `presets.labelHpc`
- `presets.hpcGuidance` (the sentence above)
- `blockSize.hint512k`

Existing `presets.database`, `presets.fileServer`, `presets.videoStreaming`, `presets.backup` and
`presets.label` are reused unchanged. Technical terms (HPC, AI, EDA, CAE, BeeGFS) stay untranslated
per the project convention; `tests/i18n/parity.spec.ts` enforces that all four locales carry the
same key set.

## Testing

**`tests/data/workloadProfiles.spec.ts`** (new)
- Every profile: `readPercent` and `randomPercent` within 0–100, `blockSize` a member of
  `BLOCK_SIZES`, `id` unique.
- Every `labelKey` resolves to a non-empty string in all four locales.
- At least one profile exists for each `ProfileClass`, so no platform can render an empty grid.
- Every `TopologyType` maps to a non-empty class array.

**`tests/components/WorkloadPanel.spec.tsx`** (new or extended)
- BeeGFS topology: `aiTraining` rendered, `database` not.
- `standard` topology: `database` rendered, `aiTraining` not.
- Clicking a profile applies all three values to the store.
- The guidance sentence appears for BeeGFS and not for `standard`.
- Must stub `window.matchMedia` — jsdom lacks it and `InfoTooltip` reaches it through
  `useIsTouchDevice`.

**`tests/engines/performance/`** (extended)
- `512K` maps to 524288 bytes and produces throughput between the `256K` and `1M` results at
  otherwise identical inputs.

Coverage threshold on `src/engines/**` and `src/utils/**` remains 75 %; the new data file is
constant-only and exercised by its own spec.

## Documentation

Changed in the same commit, per the repository's docs-in-sync rule:

- `docs/USER-GUIDE.md` — workload profile section: what the profiles are, why they differ by
  platform, that `512K` exists.
- `CHANGELOG.md` — new profiles, `512K` block size, changed defaults, and the shared-URL
  consequence stated plainly.
- `package.json` — version 3.0.0.

## Risks

| Risk | Mitigation |
|---|---|
| Old shared URLs silently render at the new defaults | Accepted deliberately; major version bump and an explicit CHANGELOG note |
| Profile values have no vendor citation | They are UI starting points, not engine constants; the source document is cited in this spec and the values are trivially editable in one table |
| A new platform ships unclassed | `Record<TopologyType, …>` is exhaustive — it fails to compile |
| `512K` missed at some call site | `Record<BlockSize, …>` on both the byte table and the label table — also a compile failure |
