# User guide

Raidy sizes storage. You describe hardware and a workload; it reports capacity, performance,
resilience and cost, and it tells you which of those you should not trust too far.

Everything runs in your browser. There is no account, nothing is uploaded, and a scenario travels
as a URL.

> The app has a built-in **Guide** with the same material, per platform and in four languages.
> This document is the version you can read without opening the app, and it says a few things the
> in-app guide does not: what the numbers are *not*, and where they are deliberately pessimistic.

---

## The five-minute path

1. **Topology** — pick the platform (ZFS, vSAN, Ceph, S2D, …) and the protection level. This
   choice drives everything else; controls that mean nothing for your platform disappear rather
   than sitting there inert.
2. **Hardware** — drive model, drives per server, servers. The drive database carries real
   published specs: capacity, IOPS, throughput, power, endurance, AFR and URE rate.
3. **Workload** — read/write mix, random/sequential mix, block size, daily writes. The profile
   buttons underneath set the first three in one click, and which profiles you see depends on the
   platform: BeeGFS offers HPC and AI profiles (training data, checkpointing, scratch, genomics,
   EDA/CAE, inference), everything else offers the general-purpose four (database, file server,
   video streaming, backup). Performance and endurance both depend on this; capacity does not.
4. **Advanced** — network, PCIe, compression assumptions, energy price and carbon region.
5. Read the right-hand panel, then **Copy URL to Share**.

The results are a narrative, not a dashboard of tiles: **Capacity → Performance → Resilience →
Cost → Take-away**, in the order a sizing conversation actually goes.

---

## Reading the capacity figures

Three numbers, and confusing them is the most common sizing error.

| Figure | Meaning |
|---|---|
| **Raw** | What you bought. Drive capacity × drive count. |
| **Usable** | What survives protection and formatting: parity or replicas, filesystem overhead, hot spares, reserved slack. |
| **Effective** | Usable × your compression and deduplication assumptions. |

**Effective capacity is a projection, not a measurement.** It rests on a ratio you supplied or
accepted as a default. Quote usable capacity in a proposal; quote effective only with the ratio
stated beside it.

The Sankey diagram shows where the difference went. If parity overhead looks larger than you
expected, that is usually the protection level rather than a mistake — RAID 6 on eight drives
costs 25%, and no configuration change makes that cheaper without losing protection.

**A note on units.** Manufacturers sell decimal terabytes (10¹²); operating systems report binary
tebibytes (2⁴⁰). The gap is about 9%, and it is the second most common surprise in storage sizing.
The unit toggle in the header switches between them — it changes the display only, never the
calculation.

---

## Reading the performance figures

**Burst and sustained are different numbers, and both are real.** On a tiered platform, writes
land in the fast tier first. Burst is what that absorbs before it saturates; sustained is what the
capacity tier can take once every byte has to drain there. A workload that fits in cache sees
burst. A backup window does not.

Where they are equal — untiered configurations, Ceph, BeeGFS — they are computed to be *exactly*
equal, not approximately.

**The bottleneck chain names the binding layer**: media, controller, PCIe, network. It is the most
directly actionable output in the tool. A media-bound configuration is one where you paid for
drives and are getting them; a controller-bound one is where a cheaper part is capping expensive
drives.

The gauges are scaled to **what the drives themselves could do**, not to a fixed maximum. So a
needle short of full means the chain is throttling your media, and a full needle means the drives
are the limit — the reading is informative in both directions.

**These are model figures, not benchmarks.** They come from published drive specifications and
vendor overhead tables, with a RAID write penalty applied. Real arrays are affected by firmware,
queue depth, filesystem tuning and access patterns no sizing tool sees. Treat them as an upper
bound for comparing configurations against each other, not as a promise.

---

## Reading the resilience figures

Press **Run Simulation** — this one is on demand, because it is 100,000 simulated years of your
cluster and takes a moment.

The headline is an **annual survival rate**, given as nines. The panel also reports the
probability of a URE during rebuild and of a second failure during the rebuild window.

**Three things worth knowing before you quote it.**

It is deliberately **pessimistic where it is uncertain**. The model is built so its simulated
failure set is always a superset of the real one — it may understate your resilience, never
overstate it. Where a mechanism could not be sourced from vendor documentation, it is left
modelled conservatively, and the release notes say which.

**Rare events need patience or a nudge.** At a realistic ~1% annual failure rate, dual failures
are rare enough that 100K iterations cannot resolve small differences between configurations. If
two options look identical, they may genuinely be, at the precision this tool reports.

**Some conservatism is visible and can look like a bug.** A BeeGFS cluster with an odd number of
storage targets reports *worse* survival than one with an even number, because the unpaired target
has no buddy and gets no credit for one. The panel says so when it happens. It is a real property
of the configuration, not an artefact.

---

## Reading the cost and sustainability figures

Power draw comes from the drives' published active and idle figures, scaled by your PUE. Energy
cost and CO₂ follow from that and your carbon region.

**Flash endurance is the one to look at.** It compares your daily write volume, amplified by the
platform's write penalty, against the drives' rated endurance, and reports the years before they
are consumed. A configuration that is fine on capacity and performance can still be wrong here —
write-heavy workloads on read-intensive drives are a classic and expensive mistake.

---

## Sharing and exporting

**Copy URL to Share** puts the entire configuration in the link. No account, no expiry, nothing
stored on a server.

One caveat worth knowing: the link records only what you *changed* from the defaults. If a default
changes in a later version, an old link inherits the new one. Version 2.0.0 did exactly this — the
default hot-spare count went from 1 to 0, so links made earlier that never touched it now show
slightly more usable capacity than when they were shared. Version 3.0.0 moved the neutral workload
defaults (read mix, random mix, and block size), which shifts the headline IOPS and throughput
figures a link displays — a larger effect than the hot-spare change. Links where you set the value
yourself are unaffected. When a release does this, its notes say so at the top.

**PDF** for a written report, **PowerPoint** for a one-page summary. Both follow your current
theme and language. The Take-away card also carries copy-pasteable ZFS provisioning commands.

---

## What Raidy is not

- **Not a provisioning tool.** It sizes; it does not deploy. A YAML/Terraform export existed and
  was removed in 2.0.0: a fragment derived from a capacity estimate has no hosts, no network and
  no credentials, so it was never deployable.
- **Not a benchmark.** See the performance caveats above.
- **Not a substitute for a vendor sizer** on a configuration you are about to buy. It is the tool
  for the conversation *before* that one — comparing options, understanding trade-offs, and
  spotting the configuration that cannot work.
- **Not a monitoring or capacity-planning tool.** It has no idea what your existing array is doing.

---

## Where the numbers come from

Every platform's formulas come from vendor documentation, cited in the code and in
[ENGINES.md](./ENGINES.md). Capacity results are held within 1% of
[WintelGuy](https://wintelguy.com/raidmttdl.pl) and NetApp's Storage Efficiency Calculator by an
automated test suite, and each validation vector carries its own sources.

Where a figure could not be sourced, that is stated rather than smoothed over — `INFERRED, not
sourced` appears in the code where an architectural inference stands in for a vendor statement.
