# Input Panel Relevance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every control in the left configuration panel earn its place — a control is shown if and only if perturbing it changes a number the app displays for the currently selected topology.

**Architecture:** Three mechanical deletion passes (inert controls, their fields, their locale keys, their guard-test allowlist entries), then two gating changes verified by extending the existing capability probe, then two number-moving hot-spare changes pinned with fixed-value vectors. Deletions and gates cannot move a result; the hot-spare changes can and must, and they are kept in separate tasks with opposite test expectations so the two are never conflated.

**Tech Stack:** React 19 + TypeScript strict, Zustand, Zod v4, Vitest + jsdom, fast-check, Biome, react-i18next (4 locales).

**Spec:** `docs/superpowers/specs/2026-08-05-input-panel-relevance-design.md`

## Global Constraints

- Branch: `feat/input-panel-relevance`, cut from `main` at `07a3687`. Do not work on `main`.
- All shell commands are prefixed `rtk` (project convention), including inside `&&` chains.
- Biome: 2-space indent, 100-char width, single quotes, semicolons as-needed. Run `rtk npm run lint:fix` before each commit.
- Every locale change touches **all four** of `en`, `fr`, `de`, `it`. The i18n parity test fails otherwise.
- `fr`/`de`/`it` strings carry full accents/diacritics (this was settled in #86 — unaccented strings were drift, not convention).
- Docs stay in sync in the *same commit*: any change to config, CI, dependencies, or behaviour updates the matching file in `docs/` plus `CHANGELOG.md`.
- Deleting a field means deleting its **ALLOWLIST entry** in `tests/utils/optionFieldsConsumed.spec.ts` too. A stale entry blesses a field that no longer exists.
- Nested platform option schemas in `src/utils/schemas.ts` are plain `z.object()` — they **strip** unknown keys rather than rejecting. Field removal is therefore link-safe for shared URLs. Do not add `.strict()`.
- Never widen an assertion to make a test pass. If a number moves in Tasks 1–8, stop and report: it means a control was consumed after all.
- Verification after every task: `rtk npm run lint && rtk npm run typecheck && rtk npm test`.

---

### Task 1: Delete the two controls no sweep caught

`datasetSize` and `cacheMode` have no consumer anywhere in the engines, worker, validators or hooks, and — unlike the other 20 — no ALLOWLIST entry either. They escaped the #104 and #110 sweeps because neither lives in a `DEFAULT_*_OPTIONS` object, which is the only place `optionFieldsConsumed.spec.ts` looks.

`cacheMode` is the most misleading control in the app: it renders only for S2D, directly above the Working Set slider, which is live.

**Files:**
- Modify: `src/components/inputs/WorkloadPanel.tsx` (remove the dataset-size slider)
- Modify: `src/components/inputs/TieringPanel.tsx` (remove the cache-mode segmented control and its `showCacheMode` prop)
- Modify: `src/components/inputs/topology-options/S2dOptionsPanel.tsx`, `CephOptionsPanel.tsx`, `BeeGfsOptionsPanel.tsx`, `VsanOptionsPanel.tsx` (drop the now-dead `showCacheMode` prop at each call site)
- Modify: `src/types/config.ts` (drop `datasetSize` from the workload state), `src/types/topology.ts` (drop `cacheMode` from `TieringConfig`)
- Modify: `src/store/slices/workloadSlice.ts` (drop the field, its default, and `setDatasetSize`)
- Modify: `src/utils/schemas.ts` (drop both zod fields)
- Modify: `src/i18n/locales/{en,fr,de,it}/workload.json` and `.../topology.json`
- Test: `tests/utils/optionFieldsConsumed.spec.ts` (verify no allowlist change is needed — neither field was listed)

**Interfaces:**
- Consumes: nothing from earlier tasks (this is the first).
- Produces: `TieringConfig` no longer has `cacheMode`; `TieringPanel`'s props no longer accept `showCacheMode`. Tasks 5 and 6 render `TieringPanel` and must not reintroduce either.

- [ ] **Step 1: Prove both are unconsumed before deleting anything**

```bash
rtk grep -rn "datasetSize" src/engines src/workers src/hooks src/utils/validators.ts
rtk grep -rn "cacheMode" src/engines src/workers src/hooks src/utils/validators.ts
```

Expected: **zero hits** for both. If either returns a hit, STOP and report — the spec's premise is wrong for that field and deleting it would change a number.

Note `synologyOptions.cacheMode` is a *different* field (Task 4) and lives in `src/types/topology.ts` under `SynologyOptions`. Do not confuse them; the grep above covers engines only, where neither appears.

- [ ] **Step 2: Write a failing test that pins the store surface**

Create `tests/store/removedWorkloadFields.spec.ts`:

```ts
/**
 * `datasetSize` and `TieringConfig.cacheMode` were stored, serialized to the URL and echoed
 * back onto their own controls, but never read by any engine. They are removed. This test
 * fails if either is reintroduced without a consumer.
 */
import { describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'
import { DEFAULT_S2D_OPTIONS } from '@/types/topology'

describe('removed dead fields', () => {
  it('workload state has no datasetSize', () => {
    expect(useConfigStore.getState()).not.toHaveProperty('datasetSize')
  })

  it('tiering config has no cacheMode', () => {
    expect(DEFAULT_S2D_OPTIONS.tieringConfig).not.toHaveProperty('cacheMode')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
rtk npx vitest run tests/store/removedWorkloadFields.spec.ts
```

Expected: FAIL, both assertions — the properties still exist.

- [ ] **Step 4: Delete both controls, fields, defaults, setters, schema entries and locale keys**

Work outward from the UI: control → store field → default → setter → zod schema → type → locale keys. TypeScript will surface every remaining reference; `noUnusedVariables` is an error, so a leftover import fails the lint.

- [ ] **Step 5: Verify a shared URL from before the change still loads**

The nested schemas strip unknown keys, so an old link carrying `cacheMode` must load cleanly with the key dropped. Add to the same spec file:

```ts
it('an old shared URL carrying the removed keys still parses', () => {
  const legacy = {
    ...JSON.parse(JSON.stringify(useConfigStore.getState().serialize?.() ?? {})),
    datasetSize: 1024,
  }
  // Root schema differentiates; nested option schemas strip. Neither should throw.
  expect(() => ConfigStateSchema.parse(legacy)).not.toThrow()
})
```

Adjust the import and the serialization call to match `src/store/urlStorage.ts`'s actual API — read it first rather than assuming a `serialize()` method exists.

- [ ] **Step 6: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: all green. **No existing assertion may change value.** If a volumetry or performance number moved, STOP and report.

- [ ] **Step 7: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): delete datasetSize and TieringConfig.cacheMode

Neither is read by any engine, worker, validator or hook. Both escaped the
#104 and #110 sweeps because neither lives in a DEFAULT_*_OPTIONS object,
which is the only place optionFieldsConsumed.spec.ts looks. cacheMode
rendered for S2D only, directly above the live Working Set slider.

Link-safe: nested option schemas strip unknown keys, so shared URLs carrying
either field still load."
```

---

### Task 2: Delete the seven inert Dell controls

PowerVault renders five controls and **all five are inert** — the user tunes model, controller count, tiering, SSD read cache and thin provisioning, and none moves a figure. PowerScale adds two more.

**Files:**
- Modify: `src/components/inputs/topology-options/DellOptionsPanel.tsx`
- Modify: `src/types/topology.ts` (`PowerVaultOptions`, `PowerScaleOptions`, and both `DEFAULT_*` objects)
- Modify: `src/utils/schemas.ts`
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json`
- Test: `tests/utils/optionFieldsConsumed.spec.ts` (remove seven ALLOWLIST entries)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PowerVaultOptions` retains only fields with engine consumers; `PowerScaleOptions` loses `smartQuotas` and `syncIQ`. No later task reads any of the seven.

Controls to delete: `powervaultOptions.model`, `.controllers`, `.tiering`, `.ssdReadCache`, `.thinProvisioning`; `powerscaleOptions.smartQuotas`, `.syncIQ`.

**Do not touch** `powerstoreOptions.model`. It looks inert (no engine reads it) but the panel's preset handler writes `systemOverheadPercent` from it, and that field *is* engine-read. Deleting `model` would remove the only way to pick a preset. It is Class C, not Class A.

- [ ] **Step 1: Confirm each of the seven is allowlisted, then remove the entries first**

```bash
rtk grep -n "model\|controllers\|tiering\|ssdReadCache\|thinProvisioning\|smartQuotas\|syncIQ" tests/utils/optionFieldsConsumed.spec.ts
```

Delete exactly the seven ALLOWLIST lines for the fields above. Leave `powerstoreOptions.model`'s entry in place.

- [ ] **Step 2: Run the guard test and watch it fail**

```bash
rtk npx vitest run tests/utils/optionFieldsConsumed.spec.ts
```

Expected: FAIL — seven fields now exist in `DEFAULT_*_OPTIONS` with neither a consumer nor an allowlist entry. This failure is the proof that the guard test genuinely covers them.

- [ ] **Step 3: Delete the controls, fields, defaults, schema entries and locale keys**

Remove from `DellOptionsPanel.tsx` the JSX for each of the seven, including the hint text that says the control is not used in any calculation — that text is the thing being removed, not preserved.

- [ ] **Step 4: Run the guard test and watch it pass**

```bash
rtk npx vitest run tests/utils/optionFieldsConsumed.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: green, **with no numeric assertion changed**.

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): delete seven inert Dell controls

PowerVault rendered five controls and all five were inert; PowerScale added
smartQuotas and syncIQ. Each was already allowlisted in the guard test and
each carried on-screen hint text admitting it changed nothing.

powerstoreOptions.model is deliberately kept: no engine reads it, but the
panel's preset handler writes systemOverheadPercent from it, which is
engine-read."
```

---

### Task 3: Delete the inert Ceph, vSAN and ZFS controls

**Files:**
- Modify: `src/components/inputs/topology-options/CephOptionsPanel.tsx`, `VsanOptionsPanel.tsx`, `ZfsOptionsPanel.tsx`
- Modify: `src/types/topology.ts` (`CephOptions`, `VsanOptions`, `ZfsOptions` + defaults)
- Modify: `src/utils/schemas.ts`
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json`
- Test: `tests/utils/optionFieldsConsumed.spec.ts` (remove five ALLOWLIST entries)

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces: `CephOptions` loses `backend`, `encryption`, `journalOnSsd`; `VsanOptions` loses `encryption`; `ZfsOptions` loses `specialVdev`.

**Do not touch** `zfsOptions.compressionType`. It feeds the generated `zfs set compression=` line in `TakeawayAct.tsx` and `exportConfig.ts` — Class C, handled in Task 7.

- [ ] **Step 1: Remove the five ALLOWLIST entries first**

`cephOptions.backend`, `.encryption`, `.journalOnSsd`; `vsanOptions.encryption`; `zfsOptions.specialVdev`.

- [ ] **Step 2: Run the guard test and watch it fail**

```bash
rtk npx vitest run tests/utils/optionFieldsConsumed.spec.ts
```

Expected: FAIL, five fields unaccounted for.

- [ ] **Step 3: Delete the controls, fields, defaults, schema entries and locale keys**

- [ ] **Step 4: Run the guard test and watch it pass**

- [ ] **Step 5: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: green, no numeric assertion changed.

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): delete inert Ceph, vSAN and ZFS controls

cephOptions.backend/encryption/journalOnSsd, vsanOptions.encryption and
zfsOptions.specialVdev were allowlisted and each stated on screen that it
changed nothing.

zfsOptions.compressionType is kept: it feeds the generated zfs set
compression= line, so it changes visible output even though it changes no
computed number."
```

---

### Task 4: Delete the inert NetApp, Synology, Longhorn and BeeGFS controls

**Files:**
- Modify: `src/components/inputs/topology-options/NetAppOptionsPanel.tsx`, `SynologyOptionsPanel.tsx`, `LonghornOptionsPanel.tsx`, `BeeGfsOptionsPanel.tsx`
- Modify: `src/components/outputs/LonghornCapacityDetails.tsx` (remove the over-provisioning row)
- Modify: `src/types/topology.ts` (four options interfaces + defaults)
- Modify: `src/engines/volumetry/index.ts` (stop populating `longhornDetails.overProvisioningPercent`)
- Modify: `src/utils/schemas.ts`
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json` and `.../output.json`
- Test: `tests/utils/optionFieldsConsumed.spec.ts` (remove eight ALLOWLIST entries)

**Interfaces:**
- Consumes: nothing from Tasks 1–3.
- Produces: `BeeGfsOptions` loses `chunkSizeKb`, `numTargets`, `network`; `NetAppOptions` loses `platform`, `adpVersion`, `zeroDetection`; `SynologyOptions` loses `modelSeries`, `ssdCache`, `cacheMode`; `LonghornOptions` loses `overProvisioningPercent`. `LonghornDetails` loses its `overProvisioningPercent` member.

`longhornOptions.overProvisioningPercent` is echoed into the Longhorn results card. Deleting the control means deleting that row — it displays a number the user can no longer influence.

The three BeeGFS controls are genuine BeeGFS tunables that the app does not model. #69 established why with sources: ThinkParQ's own benchmark shows single-stream throughput saturating after two targets, contradicting the naive `numTargets × per-target rate` model, and the app collects no client-link speed a correct model would need. The sourced comments in `src/types/topology.ts` and the BeeGFS performance strategy explaining this **stay** — they serve the person maintaining the model, not the user configuring one.

- [ ] **Step 1: Remove the eight ALLOWLIST entries first**

- [ ] **Step 2: Run the guard test and watch it fail**

- [ ] **Step 3: Delete the controls, fields, defaults, schema entries and locale keys**

- [ ] **Step 4: Delete the Longhorn over-provisioning output row**

Remove it from `LonghornCapacityDetails.tsx`, from the `LonghornDetails` type, from where `volumetry/index.ts` populates it, and from `output.json` in all four locales.

- [ ] **Step 5: Run the guard test and the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: green. Longhorn's `usableCapacity` must be **unchanged** — `overProvisioningPercent` was echoed, never computed with. If it moved, STOP and report.

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): delete inert NetApp, Synology, Longhorn and BeeGFS controls

Eleven controls, all allowlisted. The three BeeGFS ones are real tunables the
app does not model; #69's sourced comments explaining why stay in the code.

longhornOptions.overProvisioningPercent was echoed into the results card, so
that row goes too — it displayed a number the user can no longer influence."
```

---

### Task 5: Gate `fsType` to the two topologies that read it

`getFilesystemOverheadPercent` switches on `topology.type` and returns a platform constant for thirteen types. Two fall through to `getFsTypeOverhead(fsType)`: `standard`, via an explicit `case`, and **`longhorn`, via the `default` branch** — the switch has no case for it.

> An earlier draft of the spec said `standard` only. Gating on that would have hidden the control for Longhorn while the engine kept consuming the stored value, silently changing Longhorn's usable capacity. The probe case below is what catches this class of error.

**Files:**
- Modify: `src/engines/capabilities.ts` (add `honoursFsType` to `PlatformCapabilities`, extend `shouldShowControl`'s union)
- Modify: `src/components/inputs/AdvancedPanel.tsx:319` (gate the selector)
- Test: `tests/engines/capabilities.spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–4.
- Produces: `PlatformCapabilities` gains `honoursFsType: boolean`; `shouldShowControl` accepts `'fsType'`. Task 6 extends the same interface and must merge rather than replace.

- [ ] **Step 1: Write the failing probe case**

Add to the `for` loop in the `capability map matches engine behavior` describe block in `tests/engines/capabilities.spec.ts`:

```ts
it(`${topology.type}: honoursFsType=${caps.honoursFsType}`, () => {
  const base = calculateVolumetry(
    createVolumetryInput(drives, topology, { serverCount: servers, fsType: 'ext4' }),
  )
  const other = calculateVolumetry(
    createVolumetryInput(drives, topology, { serverCount: servers, fsType: 'zfs' }),
  )
  if (caps.honoursFsType) {
    expect(other.usableCapacity).not.toBe(base.usableCapacity)
  } else {
    expect(other.usableCapacity).toBe(base.usableCapacity)
  }
})
```

Check `createVolumetryInput` in `tests/fixtures/vector-harness.ts` accepts an `fsType` override; add it to the overrides type if not. Check the two `FsType` members chosen have **different** overhead percentages in `getFsTypeOverhead` — if `ext4` and `zfs` happen to return the same constant, the probe cannot distinguish and the test is vacuous. Pick two that differ and say which in a comment.

Also extend the `shouldShowControl` mirror assertion:

```ts
expect(shouldShowControl('fsType', type)).toBe(caps.honoursFsType)
```

- [ ] **Step 2: Run it and watch it fail**

```bash
rtk npx vitest run tests/engines/capabilities.spec.ts
```

Expected: FAIL — `honoursFsType` does not exist on `PlatformCapabilities`. TypeScript error, not an assertion failure.

- [ ] **Step 3: Add the flag, set to `true` for `standard` and `longhorn` only**

```ts
export interface PlatformCapabilities {
  supportsCompression: boolean
  supportsDedup: boolean
  supportsHotSpares: boolean
  hasServerCount: boolean
  /**
   * True when getFilesystemOverheadPercent consults the user's fsType rather than
   * returning a platform constant. `standard` reaches it via an explicit case;
   * `longhorn` reaches it via the `default` branch, because the switch has no
   * case for it. Both are load-bearing — see the probe in capabilities.spec.ts.
   */
  honoursFsType: boolean
}
```

Add `honoursFsType` to all fifteen entries: `true` for `standard` and `longhorn`, `false` for the other thirteen. Extend `shouldShowControl`'s parameter union and switch with a `case 'fsType': return caps.honoursFsType`.

- [ ] **Step 4: Run the probe and watch it pass**

```bash
rtk npx vitest run tests/engines/capabilities.spec.ts
```

Expected: PASS, fifteen new cases.

- [ ] **Step 5: Demonstrate falsifiability — do not skip this**

Set `longhorn.honoursFsType` to `false`. Run the probe. It **must** fail on the `longhorn` case. Quote the failure message in the task report. Restore `true` and confirm green.

This step is the point of the task. A spec read carefully by two people still got Longhorn wrong; only the probe caught it.

- [ ] **Step 6: Gate the control in the UI**

In `AdvancedPanel.tsx`, wrap the filesystem block in `shouldShowControl('fsType', topology.type)`, following the existing `showCompression`/`showDedup` pattern at lines 109–110.

- [ ] **Step 7: Run the full suite**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
```

Expected: green, **no numeric assertion changed** — the engine's behaviour is untouched; only the control's visibility changed.

- [ ] **Step 8: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): show the filesystem selector only where the engine reads it

getFilesystemOverheadPercent returns a platform constant for thirteen types.
Two consult the user's choice: standard via an explicit case, and longhorn
via the default branch, because the switch has no case for it.

Pinned by a new probe case per topology, demonstrated falsifiable by flipping
the longhorn flag and observing the failure."
```

---

### Task 6: Gate the controller selector and the working-set slider

Two narrower guards the audit found:

- **`controllerOptions.controller`** — inert for `vsan_esa` only. `isNvmeDirect` drops the controller layer from the bottleneck chain and computes `iopsCeiling` from PCIe and network alone.
- **`workingSetPercent`** — inert for `vsan_osa` in `all-flash` disk-group mode. The all-flash branch of `vsanFastTierModel` never reads it; the hybrid branch does. This is a **sub-mode** gate keyed on `diskGroupMode === 'hybrid'`, not on the topology type — `PlatformCapabilities` cannot express it, so it is a local condition in `TieringPanel`, not a capability flag.

**Files:**
- Modify: `src/engines/capabilities.ts` (add `honoursController`)
- Modify: `src/components/inputs/AdvancedPanel.tsx` (gate the controller selector)
- Modify: `src/components/inputs/TieringPanel.tsx` (gate the working-set slider on the vSAN mode it already receives)
- Test: `tests/engines/capabilities.spec.ts`, `tests/engines/performance/` (a new spec for the working-set sub-mode)

**Interfaces:**
- Consumes: `PlatformCapabilities` and `shouldShowControl` as extended by Task 5. Add to them; do not replace.
- Produces: `PlatformCapabilities` gains `honoursController: boolean`; `shouldShowControl` accepts `'controller'`.

- [ ] **Step 1: Write the failing controller probe**

The controller affects performance, not capacity, so this probe calls `calculatePerformance`, not `calculateVolumetry`. Add a separate describe block rather than extending the volumetry loop:

```ts
describe('honoursController matches the bottleneck chain', () => {
  for (const { topology, drives, servers } of REPRESENTATIVE) {
    const caps = getCapabilities(topology.type)

    it(`${topology.type}: honoursController=${caps.honoursController}`, () => {
      const weak = calculatePerformance(
        createPerformanceInput(drives, topology, {
          serverCount: servers,
          controllerOptions: { controller: 'perc_h755' },
        }),
      )
      const strong = calculatePerformance(
        createPerformanceInput(drives, topology, {
          serverCount: servers,
          controllerOptions: { controller: 'perc_h975i' },
        }),
      )
      if (caps.honoursController) {
        expect(strong.maxReadIOPS).toBeGreaterThan(weak.maxReadIOPS)
      } else {
        expect(strong.maxReadIOPS).toBe(weak.maxReadIOPS)
      }
    })
  }
})
```

Read `tests/fixtures/vector-harness.ts` first: if no `createPerformanceInput` helper exists, write one alongside `createVolumetryInput`, matching its shape and defaults. The two controllers chosen differ by roughly 3.7× in IOPS (`perc_h755` at 3,500,000, `perc_h975i` at 12,900,000), so a platform that reads the controller cannot possibly return equal values — but confirm both are valid for each topology's controller constraint, and substitute a valid pair where they are not.

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `honoursController` does not exist.

- [ ] **Step 3: Add `honoursController`, `false` for `vsan_esa` only**

- [ ] **Step 4: Run and watch it pass**

- [ ] **Step 5: Demonstrate falsifiability**

Flip `vsan_esa.honoursController` to `true`, observe the failure, quote it, restore.

- [ ] **Step 6: Write the failing working-set sub-mode test**

Create `tests/engines/performance/vsanWorkingSetSubMode.spec.ts`:

```ts
/**
 * vSAN OSA reads workingSetPercent only in hybrid disk-group mode. The all-flash branch of
 * vsanFastTierModel never consults it, so the slider is inert there even though the topology
 * as a whole honours it. A capability flag cannot express this — it is keyed on
 * diskGroupMode, not on topology.type.
 */
import { describe, expect, it } from 'vitest'

describe('vSAN OSA working set', () => {
  it('changes throughput in hybrid mode', () => {
    // build two inputs differing only in workingSetPercent, diskGroupMode: 'hybrid'
    // expect the results to differ
  })

  it('does not change throughput in all-flash mode', () => {
    // same two inputs, diskGroupMode: 'all-flash'
    // expect the results to be identical
  })
})
```

Fill both bodies using the tiering fixture shape already used by the S2D and vSAN performance specs in `tests/engines/performance/` — read one first and follow it rather than inventing a new harness.

- [ ] **Step 7: Run it — the first case should pass, the second should pass too**

Both describe current behaviour; this test pins it before the UI change so a later refactor cannot silently make the slider live in all-flash mode without anyone noticing.

- [ ] **Step 8: Gate both controls in the UI**

Controller selector in `AdvancedPanel.tsx` on `shouldShowControl('controller', topology.type)`. Working-set slider in `TieringPanel.tsx` on the vSAN mode prop it already receives — show it when the platform is not vSAN OSA, or when it is and the mode is `hybrid`.

- [ ] **Step 9: Run the full suite**

Expected: green, no numeric assertion changed.

- [ ] **Step 10: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(ui): gate the controller selector and the working-set slider

controllerOptions.controller is inert for vsan_esa, which is NVMe-direct: the
controller layer is dropped from the bottleneck chain and iopsCeiling comes
from PCIe and network alone. Pinned by a probe over calculatePerformance.

workingSetPercent is inert for vsan_osa in all-flash mode. That is a sub-mode
gate keyed on diskGroupMode, not on topology.type, so it stays a local
condition in TieringPanel rather than a capability flag — pinned by a
dedicated hybrid-vs-all-flash test."
```

---

### Task 7: Name the Class C category in the guard test

Three fields change visible output without changing a computed number: `zfsOptions.compressionType` (the generated `zfs set compression=` line), `netAppOptions.raidType` (a validation warning) and `longhornOptions.diskMode` (a results-card label, plus a UI-side handler writing presets into two live fields).

They stay. The problem is that they pass the guard test **by accident**: the test treats any read in `validators.ts`, `exportConfig.ts` or `TakeawayAct.tsx` as a real consumer. That is a loophole wide enough to admit a genuinely dead field that happens to be logged somewhere.

**Files:**
- Modify: `tests/utils/optionFieldsConsumed.spec.ts` (docstring + an explicit category)

**Interfaces:**
- Consumes: the ALLOWLIST as left by Tasks 2–4 (twenty entries lighter).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Read the guard test's docstring**

It already carves out a category for "kept informational, hint text says so" fields. Class C is a *different* category: consumed, but by the view layer.

- [ ] **Step 2: Add an explicit `UI_ONLY_CONSUMERS` list**

Name the three fields with a one-line reason each, and assert they are consumed **only** by files in `EXTRA_CONSUMER_FILES` and by no engine, worker or hook. This converts an accidental pass into a stated intent, and makes a fourth such field a deliberate decision rather than a silent one.

- [ ] **Step 3: Demonstrate falsifiability**

Add a fourth, fictional entry to `UI_ONLY_CONSUMERS` for a field that *is* engine-read (e.g. `netAppOptions.waflOverhead`). The test must fail. Quote the message, then remove the fictional entry.

- [ ] **Step 4: Run the suite and commit**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
rtk git add -A && rtk git commit -m "test: name the UI-only consumer category in the option-fields guard

zfsOptions.compressionType, netAppOptions.raidType and longhornOptions.diskMode
change visible output but no computed number. They passed the guard only
because it treats any read in validators/exportConfig/TakeawayAct as real —
a loophole that would also admit a dead field that happens to be logged.
Now stated explicitly, with a falsifiability check."
```

---

### Task 8: Shorten `fsOverheadHint`

The label carries the name and the value carries the number; the hint should carry neither.

**Files:**
- Modify: `src/i18n/locales/{en,fr,de,it}/topology.json`

**Interfaces:** none.

- [ ] **Step 1: Rewrite the four strings**

From *"Filesystem overhead: {{percent}}%. Reduces usable capacity — varies with inode ratio and formatting options on ext4/XFS storage targets"* to the varies-with clause alone.

The `{{percent}}` placeholder disappears from the string. Check whether the placeholder-preservation test asserts placeholder **parity across locales** or placeholder **presence per key** — if the latter, its expectation for this key must be updated in the same commit. Read the test before editing.

- [ ] **Step 2: Run the i18n tests**

```bash
rtk npx vitest run tests/i18n
```

Expected: PASS. Removing a placeholder from one locale but not the others fails parity — all four must change together.

- [ ] **Step 3: Run the full suite and commit**

```bash
rtk npm run lint && rtk npm run typecheck && rtk npm test
rtk git add -A && rtk git commit -m "i18n: cut fsOverheadHint to what the label and value do not say

The label names the setting and the value shows the percentage; the hint
repeated both. Four locales, accents preserved (#86)."
```

---

### Task 9: Default `hotSpares` to 0

**This task moves published numbers.** Everything before it was inert-control removal and visibility gating, which cannot change a result. From here the expectations invert: numbers change, and the new values are pinned to fixed figures.

**Files:**
- Modify: `src/store/slices/topologySlice.ts:69`
- Modify: `CHANGELOG.md`, `docs/CONFIGURATION.md` (if it documents the default)
- Test: `tests/engines/volumetry/` (new fixed-value vectors)

**Interfaces:**
- Consumes: nothing from Tasks 1–8.
- Produces: the default the Task 10 vectors build on. Task 10 must be written against `hotSpares: 0`.

Do **not** use relational assertions. The 45× cache-blend error (#111) survived 1,391 tests because every S2D and vSAN assertion used `toBeGreaterThan`.

- [ ] **Step 1: Capture the before values**

For three representative configurations — standard RAID6, ZFS raidz2, and BeeGFS `beegfs_raid6` — record `usableCapacity` at the current default of 1, as exact byte figures. Put them in the commit message and the CHANGELOG, not only in the test.

- [ ] **Step 2: Write the failing vectors**

Create `tests/engines/volumetry/hotSpareDefault.spec.ts` asserting the **post-change** usable capacity for those three configurations with `toBe`, exact bytes. Run it: it must fail, and the failure must show the old value.

- [ ] **Step 3: Change the default to 0**

- [ ] **Step 4: Run the vectors and watch them pass**

- [ ] **Step 5: Run the full suite and triage every failure individually**

Existing specs that relied on the default of 1 will fail. Each one must be inspected: if the spec is *about* hot spares, set `hotSpares: 1` explicitly to preserve its intent. If it merely inherited the default, update the expected value and say so in the commit. **Never widen an assertion to make it pass.**

- [ ] **Step 6: Write the CHANGELOG entry**

Lead with a before/after table of the three figures, in the form used for the four figures that moved in 1.16.0. Anyone who sized hardware on the current release needs to know whether this applied to them.

- [ ] **Step 7: Commit**

```bash
rtk git add -A && rtk git commit -m "feat(store)!: default hotSpares to 0

A hot spare is a deliberate design choice, not a default. The previous default
of 1 silently reduced usable capacity on first load for every platform that
honours spares.

BREAKING: usable capacity increases for any configuration left at the default.
Before/after figures in CHANGELOG.md. Pinned with exact-byte vectors, not
relational bounds — the 45x cache-blend error (#111) survived 1,391 tests
because every assertion used toBeGreaterThan."
```

---

### Task 10: Widen `DISTRIBUTED_SPARE_TOPOLOGIES`

**This task also moves published numbers**, in the opposite direction from Task 9 for affected users: adding a platform zeroes `totalHotSpares` in all three hooks, so usable capacity **increases** for anyone who had configured a spare there.

Eight platforms join `vsan_osa` and `vsan_esa`: `s2d`, `powerscale`, `powerstore`, `powerflex`, `nutanix`, `ceph`, `longhorn`, `objectscale`.

**Do not flip `supportsHotSpares`.** The engine genuinely subtracts hot spares for all fifteen types — the zeroing lives in the *hooks* (`useVolumetryCalc`, `usePerformanceCalc`, `useResilience`), which the probe bypasses by calling `calculateVolumetry` directly. Setting `supportsHotSpares: false` would make the probe fail, correctly. Extend the list only.

While here, record the resulting oddity rather than leaving it for the next reader: `shouldShowControl('hotSpares', …)` is **never called** in the UI — `TopologyPanel` gates on `usesDistributedSpares` instead — and `supportsHotSpares` is `true` for all fifteen types, so the flag carries no information. Two mechanisms, one of them vestigial. Unifying them is out of scope here; file an issue and add a comment at both sites pointing at each other.

**Files:**
- Modify: `src/types/topology.ts` (`DISTRIBUTED_SPARE_TOPOLOGIES`)
- Modify: `src/engines/capabilities.ts` (comment only, cross-referencing)
- Modify: `CHANGELOG.md`, `docs/ARCHITECTURE.md`
- Test: `tests/hooks/` (new fixed-value vectors)

**Interfaces:**
- Consumes: the `hotSpares: 0` default from Task 9. Vectors here must set `hotSpares` explicitly, since the default no longer exercises the path.
- Produces: nothing later depends on.

Sources, for the code comment and the CHANGELOG:

| Platform | Vendor statement |
|---|---|
| S2D | Reserve capacity "serves the same function as a hot spare" but is "taken evenly from every drive in the pool" |
| PowerScale | Virtual Hot Spare — reserved space, not a physical disk |
| PowerStore | "Dedicated hot spare drives are not required"; spare space distributed across each resiliency set |
| PowerFlex | Spare capacity spread across all disks |
| Nutanix | Many-to-many rebuild; no single hot-spare destination |
| Ceph | No traditional hot spare; recovery backfills into free cluster capacity |
| Longhorn | Replicas rebuild onto any node with free space |
| ObjectScale | Erasure-coded fragments re-created on surviving nodes — **inferred from architecture, no vendor source states it directly** |

Mark ObjectScale's entry as inference in the code comment. Do not present it as a citation.

Platforms that **keep** the control, with dedicated spares documented: `standard` (PERC/mdadm), `zfs` (spare vdevs), `powervault` (ME5 global and dedicated spares), `proprietary`/Synology (Hot Spare in Storage Manager, SHR-compatible), `beegfs` (targets are local RAID6, so spares matter at the controller level), and NetApp levels (ONTAP best practice is two spares per disk type, with a `min_spare_count` option).

- [ ] **Step 1: Write the failing vectors**

Create `tests/hooks/distributedSpares.spec.ts`. For at least three of the eight platforms, assert with `toBe` and exact bytes that `hotSpares: 2` yields the **same** usable capacity as `hotSpares: 0` — the definition of the spare being ignored. Drive these through the hook or through the same `totalHotSpares` computation the hooks perform, **not** through `calculateVolumetry` directly, which does not apply the zeroing.

Run it. Expected: FAIL for all eight, since they are not yet in the list.

- [ ] **Step 2: Add the eight platforms to `DISTRIBUTED_SPARE_TOPOLOGIES`**

With the sourced comment above, ObjectScale marked as inference.

- [ ] **Step 3: Run the vectors and watch them pass**

- [ ] **Step 4: Confirm the control disappears for exactly the right platforms**

`TopologyPanel` already branches on `usesDistributedSpares`, so no UI change is needed. Add an assertion that the slider is absent for the ten distributed platforms and present for the five that keep it, so a future edit to the list cannot silently change the UI.

- [ ] **Step 5: Add the cross-referencing comments and file the unification issue**

At `shouldShowControl`'s `hotSpares` case and at `DISTRIBUTED_SPARE_TOPOLOGIES`, note that two mechanisms currently express hot-spare relevance, that only the latter drives the UI, and that `supportsHotSpares` is `true` for every type and so carries no information today.

- [ ] **Step 6: Run the full suite and triage every failure individually**

Same rule as Task 9: preserve intent where a spec is about spares, update the value where it merely inherited, never widen.

- [ ] **Step 7: CHANGELOG with before/after figures, then commit**

```bash
rtk git add -A && rtk git commit -m "feat(topology)!: eight platforms rebuild from distributed capacity, not spares

S2D, PowerScale, PowerStore, PowerFlex, Nutanix, Ceph, Longhorn and
ObjectScale join vSAN in DISTRIBUTED_SPARE_TOPOLOGIES. Each vendor documents
rebuild from reserved or free capacity rather than dedicated spare drives;
ObjectScale is inferred from its erasure-coding architecture and marked as
such in the code.

Standard RAID, ZFS, PowerVault, Synology, NetApp and BeeGFS keep the control —
all six document dedicated spares.

BREAKING: usable capacity increases on the eight platforms for anyone who had
configured a hot spare. Before/after figures in CHANGELOG.md.

supportsHotSpares is deliberately not flipped: the engine does subtract spares
for all fifteen types, and the zeroing lives in the hooks. Flipping it would
make the capability probe fail, correctly."
```

---

## Self-Review

**Spec coverage.** Class A (22 controls) → Tasks 1–4. Class B (4 controls) → Tasks 5, 6, 10. Class C (3 controls) → Task 7. Hint text → Task 8. The two number-moving hot-spare changes → Tasks 9 and 10. The ALLOWLIST shrinkage is folded into the task that deletes each field, not deferred. Every spec section maps to a task.

**Placeholders.** Three steps deliberately defer detail to a file the implementer must read first, rather than guessing: the URL round-trip assertion in Task 1 Step 5 (`urlStorage.ts`'s actual API), the performance fixture in Task 6 Step 1 (`vector-harness.ts` may lack `createPerformanceInput`), and the sub-mode test bodies in Task 6 Step 6 (follow an existing tiering spec). Each names the file and what to look for. Inventing these signatures here would be worse than pointing at the source.

**Type consistency.** `PlatformCapabilities` is extended twice — `honoursFsType` in Task 5, `honoursController` in Task 6 — and Task 6's Interfaces block says to add rather than replace. `shouldShowControl`'s union grows in step with it. `TieringConfig` loses `cacheMode` in Task 1, and Tasks 5–6 render `TieringPanel` without reintroducing it.

**The ordering constraint that matters.** Tasks 1–8 must not move a number; Tasks 9–10 must. Running them in that order means any numeric change during Tasks 1–8 is unambiguous evidence of a mistake, with no legitimate explanation available. Reversing the order would destroy that signal.

## Parked, deliberately out of scope

`feat/hot-spare-rebuild-credit` (#93, commit `2706d22`) sits unpushed on its own branch and is **not** part of this plan. It adds a one-day replacement-sourcing delay for spare-free configurations, which would interact with Task 9's zero-spare default: merged together, the default configuration would take the delay penalty and the default survival figure would drop, from two changes that each look independently harmless.

Nothing in this plan depends on it, and it must not be merged alongside these tasks. When it is picked up again, its release note has to be written against a zero-spare default rather than the current one.
