# Fast tier as a shared failure domain, per platform — Research and Design

**Date**: 2026-08-04
**Status**: Research complete — design proposed, decision pending per platform
**Scope**: Answers issue [#88](https://github.com/fjacquet/raidy/issues/88). Read-only research; no
code changed. Designs against the **post-#107 shape** of `src/workers/resilienceWorker.ts` (branch
`origin/fix/worker-group-modelling`, merged as `ede321e`), not what is on `main` today. Feeds a
follow-up implementation ticket that would touch `src/hooks/useResilience.ts`
(`tieredPlatformScope`, `SIMULATION_SCOPE_BY_TOPOLOGY`), `src/workers/resilienceWorker.ts`
(`computeTopologyModel`, `runSingleSimulation`), `src/types/worker.ts` (`SimulationInput`), and the
"Not modelled" caveats in `docs/ARCHITECTURE.md` (lines 607–609) and `useResilience.ts` (lines
151–155).

## Recap of the problem

PR #82 made the Monte Carlo simulation size its population from the **capacity tier** for tiered
S2D, vSAN OSA, Ceph and Nutanix. It corrected *which* drives are simulated without modelling *why*
a fast-tier failure could cascade. The fast tier is therefore currently **not simulated at all** on
these paths — it is neither a failure source nor a group-kill trigger.

Issue #88 correctly identifies this as the one outstanding modelling gap in this repo that moves
numbers in the **unsafe** direction: every other gap understates resilience, this one reports
*better* survival than the hardware delivers.

**This document's headline finding is that the framing in #88, while directionally right about the
physics, is wrong about the magnitude — and that the obvious implementation would make the tool
much less accurate, not more.** Two things came out of the research that reframe the whole ticket:

1. **A fast-tier group kill is almost never a data-loss event.** On every platform studied, the
   blast radius of a fast-tier device failure is bounded by *one node's contribution*, and every
   one of these platforms places its redundancy **across nodes** by construction. A vSAN disk-group
   loss, a Ceph WAL/DB kill, an S2D cache-drive loss — all are "this node degraded, rebuild from
   the other nodes," not "data gone." Data loss requires a *second* fault-domain failure inside the
   rebuild window. Sources in §1–§4.
2. **The simulation has no concept of a node.** For the four tiered platforms, `groupCount` is
   `serverCount` but the worker only uses `serverCount` when `isGroupTopology(raidLevel)` is true —
   and no vSAN/Ceph/Nutanix/S2D level string is in that list. Those levels route to the **flat
   drive-pair mirror model** (arbitrary pairing) or the **global-counter parity model**, neither of
   which knows which node a drive lives on. Injecting a correlated group kill into either produces
   a large, physically *wrong* survival drop. Quantified in §6.

So the correct sequencing is: **node-aware placement is a prerequisite, not a detail.** Modelling
the blast radius without it is worse than the status quo.

**The four questions asked per platform:**
1. What does a fast-tier device failure actually take down (blast radius)?
2. Is it recoverable in place, or must the dependent capacity devices be rebuilt?
3. Is it a *data-loss* event at the cluster level, or a degradation-plus-resync event?
4. Does the app's existing `TieringConfig` carry enough to know the blast radius?

Each section answers 1–4 with sources, then §5–§8 design the change and §9 states what should
**not** be modelled.

---

## 1. VMware vSAN OSA (disk groups)

### Blast radius — confirmed, and worse than #88 states

A vSAN OSA disk group is **exactly one cache device plus 1–7 capacity devices**; a host may have
**up to 5 disk groups**. Broadcom TechDocs, *Claim Storage Devices for vSAN OSA Cluster*, verbatim:
"You can add only one cache device per disk group." *vSAN Concepts*: "Each disk group contains one
flash cache device, and one or multiple capacity devices for persistent storage." The 1–7 and 5
limits are stated in *Designing and Sizing vSAN Hosts* ("vSAN OSA must have at least 32 GB memory
to support 5 disk groups per host and 7 capacity devices per disk group") and verbatim on VMware's
own product blog ("Disk groups contain at most 1 cache device and between 1 to 7 capacity devices…
At most a vSAN host can have 5 disk groups").

The cache-failure statement #88 relies on is confirmed **verbatim** in current vSAN 8.0 TechDocs,
*A Flash Caching Device Is Not Accessible in a vSAN Cluster*:

> "vSAN interprets the failure of a single flash caching device as a failure of the entire disk
> group."

All devices in the group are marked **degraded**. The mechanism is stated on the VCF blog: "All I/O
is funneled through the caching/buffering device before it is stored on a capacity device in the
disk group."

**The research found a second trigger #88 does not mention, and it dominates the frequency.** With
deduplication and compression enabled, *any* device failure — cache **or capacity** — kills the
whole disk group. Broadcom KB 327008, verbatim:

> "When VMware vSAN is configured with Deduplication and Compression enabled, a failure of any
> single disk results in the failure of the entire Disk Group to which the disk belongs."
> Cause: "vSAN deduplication occurs at the Disk Group level across the cluster. As a result, if a
> single disk in the Disk Group fails, the entire Disk Group fails."

vSAN 7.0 U1 added a third state. Its release notes, verbatim: "With compression-only vSAN, a failed
capacity device only impacts that device and not the entire disk group." So there are **three**
space-efficiency states with **three** different capacity-failure blast radii:

| Failure | Dedup+compression OFF | Compression-only (7.0 U1+) | Dedup+compression ON |
|---|---|---|---|
| **Cache device** | Whole disk group | Whole disk group | Whole disk group |
| **Capacity device** | That device only | That device only | **Whole disk group** |

No vSAN 7.x or 8.0 change softens the cache-device blast radius — the statement is still present
verbatim in the current 8.0 docs. Max disk groups per host is unchanged at 5. vSAN **ESA** has no
disk groups or cache devices at all (a flat single-tier storage pool where "every storage device
claimed by vSAN ESA remains independent from each other"), so ESA is out of scope by construction.

### Is it data loss? — No, and this is the crux

**A disk group is a physical blast radius, not a placement fault domain.** VMware's *vSAN
Availability Technologies* whitepaper, verbatim: "vSAN uses a construct known as a 'fault domain' to
help it distribute data in a resilient way. By default, vSAN treats each host as a fault domain."
*Designing and Sizing vSAN Fault Domains*: "vSAN ensures that each protection component (replicas
and witnesses) is placed in a separate fault domain."

Because a host is its own fault domain, two replicas of one object can never land on the same host,
and therefore never on two disk groups of the same host. **Losing one disk group removes a fraction
(1/N of that host's capacity) of exactly one fault domain's contribution — strictly less severe
than losing the whole host**, which vSAN already tolerates at FTT ≥ 1.

The whitepaper is unusually direct on the point a simulation must get right:

> "Unavailability of data does not mean 'data loss.' It simply refers to the state of availability
> for the VM to use or access the data."

and

> "a failure only applies to the hosts that the object resides on, NOT the total number of failures
> within a cluster."

*A Flash Caching Device Is Not Accessible* confirms the outcome: at FTT ≥ 1, VM objects "remain
accessible from other ESXi hosts" and automatic reprotection begins. Only at FTT = 0 do objects
become inaccessible. *Replace a Capacity Device*: "When the number of failures of the object replica
with the affected components exceeds the FTT value, the virtual machines on the disk become
inaccessible."

**Rebuild trigger — a correction to the obvious assumption.** A device *hardware* failure marks
components **degraded**, which triggers rebuild **immediately**. The well-known 60-minute
`vsan.clomrepairdelay` applies only to **absent** components (host reboot, network partition,
maintenance mode). Broadcom KB 327031, verbatim: "If a failure in a physical hardware component is
detected, such as a cache or capacity disk, vSAN immediately responds by rebuilding a disk object."
So the vulnerability window for a cache-device failure is `rebuild_time`, **not**
`60 min + rebuild_time`. (This barely moves the arithmetic — the rebuild of a full disk group runs
tens to hundreds of hours — but a model that hard-codes the 60-minute timer here would be citing
the wrong mechanism.)

vSAN 7.0 U2 added durability components ("enhanced data durability to tolerate unplanned host,
disk, or network failures by creating additional durability components at the time of failure"),
which does not change the blast radius but *reduces* second-failure risk during the degraded
window — i.e. it pushes in the safe direction relative to any model that ignores it.

### Does `TieringConfig` carry enough? — Yes, derivably

`TieringConfig` (`src/types/topology.ts:203`) has `fastTier.driveCount` and
`capacityTier.driveCount`, both **per server**. So:

- **disk groups per host** = `fastTier.driveCount` (one cache device per group, per the verbatim
  quote above — the mapping is exact, not an assumption)
- **capacity devices per group** = `capacityTier.driveCount / fastTier.driveCount`

and `VsanOptions.dedup` (line 396) already exists to select the blast-radius row of the table above.
`VsanOptions.compression` (line 392) distinguishes the compression-only case. **No new input is
needed for vSAN.** The one gap is that nothing validates `fastTier.driveCount ≤ 5` or
`capacityTier.driveCount / fastTier.driveCount ≤ 7`, so a user can currently describe a disk group
VMware would not support.

---

## 2. Ceph (BlueStore WAL/DB offload)

### Blast radius — true, but the sourcing is weaker than #88 implies

This is the **least well-sourced finding in this document**, and it is worth being blunt about.

I could not find an official docs.ceph.com statement that losing a shared WAL/DB device kills every
OSD it serves. The BlueStore Config Reference's "Provisioning strategies" section documents the
canonical shared-device topology (4 HDDs sharing DB partitions on one SSD) **purely mechanically,
with no failure-domain caveat at all**. The claim is well-established Ceph operational consensus and
follows directly from architecture — BlueStore requires its RocksDB metadata and WAL at OSD startup,
so an OSD whose DB/WAL device is gone cannot start — but it is **community-sourced, not
doc-sourced**. The strongest corroboration found is a ceph-users mailing-list thread ("Proper
procedure to replace DB/WAL SSD") stating that such OSDs "will have to be destroyed and rebuilt",
and that page returned HTTP 503 on direct fetch, so only a search-engine summary was verifiable.

Any code comment resting on this should say "Ceph architecture and operational consensus" rather
than citing docs.ceph.com, because docs.ceph.com does not say it.

### Recoverable in place? — No; full destroy-and-backfill

The *mechanism* is officially documented, even though the multi-OSD generalisation is not. *Adding
and Removing OSDs* gives the replacement procedure — `ceph osd safe-to-destroy`, `ceph osd destroy`,
wipe, re-provision with the same ID — after which Ceph "begins rebalancing the cluster by migrating
placement groups (PGs)", transitioning `active+clean` → `active, some degraded objects` →
`active+clean`. There is no in-place metadata resync path for an OSD whose RocksDB lived on a dead
device: the replacement OSD is repopulated **entirely by backfill from other replicas**.

### Ratio — the codebase default is well within vendor guidance

Ceph's official *Hardware Recommendations* states **"4-5x HDD OSDs per DB/WAL SATA SSD"** and
**"≤10 HDD OSDs per DB/WAL NVMe SSD"**. `cephadm`'s OSD service spec has first-class support via
`db_slots` ("Chop the DB device into this many slices and use one for each of this many HDD OSDs"),
confirming the shared-device pattern is intentional and supported, not an edge case.

**`cephOptions.walDbRatio`'s default of 4 (`src/types/topology.ts:812`) is conservative and
defensible.** For an NVMe fast tier, Ceph officially tolerates up to 10, so a 4–10 range would be
the vendor-supported band; 4–5 is the SATA-SSD band. **`walDbRatio` is the right input for the
blast radius** — it is exactly "how many OSDs die together" — and #104's observation that it
currently reaches no engine is precisely the gap this work would close.

### Is it data loss? — No; it is a host-failure-shaped event

CRUSH's default failure domain is the host. *CRUSH Maps*, verbatim: "If the `crush_location` is not
set explicitly, a default of `root=default host=HOSTNAME` is used for OSDs." And on the design
intent: "By reflecting the underlying physical organization of the installation, CRUSH can model
(and thereby address) the potential for correlated device failures."

A WAL/DB NVMe lives inside one host and serves only OSDs in that host. So losing every OSD behind it
is a **strict subset of a host failure** — an event CRUSH already places replicas and EC shards to
survive, by construction. The blast radius is *not* novel.

**What is novel is the frequency, not the shape.** A host-failure-shaped event is being triggered by
a single NVMe dying, which is far more probable than a whole server dying. That is the honest
statement of the risk: same blast radius as a failure domain Ceph already tolerates, occurring more
often than whole-host statistics suggest. It does not create a new failure class.

Data loss requires exhausting the pool's tolerance: with `size=3, min_size=2` (Ceph's recommended
default), two more failure domains must go during the backfill window. The default EC profile
"can sustain the overlapping loss of two OSDs without losing data."

**Negative finding:** no official Ceph source quantifies recovery time for N concurrent OSD losses
relative to one. Ceph documents *tolerance* and *mechanism* but not *timing-vs-N*. There is nothing
to calibrate a backfill-duration model against.

---

## 3. Nutanix AOS (hybrid clusters) — a clean "no"

**This is a valuable negative finding: there is no correlated-failure structure here worth
modelling.**

Nutanix's SSD tier is a real dependency for the node's write path — the Nutanix Bible: "The OpLog is
stored on the SSD tier on the CVM to provide extremely fast write I/O performance… OpLog is always
on SSDs in Hybrid Clusters" — and the Extent Store "spans all device tiers", with ILM migrating data
between them. But there is **no sub-node grouping**: no SSD "owns" a defined subset of capacity HDDs
the way a vSAN cache device owns its disk group or a Ceph WAL/DB device owns its OSDs.

The documented worst case of a single SSD failure is a **CVM restart** — i.e. the whole node's
storage contribution briefly drops out. The Bible's *Drive Breakdown* notes "Nutanix Home is
mirrored across the first two SSDs to ensure availability", Cassandra "is sharded across multiple
SSDs in the node (currently up to 4)", and "in dual SSD systems, metadata will be mirrored between
the SSDs"; the pre-5.0 legacy behaviour was "if that SSD fails the CVM will be restarted."

So the blast radius **collapses upward to the node**, which is the failure domain RF2/RF3 cross-node
replication already covers, rather than sitting between "one device" and "one node" where a novel
correlated-failure concept would be needed. Disk failures trigger a Curator scan in which "all
nodes/CVMs/disks will participate in the re-replication" — uniformly for SSD or HDD, not
special-cased.

**Recommendation: model nothing for Nutanix.** Record the finding in code so it is not re-researched.

*Confidence caveat:* this is inference from documented architecture. Nutanix never states "there is
no disk-group-equivalent blast radius" — that conclusion is drawn from the absence of any such
grouping in the architecture docs plus the CVM-restart language, not from a verbatim denial.

---

## 4. Microsoft S2D (storage tiers) — a "yes" the issue did not anticipate

**#88 lists only vSAN and Ceph. S2D turns out to have the same structure, documented more clearly
than either of them.**

Microsoft Learn, *Understanding the storage pool cache*, verbatim:

> "The cache is implemented at the drive level: individual cache drives within one server are bound
> to one or many capacity drives within the same server."

> "The binding between cache and capacity drives can have any ratio, from 1:1 up to 1:12 and beyond.
> It adjusts dynamically whenever drives are added or removed, such as when scaling up or after
> failures."

This is structurally identical to a vSAN disk group: one fast device owning a bounded set of
capacity devices within one node. And Microsoft documents the failure behaviour explicitly:

> "When a cache drive fails, any writes which haven't yet been destaged are lost *to the local
> server*, meaning they exist only on the other copies (in other servers). Just like after any other
> drive failure, Storage Spaces can and does automatically recover by consulting the surviving
> copies. For a brief period, the capacity drives which were bound to the lost cache drive appear
> unhealthy. Once the cache rebinding has occurred (automatic) and the data repair has completed
> (automatic), they resume showing as healthy."

> "This scenario is why at minimum two cache drives are required per server to preserve
> performance."

And on why it is not a data-loss event:

> "Given that resiliency in Storage Spaces Direct is at least server-level (meaning data copies are
> always written to different servers; at most one copy per server), data in the cache benefits from
> the same resiliency as data not in the cache."

So S2D lands in exactly the same place as vSAN and Ceph: **a real, documented, multi-device
correlated degradation event, bounded by one node, not a data-loss event** because resiliency is
cross-server by construction. Note the binding is *dynamic* — it "adjusts… after failures" — which
makes S2D's blast radius genuinely more transient than vSAN's.

`S2DOptions.tieringConfig` carries the same `fastTier.driveCount` / `capacityTier.driveCount` pair,
so the binding ratio is derivable identically to vSAN.

---

## 5. BeeGFS MDT — correctly out of scope, confirmed

BeeGFS's architecture split is unambiguous. *Architecture Overview*: metadata servers "do the
coordination of file placement and striping among the storage servers", while storage servers "are
responsible for storing stripes of the actual contents of user files." Metadata buddy mirroring is
configured independently of storage buddy mirroring (*Mirroring*: "Both metadata and storage
mirroring can be enabled with the `beegfs` command line tool"; separate buddy-group definitions,
separate `beegfs mirror init` flow, and a different resync mechanism — metadata resync sends the
full mirrored metadata rather than using storage's timestamp-based incremental path).

**An MDT loss does not destroy storage-target data.** The strongest official anchor is the
*Filesystem Check* page's warning about `beegfs-fsck --automatic`:

> "In a system with data loss on the metadata targets, this would result in a deletion of storage
> data. Therefore, we recommend not to enable `--automatic`, unless you are sure about it."

That sentence only makes sense if the storage bytes are still physically present when the MDT is
lost — fsck is warning about what its own repair logic would do to *now-orphaned* chunks. So MDT
loss is a "cannot find/reassemble the file" event, not a "the file's blocks are destroyed" event;
actual destruction is introduced by careless repair tooling afterwards, which is an operator
behaviour this tool does not and should not model.

**Conclusion: an MDT loss is not a data-availability event for the storage-target data path in the
sense this simulation measures.** MDT drives should stay excluded, exactly as the existing comment
in `resolveBeeGfsSimulationScope` says. No change.

*Confidence caveat:* BeeGFS never states "MDT loss is a separate protection domain" in resilience-
modelling terms. That framing is inference from the architecture split, the independent mirroring
mechanisms, and the fsck warning — the fsck sentence is the single quotable anchor.

Context for MDT sizing, since it came up: *Metadata Node Tuning* recommends "low-latency devices
like SSDs or NVMes" and notes "it is generally recommended to store metadata on a RAID-1 or RAID-10
volume" because "small random writes are inefficient on RAID-5 and RAID-6."

---

## 6. Why the obvious implementation would make the tool worse

**This section is the reason this document does not simply recommend "build it."**

The four tiered platforms hand the worker `groupCount = serverCount`, but the worker only *uses*
`serverCount` when `isGroupTopology(raidLevel)` returns true — and that function matches only
`raid50`, `raid60`, `beegfs_raid6`, `beegfs_raidz2`, `beegfs_raid10`. **No vSAN, Ceph, Nutanix or
S2D level string is in it.** So today:

- `vsan_osa_raid1` → `mirrorCopies = 2` (`OutputDashboard.tsx:88`) → `isMirror` path → the flat
  drive-pair model, which pairs drives **arbitrarily** with no idea which host they are on.
- `vsan_osa_raid5` / `vsan_osa_raid6` → `mirrorCopies = 0`, not a group topology → the **standard
  parity path**, whose test is a *cluster-global* counter: `failedDrives > parityDrives`. Worse,
  `getParityDrives` does not recognise these strings at all and falls through to `return 1`, so a
  vSAN RAID-6 FTT=2 configuration is simulated with a tolerance of one drive **cluster-wide**.

Now inject a group kill into each:

**Into the flat mirror model.** A 7-drive simultaneous kill lands 7 failures into arbitrarily-chosen
mirror pairs. In reality this can *never* destroy a pair, because vSAN guarantees the two replicas
sit on different hosts. In the simulation it is a birthday problem:

| Capacity drives | Mirror pairs | Group kill | P(≥2 land in the same pair) → spurious data loss |
|---|---|---|---|
| 84 | 42 | 7 drives | **41.0%** |
| 48 | 24 | 7 drives | **62.0%** |
| 24 | 12 | 5 drives | **61.8%** |

**Into the global-counter parity model.** Tolerance is 1 drive cluster-wide, so *every* group kill
is an instant, guaranteed data loss — survival would drop by the full group-kill probability.

Either way the tool would report a large survival collapse that **does not correspond to any
physical failure mode**. It would be moving in the pessimistic direction, which is the "safe"
direction for a sizing tool, but it would be pessimistic *for a fabricated reason*, and a user
comparing vSAN OSA against ESA would see a difference that is mostly simulation artefact.

**Therefore: node-aware component placement is a hard prerequisite for modelling fast-tier
correlated failure at all.** Without it, the blast-radius work cannot be evaluated as correct or
incorrect, only as "moves the number."

---

## 7. Magnitude — how much does the physically-correct model actually move?

All figures below are analytic annual-probability estimates using this repo's own drive data
(`src/data/drives.json`: flash AFR 0.35–0.5%, HDD AFR 0.8%) at 200 MB/s effective rebuild. They are
**not** Monte Carlo runs — the point is to size the effect before building anything.

**The reference point that matters:** `OutputDashboard.tsx:113` passes `simulationCount` of
**10,000** on desktop (1,000 on mobile), not the 100,000 the hook defaults to. At 10K iterations the
Monte Carlo 95% confidence half-width is **±0.195 pp at 99% survival** and **±0.062 pp at 99.9%**.
Anything smaller than that is invisible in the shipped app.

### vSAN OSA — dedup OFF (cache-device trigger only)

| Configuration | P(≥1 group kill/yr) | Rebuild window | Added annual data-loss probability |
|---|---|---|---|
| 4 hosts × 1 DG × 5 cap | 1.75% | 57 h | **0.0002 pp** |
| 6 hosts × 2 DG × 7 cap | 5.15% | 156 h | **0.004 pp** |
| 8 hosts × 3 DG × 7 cap | 10.04% | 157 h | **0.018 pp** |

**A rounding error — one to two orders of magnitude below the noise floor.** Group kills are
frequent, but they are not data loss, and the second-failure-in-window term is tiny.

### vSAN OSA — dedup ON (any device kills the group, per KB 327008)

| Configuration | P(kill per group/yr) | P(≥1 kill/yr) | Added annual data-loss probability |
|---|---|---|---|
| 6 hosts × 2 DG × 4 cap (16 TB) | 3.59% | 35.5% | **0.14 pp** |
| 6 hosts × 2 DG × 7 cap (16 TB) | 5.88% | 51.7% | **0.59 pp** |
| 8 hosts × 3 DG × 7 cap (16 TB) | 5.88% | 76.7% | **1.84 pp** |

**This is the whole ticket.** The dedup case is 30–100× the cache-only case and lands well above the
noise floor. It is driven by the trigger #88 never mentions — capacity-device failures, which are
~2× more likely per device than cache failures *and* there are up to 7× more of them per group.

### Ceph — WAL/DB NVMe kill, `walDbRatio = 4`

| Configuration | P(≥1 WAL/DB kill/yr) | Backfill window | Added annual data-loss probability |
|---|---|---|---|
| 4 hosts × 8 HDD, size=3 | 3.47% | 44 h | **0.000003 pp** |
| 6 hosts × 12 HDD, size=3 | 7.63% | 89 h | **0.00015 pp** |
| 8 hosts × 24 HDD, size=3 | 19.08% | 89 h | **0.0029 pp** |
| 6 hosts × 12 HDD, **size=2 / EC m=1** | 7.63% | 89 h | **0.048 pp** |

**A rounding error at `size=3`** — three failure domains must go, and the third term crushes it. Even
the `size=2` case sits at the edge of the noise floor.

### Verdict on magnitude

| Platform / mode | Effect | Above the 10K-iteration noise floor? | Worth the complexity? |
|---|---|---|---|
| vSAN OSA, **dedup ON** | 0.14–1.84 pp | **Yes, clearly** | **Yes** |
| vSAN OSA, dedup OFF | 0.0002–0.018 pp | No | No |
| Ceph, size=3 / EC m≥2 | ~0.000003–0.003 pp | No | No |
| Ceph, size=2 / EC m=1 | ~0.05 pp | Marginal | Marginal |
| S2D | same shape as vSAN dedup-OFF | No | No |
| Nutanix | no structure to model | — | No |

**The honest summary: for five of the six rows, #88's concern is real physics with a negligible
numeric consequence.** The single row that justifies the work is vSAN OSA with deduplication
enabled — and that row was not the one the issue was written about.

---

## 8. Design: the two approaches compared

### Approach A — simulate fast-tier devices as additional failure sources

Add the cache/WAL-DB devices to the simulated population as their own drives. When one fails, kill
every capacity device bound to it in the same tick.

**Reuses:** the `distributeAcrossGroups` / `buildGroupPairState` structures #107 introduced. The
per-pair state machine is the right mechanism to extend — it already models "a group is a set of
slots with independent tolerance, and a specific slot dying is what matters", which generalises to
"a group is a set of capacity devices with a shared parent, and the parent dying kills all of them."
`computeTopologyModel` is the right home for the precomputed binding (which capacity index belongs
to which fast device), because that structure is draw-independent, exactly like `pairGroupIndex`.

**Needs adding:**
- A `fastTier` block on `SimulationInput` (`src/types/worker.ts`): device count, AFR, and the
  binding ratio. Today `SimulationInput` carries a single AFR and a single capacity.
- A **second AFR** in the per-day failure loop. The loop currently draws one
  `baseDailyFailureRate` for every drive; fast-tier devices have a different AFR (flash 0.35–0.5%
  vs HDD 0.8%) and must be drawn separately.
- A node-index per capacity drive, and a placement rule that respects it (§6).
- Group-kill handling in the rebuild path: a group kill removes N drives at once, and the rebuild
  must restore N, not 1. The current rebuild decrements exactly one failure per completion.

**Cost:** the honest one. #107 already measured the per-pair model at ~5.8 s → ~9.7 s for 100K
iterations. Adding a second device class plus node-aware placement is a comparable increment on top.

**Fidelity:** high. It naturally produces the correct behaviour — the fast-tier device's own AFR
drives the frequency, and the blast radius falls out of the binding rather than being a tuned
parameter.

### Approach B — a group-level failure probability derived from fast-tier AFR

Leave the population alone. Give each group a per-day probability of dying wholesale, derived from
the fast-tier device's AFR (and, for vSAN dedup, from the capacity devices' AFR too).

**Reuses:** almost everything. `groupWidths` and the group-selection loop already exist; this adds
one draw per group per day.

**Needs adding:** one number on `SimulationInput` (`groupFailureRatePerDay`), and one branch in the
day loop. That is close to the whole change.

**Cost:** negligible — one extra draw per group per day, against `driveCount` draws already
happening.

**Fidelity:** lower, in a specific and important way. It cannot express the vSAN dedup case
faithfully, because there the group-kill probability is a function of the *surviving* capacity
device count in that group, which changes as the simulation runs. Collapsing it to a constant
per-day rate is an approximation. It also cannot model a fast-tier device failing *during* a
degraded window and interacting with the rebuild.

### Recommendation

**Approach A, but only for vSAN OSA, and only after node-aware placement lands as its own change.**

Approach B is tempting because it is cheap, and for Ceph/S2D — where §7 shows the effect is a
rounding error — cheap-and-approximate would be fine. But for those platforms the right answer is
*not to model it at all*, so B has no constituency: the only platform where the number is worth
moving (vSAN dedup) is exactly the platform B approximates worst.

Sequenced:

1. **Prerequisite (separate ticket): node-aware placement for the tiered platforms.** Give the
   worker a node index per drive and make replica placement respect it. This is worth doing on its
   own merits — it fixes the `vsan_osa_raid5`/`raid6` tolerance-of-1 bug found in §6, which is a
   larger and more clearly wrong error than the one #88 is about.
2. **Then vSAN OSA disk groups via Approach A**, gated on `vsanOptions.dedup` for the
   capacity-device trigger. Blast radius derived from `fastTier.driveCount` /
   `capacityTier.driveCount` per §1.
3. **Ceph, S2D, Nutanix: document, do not model.** §9.

---

## 9. What should NOT be modelled, and why

Each of these belongs in a code comment where the reasoning survives, not as a bare TODO.

**Nutanix hybrid — nothing to model.** There is no sub-node grouping. An SSD failure's worst
documented outcome is a CVM restart, which collapses to the node failure domain RF2/RF3 already
covers. Modelling it would mean inventing a structure Nutanix does not have.

**Ceph WAL/DB — real, but numerically negligible; document the physics, skip the model.** The blast
radius is a strict subset of a host failure, which CRUSH is designed around. At the recommended
`size=3`, §7 puts the effect at ~0.0001–0.003 pp — three to four orders of magnitude below the
noise floor. The genuine finding is that a *host-failure-shaped* event is triggered by a single NVMe,
which is more probable than a whole server dying; that is worth writing down, but it does not change
a survival number anyone can read. Note also that the primary claim here is community-sourced, not
doc-sourced (§2) — building a model on it would give it more apparent authority than the sourcing
supports.

**S2D cache binding — real, documented, and explicitly transient.** Microsoft describes the affected
capacity drives as appearing "unhealthy" for "a brief period" before automatic rebinding and repair,
and states data survives via cross-server copies. It is a *degradation* event, and this panel reports
data-loss probability. Same magnitude class as vSAN dedup-OFF: below the noise floor.

**BeeGFS MDT — out of scope, permanently.** §5. Storage-target data survives an MDT loss; what is
lost is the namespace. Nothing about future research will change this — it is architecture, not a
sourcing gap.

**The 60-minute `vsan.clomrepairdelay` for device failures.** It does not apply: a hardware device
failure marks components *degraded* and rebuilds immediately (§1). Modelling a 60-minute window here
would cite the right constant for the wrong event.

**vSAN 7.0 U2 durability components.** They shorten the vulnerability window, i.e. they push
survival *up*. Omitting them keeps the model conservative, which is the correct direction. Modelling
them would need a resync-rate figure VMware does not publish.

**Backfill/rebuild duration as a function of N concurrent failures.** No official Ceph or VMware
source quantifies it (§2). The current model's single-drive rebuild time applied N times is a guess
either way; at least it is an *existing* guess rather than a new one.

**Group-kill events as instant data loss.** The single most important negative: on all four
platforms a fast-tier group kill is degradation-plus-resync, not data loss. Any implementation that
returns `survived: false` on a group kill is wrong, and by a lot — §7's dedup-ON row would jump from
1.84 pp to ~50 pp.

---

## 10. Per-platform decision summary

Each row is independently decidable.

| Platform | Blast radius | Data loss? | Input available? | Effect size | Recommendation |
|---|---|---|---|---|---|
| **vSAN OSA** (dedup ON) | Whole disk group, on **any** device failure | No — degrade + resync; loss only if FTT exhausted | Yes — `fastTier.driveCount`, `capacityTier.driveCount`, `vsanOptions.dedup` | **0.14–1.84 pp** | **Model it** (Approach A), after node-aware placement |
| **vSAN OSA** (dedup OFF) | Whole disk group, on cache failure only | Same | Same | 0.0002–0.018 pp | Falls out of the above for free; would not justify the work alone |
| **Ceph WAL/DB** | All OSDs behind the NVMe | No — subset of a host failure CRUSH tolerates | Yes — `walDbRatio` is the right input (#104) | ~0.0001–0.003 pp (size=3) | **Document, do not model** |
| **S2D cache binding** | 1–12+ bound capacity drives, transient | No — cross-server copies; auto-rebind | Yes — same `TieringConfig` derivation | Below noise floor | **Document, do not model** |
| **Nutanix hybrid** | No sub-node structure; worst case is CVM restart | No | n/a | Nothing to model | **Document the negative finding** |
| **BeeGFS MDT** | Namespace, not data | No | n/a | n/a | **Keep excluded**; no change |

---

## 11. Testing, if vSAN OSA is built

- **Before/after vectors** for a tiered vSAN OSA configuration with dedup on and off, following the
  `tests/fixtures/resilience-vectors.ts` convention #107 established: document the payload plus the
  *direction and rough magnitude*, with an actual measured run recorded in the comment, and assert
  against wide bands rather than exact rates.
- **A guard against the §6 artefact.** A test that a group kill in a node-aware model does *not*
  destroy a mirror pair — i.e. that survival after adding disk-group modelling stays within a
  fraction of a percentage point of the pre-change number for the dedup-OFF case. If it moves by
  tens of points, the node-awareness prerequisite is not actually working, and the test should say
  so loudly rather than the vectors being recalibrated to match.
- **A property test** that `P(group kill)` rises monotonically with capacity-devices-per-group when
  dedup is on, and is *independent* of it when dedup is off. That distinction is the entire content
  of KB 327008 and is the thing most likely to be implemented backwards.
- **Regression net:** every untiered configuration, and every platform not being changed
  (Ceph, S2D, Nutanix, BeeGFS), must produce byte-identical simulation input. `tieredPlatformScope`
  returning `null` already guarantees this for untiered cases by construction.

## Least well-sourced finding

**The Ceph WAL/DB blast radius (§2, question 1).** It is the claim issue #88 leads with, and it is
the one I could not confirm from official documentation. docs.ceph.com's BlueStore Config Reference
documents the shared-device provisioning pattern in purely mechanical terms with **no failure-domain
caveat whatsoever**, and I verified this by fetching the current page and the raw `.rst` source. The
claim is architecturally sound — BlueStore needs its RocksDB and WAL at OSD startup — and matches
uniform community practice, but the only direct statement found ("all the OSDs with their DB/WAL on
the same SSD will have to be destroyed and rebuilt") is from a ceph-users mailing-list thread whose
page returned HTTP 503, leaving only a search-engine summary. Everything downstream in §2 — the
ratio guidance, the destroy-and-backfill mechanism, the CRUSH host-domain framing — *is* officially
sourced; it is specifically the "one device kills N OSDs" premise that rests on consensus rather
than documentation. This is a further argument for §9's "document, do not model" recommendation for
Ceph: a model would lend the premise more authority than its sourcing carries.

The runner-up is the **"typical" vSAN disk-groups-per-host count** (§1, question 4). The max of 5 and
the 1–7 capacity range are well sourced, but VMware publishes no canonical typical value — the
guidance is directional ("Risk of failure is spread among multiple disk groups") with a worked
example of 2 groups on the product blog. Any default this tool picks is a judgement call, and the
§7 magnitude table is sensitive to it.

---

## Sources

**VMware / Broadcom vSAN OSA:**
- [Claim Storage Devices for vSAN Original Storage Architecture Cluster (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-administration/device-management-in-a-vsan-cluster/managing-storage-devices-in-vsan-cluster/claim-storage-devices-for-vsan-original-storage-architecture-cluster.html) — "You can add only one cache device per disk group."
- [vSAN Concepts (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/planning-and-deployment/what-is-vsan/vsan-concepts.html) — disk group composition; ESA flat storage pool
- [Designing and Sizing vSAN Hosts (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/planning-and-deployment/designing-and-sizing-a-virtual-san-cluster/designing-and-sizing-virtual-san-hosts.html) — 5 disk groups / 7 capacity devices; multiple-disk-group trade-offs
- [Designing and Sizing vSAN Hosts (TechDocs VCF 9.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-0/vsan-deployment-administration-and-monitoring/vsan-planning-and-deployment/designing-and-sizing-a-virtual-san-cluster/designing-and-sizing-virtual-san-hosts.html) — same limits, current release
- [A Flash Caching Device Is Not Accessible in a vSAN Cluster (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-monitoring/handling-failures-and-troubleshooting-virtual-san/handling-failures-in-virtual-san/failure-handling-in-virtual-san/a-flash-caching-device-is-not-accessible.html) — **"vSAN interprets the failure of a single flash caching device as a failure of the entire disk group."**
- [Failure States of vSAN Components (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-monitoring/handling-failures-and-troubleshooting-virtual-san/handling-failures-in-virtual-san/failure-handling-in-virtual-san/component-failure-states-in-virtual-san.html) — degraded vs absent; 60-minute rebuild timer for absent
- [Replace a Capacity Device in vSAN OSA Cluster (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-monitoring/handling-failures-and-troubleshooting-virtual-san/handling-failures-in-virtual-san/replacing-existing-hardware-components-in-vsan-cluster/replace-a-capacity-device-in-vsan-cluster.html) — capacity-failure scope; FTT exhaustion
- [Add or Remove Disks with Deduplication and Compression Enabled (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-administration/increasing-space-efficiency-in-a-vsan-cluster/using-deduplication-and-compression-in-vsan-cluster/add-or-remove-disks-when-deduplication-and-compression-is-enabled.html) — whole-disk-group removal requirement under dedup
- [Designing and Sizing vSAN Fault Domains (TechDocs 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/planning-and-deployment/designing-and-sizing-a-virtual-san-cluster/designing-and-sizing-virtual-san-fault-domains.html) — replicas and witnesses in separate fault domains
- [vSAN 7.0 U1 Release Notes (TechDocs)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/7-0/release-notes/vmware-vsan-701-release-notes.html) — compression-only mode; capacity failure scoped to the device
- [vSAN 7.0 U2 Release Notes (TechDocs)](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/7-0/release-notes/vmware-vsan-702-release-notes.html) — durability components
- [KB 327008 — Identifying and replacing a failed cache or capacity disk with vSAN deduplication enabled](https://knowledge.broadcom.com/external/article/327008/vsan-deduplication-enabled-identifying.html) — **any single disk failure fails the entire disk group under dedup**
- [KB 326859 — Troubleshooting vSAN OSA disk issues](https://knowledge.broadcom.com/external/article/326859/troubleshooting-vsan-osa-disk-issues.html) — cache vs capacity failure outcome table
- [KB 327031 — Changing the default repair delay time for a host failure in vSAN](https://knowledge.broadcom.com/external/article/327031/changing-the-default-repair-delay-time-f.html) — `vsan.clomrepairdelay`; immediate rebuild on hardware failure
- [vSAN Availability Technologies (whitepaper PDF)](https://www.vmware.com/docs/vmw-vSAN-Availability-Technologies) — host as default fault domain; "Unavailability of data does not mean 'data loss.'"
- [Understanding vSAN Architecture: Disk Groups (VMware VCF blog)](https://blogs.vmware.com/cloud-foundation/2019/04/18/vsan-disk-groups/) — 1 cache + 1–7 capacity; max 5 disk groups; 2-disk-group worked example
- [The Impact of a Storage Device Failure in vSAN ESA versus OSA (VMware VCF blog)](https://blogs.vmware.com/cloud-foundation/2023/08/02/the-impact-of-a-storage-device-failure-in-vsan-esa-versus-osa/) — I/O funnelled through the cache device; ESA device independence
- [One versus multiple vSAN disk groups per host — Yellow Bricks](https://www.yellow-bricks.com/2014/05/22/one-versus-multiple-vsan-diskgroups-per-host/) — *weak source*, personal blog; disk group as failure domain

**Ceph:**
- [BlueStore Config Reference (Reef)](https://docs.ceph.com/en/reef/rados/configuration/bluestore-config-ref/) — provisioning strategies; **negative finding: no failure-domain caveat**
- [BlueStore Config Reference, raw source (latest)](https://docs.ceph.com/en/latest/_sources/rados/configuration/bluestore-config-ref.rst.txt) — verified the same absence in source form
- [Hardware Recommendations (Reef)](https://docs.ceph.com/en/reef/start/hardware-recommendations/) — "4-5x HDD OSDs per DB/WAL SATA SSD", "≤10 HDD OSDs per DB/WAL NVMe SSD"; failure-domain definition
- [OSD Service Specification (cephadm, Reef)](https://docs.ceph.com/en/reef/cephadm/services/osd/) — `db_slots` / `wal_slots`
- [Adding and Removing OSDs (Reef)](https://docs.ceph.com/en/reef/rados/operations/add-or-rm-osds/) — destroy → recreate → backfill; PG state transitions
- [CRUSH Maps (latest)](https://docs.ceph.com/en/latest/rados/operations/crush-map/) — default `host` failure domain; correlated-failure modelling intent
- [Erasure Code (Reef)](https://docs.ceph.com/en/reef/rados/operations/erasure-code/) — default profile tolerates overlapping loss of two OSDs
- [Troubleshooting OSDs (latest)](https://docs.ceph.com/en/latest/rados/troubleshooting/troubleshooting-osd/)
- [ceph-users: "Shared WAL/DB device partition for multiple OSDs?"](https://www.spinics.net/lists/ceph-users/msg44600.html) — *weak source*, community
- [ceph-users: "Proper procedure to replace DB/WAL SSD"](https://ceph-users.ceph.narkive.com/uhXS1ygJ/proper-procedure-to-replace-db-wal-ssd) — *weak source*; **returned HTTP 503, only a search-engine summary was verifiable**

**Microsoft S2D:**
- [Understanding the storage pool cache in Azure Local and Windows Server clusters (Microsoft Learn)](https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/cache) — per-drive cache binding, 1:1 to 1:12+; cache-drive failure behaviour; server-level resiliency

**Nutanix:**
- [The Nutanix Bible — Book of AOS Storage](https://www.nutanixbible.com/4c-book-of-aos-storage.html) — Extent Store spans tiers; OpLog on SSD in hybrid; Curator re-replication on disk failure
- [The Nutanix Bible — Book of Basics: Drive Breakdown](https://www.nutanixbible.com/2i-book-of-basics-drive-breakdown.html) — Nutanix Home mirrored across two SSDs; Cassandra sharded/mirrored; pre-5.0 CVM restart behaviour
- [next.nutanix.com — CVM Crashed](https://next.nutanix.com/how-it-works-22/cvm-crashed-37283) — *weak source*, community corroboration
- [next.nutanix.com — CVM fails to boot due to disk errors](https://next.nutanix.com/ahv-virtualization-27/cvm-fails-to-boot-due-to-disk-errors-38548) — *weak source*, community corroboration

**BeeGFS:**
- [Architecture Overview](https://doc.beegfs.io/latest/architecture/overview.html) — metadata/storage separation
- [Mirroring](https://doc.beegfs.io/latest/advanced_topics/mirroring.html) — metadata and storage mirroring enabled independently
- [Metadata Mirroring](https://doc.beegfs.io/latest/advanced_topics/metadata_mirroring.html) — buddy groups, `beegfs mirror init`, full-copy resync
- [Filesystem Check](https://doc.beegfs.io/latest/advanced_topics/fscheck.html) — **the `--automatic` warning: storage data still present after MDT loss**
- [Backup](https://doc.beegfs.io/latest/advanced_topics/backup.html) — metadata hardlinks; management-data loss
- [Metadata Node Tuning](https://doc.beegfs.io/latest/advanced_topics/metadata_tuning.html) — RAID-1/RAID-10 and SSD/NVMe recommendations

**Repository context read for this design:**
- `src/workers/resilienceWorker.ts` at `origin/fix/worker-group-modelling` (PR #107) —
  `distributeAcrossGroups`, `buildGroupPairState`, `computeTopologyModel`, `TopologyModel`,
  `isGroupTopology`, `getParityDrives`
- `src/hooks/useResilience.ts` — `tieredPlatformScope`, `SIMULATION_SCOPE_BY_TOPOLOGY`,
  `resolveBeeGfsSimulationScope`
- `src/engines/shared/tiering.ts` — `resolveTiering`, `TieredCapacityResult`,
  `TieringResolverOptions`
- `src/types/topology.ts` — `TieringConfig`, `VsanOptions`, `CephOptions`, `NutanixOptions`,
  `S2DOptions`, `BeeGfsOptions`, `VsanOsaTopology`, `DEFAULT_CEPH_OPTIONS.walDbRatio`
- `src/types/worker.ts` — `SimulationInput`
- `src/components/layout/OutputDashboard.tsx` — `mirrorCopies` derivation, `simulationCount` of
  10,000 on desktop
- `src/data/drives.json` — AFR values used for the §7 magnitude estimates
- `docs/ARCHITECTURE.md` (lines 570–615) — the "Not modelled" caveat this work would remove
- `docs/superpowers/specs/2026-08-04-resilience-tiering-design.md` — PR #82's deferral of exactly
  this question
- `docs/superpowers/specs/2026-08-04-fast-tier-performance-research.md` — the sibling research for
  issue #89, same fast tier, performance axis
