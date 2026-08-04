# BeeGFS Sizing — Design

**Date**: 2026-08-03
**Status**: Approved
**Scope**: Add BeeGFS as a first-class storage platform in Raidy (volumetry, performance, resilience, sustainability).

## Problem

Raidy models RAID, ZFS, vSAN, S2D, Nutanix, Dell, NetApp, Ceph, Synology, Longhorn, PowerFlex, PowerScale and ObjectScale. BeeGFS — the parallel filesystem used on most HPC and AI training clusters — is missing.

BeeGFS does not fit any existing platform template. Every other platform in Raidy owns its data protection: a level name maps to an efficiency fraction. BeeGFS does not. It is a filesystem layer that federates *storage targets*, and each storage target is a **local RAID volume** (RAID6, RAID10, ZFS RAIDz2) or a bare drive. Cluster-level protection is a separate, optional feature: **Buddy Mirroring**, synchronous replication between pairs of targets.

Metadata is also physically separate: *metadata targets* (MDT) hold the filesystem namespace, usually on RAID1/RAID10 SSDs, and contribute nothing to usable data capacity. Sizing them wrong is the single most common BeeGFS deployment mistake, so the sizer should say something about it.

## Reference facts

From ThinkParQ / BeeGFS documentation:

| Fact | Value | Source |
|---|---|---|
| Metadata capacity rule of thumb | 0.3–0.5 % of total storage capacity | [System Requirements](https://doc.beegfs.io/latest/system_design/system_requirements.html) |
| Metadata density (ext4, 512 B inodes) | 500 GB ≈ 150 M files | [Metadata Node Tuning](https://doc.beegfs.io/latest/advanced_topics/metadata_tuning.html) |
| Buddy Mirroring capacity cost | exactly ×2 — "chunks of buddy mirrored files are written to two targets and thus consumed disk space is twice their size" | [System Requirements](https://doc.beegfs.io/latest/system_design/system_requirements.html) |
| Buddy groups | always pairs; data and metadata buddy mirroring are configured independently | idem |
| RAID6 storage target width | 10–12 drives is the recommended balance | [Storage Node Tuning](https://doc.beegfs.io/latest/advanced_topics/storage_tuning.html) |
| Striping (`numtargets`, `chunksize` 512 K) | performance only, no capacity effect | idem |

> **As-built divergence.** `numtargets` and `chunksize` ended up **informational**, not modelled. `numtargets` is a *per-file* stripe width, so it caps single-file throughput, while every performance figure this tool reports is a cluster aggregate bounded by the total storage-target count; `chunksize` shapes per-target sequential efficiency, and the bottleneck chain has no per-file layer for a chunk boundary to act on. Both are labelled informational in the panel (tooltip + hint) rather than wired to an invented formula. See the doc-comments on `BeeGfsOptions.chunkSizeKb` / `numTargets`.

Additional architecture reference: [BeeGFS Reference Architecture (June 2026)](https://www.beegfs.io/c/wp-content/uploads/2026/06/BeeGFS-Ref-architecture-June-2026pdf.pdf), [NetApp BeeGFS sizing guidelines](https://github.com/NetAppDocs/beegfs/blob/main/second-gen/beegfs-design-solution-sizing-guidelines.adoc).

## Decisions

1. **Level = local RAID only.** `beegfs_raid6`, `beegfs_raid10`, `beegfs_raidz2`, `beegfs_single`. Buddy Mirroring is *not* encoded in the level.
2. **Buddy Mirroring = two independent booleans** in `BeeGfsOptions` (`storageBuddyMirror`, `metadataBuddyMirror`). This mirrors how BeeGFS actually works — you can mirror metadata without mirroring data — and avoids a 7-entry level enum that still could not express the metadata case.
3. **Target width is an explicit input**: `drivesPerTarget`, default 12. RAID6 efficiency is meaningless without it. The target count is derived and shown read-only.
4. **Metadata targets reuse the existing `TieringConfig` primitive** (`src/types/topology.ts:181-207`, resolved by `src/engines/shared/tiering.ts`). Its semantics are already exactly right: the fast tier counts toward **raw** capacity but never toward usable — the same treatment Ceph WAL/DB offload gets today. `fastTier` = MDT, `capacityTier` = ST. The `TieringPanel.tsx` UI is reused as-is.
5. **All four engines in v1.** Sustainability needs no code (it is platform-agnostic).
6. **The controller class follows the LEVEL, not the platform.** *(Added post-implementation —
   see the correction note below.)* `getControllerRequirement(type, level?)` returns `'raid'` for
   `beegfs_raid6` / `beegfs_raid10`, `'hba'` for `beegfs_raidz2`, and `'either'` for
   `beegfs_single`. BeeGFS is **not** entered in `HBA_REQUIRED_TOPOLOGIES`.

> **Correction — BeeGFS is not pure software-defined storage.** The implementation initially put
> `'beegfs'` in `HBA_REQUIRED_TOPOLOGIES` (`src/types/topology.ts`), classifying it alongside Ceph
> and vSAN, so `getControllerOptions()` offered **only** HBAs. That contradicts this document's own
> Problem statement — "each storage target is a **local RAID volume**". BeeGFS never sees the
> disks: it addresses one block device per target, and in the most common deployment that device is
> a hardware RAID6 volume on a PERC or LSI controller. An IT-mode HBA is required only for
> `beegfs_raidz2`, because ZFS addresses disks directly.
>
> The error was quantitatively material and **optimistic**: the bottleneck chain's Controller layer
> reads `CONTROLLER_LIMITS[controller]`, where a Dell PERC H755 is 750 000 IOPS / 12 000 MB/s while
> the cheapest HBA in the list is 2 000 000 IOPS / 19 200 MB/s — roughly 2.7× the controller IOPS
> ceiling and 1.6× the throughput a real RAID6 node would have. This spec never stated the SDS
> classification explicitly (it was asserted in the implementation brief), which is why every review
> checked against the wrong premise; Decision 6 above records the correct rule at the source.

### Rejected alternatives

- *Efficiency-lookup only* (the Ceph/Nutanix/Longhorn shape): cheapest, but produces wrong numbers — RAID6 efficiency depends on target width, and metadata would silently inflate usable capacity.
- *File-count-driven metadata sizing* (new "number of files" / "average file size" store inputs): more accurate, but adds store fields, UI and i18n outside the topology slice. Deferred — the advisory below derives an estimated file count from MDT capacity instead, which answers the same question without new global inputs.

## Model

### Types (`src/types/topology.ts`)

```ts
export type BeeGfsTopology =
  | 'beegfs_raid6'    // storage target = local RAID6 (default)
  | 'beegfs_raid10'   // storage target = local RAID10
  | 'beegfs_raidz2'   // storage target = ZFS RAIDz2
  | 'beegfs_single'   // one drive = one target, no local RAID

export interface BeeGfsOptions {
  drivesPerTarget: number          // default 12
  storageBuddyMirror: boolean      // default false → usable ×0.5
  metadataBuddyMirror: boolean     // default true  → MDT requirement ×2
  chunkSizeKb: 512 | 1024 | 2048   // default 512, informational (see divergence note above)
  numTargets: number               // per-file stripe width, default 4, informational
  network: 'ib-hdr' | 'ib-ndr' | '100gbe' | '25gbe'  // default '100gbe', informational
  fsOverheadPercent: number        // ext4/xfs under the targets, default 2
  metadataTargets: boolean         // default false — AS-BUILT ADDITION, see below
  tiering?: TieringConfig          // fastTier = MDT, capacityTier = ST
}
```

### Volumetry

```
localFraction(level, d = drivesPerTarget):
  beegfs_raid6   -> (d - 2) / d
  beegfs_raidz2  -> (d - 2) / d
  beegfs_raid10  -> 0.5
  beegfs_single  -> 1

dataFraction = localFraction × (storageBuddyMirror ? 0.5 : 1)
```

Filesystem overhead: 2 % (`case 'beegfs'` in `overhead/filesystem-overhead.ts`), matching the ext4/xfs treatment already used for Ceph.

**Metadata advisory** (`beeGfsDetails`, built in `volumetry/index.ts` following the `longhornDetails` pattern):

```
mdtRawCapacity      = tiering.cacheTierCapacity            // 0 when no MDT configured
mdtUsable           = mdtRawCapacity × 0.5                 // RAID1/RAID10 metadata volumes
                                    × (metadataBuddyMirror ? 0.5 : 1)
mdtRecommendedMin   = usableCapacity × 0.003
mdtRecommendedTypic = usableCapacity × 0.005
estimatedFileCount  = mdtUsable / 500 GB × 150e6
status              = mdtUsable < mdtRecommendedMin ? 'under' : 'ok'
```

Surfaced in the capacity card, plus a `validators.ts` alert when `status === 'under'` or when no MDT is configured at all.

> **As-built addition: the `metadataTargets` opt-in gate.** The spec above let MDT tiering activate as soon as both `TieringPanel` drive pickers were filled in. That is a trap: enabling tiering also switches the *storage-target* drive selection from the Hardware sidebar to `tiering.capacityTier`, so simply exploring the MDT pickers would silently move the capacity calculation onto a different drive. Implementation added an explicit `metadataTargets: boolean` (default `false`) that gates both the `TieringPanel` render and the `resolveTiering` branch, mirroring Ceph's existing `walDbOffload` toggle. This is an improvement on what the spec describes and is the shipped behaviour.

### Performance

```
getWritePenalty(level, options):
  base = raid6 | raidz2 -> 6 ; raid10 -> 2 ; single -> 1
  return base × (storageBuddyMirror ? 2 : 1)
```

Reads scale linearly with drive count; writes are `driveCount × driveIOPS × write% / penalty`. Latency gets a `case 'beegfs'` in `performance/utils.ts` reflecting client–server network overhead (close to Ceph, above `standard`).

> **Controller write-back cache is deliberately not modelled.** `RaidControllerOptions.writePolicy`
> (`'write-back' | 'write-through' | 'write-back-with-bbu'`) exists and is exported to the config
> report, but it does not feed the write penalty, and no other platform consumes it — of the whole
> `RaidControllerOptions` interface only `controller` and `stripeSize` reach any engine. This engine
> models **sustained** IOPS and throughput. A battery/flash-backed write-back cache is a finite
> buffer: under a sustained write stream the host rate converges on the rate at which the cache
> drains to the array, so once the cache saturates the ceiling is the back-end array's, and the RAID
> 6 read-modify-write cost (read old data + P + Q, write new data + P + Q = 6 back-end I/Os) is
> deferred by the cache but never removed. The genuine benefits — write latency (ack from NVRAM
> instead of media) and burst absorption — are properties of the *unsaturated* cache, i.e. of a
> transient with no representation in this engine. There is one real sustained effect, full-stripe
> write coalescing, which converts a 6-I/O RMW into an `(N+2)/N` full-stripe write; but its
> magnitude is a function of write locality and stripe alignment, no platform's write penalty in
> this engine is workload-dependent, and quantifying it would mean inventing a locality model. It is
> therefore documented on the `writePolicy` type rather than approximated.

**Network model generalisation.** Buddy Mirroring doubles write traffic on the wire. Today the only platform with a non-default `NetworkModel` is vSAN, hardcoded at `performance/index.ts:300-306` against `bottleneck-chain.ts:137-177`. This is replaced by a `NETWORK_MODEL_BY_TOPOLOGY: Partial<Record<TopologyType, NetworkModelResolver>>` lookup. vSAN behaviour must be bit-identical afterwards — its existing performance specs are the regression gate, and they are run before the BeeGFS entry is added. BeeGFS contributes `trafficFraction = write% × (buddy ? 2 : 1) + read% × 1`.

### Resilience

- `resilienceWorker.ts` `getParityDrives`: `beegfs_raid6`/`beegfs_raidz2` → 2, `beegfs_raid10` → 1, `beegfs_single` → 0.
- `OutputDashboard.tsx`: pass `mirrorCopies: 2` when `storageBuddyMirror` is on, and pass the **storage target count** where the worker expects `serverCount`. The worker already overloads that field as the RAID-group count, so the worker contract is unchanged.

> **As-built divergence.** The wiring landed in `useResilience.ts` rather than `OutputDashboard.tsx`, and the target count is **not** `floor(driveCount × serverCount / drivesPerTarget)` as written above — that expression applies neither hot spares nor MDT tiering, so it disagreed with the capacity card (100 drives / 10 spares / `drivesPerTarget` 12: volumetry 7 targets, resilience 8 groups). The shipped derivation is the exported `resolveBeeGfsSimulationScope`, which reuses volumetry's own `resolveBeeGfsUsableDrives` + `calculateStorageTargets`, so both surfaces describe one cluster. Under MDT tiering the drive capacity/URE/AFR handed to the worker also follow the capacity tier.

### Sustainability

No code. `src/engines/sustainability/` is topology-agnostic (drive count × power). MDT drives are already included in raw via `resolveTiering`.

## Component boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `volumetry/strategies/beegfs.ts` | level + `drivesPerTarget` + buddy → data fraction | `BeeGfsOptions` only |
| metadata advisory in `volumetry/index.ts` | MDT capacity vs 0.3–0.5 % rule, estimated file count | resolved tiering + usable capacity |
| `performance/strategies/beegfs.ts` | write penalty, IOPS | `BeeGfsOptions` only |
| `NETWORK_MODEL_BY_TOPOLOGY` | per-platform wire amplification | topology type + workload mix |
| `BeeGfsOptionsPanel.tsx` | inputs; delegates MDT selection to `TieringPanel` | store slice |

Each is a pure function of its inputs and testable in isolation, matching the existing strategy-pattern contract (`VolumetryStrategy`, `PerformanceStrategy`).

## Error handling

- `drivesPerTarget` below the level minimum (4 for RAID6/RAIDz2, 2 for RAID10) → validation alert, no NaN.
- Usable drives (after hot spares and MDT tiering) not a multiple of `drivesPerTarget` → warning showing the wasted drives; capacity is computed on whole targets only. **As built and verified:** `usableDrives = storageTargetCount × drivesPerTarget`, so stranded drives contribute to raw capacity (and their own breakdown bucket) but never to usable. The warning's count comes from `beeGfsDetails.strandedDrives`, the same number the capacity card prints.
- `storageBuddyMirror` with fewer than 2 nodes → alert (buddy groups must span fault domains).
- No MDT configured → advisory notice, not an error; BeeGFS can co-locate metadata on storage nodes.

## Testing

- `tests/fixtures/beegfs-vectors.ts` — sourced `PlatformVector[]` following the `longhorn-vectors.ts` documentation rigour. Vectors: RAID6 ×12 no buddy (83.3 %), RAID6 ×12 buddy (41.7 %), RAID10 no buddy (50 %), RAID10 buddy (25 %), `single` + buddy (50 %), a RAID6 ×10 target-width case, and a **stranding** case (5 nodes × 20 drives at `drivesPerTarget` 12 → 8 whole targets, 4 stranded) pinning the whole-targets-only rule below. The separate-MDT case lives in `tests/engines/volumetry/beegfs.spec.ts` rather than the vector file.
- `tests/engines/volumetry/vectors/beegfs.spec.ts` — loop harness.
- `tests/engines/volumetry/beegfs.spec.ts` — behavioural: advisory status transitions, estimated file count, `drivesPerTarget` sensitivity, `metadataBuddyMirror` has no effect on usable.
- vSAN performance specs must pass unchanged after the network-model refactor.
- Existing platform-enumerating specs updated: `volumetry.spec.ts`, `capabilities.spec.ts`, `outputRelevance.spec.ts`, `perf-strategies.spec.ts`, new `beegfsConstants.spec.ts`.
- 75 % coverage threshold on `engines/`, `workers/`, `utils/` maintained.

## Out of scope

- Explicit file-count / average-file-size inputs (see rejected alternatives).
- BeeOND (on-demand burst filesystem) and storage pools / tiering *within* BeeGFS.
- Client-side caching and per-client bandwidth modelling — the performance engine has no client concept.
