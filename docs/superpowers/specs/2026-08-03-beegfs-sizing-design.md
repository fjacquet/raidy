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

Additional architecture reference: [BeeGFS Reference Architecture (June 2026)](https://www.beegfs.io/c/wp-content/uploads/2026/06/BeeGFS-Ref-architecture-June-2026pdf.pdf), [NetApp BeeGFS sizing guidelines](https://github.com/NetAppDocs/beegfs/blob/main/second-gen/beegfs-design-solution-sizing-guidelines.adoc).

## Decisions

1. **Level = local RAID only.** `beegfs_raid6`, `beegfs_raid10`, `beegfs_raidz2`, `beegfs_single`. Buddy Mirroring is *not* encoded in the level.
2. **Buddy Mirroring = two independent booleans** in `BeeGfsOptions` (`storageBuddyMirror`, `metadataBuddyMirror`). This mirrors how BeeGFS actually works — you can mirror metadata without mirroring data — and avoids a 7-entry level enum that still could not express the metadata case.
3. **Target width is an explicit input**: `drivesPerTarget`, default 12. RAID6 efficiency is meaningless without it. The target count is derived and shown read-only.
4. **Metadata targets reuse the existing `TieringConfig` primitive** (`src/types/topology.ts:181-207`, resolved by `src/engines/shared/tiering.ts`). Its semantics are already exactly right: the fast tier counts toward **raw** capacity but never toward usable — the same treatment Ceph WAL/DB offload gets today. `fastTier` = MDT, `capacityTier` = ST. The `TieringPanel.tsx` UI is reused as-is.
5. **All four engines in v1.** Sustainability needs no code (it is platform-agnostic).

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
  chunkSizeKb: 512 | 1024 | 2048   // default 512, sequential performance
  numTargets: number               // per-file stripe width, default 4, performance only
  network: 'ib-hdr' | 'ib-ndr' | '100gbe' | '25gbe'  // default '100gbe'
  fsOverheadPercent: number        // ext4/xfs under the targets, default 2
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

### Performance

```
getWritePenalty(level, options):
  base = raid6 | raidz2 -> 6 ; raid10 -> 2 ; single -> 1
  return base × (storageBuddyMirror ? 2 : 1)
```

Reads scale linearly with drive count (striping across `numTargets`); writes are `driveCount × driveIOPS × write% / penalty`. Latency gets a `case 'beegfs'` in `performance/utils.ts` reflecting client–server network overhead (close to Ceph, above `standard`).

**Network model generalisation.** Buddy Mirroring doubles write traffic on the wire. Today the only platform with a non-default `NetworkModel` is vSAN, hardcoded at `performance/index.ts:300-306` against `bottleneck-chain.ts:137-177`. This is replaced by a `NETWORK_MODEL_BY_TOPOLOGY: Partial<Record<TopologyType, NetworkModelResolver>>` lookup. vSAN behaviour must be bit-identical afterwards — its existing performance specs are the regression gate, and they are run before the BeeGFS entry is added. BeeGFS contributes `trafficFraction = write% × (buddy ? 2 : 1) + read% × 1`.

### Resilience

- `resilienceWorker.ts` `getParityDrives`: `beegfs_raid6`/`beegfs_raidz2` → 2, `beegfs_raid10` → 1, `beegfs_single` → 0.
- `OutputDashboard.tsx`: pass `mirrorCopies: 2` when `storageBuddyMirror` is on, and pass the **storage target count** (`floor(driveCount × serverCount / drivesPerTarget)`) where the worker expects `serverCount`. The worker already overloads that field as the RAID-group count (`resilienceWorker.ts:139-140`), so the worker contract is unchanged.

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
- `driveCount × serverCount` not a multiple of `drivesPerTarget` → warning showing the wasted drives; capacity is computed on whole targets only.
- `storageBuddyMirror` with fewer than 2 nodes → alert (buddy groups must span fault domains).
- No MDT configured → advisory notice, not an error; BeeGFS can co-locate metadata on storage nodes.

## Testing

- `tests/fixtures/beegfs-vectors.ts` — sourced `PlatformVector[]` following the `longhorn-vectors.ts` documentation rigour. Vectors: RAID6 ×12 no buddy (83.3 %), RAID6 ×12 buddy (41.7 %), RAID10 no buddy (50 %), RAID10 buddy (25 %), `single` + buddy (50 %), and one case with separate MDT proving the fast tier lands in raw only.
- `tests/engines/volumetry/vectors/beegfs.spec.ts` — loop harness.
- `tests/engines/volumetry/beegfs.spec.ts` — behavioural: advisory status transitions, estimated file count, `drivesPerTarget` sensitivity, `metadataBuddyMirror` has no effect on usable.
- vSAN performance specs must pass unchanged after the network-model refactor.
- Existing platform-enumerating specs updated: `volumetry.spec.ts`, `capabilities.spec.ts`, `outputRelevance.spec.ts`, `perf-strategies.spec.ts`, new `beegfsConstants.spec.ts`.
- 75 % coverage threshold on `engines/`, `workers/`, `utils/` maintained.

## Out of scope

- Explicit file-count / average-file-size inputs (see rejected alternatives).
- BeeOND (on-demand burst filesystem) and storage pools / tiering *within* BeeGFS.
- Client-side caching and per-client bandwidth modelling — the performance engine has no client concept.
