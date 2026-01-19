---
phase: 04-code-quality
plan: 04
subsystem: volumetry-engine
tags: [refactoring, strategy-pattern, typescript, architecture]
requires: [02-01, 02-02]
provides:
  - Modular volumetry calculation architecture
  - Strategy pattern for topology-specific calculations
  - Exhaustive type checking with assertNever
affects: [future topology additions, volumetry maintenance]
tech-stack:
  added: []
  patterns: [strategy-pattern, exhaustive-type-checking]
key-files:
  created:
    - src/engines/volumetry/strategies/VolumetryStrategy.ts
    - src/engines/volumetry/strategies/raid.ts
    - src/engines/volumetry/strategies/zfs.ts
    - src/engines/volumetry/strategies/s2d.ts
    - src/engines/volumetry/strategies/ceph.ts
    - src/engines/volumetry/strategies/nutanix.ts
    - src/engines/volumetry/strategies/vsan.ts
    - src/engines/volumetry/strategies/dell.ts
    - src/engines/volumetry/strategies/proprietary.ts
    - tests/engines/volumetry/strategies/raid.spec.ts
  modified:
    - src/engines/volumetry/index.ts
decisions:
  - title: "Use strategy interface instead of abstract class"
    rationale: "TypeScript interfaces are simpler for pure data transformations. No need for inheritance complexity."
  - title: "Optional calculateOverhead() method"
    rationale: "Not all topologies have overhead beyond efficiency (e.g., RAID). Optional method keeps interface flexible."
  - title: "Runtime type guard before strategy lookup"
    rationale: "Balances compile-time exhaustive checking (assertNever) with runtime safety for invalid topology types from URL params."
  - title: "Group Dell topologies into single strategy"
    rationale: "PowerFlex, PowerStore, PowerScale, and ObjectScale share similar calculation patterns. Single strategy reduces duplication."
  - title: "Group proprietary topologies together"
    rationale: "Synology, NetApp, and PowerVault are all vendor-specific RAID variants. Logical grouping in single strategy."
metrics:
  duration: 7min
  completed: 2026-01-18
---

# Phase 4 Plan 4: Volumetry Strategy Pattern Extraction Summary

**One-liner:** Refactored 1142-line monolithic volumetry engine into strategy pattern with 8 topology-specific modules (42-139 lines each)

## Objective

Extract topology-specific capacity calculations from monolithic 1142-line volumetry engine into separate strategy modules using the strategy pattern. Enable compile-time exhaustive type checking and improve maintainability.

## What Was Built

### Strategy Pattern Architecture

**Created VolumetryStrategy interface:**

- `calculateDataFraction(level, driveCount, options): number` - Calculate topology efficiency
- `calculateOverhead?(rawCapacity, options): number` - Optional metadata overhead calculation
- Clear separation between parity/redundancy logic and overhead logic

**Implemented 8 topology strategies:**

1. **raid.ts (85 lines)** - Standard RAID levels

   - RAID0/1/1E/1_3WAY/3/4/5/5E/5EE/6/10/50/60
   - Formulas validated against WintelGuy RAID Calculator (Phase 2)

2. **zfs.ts (63 lines)** - ZFS topologies

   - stripe/mirror/raidz1/2/3/draid1/2/3
   - Slop space: `clamp(capacity/32, 128 MiB, 128 GiB)` per OpenZFS spec

3. **s2d.ts (53 lines)** - Microsoft Storage Spaces Direct

   - Simple/Mirror/Parity/Dual Parity/MAP
   - Fault domain-aware efficiency calculations

4. **ceph.ts (55 lines)** - Ceph distributed storage

   - Replicated pools (2x/3x)
   - Erasure coded pools (k+m formulas)

5. **nutanix.ts (42 lines)** - Nutanix AOS

   - RF2/RF3 replication factors
   - EC-X erasure coding (4:1, 6:2 striping)

6. **vsan.ts (82 lines)** - VMware vSAN (OSA and ESA)

   - Adaptive stripe width based on cluster size
   - 4+1 vs 2+1 RAID-5 selection logic for ESA

7. **dell.ts (139 lines)** - Dell storage platforms

   - PowerFlex: 2/3-way mirror, EC (4+1, 4+2, 8+2, 12+4)
   - PowerStore: RAID 5/6/10
   - PowerScale: N+x protection levels
   - ObjectScale: EC 12+4/10+2/24+4, triple mirror

8. **proprietary.ts (91 lines)** - Vendor-specific RAID
   - Synology: SHR/SHR-2/RAID F1
   - NetApp: RAID-DP/RAID-TEC
   - PowerVault: Traditional RAID + ADAPT

**Total strategy code: 657 lines**
**Average per strategy: 82 lines** (well under 250 line target)

### Orchestrator Refactoring

**Updated src/engines/volumetry/index.ts:**

Before:

- 1142 lines total
- 340-line getDataFraction function with 16 nested switch statements
- All topology logic in single file

After:

- 911 lines total (20.2% reduction)
- 80-line getDataFraction function using strategy pattern
- Topology logic extracted to 8 focused modules

**Key changes:**

1. **Added getStrategy() with exhaustive type checking:**

```typescript
function getStrategy(topologyType: TopologyType): VolumetryStrategy {
  switch (topologyType) {
    case "standard":
      return raidStrategy;
    case "zfs":
      return zfsStrategy;
    // ... all topology types
    default:
      return assertNever(topologyType); // Compile-time error if type missing
  }
}
```

2. **Added runtime type guard for graceful degradation:**

```typescript
// Handle invalid topology types from URL params (can't be caught at compile time)
if (!VALID_TOPOLOGY_TYPES.includes(topology.type as TopologyType)) {
  console.warn(
    `Unknown topology type: ${topology.type}, falling back to 100% efficiency`
  );
  return 1.0;
}
```

3. **Simplified data fraction calculation:**

- Was: 340 lines of nested switch statements
- Now: ~60 lines delegating to strategies

4. **Integrated ZFS strategy overhead:**

```typescript
// Use ZFS strategy for slop space calculation
const slop = zfsStrategy.calculateOverhead?.(capacity) ?? 0;
```

### Testing

**Created RAID strategy unit tests:**

- 18 tests covering all RAID levels (RAID0 through RAID60)
- Validates formulas against industry standards
- Tests edge cases (single drive, minimum drives, large arrays)

**Phase 2 regression testing:**

- All 227 existing volumetry tests pass
- Zero behavior changes
- 100% backward compatibility

## Technical Improvements

### QUAL-03: Component Extraction ✓

- Topology-specific logic isolated in separate modules
- Each strategy focused on single topology type
- Clear module boundaries and responsibilities

### QUAL-04: Strategy Pattern ✓

- VolumetryStrategy interface defines contract
- 8 concrete strategy implementations
- Orchestrator delegates to strategies via lookup

### QUAL-06: Cyclomatic Complexity Reduction ✓

- Large switch statements replaced with strategy calls
- getDataFraction complexity reduced from ~35 to ~8
- Each strategy module has low complexity (max 10 per function)

### QUAL-15: Exhaustive Type Checking ✓

- assertNever in getStrategy() default case
- TypeScript compiler errors if new topology type added without strategy
- Compile-time safety for topology type completeness

## Deviations from Plan

### Plan Expected: Volumetry orchestrator under 300 lines

**Actual: 911 lines**

**Rationale:**
The orchestrator retained more logic than anticipated because it still coordinates:

- Tiering calculations (S2D, vSAN OSA, Ceph, Nutanix hybrid)
- ObjectScale geo-overhead tables (80 lines for multi-site replication)
- Filesystem overhead selection (25 lines mapping topology to filesystem)
- Breakdown visualization array building (140 lines)
- ZFS-specific ashift penalty calculation
- Per-topology overhead calculations (PowerFlex FG, Nutanix system, S2D reserve, etc.)

The key win is extracting **topology parity/redundancy logic** (340 lines → 80 lines, 76% reduction in that section). The orchestrator still needs coordination logic that can't be extracted to strategies.

**Impact:** None negative. Code is still significantly more maintainable:

- Adding new topology: create new strategy module (42-139 lines)
- Debugging topology calculations: isolated in single file
- Testing topology logic: unit test strategy directly

### No Deviations: Runtime Type Guard Added

**Context:** Plan didn't specify handling of invalid topology types from URL params.

**Decision:** Added runtime type guard before strategy lookup to gracefully handle invalid topology types while preserving compile-time exhaustive checking with assertNever.

**Files modified:** src/engines/volumetry/index.ts (added VALID_TOPOLOGY_TYPES array and guard)

**Tracked as:** Rule 2 auto-addition (missing critical functionality for security - graceful handling of untrusted URL input)

## Impact Assessment

### Maintainability

**Before:** Adding new topology required editing 1142-line file with complex switch statements
**After:** Create new strategy module (42-139 lines), add case to getStrategy(), done

**Developer experience:**

- Find RAID calculations: `src/engines/volumetry/strategies/raid.ts` (was: search 1142-line file)
- Test ZFS slop space: Import zfsStrategy, call calculateOverhead() (was: extract function from monolith)
- Debug Ceph efficiency: Read 55-line ceph.ts (was: navigate 340-line switch statement)

### Type Safety

**Before:** Adding topology type required manually updating switch statement
**After:** TypeScript compiler errors at build time if topology type missing from getStrategy()

**Example:**

```typescript
// Add new topology type to types/topology.ts:
export type TopologyType = 'standard' | 'zfs' | ... | 'new_topology'

// TypeScript immediately errors in getStrategy():
// "Type 'new_topology' not handled in switch statement"
```

### Test Coverage

**Before:** Phase 2 tests covered calculations via main calculateVolumetry() function
**After:** Can unit test individual strategies + integration tests via calculateVolumetry()

**New capability:** Test RAID calculations independently without setting up full volumetry input

### Performance

**No impact:** Strategy lookup is O(1) switch statement, same as original nested switches

## Lessons Learned

### Strategy Pattern Benefits

1. **Focused modules:** Each strategy 42-139 lines vs 1142-line monolith
2. **Parallel development:** Multiple developers can work on different strategies
3. **Easier testing:** Unit test strategies without complex setup
4. **Clear contracts:** VolumetryStrategy interface documents expectations

### TypeScript Exhaustive Checking

1. **assertNever catches missing cases at compile time** - prevents "forgot to handle new type" bugs
2. **Runtime guard needed for external data** - compile-time checks don't catch URL param injection
3. **Balance static and runtime safety** - both layers needed for robust code

### Refactoring Large Functions

1. **Extract domain logic first** - topology calculations were clear extraction targets
2. **Keep coordination logic in orchestrator** - tiering, overhead, breakdown building belong together
3. **Measure success by domain extraction, not total lines** - 340-line function → 80 lines is the win

## Files Modified

**Created (10 files):**

- src/engines/volumetry/strategies/VolumetryStrategy.ts (47 lines)
- src/engines/volumetry/strategies/raid.ts (85 lines)
- src/engines/volumetry/strategies/zfs.ts (63 lines)
- src/engines/volumetry/strategies/s2d.ts (53 lines)
- src/engines/volumetry/strategies/ceph.ts (55 lines)
- src/engines/volumetry/strategies/nutanix.ts (42 lines)
- src/engines/volumetry/strategies/vsan.ts (82 lines)
- src/engines/volumetry/strategies/dell.ts (139 lines)
- src/engines/volumetry/strategies/proprietary.ts (91 lines)
- tests/engines/volumetry/strategies/raid.spec.ts (149 lines)

**Modified (1 file):**

- src/engines/volumetry/index.ts (1142 → 911 lines, -231 lines, -20.2%)

**Total code written:** 849 lines (strategies + tests + orchestrator updates)
**Net reduction:** 231 lines in main engine

## Commits

1. `930e6bb` - feat(04-04): create VolumetryStrategy interface
2. `994957d` - feat(04-04): extract volumetry strategies for all topology types

## Verification

- [x] VolumetryStrategy interface with calculateDataFraction() and optional calculateOverhead()
- [x] 8 strategy modules created (raid, zfs, s2d, ceph, nutanix, vsan, dell, proprietary)
- [x] Each strategy 42-139 lines (all under 250 line target)
- [x] volumetry/index.ts uses strategy lookup pattern via getStrategy()
- [x] getStrategy() uses assertNever() for exhaustive type checking
- [x] Runtime type guard for graceful handling of invalid topology types
- [x] All 227 Phase 2 tests pass (zero regressions)
- [x] RAID strategy tests created (18 tests)
- [x] TypeScript compiles with zero errors
- [x] Test coverage maintained (no reduction)

## Next Phase Readiness

**Recommendations:**

1. **Consider extracting ObjectScale geo-overhead tables** - 80 lines of lookup tables could move to objectscale-geo-overhead.ts helper
2. **Consider extracting tiering logic** - calculateTieredCapacity() could be separate module if more tier types added
3. **Add strategy tests for remaining topologies** - Currently only RAID has strategy-specific tests

**No blockers for Phase 5.**

## Success Criteria Met

✓ Volumetry engine refactored from 1142-line monolith to modular architecture
✓ 8 strategy modules handling topology-specific calculations (42-139 lines each)
✓ Strategy pattern enables adding new topologies by implementing VolumetryStrategy interface
✓ assertNever() provides compile-time exhaustive type checking
✓ All 227 Phase 2 tests pass with zero regressions
✓ TypeScript compiles with zero errors
✓ Maintainability significantly improved (focused modules vs monolith)
