# Modelling the fast tier as a shared failure domain (#88)

**Status:** design, revised 2026-08-05 after reading the worker. No code written.

> **The first draft's central proposal was wrong.** It is kept below, struck through with the
> reason, because the reason is the useful part: `serverCount` is overloaded as both fault-group
> count and replica-placement host count, so regrouping by disk group would have introduced an
> optimistic bias while removing one.

**Direction of the change:** survival rates go **down** for tiered vSAN OSA and tiered Ceph. This
is the one open item that currently errs on the unsafe side, so the fix makes published numbers
worse, not better. That is the point.

---

## 1. What is actually true, with sources

The premise had to be established before it could be scoped, which is why #82 deferred it. Both
halves now have a vendor statement behind them.

### vSAN OSA — a cache device failure kills its whole disk group

> "vSAN interprets the failure of a single flash caching device as a failure of the entire disk
> group. […] Both cache device and capacity devices that reside in the disk group, for example,
> magnetic disks, are marked as degraded."

— [Broadcom, *A Flash Caching Device Is Not Accessible in a vSAN Cluster*](https://techdocs.broadcom.com/us/en/vmware-cis/vsan/vsan/8-0/vsan-monitoring/handling-failures-and-troubleshooting-virtual-san/handling-failures-in-virtual-san/failure-handling-in-virtual-san/a-flash-caching-device-is-not-accessible.html)

Structure: a disk group is **exactly one cache device plus one to seven capacity devices**.

One refinement worth recording but **not** proposed for v1: with Deduplication & Compression
enabled, *any* device failure — cache or capacity — fails the whole disk group. Raidy has a vSAN
dedup toggle, so this is expressible, but it is a second mechanism on top of the first and should
land separately if at all.

### Ceph — a shared block.db device takes every OSD that uses it

> "a corrupt block.db file will impact all OSDs which are included in that block.db file"

— [Red Hat Ceph Storage 3, *Handling a disk failure*](https://docs.redhat.com/en/documentation/red_hat_ceph_storage/3/html/operations_guide/handling-a-disk-failure)

Note the upstream Ceph BlueStore documentation does **not** state this — it documents provisioning
several `db` logical volumes on one SSD without discussing the failure consequence. The citable
statement is Red Hat's. Checked directly: the upstream page carries provisioning guidance only.

### S2D and Nutanix are deliberately excluded

Both tier through `resolveTiering` and were named alongside the other two in #82, but neither has
a sourced statement that losing the fast device takes the capacity tier with it — their fast tiers
are write-back cache. Including them "for symmetry" would be inventing a failure mode. If someone
wants them in, that needs its own source first.

**Consequence:** this is a two-platform change, not a four-platform one. The relevance table must
say so explicitly rather than keying off "is tiered".

---

## 2. Why the current model cannot express it

`resilienceWorker.ts` simulates `driveCount` data-bearing drives spread over `groupCount` fault
groups (`distributeAcrossGroups`), each group tolerating `parityPerGroup` failures. It has a
`correlatedFailureWindow` — but that models a *burst of independent failures being more likely
after one occurs*, not a single event that deterministically removes a whole group at once.

The fast-tier devices are not in the simulated population at all: `tieredPlatformScope` sets
`driveCount` from `tiering.capacityTierDriveCount` and `mediaDrive` from the capacity tier. So
today the cache device cannot fail, because it does not exist in the model.

That is the gap. It needs a new concept, as #88 predicted.

---

## 3. Proposed model

### CORRECTION (2026-08-05, after reading the worker): the fault group must NOT become the disk group

The first draft of this spec proposed making the simulated fault group the *disk group* rather
than the node, deriving `groupCount = tiering.cacheTierDriveCount`. **That is wrong, and it would
introduce a new optimistic bias while fixing an existing one.**

`useResilience.ts:483` passes the scope's `groupCount` to the worker as `serverCount`, and the
worker overloads that single field three ways: fault-group count, BeeGFS storage-target count,
and — the problem — **real host count for replica placement**. From `resilienceWorker.ts:337`:

> "`serverCount` is the real host count and real placement puts each copy on a different host"

`assignNodesRoundRobin(numMirrorGroups, effectiveMirrorCopies, serverCount)` spreads mirror
copies across that many hosts. Feeding it a disk-group count — always ≥ the host count — would
model replicas that in reality share a host as sitting on different hosts. That **overstates**
resilience, which is the exact error class #88 exists to remove. Every mirror level of both
target platforms goes through that path (`vsan_osa_raid1`, `ceph_replicated_*`).

So the regrouping is not separable-but-optional; it is **incorrect** unless `serverCount` is first
split into distinct fault-group and host-count inputs. That is its own change, with its own risk,
and it should not ride along here.

### Revised model: keep the groups, add the event

`groupCount` stays `serverCount`. Each simulated group (a node) holds
`fastTierDevicesPerGroup = cacheTierDriveCount / serverCount` cache devices — for vSAN OSA that is
disk groups per host, for Ceph it is shared block.db devices per host. Both are already per-server
values in `TieringConfig.fastTier.driveCount` before `calculateTieredCapacity` multiplies by
`serverCount`, so the quotient is exact rather than inferred. (This also answers open question 3
from the first draft: `cacheTierDriveCount` really is a device count, not a capacity proxy.)

A cache failure inside a group takes down that group's share of capacity drives:

```
drivesPerFastTierDevice = groupWidth / fastTierDevicesPerGroup
```

New optional worker inputs, both absent by default so every existing caller is untouched:

```ts
/** AFR of the shared fast-tier device. Absent or 0 = no shared fast tier (default). */
sharedFastTierAfrPercent?: number
/** Cache/DB devices per simulated fault group; their blast radius is groupWidth / this. */
fastTierDevicesPerGroup?: number
```

Per simulated day, per group, before the per-drive pass: roll `fastTierDevicesPerGroup` times at
`sharedFastTierAfrPercent / 100 / 365`; each hit injects `drivesPerFastTierDevice` simultaneous
drive failures into that group, through the **existing** failure-assignment logic rather than a
parallel path — otherwise the URE, rebuild and correlated-window mechanics would silently not
apply to them.

That last point is the main implementation cost: the per-drive failure body is currently inline in
the day loop, so injecting forced failures means extracting it into a closure the loop and the
cache event both call. It is a contained refactor, but it touches the most safety-critical function
in the codebase, whose invariants are held together by long proof comments. It needs its own
careful review, and an equivalence gate showing the extraction alone moves nothing.

### What is NOT proposed

- **Rebuild modelling after a group loss.** A whole disk group rebuilding is a different and much
  longer operation than a single-drive rebuild. Guessing at it would put an unsourced number into
  the pessimistic direction on top of a sourced one. v1 should treat the group as lost and let the
  cluster-level redundancy decide survival, and say so.
- **The vSAN dedup amplification** (any device fails the group). Separate mechanism, separate
  change.
- **Any change to S2D or Nutanix.** See §1.

---

## 4. Gate

Because this moves published numbers, the same discipline the recent engine work used applies:

1. **Characterization before/after** for tiered vSAN OSA and tiered Ceph across at least: 1 disk
   group per node, 2 per node, and a Ceph cluster at both ends of the documented 4-5:1 SSD and
   6-9:1 NVMe OSD-to-journal ratios. Survival rate, URE probability, dual-failure probability.
2. **The two effects reported separately** — regrouping and cache-failure — since they push in
   opposite directions and a net figure hides both.
3. **Untiered configurations must be byte-identical.** The resolver returns null when tiering is
   off, and that path must not move at all.
4. **S2D and Nutanix must be byte-identical**, proving the change is scoped to the two platforms
   with sources.
5. **Falsifiability**: setting the cache AFR to zero must exactly reproduce the pre-change numbers
   for the same grouping. If it does not, the event is coupled to something it should not be.

## 5. Cleanups this closes

- The "Not modelled" caveat in `tieredPlatformScope`'s doc comment (`useResilience.ts`).
- The matching caveat in `docs/ARCHITECTURE.md`.
- `docs/BACKLOG.md` B21.

## 6. Open questions for review

1. **Is the regrouping (`groupCount` = disk groups, not nodes) in scope here, or its own fix
   first?** It is separable, it moves numbers on its own, and it moves them the other way.
2. **Should a group loss be recoverable at all in v1**, or simply fatal to that group?
3. ~~**Ceph's shared-device count**~~ — **answered.** `TieringConfig.fastTier.driveCount` is a
   per-server *device* count that `calculateTieredCapacity` multiplies by `serverCount`, so
   `cacheTierDriveCount / serverCount` is exactly "cache devices per host". No new input needed.

4. **New, and the one that matters:** should `serverCount` be split into separate fault-group and
   host-count worker inputs first? Until it is, the disk-group-level fault domain cannot be
   modelled without corrupting replica placement. Doing it first makes #88 smaller; doing it never
   caps how faithful #88 can get.
