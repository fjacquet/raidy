# Input panel relevance: a control exists only if it changes a number — Design

**Date**: 2026-08-05
**Status**: Approved
**Scope**: `src/components/inputs/AdvancedPanel.tsx`, `src/components/inputs/topology-options/BeeGfsOptionsPanel.tsx`, `src/engines/capabilities.ts`, the four locale files, and `tests/engines/capabilities.spec.ts`.

## Problem

Reported from the running app: a BeeGFS configuration showed a **Filesystem** selector set to ZFS while the BeeGFS panel one section above declared its own 2% ext4/XFS overhead, and three BeeGFS controls each carried a paragraph explaining that they do not affect any result.

Two distinct defects sit behind that screen.

**A silently ignored control.** `getFilesystemOverheadPercent` (`src/engines/volumetry/overhead/filesystem-overhead.ts`) switches on `topology.type` and returns a per-platform constant — BeeGFS takes `beeGfsOptions.fsOverheadPercent`, ZFS 1%, vSAN 1.5%, ObjectScale 1.5%. The user's `fsType` choice is consulted **only for standard RAID**. Everywhere else the Advanced panel offers a control that changes nothing.

This is the same class as #104 and #110 — a field the user can move with no effect — and it escaped both sweeps because it lives in `AdvancedPanel`, not in a `DEFAULT_*_OPTIONS` object, so `tests/utils/optionFieldsConsumed.spec.ts` does not reach it.

**Explanation printed twice.** The nine longest hint strings in `topology.json` are all BeeGFS. The two worst (271 characters each) belong to `numTargets` and `chunkSizeKb` — controls that **already have tooltips** (`numTargetsTooltip`, `chunkSizeTooltip`). The same text is both a hover affordance and permanent on-screen prose.

## What is explicitly not a problem

**The output panel is already consistent.** `shouldShowSection` returns `true` unconditionally for capacity, performance, resilience, cost and takeaway; only platform detail cards are conditional. The core output keeps its shape across technologies, and platform-specific content is added rather than substituted. No change.

**The capability mechanism already exists and is probe-backed.** `shouldShowControl` gates four controls, and `tests/engines/capabilities.spec.ts` ("capability map matches engine behavior") perturbs each control per platform and asserts the engine output actually moves. Nothing new is invented here; two cases are added to a working mechanism.

## The three rules

1. **A control exists in the left panel if and only if perturbing it changes a displayed number.** Verified by the probe, not asserted in a comment.
2. **The right panel keeps its shape across technologies.** Platform-specific content adds; it does not remove or replace. Already true — recorded so it is not eroded.
3. **A hint restates neither the label nor the value.** Explanation belongs in the tooltip; the inline hint carries only what the value alone cannot convey.

## Decision — delete rather than mark

Three BeeGFS controls (`chunkSizeKb`, `numTargets`, `network`) are genuine BeeGFS tunables with real effects on real hardware, and the app models none of them. #69's research established this with sources — ThinkParQ's own benchmark shows single-stream throughput saturating after two targets, contradicting the obvious `numTargets × per-target rate` model, and the app collects no client-link speed a correct model would need.

They are **deleted**, not kept with a disclaimer.

Keeping them unmarked would claim they are modelled. Keeping them marked is the current state, which is what prompted this work: a control followed by four lines explaining it does nothing is worse than no control.

The knowledge is not lost. #69's sourced comments in `src/types/topology.ts` and the BeeGFS performance strategy record *why* each is unmodelled, where they serve the person maintaining the model.

**An alternative was considered and rejected**: moving these settings into the YAML/Ansible/Terraform export, so a presales engineer keeps a record of intended configuration. The export covers ZFS only — one platform of sixteen — so this would have meant building the export out across every platform. That expansion could not be justified: Raidy is a sizing tool, not a provisioning tool, and what the ZFS export emits is three lines (`zfs_ashift`, `zfs_recordsize`), not a deployable artifact. Expanding an unproven feature to house three deleted controls fails YAGNI. The export's value is a separate question, filed separately.

## Changes

**`fsType`** — gated in `AdvancedPanel` on a new capability flag. Present for `standard`; absent everywhere else, matching `getFilesystemOverheadPercent`'s switch exactly.

**Three BeeGFS controls** — `chunkSizeKb`, `numTargets` and `network` removed from `BeeGfsOptionsPanel`, along with their label, hint and tooltip keys in all four locales.

Whether the underlying *fields* are also removed from `BeeGfsOptions` is decided by the URL-persistence check that #104 and #110 established: the nested platform schemas are plain `z.object()` and strip unknown keys, so removal is link-safe. Remove the fields with the controls, so the sweep test in `tests/utils/optionFieldsConsumed.spec.ts` does not need three new allowlist entries.

**`fsOverheadHint`** — reduced to what the label and value do not already say. From *"Filesystem overhead: {{percent}}%. Reduces usable capacity — varies with inode ratio and formatting options on ext4/XFS storage targets"* to the varies-with clause alone. Four locales.

## Testing

- **A probe case for `fsType`**, in the existing `tests/engines/capabilities.spec.ts` style: perturb `fsType` per platform and assert usable capacity moves exactly where the new flag says it should. This is what makes rule 1 a test rather than an intention.
- **Falsifiability**: the probe case must fail if the flag is set wrong for any platform. Demonstrate by flipping one entry, observing the failure, and restoring it.
- **No number may change.** Deleting a control that fed nothing, and gating one the engine ignored, cannot move a result. Any moved figure means a control was consumed after all — stop and report rather than adjusting.
- The i18n parity test and the placeholder-preservation test must stay green; removing keys from fewer than four locales fails the first.

## Out of scope, filed separately

- Whether the YAML/Ansible/Terraform export earns its keep at all.
- `DellOptionsPanel.tsx` at 515 lines, the largest file in the project.
- `capabilities.ts`'s thirty-line comment describing a UI problem instead of encoding it.
- `getRecommendations()` in `useResilience.ts` returning hardcoded English.
- The duplicated sustained-write bottleneck derivation flagged during #112.

## Scope discipline

Extending the probe to *every* remaining control was considered and cut. Two controls are known to be broken; the rest are a supposition. The probe extends to the next case when evidence produces one — the same reasoning that killed the export proposal.
