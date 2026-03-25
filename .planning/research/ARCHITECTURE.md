# Architecture Patterns: Dell Formula Fix Integration

**Domain:** Dell storage calculation formula corrections in existing TypeScript SPA
**Researched:** 2026-03-25
**Milestone:** v1.2 Dell Calculation Accuracy

---

## Recommended Architecture

No new components. All changes are surgical edits within the existing strategy pattern.
The three affected files are:

| File | Change type |
|------|-------------|
| `src/engines/volumetry/strategies/proprietary.ts` | Modify `powervault_adapt` case |
| `src/engines/volumetry/strategies/dell.ts` | Modify `powerstore_raid5` and `powerstore_raid6` cases |
| `src/engines/volumetry/overhead/overheadCalculator.ts` | Add PowerStore system overhead block |
| `tests/engines/volumetry.spec.ts` | Update ADAPT assertions; add Dell Sizer reference vectors |
| `tests/fixtures/dell-vectors.ts` | New fixture file for Dell Sizer reference data |

---

## Component Boundaries (as-is)

```
calculateVolumetry() [src/engines/volumetry/index.ts]
  │
  ├─ getDataFraction() [helpers/calculationHelpers.ts]
  │    └─ getStrategy(topology.type) → strategy.calculateDataFraction(level, driveCount, options)
  │         ├─ proprietaryStrategy  ← powervault_adapt lives here
  │         └─ dellStrategy         ← powerstore_* and powerscale_* live here
  │
  └─ calculateOverheads() [overhead/overheadCalculator.ts]
       └─ powerstore system overhead block ← does NOT exist yet
```

The `VolumetryStrategy` interface has two methods:

```typescript
calculateDataFraction(level, driveCount, options?): number   // parity/EC efficiency 0–1
calculateOverhead?(rawCapacity, options?): number            // bytes to subtract
```

---

## Integration Decisions Per Formula Fix

### DELL-01 / DELL-02: PowerVault ADAPT

**Current code** (`proprietary.ts` line 73–75):
```typescript
case 'powervault_adapt':
  return usableDrives >= 24 ? 0.87 : 0.85
```

**Correct formula** per Dell ME5 technical specification:
```
dataFraction = (N - 2 * protectionLevel) / N
```
where `protectionLevel = 2` for ADAPT (dual distributed parity), `N = usableDrives`.

For 12 drives: `(12 - 4) / 12 = 0.667` (66.7%), not 85%.
For 24 drives: `(24 - 4) / 24 = 0.833` (83.3%), not 87%.

**Where the fix goes:** `calculateDataFraction()` in `proprietary.ts`. This is the right location because ADAPT efficiency IS the parity fraction — there is no separate overhead component. The constant `protectionLevel = 2` should be a named constant inside the case block, not an interface option, because ADAPT always uses dual protection.

**No new method needed.** The existing `calculateDataFraction(level, driveCount)` signature handles it — `driveCount` is already the parameter that drives the formula. The `usableDrives` variable at the top of the function already equals `driveCount`.

**No `calculateOverhead()` addition needed** for ADAPT. ADAPT does not have a separate system overhead pool distinct from parity. Dell Sizer accounts for ADAPT efficiency purely through the data fraction.

---

### DELL-03 / DELL-04 / DELL-05: PowerStore RAID-5 and RAID-6

PowerStore's internal RAID is drive-count-aware. Dell Sizer selects stripe width based on how many drives are installed:

| Drive count | RAID-5 stripe | Efficiency | RAID-6 stripe | Efficiency |
|-------------|---------------|------------|---------------|------------|
| 3–5 | 4+1 | 4/5 = 80.0% | n/a | — |
| 6–9 | 4+1 | 4/5 = 80.0% | 4+2 | 4/6 = 66.7% |
| 10–20 | 8+1 | 8/9 = 88.9% | 8+2 | 8/10 = 80.0% |
| 21+ | 12+1 | 12/13 = 92.3% | n/a (unsupported at scale) | — |

The stripe-width selection logic belongs in `calculateDataFraction()`. Rationale: it is purely an efficiency fraction, not an overhead in bytes. The method signature already receives `driveCount`, which is the only input needed to select the stripe width.

**Where system overhead goes:** PowerStore imposes a non-configurable system reservation (~2 TB per appliance or ~3–5% of raw capacity for internal OS, metadata, and rebuild journals). This is NOT a parity fraction — it is a fixed bytes-off-the-top deduction. It belongs in `calculateOverheads()` in `overheadCalculator.ts`, as a new block parallel to the existing `powerstoreSnapshotReserve` block. It must also be plumbed through `OverheadResult`, `buildBreakdown()`, and the result return from `calculateVolumetry()`.

**No new method on `VolumetryStrategy`** is needed. The overhead calculator already calls topology-specific logic inline rather than through the strategy interface. Consistency with existing patterns means the PowerStore system overhead stays in `overheadCalculator.ts` rather than in `calculateOverhead?()` on the strategy. (The `calculateOverhead?()` on the strategy is used only by `zfsStrategy` for slop space; all other per-topology overheads live in `overheadCalculator.ts`.)

**Options type addition:** `PowerStoreOptions` currently has no field for system overhead control. Two options:

1. Add `systemOverheadPercent: number` to `PowerStoreOptions` with default 3% (matches ObjectScale's existing pattern). This gives users visibility and test control.
2. Hard-code it in `overheadCalculator.ts` as a constant.

Recommendation: add the field to `PowerStoreOptions` and `DEFAULT_POWERSTORE_OPTIONS`. This mirrors `ObjectScaleOptions.systemOverheadPercent` and makes the value testable without magic numbers. It does not break the URL hash schema because URL storage only serializes slice state, and adding a field with a default to the store follows the existing migration-safe pattern (new fields with defaults are backward-compatible).

---

### DELL-06: PowerScale N+x Formulas

Current code is `(usableDrives - x) / usableDrives`, which is mathematically correct for the N+x model. Validation against Dell documentation is needed but no formula change is anticipated. If Dell Sizer output diverges, the most likely cause is per-node vs per-drive counting — PowerScale applies protection at the node level. If `driveCount` in the store represents total drives across all nodes and `serverCount` is available through `VolumetryInput`, then the fix would require passing `serverCount` through `getDataFraction()` to `dellStrategy`. Currently `getDataFraction()` passes `serverCount` only for `vsan_esa`, `vsan_osa`, and `standard` topologies (see `calculationHelpers.ts` lines 133–142). For PowerScale, the `options` object passed is `{}`.

**Architecture implication:** If PowerScale validation shows per-node accounting is needed, add a `case 'powerscale':` branch in the `getDataFraction()` switch to pass `{ serverCount }` as options, then read it in `dellStrategy.calculateDataFraction()`. This is a two-line change in `calculationHelpers.ts` plus one-line change in `dell.ts` — no interface change required since `options` is `unknown`.

---

### DELL-07: PowerFlex EC Formulas

Current formulas (`powerflex_ec_4_1` etc.) use direct data/total ratios which are correct for pure EC math. The main uncertainty is whether PowerFlex FG metadata overhead (12–15%) already captures the real-world overhead, or whether the base EC fraction itself needs adjustment. Validation is needed; no architecture change anticipated.

---

### DELL-08: ObjectScale EC and Geo-Replication

Current code uses direct k/(k+m) ratios for EC and has a separate `getObjectScaleGeoOverhead()` helper for geo-replication. This is architecturally sound. Validation needed; no architecture change anticipated unless Dell documentation shows the base EC fraction differs from the mathematical k/(k+m).

---

## Data Flow for ADAPT Fix

```
Input: driveCount=12, topology={ type: 'powervault', level: 'powervault_adapt' }
       hotSpares=0
       usableDrives = 12 - 0 = 12

calculateVolumetry()
  └─ getDataFraction(topology, usableDrives=12, ...)
       └─ getStrategy('powervault') → proprietaryStrategy
       └─ proprietaryStrategy.calculateDataFraction('powervault_adapt', 12)
            BEFORE: return usableDrives >= 24 ? 0.87 : 0.85  → 0.85
            AFTER:  const P = 2  // ADAPT dual protection
                    return (usableDrives - 2 * P) / usableDrives  → 0.667
```

---

## Data Flow for PowerStore System Overhead Fix

```
Input: driveCount=10, topology={ type: 'powerstore', level: 'powerstore_raid5' }

calculateVolumetry()
  ├─ getDataFraction() → dellStrategy.calculateDataFraction('powerstore_raid5', 10)
  │    BEFORE: return 0.80
  │    AFTER:  driveCount 10 falls in 6–9 range? No, 10+ → 8+1 → return 8/9 ≈ 0.889
  │
  └─ calculateOverheads({ topology, powerstoreOptions, capacityAfterParity, ... })
       EXISTING: powerstoreSnapshotReserve = capacityAfterParity * (snapshotReservePercent/100)
       NEW:      powerstoreSystemOverhead  = capacityAfterParity * (powerstoreOptions.systemOverheadPercent/100)
```

The `powerstoreSystemOverhead` must also appear in:
- `OverheadResult` interface (new field)
- The subtraction chain in `calculateVolumetry()` (lines 197–207 of index.ts)
- `buildBreakdown()` to render in the Sankey waterfall
- The `return` statement at the end of `calculateVolumetry()`

---

## Patterns to Follow

### Pattern: Existing overhead block style
Every per-topology overhead in `overheadCalculator.ts` follows this exact structure:

```typescript
// PowerStore system overhead (3-5% internal OS/metadata/rebuild journals)
let powerstoreSystemOverhead = 0
if (topology.type === 'powerstore') {
  powerstoreSystemOverhead =
    capacityAfterParity * (powerstoreOptions.systemOverheadPercent / 100)
}
```

The new block must match this style exactly — same comment format, same guard pattern, same variable naming convention.

### Pattern: Named constants for magic numbers
ADAPT protection level should be a `const` inside the case block, not a numeric literal:
```typescript
case 'powervault_adapt': {
  const ADAPT_PROTECTION_DRIVES = 2  // ADAPT always uses dual distributed parity
  return (usableDrives - 2 * ADAPT_PROTECTION_DRIVES) / usableDrives
}
```

### Anti-Pattern: Hardcoded efficiency constants
The current `0.85`/`0.87` pattern for ADAPT and `0.80`/`0.75` for PowerStore are anti-patterns that hide the actual formula. Replace them with derived expressions that make the underlying formula legible.

---

## Build Order for Formula Fixes

Build in this order to minimize test regressions cascading across steps:

**Step 1: ADAPT formula fix (isolated, no new plumbing)**
- Edit `proprietary.ts` `powervault_adapt` case
- Update the 4 existing ADAPT test assertions in `volumetry.spec.ts` (lines 3728–3756) — the new expected values will be significantly lower (~67% vs 85%)
- Add Dell Sizer reference vectors in new `tests/fixtures/dell-vectors.ts`
- Run `npm test` — only ADAPT tests should change

**Step 2: PowerStore data fraction fix (isolated to `dell.ts`)**
- Edit `dell.ts` `powerstore_raid5` and `powerstore_raid6` cases to use drive-count-aware stripe selection
- Update existing PowerStore snapshot reserve tests (lines 3147–3172 of `volumetry.spec.ts`) — the base efficiency changes so snapshot-reserve assertions that use relative comparisons need revision
- Run `npm test` — only PowerStore tests should change

**Step 3: PowerStore system overhead (requires type + overhead + breakdown changes)**
- Add `systemOverheadPercent` to `PowerStoreOptions` interface and `DEFAULT_POWERSTORE_OPTIONS`
- Add overhead block in `overheadCalculator.ts`
- Add `powerstoreSystemOverhead` field to `OverheadResult` interface
- Thread it through `calculateVolumetry()` subtraction chain and breakdown builder
- Add new assertions to PowerStore tests
- Run `npm test` — broader surface, verify breakdown tests pass

**Step 4: PowerScale, PowerFlex, ObjectScale validation**
- Compare calculated output against Dell documentation reference values
- Fix only if divergence found; each fix is isolated to `dell.ts` cases
- Add reference vectors to `dell-vectors.ts`

**Step 5: Regression sweep**
- Run `npm run test:coverage` — verify 75% threshold not broken
- Run `npm run typecheck` — PowerStoreOptions interface change must typecheck cleanly
- Run `npm run lint` — no unused variables from new fields

---

## Test Regression Map

| What changes | Tests that will break | Why |
|---|---|---|
| ADAPT formula (0.85/0.87 → dynamic) | `volumetry.spec.ts` lines 3728–3756 (4 tests) | Expected efficiency values will drop from ~83–87% to ~60–68% |
| PowerStore RAID-5 fraction (0.80 → drive-count-aware) | `volumetry.spec.ts` PowerStore snapshot tests (lines 3147–3172) | Base efficiency changes, affecting relative efficiency assertions |
| PowerStore system overhead added | Same PowerStore snapshot tests | Additional overhead reduces total efficiency further |
| PowerStore Options type change | `tests/store/urlStorage.spec.ts` if it tests default store shape | New field with default — likely backward-compatible but verify |

Tests that will NOT break from these changes: RAID, ZFS, vSAN, S2D, Ceph, Nutanix, Synology, NetApp, PowerFlex, PowerScale, ObjectScale, performance, resilience.

---

## Scalability Considerations

None of these changes affect bundle size or runtime performance. All Dell strategy methods are pure synchronous functions called once per UI interaction. The overhead calculator runs in the main thread but completes in microseconds.

---

## Sources

- Code analysis: `src/engines/volumetry/strategies/dell.ts` (direct inspection)
- Code analysis: `src/engines/volumetry/strategies/proprietary.ts` (direct inspection)
- Code analysis: `src/engines/volumetry/strategies/VolumetryStrategy.ts` (direct inspection)
- Code analysis: `src/engines/volumetry/helpers/calculationHelpers.ts` (direct inspection)
- Code analysis: `src/engines/volumetry/overhead/overheadCalculator.ts` (direct inspection)
- Code analysis: `src/types/topology.ts` — PowerStoreOptions, PowerVaultOptions interface definitions
- Code analysis: `tests/engines/volumetry.spec.ts` — existing ADAPT and PowerStore test assertions
- Project context: `.planning/PROJECT.md` — DELL-01 through DELL-10 requirements and Dell Sizer reference mandate
- Formula reference: Dell ME5 ADAPT uses dual distributed parity = 2 parity drives regardless of N (HIGH confidence — standard ADAPT documentation)
- Formula reference: PowerStore stripe width selection is drive-count-dependent (MEDIUM confidence — requires validation against actual Dell Sizer output per DELL-03/DELL-04 requirements)
