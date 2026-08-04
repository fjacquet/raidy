# URL Schema Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a shared URL carry every setting, reject forged values instead of silently defaulting them, and stop describing code paths that do not exist.

**Architecture:** Four hand-written lists of the same field set had drifted. Closed unions move into exported `as const` arrays that both the TypeScript type and the Zod enum derive from, so the compiler holds them together. `partialize` and `getDefaultState()` stop restating field lists — one derives from a `PERSISTED_KEYS` constant, the other from the slices' own initial state — and a parity test forces any new setting to be classified. The never-reachable flat-payload branch and the root `.passthrough()` are deleted.

**Tech Stack:** TypeScript strict, Zod 4, Zustand 5 (`persist` + `createJSONStorage`), LZ-String, Vitest + jsdom, Biome.

**Spec:** `docs/superpowers/specs/2026-08-04-url-schema-hardening-design.md`

## Global Constraints

- Commands are prefixed with `rtk` in this repo (a token-reducing proxy — always safe): `rtk npm run typecheck`, `rtk npx vitest run <file>`, `rtk git add`, `rtk git commit`.
- Every commit must pass `rtk npm run typecheck` and `rtk npm run lint`. Run `rtk npm run lint:fix` before committing.
- Branch: `fix/url-schema-hardening` (already checked out, spec already committed). Do not push, do not open a PR.
- `driveId` stays `z.string().min(1)` — it is a drive-database key, not a closed union. Do not enumerate it.
- Existing tests may only be edited where a task explicitly says so (Task 4 migrates `tests/utils/urlStorage.spec.ts` fixtures). Anywhere else, a failing existing test means STOP and report.
- Docs ship in the same commit as the behaviour change they describe — a project rule in `CLAUDE.md`.
- Closing a `docs/BACKLOG.md` item means deleting its entry entirely, not marking it done. Leave every other entry, including its number, untouched.
- Biome: 2-space indent, 100-char lines, single quotes, semicolons as-needed.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/types/config.ts` | Modify | Owns six closed unions; gains their `as const` value arrays |
| `src/types/topology.ts` | Modify | Owns `ControllerType`; gains `HBA_TYPES`, `RAID_CONTROLLER_TYPES`, `CONTROLLER_TYPES` |
| `src/utils/schemas.ts` | Modify | URL payload validation; enums replace `z.string()`, root `.passthrough()` removed |
| `src/store/persistedKeys.ts` | Create | The single list of persisted keys, and the deliberate opt-outs |
| `src/store/configStore.ts` | Modify | `partialize` derives from `PERSISTED_KEYS`; `getDefaultState()` derives from the slices |
| `src/store/urlStorage.ts` | Modify | Envelope is the only accepted payload shape |
| `tests/store/persistedKeys.spec.ts` | Create | The parity test that forces new settings to be classified |
| `tests/store/resetToDefaults.spec.ts` | Create | Pins the three fields the reset button silently skipped |
| `tests/utils/schemaEnums.spec.ts` | Create | Forged enum values are rejected, valid ones survive |
| `tests/utils/urlStorage.spec.ts` | Modify | Fixtures migrate to the enveloped shape zustand actually writes |

---

### Task 1: Closed enums derived from const arrays

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/types/topology.ts:233-257`
- Modify: `src/utils/schemas.ts:257` and `:376-426`
- Test: `tests/utils/schemaEnums.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks — this is the first.
- Produces: `BLOCK_SIZES`, `NETWORK_SPEEDS`, `PCIE_GENS`, `PCIE_LANES`, `CARBON_REGIONS`, `FS_TYPES` exported from `src/types/config.ts`; `HBA_TYPES`, `RAID_CONTROLLER_TYPES`, `CONTROLLER_TYPES` exported from `src/types/topology.ts`. All are `readonly` string tuples. The matching types (`BlockSize`, `NetworkSpeed`, `PCIeGen`, `PCIeLanes`, `CarbonRegion`, `HbaType`, `RaidControllerType`, `ControllerType`) keep their existing names and remain exported.

- [ ] **Step 1: Write the failing test**

Create `tests/utils/schemaEnums.spec.ts`:

```ts
/**
 * The URL schema's closed unions must reject forged values rather than letting them reach a
 * lookup table, miss, and fall back — a silently wrong calculation is worse than a rejected
 * link. Each enum derives from the same `as const` array the TypeScript type derives from, so
 * the schema and the lookup tables cannot drift apart.
 */

import { describe, expect, it } from 'vitest'
import {
  BLOCK_SIZES,
  CARBON_REGIONS,
  FS_TYPES,
  NETWORK_SPEEDS,
  PCIE_GENS,
  PCIE_LANES,
} from '@/types/config'
import { CONTROLLER_TYPES } from '@/types/topology'
import { validateUrlState } from '@/utils/schemas'

describe('URL schema closed enums', () => {
  const rootCases = [
    { field: 'blockSize', values: BLOCK_SIZES },
    { field: 'networkSpeed', values: NETWORK_SPEEDS },
    { field: 'pcieGen', values: PCIE_GENS },
    { field: 'pcieLanes', values: PCIE_LANES },
    { field: 'carbonRegion', values: CARBON_REGIONS },
    { field: 'fsType', values: FS_TYPES },
  ] as const

  for (const { field, values } of rootCases) {
    it(`accepts every declared ${field} value`, () => {
      expect(values.length).toBeGreaterThan(1)
      for (const value of values) {
        expect(validateUrlState({ [field]: value })).toEqual({ [field]: value })
      }
    })

    it(`rejects a forged ${field} value`, () => {
      expect(validateUrlState({ [field]: 'not-a-real-value' })).toBeNull()
    })
  }

  it('accepts every declared controller value', () => {
    expect(CONTROLLER_TYPES.length).toBeGreaterThan(1)
    for (const controller of CONTROLLER_TYPES) {
      const state = { controllerOptions: { ...VALID_CONTROLLER_OPTIONS, controller } }
      expect(validateUrlState(state)).not.toBeNull()
    }
  })

  it('rejects a forged controller value', () => {
    const state = {
      controllerOptions: { ...VALID_CONTROLLER_OPTIONS, controller: 'not-a-controller' },
    }
    expect(validateUrlState(state)).toBeNull()
  })
})
```

Add the fixture above the `describe`, after the imports — `ControllerOptionsSchema` is strict about its other fields, so a bare `{ controller }` would fail for the wrong reason:

```ts
import { DEFAULT_CONTROLLER_OPTIONS } from '@/types'

const VALID_CONTROLLER_OPTIONS = DEFAULT_CONTROLLER_OPTIONS
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/utils/schemaEnums.spec.ts`

Expected: FAIL at import — `BLOCK_SIZES` and the other arrays do not exist yet. That is the correct first failure.

- [ ] **Step 3: Add the const arrays in `src/types/config.ts`**

Replace each union declaration with an array plus a derived type. Keep the existing doc comments.

```ts
/** Workload block size options */
export const BLOCK_SIZES = ['4K', '8K', '16K', '64K', '128K', '256K', '1M'] as const
export type BlockSize = (typeof BLOCK_SIZES)[number]

/** Network speed options */
export const NETWORK_SPEEDS = [
  '1GbE',
  '10GbE',
  '25GbE',
  '40GbE',
  '100GbE',
  '200GbE',
  '400GbE',
] as const
export type NetworkSpeed = (typeof NETWORK_SPEEDS)[number]

/** PCIe generation options */
export const PCIE_GENS = ['gen3', 'gen4', 'gen5'] as const
export type PCIeGen = (typeof PCIE_GENS)[number]

/** PCIe lane configuration */
export const PCIE_LANES = ['x4', 'x8', 'x16'] as const
export type PCIeLanes = (typeof PCIE_LANES)[number]

/** Carbon intensity regions */
export const CARBON_REGIONS = [
  'switzerland',
  'france',
  'norway',
  'germany',
  'usa_average',
  'china',
  'world_average',
] as const
export type CarbonRegion = (typeof CARBON_REGIONS)[number]

/** File system types available for backup calculations */
export const FS_TYPES = ['xfs', 'ext4', 'zfs', 'refs', 'ntfs', 'btrfs'] as const
export type FsType = (typeof FS_TYPES)[number]
```

`FsType` is new. In the same file, `FilesystemState.fsType` currently inlines the union — change it to use the named type:

```ts
  /** File system type */
  fsType: FsType
```

- [ ] **Step 4: Add the const arrays in `src/types/topology.ts`**

Replace the `HbaType` and `RaidControllerType` unions the same way, preserving every inline comment as an array-element comment, and derive `ControllerType` from both:

```ts
export const HBA_TYPES = [
  'hba_sas', // Generic SAS HBA (IT mode)
  'hba_nvme', // NVMe HBA / direct attach
  'lsi_9500', // Broadcom/LSI 9500 series (24G SAS)
  'lsi_9400', // Broadcom/LSI 9400 series (12G SAS)
  'dell_hba355i', // Dell HBA355i (12G SAS)
  'dell_hba355e', // Dell HBA355e external (12G SAS)
] as const
export type HbaType = (typeof HBA_TYPES)[number]
```

Do the same for `RAID_CONTROLLER_TYPES` / `RaidControllerType`, keeping every existing member and its comment. Then:

```ts
/** Every controller value, in HBA-then-RAID order. Derived so `CONTROLLER_LIMITS` below stays
 * exhaustive by compilation: adding a member here breaks the build until the table follows. */
export const CONTROLLER_TYPES = [...HBA_TYPES, ...RAID_CONTROLLER_TYPES] as const
export type ControllerType = HbaType | RaidControllerType
```

- [ ] **Step 5: Run the type checker to confirm the tables still cover every member**

Run: `rtk npm run typecheck`
Expected: PASS. `CONTROLLER_LIMITS`, `BLOCK_SIZE_BYTES` and `CARBON_INTENSITY` are `Record<Type, …>`, so a mismatch between an array and its table would surface here. If it errors, an array member was mistyped — fix the array, not the table.

- [ ] **Step 6: Replace the `z.string()` fields in `src/utils/schemas.ts`**

Add the imports at the top of the file, merging into the existing `@/types` import if one is present:

```ts
import {
  BLOCK_SIZES,
  CARBON_REGIONS,
  FS_TYPES,
  NETWORK_SPEEDS,
  PCIE_GENS,
  PCIE_LANES,
} from '@/types/config'
import { CONTROLLER_TYPES } from '@/types/topology'
```

In `ControllerOptionsSchema` (line 257):

```ts
  controller: z.enum(CONTROLLER_TYPES),
```

In `ConfigStateSchema`:

```ts
    blockSize: z.enum(BLOCK_SIZES).optional(),
    networkSpeed: z.enum(NETWORK_SPEEDS).optional(),
    pcieGen: z.enum(PCIE_GENS).optional(),
    pcieLanes: z.enum(PCIE_LANES).optional(),
    carbonRegion: z.enum(CARBON_REGIONS).optional(),
    fsType: z.enum(FS_TYPES).optional(),
```

Leave `driveId: z.string().min(1).optional()` exactly as it is.

- [ ] **Step 7: Run the test to verify it passes**

Run: `rtk npx vitest run tests/utils/schemaEnums.spec.ts`
Expected: PASS (14 tests).

- [ ] **Step 8: Run the full suite**

Run: `rtk npm run typecheck && rtk npx vitest run`
Expected: PASS. A pre-existing test that fed a bogus enum value through the schema and expected it to survive would fail here — if that happens, STOP and report rather than editing it.

- [ ] **Step 9: Update the backlog and CHANGELOG, lint, and commit**

Delete the whole `### [B4](…)` entry from `docs/BACKLOG.md`, body and all.

In `CHANGELOG.md`, under `## [Unreleased]` → `### Fixed` (create the heading if absent):

```markdown
- **Forged values in a shared link are rejected instead of silently defaulted.** `blockSize`,
  `networkSpeed`, `pcieGen`, `pcieLanes`, `carbonRegion`, `fsType` and the RAID controller were
  free-text in the URL schema, so an arbitrary string reached a lookup table, missed, and fell
  back to a default — a wrong calculation presented as a valid one. Each is now an enum derived
  from the same `as const` array its TypeScript type derives from, so the schema and the lookup
  tables are held together by the compiler. (#62)
```

```bash
rtk npm run lint:fix
rtk git add src/types/config.ts src/types/topology.ts src/utils/schemas.ts tests/utils/schemaEnums.spec.ts docs/BACKLOG.md CHANGELOG.md
rtk git commit -m "fix(schema): reject forged enum values from shared links

blockSize, networkSpeed, pcieGen, pcieLanes, carbonRegion, fsType and the RAID
controller were z.string() in ConfigStateSchema, so a crafted link reached a
lookup table, missed, and silently defaulted. Each union now lives in an as
const array that both the TypeScript type and the Zod enum derive from; the
Record<Type, ...> lookup tables keep them exhaustive by compilation.

Closes #62"
```

---

### Task 2: One persisted-key list, with a parity test

**Files:**
- Create: `src/store/persistedKeys.ts`
- Modify: `src/store/configStore.ts:156-202`
- Modify: `src/utils/schemas.ts` (add `performanceThreshold`)
- Test: `tests/store/persistedKeys.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `PERSISTED_KEYS` and `EPHEMERAL_KEYS`, both `readonly string[]` tuples exported from `src/store/persistedKeys.ts`, plus the type alias `PersistedKey = (typeof PERSISTED_KEYS)[number]`.

- [ ] **Step 1: Write the failing test**

Create `tests/store/persistedKeys.spec.ts`:

```ts
/**
 * Four hand-written lists described the same field set and drifted:
 * `performanceThreshold` was missing from both `partialize` and `ConfigStateSchema`, so it reset
 * on every shared link while every other setting survived (#63).
 *
 * These assertions force a decision. A newly added setting fails this test until someone puts it
 * in PERSISTED_KEYS or EPHEMERAL_KEYS — it can no longer vanish from a shared link by omission.
 */

import { describe, expect, it } from 'vitest'
import { EPHEMERAL_KEYS, PERSISTED_KEYS } from '@/store/persistedKeys'
import { useConfigStore } from '@/store'
import { ConfigStateSchema } from '@/utils/schemas'

/** Settings, not actions — an action is a function, a setting never is. */
function configKeysOfLiveStore(): string[] {
  return Object.entries(useConfigStore.getState())
    .filter(([, value]) => typeof value !== 'function')
    .map(([key]) => key)
}

describe('persisted-key parity', () => {
  it('classifies every configuration field exactly once', () => {
    const declared = [...PERSISTED_KEYS, ...EPHEMERAL_KEYS].sort()
    expect(declared).toEqual(configKeysOfLiveStore().sort())
  })

  it('keeps the two lists disjoint', () => {
    const overlap = PERSISTED_KEYS.filter((key) => (EPHEMERAL_KEYS as readonly string[]).includes(key))
    expect(overlap).toEqual([])
  })

  it('matches the URL schema field for field', () => {
    expect([...PERSISTED_KEYS].sort()).toEqual(Object.keys(ConfigStateSchema.shape).sort())
  })

  it('persists performanceThreshold', () => {
    expect(PERSISTED_KEYS).toContain('performanceThreshold')
  })
})
```

Then, in the same file, the regression that #63 is actually about — a non-default threshold must
survive the round trip through the URL, not merely appear in a list:

```ts
import { compressToEncodedURIComponent } from 'lz-string'
import { urlHashStorage } from '@/store/urlStorage'

describe('performanceThreshold round trip', () => {
  const stateKey = 'raidy'

  it('survives a shared link', () => {
    window.location.hash = ''
    useConfigStore.getState().resetToDefaults()
    useConfigStore.getState().setPerformanceThreshold(0.7)

    // partialize + createJSONStorage is what writes the hash; read it back the same way.
    const written = urlHashStorage.getItem(stateKey)
    expect(written).not.toBeNull()
    expect(JSON.parse(written as string).state.performanceThreshold).toBe(0.7)
  })
})
```

If `urlHashStorage.getItem` returns `null` here because the store's `persist` middleware has not
written the hash in this test environment, build the hash explicitly instead — compress
`JSON.stringify({ state: { performanceThreshold: 0.7 }, version: 1 })` into
`window.location.hash = \`${stateKey}=…\`` and assert `getItem` returns it with the field intact.
Either shape proves the same thing: the field is no longer dropped. Say in your report which one
you used and why.

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/store/persistedKeys.spec.ts`

Expected: FAIL at import — `@/store/persistedKeys` does not exist yet.

- [ ] **Step 3: Create `src/store/persistedKeys.ts`**

`PERSISTED_KEYS` is the forty keys `partialize` lists today (`configStore.ts:160-199`), in the same order, plus `performanceThreshold` after `unitSystem`.

```ts
/**
 * Which configuration fields belong in a shared link, and which deliberately do not.
 *
 * These two lists must partition the store's configuration state — `tests/store/persistedKeys.spec.ts`
 * asserts it. That parity check exists because the same field set used to be written out by hand
 * in four places (`partialize`, `getDefaultState`, `ConfigStateSchema`, and the slices), which is
 * how `performanceThreshold` came to be absent from a shared link while every other setting
 * survived (#63).
 */
export const PERSISTED_KEYS = [
  // Hardware
  'driveId',
  'driveCount',
  'serverCount',
  'serverPowerWatts',
  // Topology
  'topology',
  'hotSpares',
  'zfsOptions',
  's2dOptions',
  'vsanOptions',
  'cephOptions',
  'longhornOptions',
  'beeGfsOptions',
  'powerFlexOptions',
  'controllerOptions',
  'netAppOptions',
  'synologyOptions',
  'nutanixOptions',
  'objectscaleOptions',
  'powerstoreOptions',
  'powerscaleOptions',
  'powervaultOptions',
  // Workload
  'readPercent',
  'blockSize',
  'randomPercent',
  'datasetSize',
  'dailyWriteVolume',
  // Advanced
  'compressionRatio',
  'dedupRatio',
  'networkSpeed',
  'pcieGen',
  'pcieLanes',
  'pue',
  'carbonRegion',
  'projectYears',
  'electricityCostPerKwh',
  'unitSystem',
  'performanceThreshold',
  // Filesystem
  'fsType',
  'supportsReflink',
  'backupRetention',
  'dailyChangeRate',
] as const

/**
 * Configuration state deliberately kept out of shared links.
 *
 * The drive filters narrow the picker for the current session; they describe how someone is
 * browsing the drive database, not the configuration the link is meant to reproduce.
 */
export const EPHEMERAL_KEYS = ['driveConnectivity', 'driveFormFactor'] as const

export type PersistedKey = (typeof PERSISTED_KEYS)[number]
```

- [ ] **Step 4: Derive `partialize` from the list**

In `src/store/configStore.ts`, add the import:

```ts
import { PERSISTED_KEYS, type PersistedKey } from './persistedKeys'
```

Replace the forty-line object literal inside `partialize` (lines 158-200) with a pick driven by the list:

```ts
      partialize: (state) => {
        const persisted = {} as Pick<ConfigStore, PersistedKey>
        for (const key of PERSISTED_KEYS) {
          // Indexed assignment across a union of key types needs the cast; the Pick above is
          // what actually constrains the result.
          ;(persisted as Record<string, unknown>)[key] = state[key]
        }
        return omitDefaults(persisted, DEFAULT_STATE_BASELINE)
      },
```

Use `ConfigStore` — the flat slice intersection declared at `configStore.ts:69`, which is what
`create<ConfigStore>()` and therefore `state` actually are. Do **not** use the `ConfigState`
exported from `@/types/config`: that one is the nested `{ hardware, topology, workload, advanced,
filesystem }` shape and has none of these keys. (`@/utils/schemas` also exports a third, unrelated
`ConfigState` inferred from the Zod schema.) Do not change `omitDefaults` or
`DEFAULT_STATE_BASELINE`.

- [ ] **Step 5: Add `performanceThreshold` to the URL schema**

In `src/utils/schemas.ts`'s `ConfigStateSchema`, immediately after the `unitSystem` line:

```ts
    performanceThreshold: z.number().min(0.5).max(1).finite().optional(),
```

The bounds match `setPerformanceThreshold`'s clamp in `src/store/slices/advancedSlice.ts`
(`Math.min(1.0, Math.max(0.5, …))`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `rtk npx vitest run tests/store/persistedKeys.spec.ts`

Expected: the last three tests PASS. The first (`classifies every configuration field exactly once`) still FAILS — `getDefaultState()` is a separate list and Task 3 has not reconciled it yet. Confirm the failure names only the keys Task 3 owns; if it names anything else, a key was mistyped in Step 3.

- [ ] **Step 7: Run the full suite**

Run: `rtk npm run typecheck && rtk npx vitest run`
Expected: everything passes except the one known-failing parity assertion from Step 6.

- [ ] **Step 8: Commit**

```bash
rtk npm run lint:fix
rtk git add src/store/persistedKeys.ts src/store/configStore.ts src/utils/schemas.ts tests/store/persistedKeys.spec.ts
rtk git commit -m "fix(store): persist performanceThreshold, and derive partialize from one list

partialize enumerated forty keys by hand and ConfigStateSchema repeated them;
performanceThreshold was missing from both, so it reset on every shared link.
Both now derive from PERSISTED_KEYS, with EPHEMERAL_KEYS recording the
deliberate opt-outs and a parity test forcing new settings to be classified.

The parity test's store-partition assertion still fails pending the
getDefaultState reconciliation in the next commit."
```

---

### Task 3: `getDefaultState()` derives from the slices

**Files:**
- Modify: `src/store/configStore.ts:77-141`
- Test: `tests/store/resetToDefaults.spec.ts` (create)

**Interfaces:**
- Consumes: `PERSISTED_KEYS` / `EPHEMERAL_KEYS` from Task 2 (only through the parity test, which this task turns green).
- Produces: nothing new — `getDefaultState()` keeps its name and its "fresh objects every call" contract.

- [ ] **Step 1: Write the failing test**

Create `tests/store/resetToDefaults.spec.ts`:

```ts
/**
 * `resetToDefaults()` is `set(getDefaultState())`, and zustand's `set` merges — so any field
 * missing from `getDefaultState()` keeps its current value instead of resetting. Three fields
 * lived only in their slices' initial state and were therefore never reset:
 * `performanceThreshold`, `driveConnectivity` and `driveFormFactor`.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('resetToDefaults', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults()
  })

  it('resets fields that live only in their slice', () => {
    const store = useConfigStore.getState()
    store.setPerformanceThreshold(0.6)
    store.setDriveConnectivity('nvme')
    store.setDriveFormFactor('u.2')

    expect(useConfigStore.getState().performanceThreshold).toBe(0.6)
    expect(useConfigStore.getState().driveConnectivity).toBe('nvme')

    useConfigStore.getState().resetToDefaults()

    const after = useConfigStore.getState()
    expect(after.performanceThreshold).toBe(1.0)
    expect(after.driveConnectivity).toBe('all')
    expect(after.driveFormFactor).toBe('all')
  })

  it('still resets the fields it always did', () => {
    useConfigStore.getState().setDriveCount(99)
    useConfigStore.getState().setReadPercent(10)

    useConfigStore.getState().resetToDefaults()

    const after = useConfigStore.getState()
    expect(after.driveCount).toBe(12)
    expect(after.readPercent).toBe(70)
  })

  it('installs fresh option objects rather than sharing one reference', () => {
    useConfigStore.getState().resetToDefaults()
    const first = useConfigStore.getState().zfsOptions

    useConfigStore.getState().resetToDefaults()
    const second = useConfigStore.getState().zfsOptions

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/store/resetToDefaults.spec.ts`

Expected: the first test FAILS — `performanceThreshold` is still `0.6` and `driveConnectivity` still `'nvme'` after the reset. The other two PASS (they pin behaviour that already works and must survive).

- [ ] **Step 3: Replace `getDefaultState()` with a slice-derived version**

In `src/store/configStore.ts`, delete the whole hand-written `getDefaultState` literal (lines 77-132) and its now-unused `DEFAULT_*_OPTIONS` imports if nothing else in the file uses them. Replace with:

```ts
/**
 * The default configuration, taken from the slices themselves rather than restated here.
 *
 * A StateCreator's body builds its initial state eagerly and only closes over `set`/`get` inside
 * its action functions, so invoking one with inert stubs yields the slice's defaults without
 * touching a store. Restating them was a fourth copy of the same field list, and it had already
 * drifted: `performanceThreshold`, `driveConnectivity` and `driveFormFactor` were missing, so
 * `resetToDefaults()` — a merging `set` — silently left all three untouched.
 *
 * Each call re-invokes the creators, so the option objects are fresh: `resetToDefaults()` installs
 * new references rather than sharing the module-level defaults.
 */
const sliceDefaults = <T extends object>(creator: StateCreator<T>): Partial<T> => {
  const noop = (() => undefined) as never
  const raw = creator(noop, noop, noop) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value !== 'function'),
  ) as Partial<T>
}

const getDefaultState = () => ({
  ...sliceDefaults(createHardwareSlice),
  ...sliceDefaults(createTopologySlice),
  ...sliceDefaults(createWorkloadSlice),
  ...sliceDefaults(createAdvancedSlice),
})
```

`StateCreator` is imported from `zustand` in this file's slice modules; add `import type { StateCreator } from 'zustand'` here if it is not already present. The four `create*Slice` functions are already imported.

- [ ] **Step 4: Run both affected specs**

Run: `rtk npx vitest run tests/store/resetToDefaults.spec.ts tests/store/persistedKeys.spec.ts`
Expected: PASS — including the parity assertion Task 2 left failing, since `getDefaultState()` is no longer a separate list.

- [ ] **Step 5: Run the full suite**

Run: `rtk npm run typecheck && rtk npx vitest run`

Expected: PASS. Watch specifically for tests asserting that `resetToDefaults()` leaves a filter or the performance threshold alone — that behaviour genuinely changes here. If one exists, STOP and report it rather than editing it; it needs a human decision about which behaviour is intended.

- [ ] **Step 6: Update the backlog and CHANGELOG, lint, and commit**

Delete the whole `### [B5](…)` entry from `docs/BACKLOG.md`.

In `CHANGELOG.md`, add to the `### Fixed` list under `## [Unreleased]`:

```markdown
- **`performanceThreshold` survives a shared link.** It was absent from `partialize`, so it reset
  while every other setting persisted. (#63)
```

and add a `### Changed` section under `## [Unreleased]`:

```markdown
### Changed
- **"Reset to defaults" now resets the performance threshold and the two drive-picker filters.**
  They lived only in their slices' initial state, and `resetToDefaults()` merges, so the button
  silently skipped them. Defaults are now taken from the slices themselves rather than restated.
```

```bash
rtk npm run lint:fix
rtk git add src/store/configStore.ts tests/store/resetToDefaults.spec.ts docs/BACKLOG.md CHANGELOG.md
rtk git commit -m "fix(store): reset every setting, not just the ones listed twice

getDefaultState() restated the slices' defaults and had drifted from them:
performanceThreshold, driveConnectivity and driveFormFactor were missing, and
because resetToDefaults() is a merging set, the button silently left all three
untouched. Defaults now come from the slice creators themselves.

Closes #63"
```

---

### Task 4: The envelope is the only payload shape

**Files:**
- Modify: `src/store/urlStorage.ts:11-80`
- Modify: `src/utils/schemas.ts:426`
- Modify: `tests/utils/urlStorage.spec.ts`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing — `urlHashStorage` keeps its `StateStorage` shape.

- [ ] **Step 1: Write the failing test**

Append to `tests/utils/urlStorage.spec.ts`, inside the outermost `describe`:

```ts
  it('rejects a flat payload, which no released version has ever written', () => {
    // `createJSONStorage` has wrapped state in `{ state, version }` since the initial commit, so
    // a flat payload can only come from a hand-crafted link.
    const flat = compressToEncodedURIComponent(JSON.stringify({ driveCount: 24 }))
    window.location.hash = `${stateKey}=${flat}`

    expect(urlHashStorage.getItem(stateKey)).toBeNull()
  })

  it('strips an unknown root key instead of merging it into the store', () => {
    const payload = compressToEncodedURIComponent(
      JSON.stringify({ state: { driveCount: 24, somethingUnknown: 'x' }, version: 1 }),
    )
    window.location.hash = `${stateKey}=${payload}`

    const retrieved = urlHashStorage.getItem(stateKey)
    expect(retrieved).not.toBeNull()
    const parsed = JSON.parse(retrieved as string)
    expect(parsed.state.driveCount).toBe(24)
    expect(parsed.state).not.toHaveProperty('somethingUnknown')
  })
```

`compressToEncodedURIComponent` is already imported in that file if other tests build hashes directly; if not, add `import { compressToEncodedURIComponent } from 'lz-string'`. `stateKey` is the existing local constant.

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/utils/urlStorage.spec.ts`

Expected: both new tests FAIL — the flat payload is currently accepted, and the unknown key currently survives `.passthrough()`.

- [ ] **Step 3: Delete the flat-payload branch**

In `src/store/urlStorage.ts`, `getItem` currently reads:

```ts
      // Validate the REAL config payload, not the persist envelope wrapping it.
      // A bare/flat object (older links, hand-constructed test fixtures) is
      // validated as-is for backward compatibility.
      const envelope = isPersistEnvelope(parsed)
      const rawState = envelope ? (parsed as PersistEnvelope).state : parsed
      const validated = validateUrlState(rawState)
```

Replace with:

```ts
      // Validate the REAL config payload, not the persist envelope wrapping it. A payload that
      // is not an envelope cannot have come from any released version — `createJSONStorage` has
      // wrapped state in `{ state, version }` since the initial commit — so it is treated as a
      // corrupt link rather than a legacy one.
      if (!isPersistEnvelope(parsed)) {
        console.error('Configuration link is not in the expected format')
        toast.error('Invalid configuration link', {
          description: 'The shared configuration link is invalid. Using default settings instead.',
          duration: 5000,
        })
        return null
      }
      const validated = validateUrlState(parsed.state)
```

Then simplify the re-wrap below it, which no longer has two cases:

```ts
      // Re-wrap in the envelope Zustand expects (preserving `version`) so
      // hydration reads the validated config, not the raw unvalidated one.
      const output = { state: validated, version: parsed.version }
```

Update the module-level doc comment (lines 11-20) so it no longer implies flat payloads are handled — state plainly that the compressed hash decodes to the persist envelope and that anything else is rejected.

- [ ] **Step 4: Remove the root `.passthrough()`**

In `src/utils/schemas.ts`, replace line 426:

```ts
  .passthrough() // Allow extra fields for forward compatibility
```

with a plain close of the object plus a comment above the schema's closing brace:

```ts
  })
```

and add above `export const ConfigStateSchema`, appended to its existing doc comment:

```
 * Unknown top-level keys are stripped (Zod's default). The nested platform-option schemas are
 * already strict, and an unknown key merged into the live store is read by nobody yet re-persisted
 * on the next change — forward compatibility that only grows the URL.
```

- [ ] **Step 5: Migrate the existing flat fixtures**

`tests/utils/urlStorage.spec.ts` builds fixtures flat — `urlHashStorage.setItem(stateKey, JSON.stringify(config))` — across roughly fifteen call sites. `setItem` stores whatever string it is given, so these round-trips only ever passed because `getItem` accepted flat payloads.

Add a helper near the top of the file, after the imports:

```ts
/** The shape zustand's `createJSONStorage` actually writes. */
function envelope(state: unknown): string {
  return JSON.stringify({ state, version: 1 })
}
```

Then change every `urlHashStorage.setItem(stateKey, JSON.stringify(x))` to `urlHashStorage.setItem(stateKey, envelope(x))`, and every assertion that reads the round-tripped value through `JSON.parse(retrieved)` to read `JSON.parse(retrieved).state`. Change nothing else about what each test asserts.

The `legacyConfig` case (around line 600) is the one whose expectation genuinely inverts: it asserted a flat legacy link hydrates; it must now assert `getItem` returns `null`. Rename it to say so — a "legacy link" that never existed should not keep that name. If any other test's assertion has to change to pass, STOP and report.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `rtk npx vitest run tests/utils/urlStorage.spec.ts`
Expected: PASS, including the two tests from Step 1.

- [ ] **Step 7: Run the full suite**

Run: `rtk npm run typecheck && rtk npx vitest run`
Expected: PASS. `tests/store/urlStorage.spec.ts` and `tests/store/urlPersistenceOptions.spec.ts` also exercise this path — if either fails, check whether it builds flat fixtures too and migrate it the same way; if it fails for another reason, STOP and report.

- [ ] **Step 8: Update the docs, backlog and CHANGELOG, lint, and commit**

In `docs/ARCHITECTURE.md`'s URL-persistence section, state that the compressed hash decodes to zustand's `{ state, version }` envelope and nothing else is accepted, that unknown top-level keys are stripped, and that the schema's closed unions derive from the `as const` arrays in `src/types/`.

Delete the `### [B6](…)` and `### [B7](…)` entries from `docs/BACKLOG.md`.

Add to `CHANGELOG.md`'s `### Fixed` list under `## [Unreleased]`:

```markdown
- **A malformed shared link is reported instead of half-loaded.** `urlStorage.ts` claimed to
  support flat, non-enveloped payloads for backward compatibility; they have never hydrated,
  because zustand reads `deserializedStorageValue.state`. The branch and its comment are gone, and
  unknown top-level keys are now stripped rather than merged into the live store. (#64, #65)
```

```bash
rtk npm run lint:fix
rtk git add src/store/urlStorage.ts src/utils/schemas.ts tests/utils/urlStorage.spec.ts docs/ARCHITECTURE.md docs/BACKLOG.md CHANGELOG.md
rtk git commit -m "fix(url): accept only the persist envelope, strip unknown root keys

The flat-payload branch claimed backward compatibility for links that cannot
exist: createJSONStorage has wrapped state in { state, version } since the
initial commit, and zustand hydrates from .state. The branch survived only
because the tests fed it flat fixtures, so those move to the shape production
actually writes.

Root-level passthrough is gone too: nested schemas are already strict, and an
unknown key nobody reads still gets re-persisted into the URL.

Closes #64, #65"
```

---

## Verification

```bash
rtk npm run lint && rtk npm run typecheck && rtk npx vitest run
rtk npm run test:coverage    # 75% threshold on engines/, workers/, utils/ must hold
```

Manual check in `rtk npm run dev`:

1. Set the performance threshold to something other than 100%, click "Copy URL to Share", open the link in a fresh tab. The threshold must survive — it did not before.
2. Hand-edit the hash to a garbage string. Expect the "Invalid configuration link" toast and default settings, not a silently odd calculation.
3. Change several settings, then click "Reset to defaults". The performance threshold and both drive-picker filters must return to their defaults along with everything else.
