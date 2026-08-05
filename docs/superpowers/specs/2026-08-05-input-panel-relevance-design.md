# Input panel relevance: a control exists only if it changes a number — Design

**Date**: 2026-08-05
**Status**: Approved
**Scope**: the left (configuration) panel across all fifteen topology types — `src/components/inputs/**`, `src/engines/capabilities.ts`, `src/types/topology.ts`, `src/store/slices/topologySlice.ts`, the four locale files, `tests/engines/capabilities.spec.ts` and `tests/utils/optionFieldsConsumed.spec.ts`.

## Problem

Reported from the running app: a BeeGFS configuration showed a **Filesystem** selector set to ZFS while the BeeGFS panel one section above declared its own 2% ext4/XFS overhead, and three BeeGFS controls each carried a paragraph explaining that they do not affect any result.

That screen is not a BeeGFS problem. A full audit of the left panel — every shared panel and all sixteen platform option panels, each control traced to its reads across the four engines, the worker, the validators and the hooks — found the same shape on nine platforms.

**The count.** 33 controls are live with a concrete calculation citation. Against them:

- **22 controls are inert everywhere** — no engine, worker, validator or hook reads them for any topology.
- **4 controls are live but shown too widely** — the engine consults them for some topologies and ignores them for others, while the UI shows them for all.
- **3 controls feed text, never a number** — a generated CLI line, a validation warning, a label echoed back into a results card.

The concentration matters more than the total. PowerVault renders five controls, and **all five are inert**: the user tunes model, controller count, tiering, SSD read cache and thin provisioning, and none of them moves a single figure.

**These are known.** Twenty of the inert controls are already listed in the ALLOWLIST of `tests/utils/optionFieldsConsumed.spec.ts`, and most carry hint text saying, on screen, that they are not used in any calculation. The project found them in the #104 and #110 sweeps and chose to keep them, marked. This spec reverses that choice: a control followed by a sentence explaining it does nothing is worse than no control.

**Two escaped every sweep.** `datasetSize` (WorkloadPanel) and `cacheMode` (TieringPanel) have no consumer anywhere and no allowlist entry. They persist to the URL and echo back onto their own slider. `cacheMode` is the most misleading control in the app: it renders only for S2D, directly above the Working Set slider, which is live.

## The three rules

1. **A control exists in the left panel if and only if perturbing it changes a displayed number** — for the topology currently selected, not for some topology. Verified by the probe, not asserted in a comment.
2. **The right panel keeps its shape across technologies.** Platform-specific content adds; it does not remove or replace. Already true (`shouldShowSection` returns `true` unconditionally for the five core sections) — recorded so it is not eroded.
3. **A hint restates neither the label nor the value.** Explanation belongs in the tooltip; the inline hint carries only what the value alone cannot convey.

## Decision — delete rather than mark

The inert controls name real product features. PowerVault really does have controllers and thin provisioning; vSAN really does have encryption; BeeGFS `numTargets` is a real tunable. The app models none of them, and #69's research showed why building one of them properly is not cheap: ThinkParQ's own benchmark contradicts the naive `numTargets × per-target rate` model, and the app collects no client-link speed a correct model would need.

They are **deleted**, not kept with a disclaimer. Keeping them unmarked would claim they are modelled. Keeping them marked is the current state, which is what prompted this work.

The knowledge is not lost: the sourced comments in `src/types/topology.ts` and the platform strategies record *why* each is unmodelled, where they serve the person maintaining the model.

**An alternative was considered and rejected**: moving these settings into the YAML/Ansible/Terraform export, so a presales engineer keeps a record of intended configuration. The export covers ZFS only — one platform of fifteen — so this would have meant building it out across every platform. Raidy is a sizing tool, not a provisioning tool, and what the ZFS export emits is three lines, not a deployable artifact. Expanding an unproven feature to house deleted controls fails YAGNI. The export's value is a separate question, filed as #124.

## Changes

### Class A — delete (inert for every topology)

| Panel | Controls |
|---|---|
| Workload | `datasetSize` |
| Tiering | `cacheMode` |
| PowerVault | `model`, `controllers`, `tiering`, `ssdReadCache`, `thinProvisioning` |
| BeeGFS | `chunkSizeKb`, `numTargets`, `network` |
| Ceph | `backend`, `encryption`, `journalOnSsd` |
| NetApp | `platform`, `adpVersion`, `zeroDetection` |
| Synology | `modelSeries`, `ssdCache`, `cacheMode` |
| PowerScale | `smartQuotas`, `syncIQ` |
| vSAN | `encryption` |
| ZFS | `specialVdev` |
| Longhorn | `overProvisioningPercent` |

Delete the control, the underlying field, its locale keys in all four languages, **and its ALLOWLIST entry** in `tests/utils/optionFieldsConsumed.spec.ts`. Leaving the allowlist entry behind would keep the guard test blessing a field that no longer exists.

Field removal is link-safe: the nested platform schemas are plain `z.object()` and **strip** unknown keys rather than rejecting, so an old shared URL loads with the removed key dropped. Only the root `ConfigStateSchema` differentiates.

`longhornOptions.overProvisioningPercent` is echoed into the Longhorn results card. Deleting the control means deleting that row too — it displays a number the user can no longer influence.

### Class B — gate (live for some topologies, shown for all)

**`fsType`** — live for `standard` **and `longhorn`**. `getFilesystemOverheadPercent` switches on `topology.type`; there is no `case 'longhorn'`, so Longhorn falls into the `default` branch that reads the user's `fsType`, exactly like standard RAID. The other thirteen types each have an explicit case returning a platform constant.

> This corrects an error in an earlier draft of this spec, which stated `standard` only. Gating on `standard` alone would hide the control for Longhorn while the engine kept consuming the stored value — silently changing Longhorn's usable capacity. The probe case below is what catches this class of mistake; it is the reason rule 1 demands a test rather than a reading of the code.

**`controllerOptions.controller`** — inert for `vsan_esa` only. `isNvmeDirect` drops the controller layer from the bottleneck chain and computes `iopsCeiling` from PCIe and network alone.

**`workingSetPercent`** — inert for `vsan_osa` in `all-flash` disk-group mode. The all-flash branch of `vsanFastTierModel` never reads it, while the hybrid branch does. This is a sub-mode gate, not a topology gate: the condition is `diskGroupMode === 'hybrid'`, not the topology type.

**`hotSpares`** — see the dedicated section below.

### Class C — keep, but stop calling them settings

`zfsOptions.compressionType` (feeds the generated `zfs set compression=` line), `netAppOptions.raidType` (feeds a validation warning) and `longhornOptions.diskMode` (a label, plus a UI-side handler writing presets into two live fields) change no computed number but do change visible output. They stay. They are excluded from rule 1 explicitly, and the guard test's docstring is updated to name this category, because today it passes them only by treating any read in `validators.ts` / `exportConfig.ts` / `TakeawayAct.tsx` as a real consumer — which is accidental, not intentional.

### Hint text

`fsOverheadHint` drops to the varies-with clause alone: from *"Filesystem overhead: {{percent}}%. Reduces usable capacity — varies with inode ratio and formatting options on ext4/XFS storage targets"* to the tail. The label carries the name and the value carries the number; the hint should carry neither. Four locales.

## Hot spares — the two changes that do move numbers

Everything above is inert-control removal and cannot change a result. These two can, and are stated separately for that reason.

**Default `hotSpares` 1 → 0.** `src/store/slices/topologySlice.ts:69`. This changes usable capacity on first load for every platform that honours hot spares.

**Widen `DISTRIBUTED_SPARE_TOPOLOGIES`.** It holds `vsan_osa` and `vsan_esa` today; `TopologyPanel` already hides the slider for them and shows a note instead. The audit found seven more platforms where dedicated hot-spare drives are not the vendor's model — for these, adding them zeroes `totalHotSpares` in all three hooks, so usable capacity **increases** for anyone who had configured a spare.

| Platform | Vendor statement |
|---|---|
| S2D | Reserve capacity "serves the same function as a hot spare" but is "taken evenly from every drive in the pool" |
| PowerScale | Virtual Hot Spare — reserved space, configurable as a percentage or a virtual-drive count, not a physical disk |
| PowerStore | "Dedicated hot spare drives are not required"; spare space is distributed across each resiliency set |
| PowerFlex | Spare capacity spread across all disks rather than on dedicated hot-spare disks |
| Nutanix | Many-to-many rebuild across the cluster; no single hot-spare destination |
| Ceph | No traditional hot spare; recovery backfills into free cluster capacity |
| Longhorn | Replicas rebuild onto any node with available space, governed by the minimum-free-space threshold |

Sources: Microsoft "Deep Dive: The Storage Pool in Storage Spaces Direct"; Dell PowerScale OneFS Administration Guide (Virtual Hot Spare); Dell KB 000188491 (PowerStore capacity); Dell KB 000219120 (PowerFlex spare capacity); Nutanix *Definitive Guide to AOS Storage*; Red Hat Ceph Storage Operations Guide (handling a disk failure); Longhorn space-consumption guideline.

**Platforms that keep the control**, with dedicated spares documented: standard RAID (PERC/mdadm global hot spares), ZFS (spare vdevs), PowerVault ME5 (global *and* dedicated spares, per the ME5 Administrator's Guide), and BeeGFS — whose storage targets are local hardware RAID6 volumes, so spares are meaningful at the controller level even though BeeGFS itself has no such concept.

**Three cases are not settled and must be resolved before implementation, not during it:**

- **ObjectScale** — 12+4 erasure coding with fragments dispersed across nodes implies no spare drive, but no vendor source says so directly. This is inference, not evidence.
- **NetApp ONTAP** and **Synology DSM** — not researched. They stay in the keep-the-control list by default, which is the conservative choice, but that default is an assumption and not a finding.

**A gate that the current design cannot express:** PowerVault ME5 supports spares for standard disk groups but **ADAPT disk groups use neither global nor dynamic spares**. Relevance there depends on the level, not the type, while `usesDistributedSpares(type)` takes only a type. Either ADAPT is handled by extending the predicate to accept the level, or PowerVault keeps the control unconditionally and the discrepancy is documented. Decide before implementing; do not let the existing signature make the decision by default.

**Release note.** Both changes move published figures. They belong in the CHANGELOG with before/after numbers, in the form used for the four figures that moved in 1.16.0 — anyone who sized hardware on the current release needs to know whether it applied to them.

## Testing

The two classes have opposite expectations, and conflating them is how a silent regression would ship.

**Class A and B — no number may change.** Deleting a control that fed nothing, and gating one the engine ignored, cannot move a result. Any moved figure means a control was consumed after all: stop and report rather than adjusting the expectation.

- Extend `tests/engines/capabilities.spec.ts` with probe cases for `fsType`, `controller` and `workingSetPercent`, in the existing style: perturb the control per platform and assert the output moves exactly where the capability flag says it should.
- **Falsifiability, demonstrated not claimed**: each new probe case must fail when its flag is wrong for one platform. Flip one entry, observe the failure, quote the message, restore it. The `fsType`/Longhorn error above is exactly what this catches — a spec read carefully by two people still got it wrong; only the probe would have.
- The ALLOWLIST shrinks by twenty entries. `tests/utils/optionFieldsConsumed.spec.ts` must stay green with no entry left for a deleted field.
- The i18n parity test and the placeholder-preservation test must stay green; removing keys from fewer than four locales fails the first.

**Hot spares — numbers change, and the new values are pinned.** Not relational bounds. The 45× cache-blend error (#111) survived 1,391 tests because every S2D and vSAN assertion used `toBeGreaterThan`. Add fixed-value vectors for at least one affected platform per category: default-change only, distributed-spares only, and both.

## Out of scope, filed separately

- #124 — whether the YAML/Ansible/Terraform export earns its keep at all.
- #125 — `getRecommendations()` returning hardcoded English.
- #126 — `DellOptionsPanel.tsx` at 515 lines, the largest file in the project.
- #127 — the duplicated sustained-write bottleneck derivation flagged during #112.
- #128 — `capabilities.ts`'s thirty-line comment describing a fixed problem.
- `performanceThreshold` computes `usableCapacity * performanceThreshold` inside `OutputDashboard.tsx` and `CapacityAct.tsx` rather than in an engine. It is live and unconditional, so it is not a relevance defect — but a displayed number derived in the view layer is outside the reach of every guard test this project has. Worth an issue; not this one.

## Scope discipline

The probe extends to the controls the audit proved wrong, not to every control. The 33 live controls each have a calculation citation; re-probing them would be work without a hypothesis. The probe grows when evidence produces the next case — the same reasoning that killed the export proposal.
