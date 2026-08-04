# Fast-tier performance contribution, per platform — Research

**Date**: 2026-08-04
**Status**: Research complete — decision pending per platform
**Scope**: Answers issue [#89](https://github.com/fjacquet/raidy/issues/89). Read-only research;
no code changed. Feeds a follow-up implementation ticket that will update
`calculatePerformance` (`src/engines/performance/index.ts`, the `else if (tiering &&
capacityDrive)` branch, lines ~250–276) and the matching comments in `docs/ARCHITECTURE.md`
(lines 305–312).

## Recap of the problem

`calculatePerformance` has one tiered branch that models a fast-tier contribution (S2D: writes
fully absorbed by the cache tier, reads blended by `workingSetPercent`) and one branch that
doesn't (vSAN OSA, Ceph, Nutanix, BeeGFS all fall through to capacity-tier-only media sizing).
That was a deliberate, documented choice in PR #82 — modelling four platforms' different cache
semantics with one generic blend would have been a guess presented as a number, and understating
is the safe direction for a sizing tool. This document does the per-platform research PR #82
deferred, so each platform can now get a decision made on real sourcing instead of a blanket
"not yet."

**The four questions asked per platform**, from the issue:
1. Does the fast tier serve reads, and under what condition (all reads / working set / recently
   written data only)?
2. Does it absorb writes fully (write-back) or as a staging area with a drain rate that becomes
   the real ceiling under sustained load?
3. Or does it only accelerate metadata/journal commits, contributing nothing to bulk data IOPS or
   bandwidth?

Each section below answers 1–3 with sources, then proposes a model (or explicitly no model) with
its input dependencies and risk.

---

## 1. VMware vSAN OSA (disk groups)

### What the fast tier does

**Reads (hybrid only):** vSAN OSA hybrid disk groups split the cache device into a fixed
**70% read cache / 30% write buffer**. All-flash disk groups dedicate **100%** of the cache
device to the write buffer and allocate **0%** to read cache — the capacity tier is already flash,
so a separate read cache is redundant. The read cache targets roughly a **90% hit rate**; on a
miss, the read falls through to the HDD capacity tier, with the surrounding ~1MB prefetched.
Source: VMware Cloud Foundation blog, "Understanding vSAN Architecture: Disk Groups"
(engineer-authored, VMware's own domain; not the formal Planning and Deployment Guide — this
70/30 split does not appear to be stated in the current docs.vmware.com reference manual, only in
this 2019 blog post). Nothing in VMware's later blogs (e.g. the 2022/2019 write-buffer-sizing
post) indicates the ratio itself changed through vSAN 8 OSA — only capacity guidance changed.

**Writes:** Full write-back. Writes acknowledge from the cache tier and do not wait on capacity-tier
destage. Destaging to the capacity tier runs on a self-tuning "elevator algorithm" that considers
capacity, proximity, incoming I/O rate, queue depth, disk utilization, and batching — it
deliberately keeps hot/overwritten blocks resident rather than destaging on a fixed schedule, so
no numeric drain rate is published. Under sustained write pressure, when the write-buffer/log
space fills, vSAN raises **Log Congestion** (metadata log space) or **SSD Congestion** (write
buffer space) and throttles incoming I/O — this is VMware's documented mechanism for "the buffer
fills and the drain rate becomes the real ceiling," confirmed via Broadcom's current KB (VMware's
present documentation platform).

**Metadata-only?** No — this is squarely category 1+2 (reads and writes), not category 3.

### Proposed model

Reuse the S2D structure, gated on `vsanOptions.diskGroupMode`:

- **Writes** (both `hybrid` and `all-flash`): absorbed by the cache tier — same write-back formula
  S2D already uses (`writeCapIOPS = cacheCount * c.performance.iops_write`). VMware documents
  100% write buffer for both disk-group modes, so this holds regardless of mode.
- **Reads**: blend cache/capacity by `workingSetPercent`, **only when `diskGroupMode === 'hybrid'`**.
  When `diskGroupMode === 'all-flash'`, do **not** blend reads — VMware documents 0% read cache
  allocation there, so a blend would fabricate a benefit VMware's own docs say doesn't exist; keep
  the existing capacity-tier-only read path for all-flash disk groups.

**Inputs that drive it:** `workingSetPercent` (reads, hybrid only), `vsanOptions.diskGroupMode`
(gates whether the read blend applies at all), the existing cache-tier drive/count from
`tiering`. A user moves the read number by changing `workingSetPercent` or by switching disk-group
mode; the write number moves only via cache-tier drive selection/count, same as S2D today.

### Risk

This raises published numbers for every hybrid vSAN OSA configuration (reads and writes) and for
the write side of all-flash OSA configs.

- **Read risk**: the model would compute a hit rate purely from `workingSetPercent`, an app-level
  slider with no direct mapping to VMware's actual algorithm (access pattern vs. cache size,
  targeting ~90% hit rate but not guaranteed). If a user's real working set exceeds the configured
  cache-tier capacity, the real hit rate collapses well below what `workingSetPercent` implies, and
  the model overstates read IOPS. This is the same class of risk S2D's read blend already carries
  today — not a new risk category, just a second platform inheriting it.
- **Write risk**: no destage/congestion throttle is modelled, so a sustained, cache-tier-saturating
  write burst is priced as if fully write-back forever. VMware's own congestion mechanism says
  otherwise once the buffer fills — but no numeric drain rate is published to model that ceiling
  against. Same accepted limitation S2D already carries; consistent, not novel.
- Both risks move the number in the dangerous direction (up), but they mirror an already-shipped,
  already-accepted precedent (S2D) rather than introducing a new failure mode.

---

## 2. Ceph (BlueStore WAL/DB offload)

### What the fast tier does

**Reads:** No. BlueStore's WAL device holds the internal write-ahead log; the DB device holds
RocksDB metadata (object map, allocator state, omap). Both are described in Ceph's own
configuration reference purely as internal journal/metadata stores — never user object data. A
client read is served from the `block` (bulk data) device; the WAL/DB device is never in the data
read path.

**Writes:** No independent capacity added — but not a complete non-factor either. Every OSD write
commits to the WAL/journal before being acknowledged; if that journal shares a spindle with bulk
data on HDD, journal writes and data writes contend for the same disk. Moving WAL/DB to NVMe
removes that contention and cuts commit latency, but it does not add a parallel pool of read/write
IOPS the way a genuine cache tier would — bulk data still lives on, and is bounded by, the HDD's
own IOPS ceiling. Ceph's `block.db` sizing guideline (~1–4% of `block` size, RGW workloads
recommended ≥4%) sizes DB for metadata *volume*, not for absorbing data throughput, which is
consistent with "commit-path accelerator" rather than "capacity tier."

**Cache tiering vs. WAL/DB offload — not the same feature.** Ceph has a separate, CRUSH-based
cache-tiering pool overlay feature, unrelated to per-OSD WAL/DB device placement. Ceph's own docs
state cache tiering "was deprecated in the Reef release... will be removed in a future release
without notice. Do not deploy new cache tiers." Raidy's `CephOptions.walDbOffload`/`tiering` fields
correspond to WAL/DB device placement (BlueStore), not the deprecated cache-tiering pool — no
confusion between the two in the current model.

**Metadata-only?** Yes, for the read axis outright. For the write axis it's "removes a specific
bottleneck on the commit path" rather than "adds capacity" — the issue's suspicion is confirmed,
with one qualification: a model that ignores WAL/DB entirely does very slightly understate
sustained random-write IOPS on a busy HDD OSD (by however much journal contention was costing it),
but that effect is a workload-dependent commit-latency term this app has no equivalent input for.

### Proposed model

**No model.** Keep the current capacity-tier-only behavior. WAL/DB structurally cannot serve data
reads, and its write-path benefit is a latency/contention-removal effect with no vendor-published
number to turn into an IOPS or bandwidth delta — reusing the S2D blend here would be exactly the
"guess presented as a number" PR #82 declined to write. Ceph is the platform issue #89's own
description already suspected belonged in category 3; this research confirms it, with the added
nuance that "contributes nothing" is precisely true for reads and only *approximately* true for
writes (true for bulk write IOPS/throughput; not true for a workload's commit-latency tail, which
this engine doesn't model for any platform).

**Inputs that would drive it:** none — there is no existing input (workload mix, working set,
drive counts) that maps to "how much journal contention did offloading actually remove," so there
is nothing to wire.

### Risk

None — this proposal changes nothing. Leaving Ceph unmodelled keeps it in the safe (understating)
direction, which is correct given the fast tier's real semantics.

---

## 3. Nutanix AOS (hybrid cluster)

### What the fast tier does

Two genuinely distinct mechanisms exist and must not be conflated:

**ILM SSD tier (Tier 0, read-oriented capacity tiering):** Information Lifecycle Management
continuously monitors I/O and migrates data between SSD and HDD based on access heat. The
promotion trigger is precisely documented: **3 touches for random I/O, or 10 touches for
sequential I/O, within a 10-minute window** (multiple reads inside a 10-second sample count as one
touch). Down-migration triggers when SSD tier utilization crosses a configurable threshold
(default 75%), evicting by last-access-time. There is **no published working-set percentage** —
promotion is touch-count-driven, not expressed as a fraction of the dataset.

**OpLog (write-back staging, distinct from the ILM tier):** A persistent write buffer, always on
SSD in hybrid clusters regardless of ILM tier state. Writes are synchronously replicated to peer
CVMs' OpLogs before acknowledgment — true write-back, fully absorbing writes it accepts. Reads of
data not yet drained from OpLog are served from OpLog itself (a genuine "recently written data"
read case, distinct from ILM's steady-state hot-read case). Critically, OpLog has a **documented
routing rule by I/O size**: writes with more than 1.5MB outstanding to a vDisk are classified
sequential and **bypass OpLog entirely**, going straight to the extent store (HDD, in a hybrid
cluster); random writes coalesce in OpLog and drain when the vDisk goes idle or OpLog reaches 85%
capacity. No numeric drain-rate throttle is published for the sustained-load case.

**Metadata-only?** No for writes (OpLog genuinely absorbs random writes); largely no for reads on
the ILM axis too, but with no percentage-based hook to model it by.

### Proposed model

This is **not** a reuse of the S2D blend — Nutanix's real split key is I/O size/pattern
(`randomPercent`), not a working-set read/write blend, so a faithful model looks structurally
different from S2D's:

- **Writes**: split by `randomPercent`. The random-write fraction is absorbed by the fast (OpLog)
  tier — same write-back IOPS treatment S2D/vSAN use for their cache tier. The sequential-write
  fraction (`sequentialPercent`) routes directly to the capacity tier, since Nutanix's own >1.5MB
  routing rule sends large sequential writes straight past OpLog. This reuses an input the engine
  already has (`randomPercent`, already used for `randomWritePenalty` vs. `sequentialWritePenalty`
  elsewhere in `calculatePerformance`) and it is directly sourced from Nutanix's documented
  behavior, not invented.
- **Reads**: **no model.** There is no published working-set percentage or hit-rate figure for
  ILM's touch-count-driven promotion — reusing `workingSetPercent` here would mean inventing a
  curve Nutanix never published, exactly the failure mode PR #82 avoided. This is the least
  defensible of the four platforms' read questions to model, and the honest answer is "it depends
  on a parameter (access-touch heat over time) the app does not model." Leave Nutanix reads on the
  existing capacity-tier-only path.

**Inputs that drive it:** `randomPercent`/`sequentialPercent` (writes only), the existing
cache-tier (OpLog-equivalent) drive/count from `tiering`. A user moves the write number by
changing the workload's random/sequential mix or the fast-tier drive selection; nothing moves the
read number, because nothing is modelled there.

### Risk

This raises the write-side number for every hybrid Nutanix configuration; reads are unaffected
(status quo).

- **Misclassification risk**: the model treats the app's `randomPercent` slider as a clean proxy
  for Nutanix's own per-write >1.5MB-outstanding sequential/random classification. Real workloads
  don't align perfectly with either axis — a workload the user labels "random" in the app could in
  practice issue large writes that Nutanix's own logic classifies sequential (bypassing OpLog), in
  which case the model overstates achievable write IOPS by crediting OpLog absorption that
  wouldn't actually happen.
- **Sustained-load risk**: OpLog drains at capacity-threshold (85%) or on vDisk idle, not at a
  published throughput rate. A model that treats OpLog as an unbounded write-back cache overstates
  sustained (non-bursty) random-write throughput once OpLog is continuously full and draining —
  same caveat class as vSAN's congestion mechanism and S2D's unlimited write-back assumption.
- Net: real risk, but bounded to the write side only, driven by an input the engine already
  possesses, and directly traceable to a documented Nutanix routing rule rather than a guess.

---

## 4. BeeGFS (metadata targets)

### What the fast tier does

**Reads/writes of bulk data:** Never. MDTs store strictly filesystem metadata — inodes, directory
entries, and file-to-chunk striping/placement maps — as extended attributes on the underlying local
filesystem. BeeGFS's own architecture docs are explicit: storage servers/storage targets "are
responsible for storing stripes of the actual contents of user files," while metadata servers "do
the coordination of file placement and striping," and clients "directly contact the storage
servers to perform file I/O." There is no "data on MDT" feature (unlike, e.g., Lustre) — the only
inlining BeeGFS does is inlining small xattrs into the inode itself, which is metadata-on-metadata,
not file content.

**Metadata ops are a genuinely separate axis, not a blend candidate.** BeeGFS's own benchmarking
guidance and public IO-500 submissions measure metadata operations per second (via `mdtest`:
create/stat/delete rates) completely separately from data throughput/IOPS (via `StorageBench`/IOR).
No BeeGFS vendor document blends the two into a single number. Metadata-target speed genuinely
gates *overall workload* performance for metadata-heavy access patterns (many small files, deep
directory trees, `stat`/`readdir`-heavy I/O) — but it gates a different axis (namespace operations
per second), not bytes or IOPS of bulk data transfer.

**Metadata-only?** Yes, unambiguously — and more strongly than Ceph. Ceph's WAL/DB has a real
(if unmodelled) effect on bulk-write latency because it shares the commit path with data. BeeGFS's
MDT has **zero structural coupling** to bulk data I/O at all; blending it into the media-layer IOPS
number would be a category error, not merely an approximation.

### Proposed model

**No model — the strongest "no model" case of the four.** Keep the current capacity-tier-only
behavior. This isn't a judgment call balancing an uncertain benefit against invented curves (as
with Nutanix reads or Ceph writes); it's that MDTs cannot serve bulk data I/O at all, so there is
nothing to add to the media layer regardless of how much research effort goes into it. If a future
increment wants to surface MDT performance, the honest representation is a **separate "metadata
ops/sec" metric** displayed alongside the bottleneck chain (not folded into it) — but that needs a
new ops/sec model with no existing input (`workingSetPercent`, `randomPercent`, tier drive counts)
mapping to namespace-operation throughput, so it is out of scope here.

**Inputs that would drive it:** none for the bulk-IOPS media layer, by design. A hypothetical
future metadata-ops metric would need new modelling work, not a reuse of any existing input.

### Risk

None — this proposal changes nothing. BeeGFS should remain permanently in this bucket regardless
of future research; the underlying architecture, not a gap in current sourcing, is why.

---

## Summary table

| Platform | Reads? | Writes? | Metadata-only? | Proposed model | Inputs | Risk if assumption wrong |
|---|---|---|---|---|---|---|
| vSAN OSA (hybrid) | Yes, ~90% hit rate target, working-set-shaped | Yes, full write-back, congestion-throttled under sustained load (no numeric rate) | No | Reuse S2D blend for reads (hybrid only) and writes (both modes) | `workingSetPercent` (reads, gated on `diskGroupMode === 'hybrid'`), cache-tier drive/count | Overstates reads if real working set > cache capacity; overstates sustained writes (no destage-rate ceiling modelled) — same class of risk S2D already carries |
| vSAN OSA (all-flash) | No (0% read cache documented) | Yes, full write-back | Partial | Writes only, same as hybrid; no read blend | cache-tier drive/count (writes only) | Same sustained-write risk as hybrid; no read risk since no read model added |
| Ceph (WAL/DB) | No | Effectively no (contention-removal, not added capacity) | Yes (for reads outright; ~yes for bulk writes) | No model | — | None — unchanged, stays safe |
| Nutanix (hybrid) | Yes, but touch-count-driven with no % figure | Yes, full write-back for random writes only (sequential bypasses OpLog); drain at 85% capacity or idle, no numeric rate | No for writes; effectively yes for reads (no modellable input) | Write-only model split by `randomPercent`; no read model | `randomPercent`/`sequentialPercent`, cache(OpLog)-tier drive/count | Overstates write IOPS if app's random/sequential label doesn't match Nutanix's own >1.5MB routing rule, and under sustained (non-idle) load with no drain-rate ceiling modelled |
| BeeGFS (MDT) | No | No | Yes, structurally | No model | — | None — unchanged, and should stay unchanged regardless of future research |

## Least-sourced answer

**Nutanix reads (ILM tier promotion, question 1).** The write-side answer (OpLog: write-back,
gated by the documented >1.5MB sequential-bypass rule, draining at 85% capacity or on idle) is
precisely sourced from the Nutanix Bible. The read-side answer is qualitatively solid (ILM
promotes hot data to SSD, confirmed by a specific touch-count formula) but has **no
vendor-published percentage or hit-rate figure** to anchor a model against — "3 touches in 10
minutes" is a promotion trigger, not a working-set fraction, and there is no documented mapping
from it to anything resembling `workingSetPercent`. That gap is exactly why this document proposes
no read model for Nutanix; the honest finding is "it depends on access-heat-over-time, a parameter
the app does not and cannot easily model," not "reads aren't served from the fast tier."

## Sources

**VMware vSAN OSA:**
- [Understanding vSAN Architecture: Disk Groups](https://blogs.vmware.com/cloud-foundation/2019/04/18/vsan-disk-groups/) — VMware Cloud Foundation blog; 70/30 read-cache/write-buffer split (hybrid), 100% write buffer (all-flash), ~90% read-cache hit-rate target, elevator destage algorithm
- [Write Buffer Sizing in vSAN When Using the Very Latest Hardware](https://blogs.vmware.com/cloud-foundation/2019/10/01/write-buffer-sizing-in-vsan-when-using-the-very-latest-hardware/) — VMware Cloud Foundation blog; write-buffer capacity guidance, corroborates write-back behavior
- [Understanding Congestion in vSAN](https://knowledge.broadcom.com/external/article/326479/understanding-congestion-in-vsan.html) — Broadcom (VMware) KB; Log Congestion / SSD Congestion throttling mechanism when the write buffer fills

**Ceph BlueStore:**
- [BlueStore Config Reference](https://docs.ceph.com/en/latest/rados/configuration/bluestore-config-ref/) — Ceph official docs; WAL/DB device roles, internal journal/metadata description
- [BlueStore Config Reference (Octopus)](https://docs.ceph.com/en/octopus/rados/configuration/bluestore-config-ref/) — Ceph official docs; `block.db` sizing guideline (~1–4% of `block`, RGW ≥4%)
- [Cache Tiering](https://docs.ceph.com/en/latest/rados/operations/cache-tiering/) — Ceph official docs; confirms cache tiering is a separate, deprecated (Reef) feature distinct from WAL/DB offload

**Nutanix AOS:**
- [Nutanix Bible — Book of AOS Storage](https://www.nutanixbible.com/4c-book-of-aos-storage.html) — Nutanix's official architecture reference; ILM touch-count promotion trigger, tier-utilization down-migration threshold, OpLog write-back/replication/drain behavior, >1.5MB sequential bypass rule
- [Sequential I/O and the OpLog versus the Extent Store](https://next.nutanix.com/how-it-works-22/sequential-i-o-and-the-oplog-versus-the-extent-store-39228) — Nutanix Community (corroborating source), sequential-vs-OpLog routing detail

**BeeGFS:**
- [Architecture Overview](https://doc.beegfs.io/latest/architecture/overview.html) — official BeeGFS docs; storage-server vs. metadata-server role separation
- [Benchmarking a BeeGFS System](https://doc.beegfs.io/latest/advanced_topics/benchmark.html) — official BeeGFS docs; metadata ops/sec (`mdtest`) measured separately from data throughput (`StorageBench`/IOR)
- [Metadata Node Tuning](https://doc.beegfs.io/latest/advanced_topics/metadata_tuning.html) — official BeeGFS docs; metadata performance's effect on metadata-heavy workloads

**Repository context read for this research:**
- `src/engines/performance/index.ts` — the branch under discussion (lines 226–282)
- `src/engines/shared/tiering.ts` — `resolveTiering`, per-platform tiering gate conditions
- `src/types/topology.ts` — `TieringConfig`, `VsanOptions`, `CephOptions`, `NutanixOptions`,
  `BeeGfsOptions`
- `src/engines/performance/strategies/{vsan,ceph,nutanix,beegfs}.ts` — existing write-penalty and
  IOPS strategies these proposals would sit alongside
- `docs/ARCHITECTURE.md` (lines 303–312) — the "deliberately not modelled" comment this research
  will inform an update to
- `docs/superpowers/specs/2026-08-04-resilience-tiering-design.md` — prior art on tiering-awareness
  gaps in the same engine, including the note that fast-tier *failure* semantics (shared fault
  domains) remain out of scope for both that work and this one
