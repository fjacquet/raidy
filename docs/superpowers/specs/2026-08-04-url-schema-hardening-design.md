# URL schema hardening: closed enums, one persisted-key list, no dead paths — Design

**Date**: 2026-08-04
**Status**: Approved
**Scope**: `src/utils/schemas.ts`, `src/store/configStore.ts`, `src/store/urlStorage.ts`, plus the
const-array sources in `src/types/`. Closes #62, #63, #64, #65.

## Problem

"Copy URL to Share" is the app's only persistence mechanism. Four defects in it share one shape —
a list of fields written out by hand in more than one place, drifting silently:

- **#62** — Seven fields are `z.string()` in `ConfigStateSchema`: `blockSize`, `networkSpeed`,
  `pcieGen`, `pcieLanes`, `carbonRegion`, `fsType`, `controllerOptions.controller`. An arbitrary
  string from a crafted link reaches the store, hits a lookup table, misses, and falls back — a
  silently wrong calculation rather than a rejected link.
- **#63** — `performanceThreshold` is missing from `partialize`, so it resets on every shared
  link while every other setting survives.
- **#64** — `urlStorage.ts`'s comment claims flat (non-enveloped) payloads load for backward
  compatibility. They never have: zustand's `hydrate()` reads `deserializedStorageValue.state`,
  which is `undefined` for a flat object.
- **#65** — `ConfigStateSchema` is `.passthrough()` at the root, so an unknown top-level key from
  a link merges into the live store. Nested platform schemas are strict, so the root is the only
  place this happens.

### What exploration turned up beyond the issues

`getDefaultState()` (`configStore.ts:77`) is a **fourth** hand-written list, and it omits
`performanceThreshold`, `driveConnectivity` and `driveFormFactor` — all three live only in their
slices' initial state. `resetToDefaults()` is `set(getDefaultState())`, and zustand's `set`
merges, so **"Reset to defaults" does not currently reset any of those three fields.** Unreported,
same root cause as #63, and the parity test below catches it.

So the drift is across four lists, not two:

| List | Location | Missing today |
|---|---|---|
| Slice initial states | `src/store/slices/*.ts` | — (this is the truth) |
| `getDefaultState()` | `configStore.ts:77` | `performanceThreshold`, `driveConnectivity`, `driveFormFactor` |
| `partialize` | `configStore.ts:156` | `performanceThreshold` |
| `ConfigStateSchema` | `schemas.ts:376` | `performanceThreshold` |

## Decision 1 — Enums derive from a single source (#62)

Each free-text union's values move into an exported `as const` array in the module that already
owns the type. The TypeScript type derives from the array; `schemas.ts` builds its `z.enum(...)`
from the same array.

```ts
// src/types/config.ts
export const BLOCK_SIZES = ['4K', '8K', '16K', '64K', '128K', '256K', '1M'] as const
export type BlockSize = (typeof BLOCK_SIZES)[number]
```

```ts
// src/utils/schemas.ts
blockSize: z.enum(BLOCK_SIZES).optional(),
```

Seven fields, in the module that owns each type:

| Field | Type | Home |
|---|---|---|
| `blockSize` | `BlockSize` | `src/types/config.ts` |
| `networkSpeed` | `NetworkSpeed` | `src/types/config.ts` |
| `pcieGen` | `PCIeGen` | `src/types/config.ts` |
| `pcieLanes` | `PCIeLanes` | `src/types/config.ts` |
| `carbonRegion` | `CarbonRegion` | `src/types/config.ts` |
| `fsType` | `FilesystemState['fsType']` | `src/types/config.ts` |
| `controllerOptions.controller` | `ControllerType` | `src/types/topology.ts` |

`ControllerType` is `HbaType | RaidControllerType`, so it gets two const arrays and a derived
union of both: `export const CONTROLLER_TYPES = [...HBA_TYPES, ...RAID_CONTROLLER_TYPES] as const`.

**Why this cannot drift:** the lookup tables stay `Record<Type, …>` (`BLOCK_SIZE_BYTES`,
`CARBON_INTENSITY`, `CONTROLLER_LIMITS`, …). Adding a value to a const array widens the type,
which makes every `Record<Type, …>` non-exhaustive and breaks the build until the table follows.
The enum and the table are held together by the compiler, not by a convention someone has to
remember.

`driveId` stays `z.string().min(1)`. It is a drive-database key, not a closed union — enumerating
72 ids in the schema would couple it to `drives.json`, and an unknown id already degrades cleanly
to "No drive selected". Out of scope, deliberately.

## Decision 2 — One persisted-key list (#63, plus the `resetToDefaults` bug)

Two explicit lists that must **partition** the store's configuration state:

```ts
// src/store/persistedKeys.ts
/** Every configuration field that belongs in a shared link. */
export const PERSISTED_KEYS = ['driveId', 'driveCount', /* … */, 'performanceThreshold'] as const

/**
 * Configuration state deliberately left out of shared links, with the reason.
 * Drive filters narrow the picker in the current session; they are not part of
 * the configuration a link describes.
 */
export const EPHEMERAL_KEYS = ['driveConnectivity', 'driveFormFactor'] as const
```

`PERSISTED_KEYS` is the forty keys `partialize` lists today plus `performanceThreshold`, in the
same order.

`partialize` derives from `PERSISTED_KEYS` through a typed pick, replacing forty hand-written
`key: state.key` lines. `omitDefaults(…, DEFAULT_STATE_BASELINE)` is unchanged.

`getDefaultState()` stops being a fourth list: it is assembled from the slices' initial states
rather than restating them. That closes the `resetToDefaults` gap as a side effect of removing the
duplication, not as a separate patch.

**The parity test** asserts two equalities:

1. `PERSISTED_KEYS ∪ EPHEMERAL_KEYS` equals exactly the configuration keys of a fresh store —
   `Object.entries(useConfigStore.getState())` filtered to entries whose value is not a function,
   which is what separates settings from actions — and the two lists are disjoint.
2. `PERSISTED_KEYS` equals exactly `Object.keys(ConfigStateSchema.shape)`.

A newly added setting then fails the test until someone decides which list it belongs in. That is
the point: #63 happened because nothing forced the decision.

**Accepted consequence:** `resetToDefaults()` will now also reset `performanceThreshold`,
`driveConnectivity` and `driveFormFactor`. That is what the button claims to do, but it is a
visible behaviour change and belongs in the CHANGELOG.

## Decision 3 — Delete the dead legacy branch (#64)

`configStore.ts` has used `createJSONStorage` since the initial commit (`86f83b8`), and
`createJSONStorage` always wraps state in `{ state, version }`. No released version has ever
written a flat payload, so no flat link can exist in the wild. Wiring the branch would build a
path for links that cannot exist; it is deleted, along with the comment asserting a capability the
code lacks. `getItem` treats a non-enveloped payload like any corrupt link: toast, and defaults.

**The real cost is in the tests, and it is the right cost.** `tests/utils/urlStorage.spec.ts`
builds its fixtures flat — `setItem(key, JSON.stringify(config))` across roughly fifteen call
sites, including an explicit `legacyConfig` case. They pass today only because of the branch
production never takes: a test net validating a path that does not exist, the same defect #75
reports elsewhere. They migrate to the enveloped shape zustand actually produces, and the
`legacyConfig` case inverts — a flat link must now be rejected.

## Decision 4 — Strip unknown root keys (#65)

`.passthrough()` is removed; Zod's default strip applies. Nested platform schemas are already
strict, and accepting at the root what is refused one level down has no justification. The
forward-compatibility argument does not survive examination either: an unknown key merged into the
live store is read by nobody, but it *is* re-persisted, so it grows the URL indefinitely. A
comment at the call site records why the behaviour is strip.

## Testing

- **Enum round-trip, per field:** a valid value survives a URL round-trip; a forged value causes
  `validateUrlState` to reject the whole link rather than silently defaulting the field. Assert
  the rejection, not just the absence of the bad value.
- **Parity test** (Decision 2) — the test that would have caught #63 and the `resetToDefaults`
  gap.
- **`resetToDefaults()`** restores `performanceThreshold`, `driveConnectivity` and
  `driveFormFactor` from non-default values.
- **`performanceThreshold` round-trip** through a shared URL — the literal #63 regression.
- **Flat payload rejected**; enveloped payload carrying an unknown root key hydrates without that
  key.
- Existing tests in `tests/utils/urlStorage.spec.ts` migrate to enveloped fixtures. No assertion
  changes except the `legacyConfig` case, whose expectation genuinely inverts.

## Documentation

- `docs/ARCHITECTURE.md`'s URL-persistence section: the envelope is the only accepted shape,
  unknown root keys are stripped, and enums derive from the const arrays.
- `CHANGELOG.md`: a `### Fixed` entry for the four issues, and a `### Changed` entry for the
  `resetToDefaults` behaviour change.
- `docs/BACKLOG.md`: B4, B5, B6 and B7 are deleted, per the file's "How to close an item"
  convention.

## Out of scope

- `driveId` validation against `drives.json` (Decision 1).
- #61 (fraction-vs-percent audit on snapshot-reserve fields) — a units question in the platform
  option schemas, unrelated to how a link is parsed.
- Chantiers B (i18n: #72, #71) and D (controller/UI: #75, #74), each getting its own spec.
