# Modelling the fast tier as a shared failure domain (#88)

**Status:** design, awaiting review. No code written.

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

### The fault group becomes the disk group, not the node

For vSAN OSA the natural fault group is already documented: the disk group. The inputs to derive
it are present, no new UI required:

```
groupCount        = tiering.cacheTierDriveCount        // one cache device per disk group
drivesPerGroup    = capacityTierDriveCount / cacheTierDriveCount
```

For Ceph the same arithmetic applies with `cacheTierDriveCount` reading as "shared block.db
devices" and the quotient as OSDs per DB device.

**This alone changes numbers**, before any cache-failure event is added: today `groupCount` is
`serverCount`, and a node with two disk groups is currently simulated as one fault domain instead
of two. Whether that is a separate, earlier fix or part of this one is a review question — it is
arguably a bug in its own right, and it moves survival in the *optimistic* direction when split
(more, smaller groups tolerate more scattered failures), which is the opposite direction from the
cache-failure event. The two effects partly cancel, and the release note must not present the net
as if it were one mechanism.

### A cache-device failure event per group

Each simulated group gains one cache device with its own AFR, taken from
`tiering.cacheTierDrive` — the fast-tier drive is already resolved, only never used for
reliability. On any day the cache device fails, the entire group is lost at once, regardless of
`parityPerGroup`.

Sketch, in the worker's existing per-day loop shape:

```
// Per group, once per simulated day, before the per-drive failure pass:
if (hasSharedFastTier && random() < cacheDailyFailureProbability) {
  // The whole group is gone: capacity devices included, per the vendor statement.
  groupFailures[g] = groupWidths[g]
}
```

The daily probability comes from the cache drive's AFR by the same conversion the worker already
applies to data drives — reusing it rather than introducing a second formula.

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
3. **Ceph's shared-device count** is derived from `cacheTierDriveCount`. Is that what users
   actually enter there, or do they treat it as total WAL/DB capacity? If the latter, the quotient
   is meaningless and the model needs an explicit "OSDs per DB device" input.
