# Phase 4: Code Quality - Research

**Researched:** 2026-01-18
**Domain:** TypeScript/React code quality, refactoring patterns, type safety
**Confidence:** HIGH

## Summary

Phase 4 addresses code maintainability by refactoring two monolithic areas: the 1647-line TopologyPanel component and the 1141-line volumetry calculation engine with 16 switch statements. The standard approach combines React component composition patterns (compound components) with the Strategy pattern for TypeScript calculation engines. TypeScript exhaustive type checking with discriminated unions ensures compile-time safety when adding new topology types.

Current state is surprisingly good: TypeScript strict mode already enabled with zero violations, Biome lint has only 8 minor errors, and Phase 2 established 75%+ test coverage providing safety net for refactoring. The main work involves splitting components and extracting calculation logic while maintaining existing test coverage.

**Primary recommendation:** Use incremental refactoring with extract method pattern, refactoring one topology type at a time while running tests after each extraction. Start with component splitting (lower risk, visual verification) before tackling calculation engine refactoring (higher complexity, requires test validation).

## Standard Stack

The established libraries/tools for code quality and refactoring:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Biome | 2.3.11 | Fast linter/formatter | 10-25x faster than ESLint, single tool, already configured |
| TypeScript | 5.9.3 | Type safety & refactoring | Strict mode enabled, safe refactoring with type checking |
| Vitest | 4.0.16 | Test coverage during refactoring | Already configured with 75%+ coverage from Phase 2 |
| fast-check | 4.5.3 | Property-based testing | Validates refactored calculations across wide input ranges |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| depcheck | latest | Find unused dependencies | Audit phase - verify html2canvas actually needed |
| @vitest/coverage-v8 | 4.0.16 | Track coverage during refactoring | Ensure refactoring maintains coverage thresholds |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Biome | ESLint + Prettier | ESLint has more rules but requires 127+ packages vs Biome's single binary |
| Extract method | AI refactoring tools | Manual extraction provides better understanding and control |

**Installation:**
```bash
# Already installed - no new dependencies needed
npm install --save-dev @biomejs/biome  # Already present
npm install -g depcheck  # Optional global install for dependency audit
```

## Architecture Patterns

### Recommended Project Structure (Post-Refactoring)
```
src/
├── components/
│   └── inputs/
│       ├── TopologyPanel.tsx           # Main container (200-300 lines)
│       └── topology-options/           # NEW: Extracted per-topology panels
│           ├── ZfsOptionsPanel.tsx     # ZFS-specific options (100-150 lines)
│           ├── VsanOptionsPanel.tsx    # vSAN-specific options (100-150 lines)
│           ├── CephOptionsPanel.tsx    # Ceph-specific options (80-120 lines)
│           ├── S2dOptionsPanel.tsx     # S2D-specific options (80-120 lines)
│           └── shared/                 # Shared form control wrappers
│               ├── TopologyFormGroup.tsx
│               └── TopologySlider.tsx
├── engines/
│   └── volumetry/
│       ├── index.ts                    # Orchestrator (200-300 lines)
│       ├── strategies/                 # NEW: Strategy pattern implementation
│       │   ├── VolumetryStrategy.ts    # Base interface
│       │   ├── raid.ts                 # Standard RAID calculations
│       │   ├── zfs.ts                  # ZFS calculations
│       │   ├── vsan.ts                 # VMware vSAN calculations
│       │   ├── s2d.ts                  # Microsoft S2D calculations
│       │   ├── ceph.ts                 # Ceph calculations
│       │   ├── nutanix.ts              # Nutanix calculations
│       │   └── dell.ts                 # PowerFlex/Store/Scale calculations
│       └── utils/                      # Shared calculation utilities
│           ├── tiering.ts
│           └── overhead.ts
└── engines/
    └── performance/
        ├── index.ts                    # Orchestrator
        └── strategies/                 # NEW: Performance strategy pattern
            ├── PerformanceStrategy.ts
            ├── raid.ts
            └── [per-topology modules]
```

### Pattern 1: React Compound Component Pattern (TopologyPanel Split)
**What:** Split large component into cooperating sub-components that share context
**When to use:** Component exceeds 300 lines or handles multiple distinct concerns
**Example:**
```typescript
// Source: https://frontendmastery.com/posts/advanced-react-component-composition-guide/
// Main TopologyPanel.tsx (200-300 lines)
interface TopologyPanelProps {
  topology: Topology
  onChange: (topology: Topology) => void
}

export function TopologyPanel({ topology, onChange }: TopologyPanelProps) {
  return (
    <div className="topology-panel">
      <TopologyTypeSelector topology={topology} onChange={onChange} />

      {/* Switch based on topology type - each panel is 100-150 lines */}
      {topology.type === 'zfs' && <ZfsOptionsPanel topology={topology} onChange={onChange} />}
      {topology.type === 'vsan_esa' && <VsanOptionsPanel topology={topology} onChange={onChange} />}
      {topology.type === 'ceph' && <CephOptionsPanel topology={topology} onChange={onChange} />}
      {/* ... other topology types */}
    </div>
  )
}

// ZfsOptionsPanel.tsx (100-150 lines) - extracted from TopologyPanel
interface ZfsOptionsPanelProps {
  topology: Topology & { type: 'zfs' }
  onChange: (topology: Topology) => void
}

export function ZfsOptionsPanel({ topology, onChange }: ZfsOptionsPanelProps) {
  const { t } = useTranslation('topology')

  return (
    <div className="zfs-options">
      <Label>{t('zfs.ashift')}</Label>
      <Slider
        value={topology.zfsOptions?.ashift ?? 12}
        onChange={(ashift) => onChange({
          ...topology,
          zfsOptions: { ...topology.zfsOptions, ashift }
        })}
        min={9}
        max={16}
      />
      {/* More ZFS-specific controls */}
    </div>
  )
}
```

### Pattern 2: TypeScript Strategy Pattern (Calculation Engines)
**What:** Encapsulate topology-specific calculation algorithms in separate modules
**When to use:** Large switch statements (10+ cases) or cyclomatic complexity > 10
**Example:**
```typescript
// Source: https://refactoring.guru/design-patterns/strategy/typescript/example
// volumetry/strategies/VolumetryStrategy.ts
export interface VolumetryStrategy {
  calculateDataFraction(
    level: string,
    driveCount: number,
    options: TopologyOptions
  ): number

  calculateOverhead?(
    rawCapacity: number,
    options: TopologyOptions
  ): number
}

// volumetry/strategies/raid.ts
export class RaidVolumetryStrategy implements VolumetryStrategy {
  calculateDataFraction(level: string, driveCount: number): number {
    const usableDrives = driveCount

    switch (level) {
      case 'RAID0': return 1.0
      case 'RAID1': return 0.5
      case 'RAID5': return (usableDrives - 1) / usableDrives
      case 'RAID6': return (usableDrives - 2) / usableDrives
      case 'RAID10': return 0.5
      default: return 1.0
    }
  }
}

// volumetry/strategies/zfs.ts
export class ZfsVolumetryStrategy implements VolumetryStrategy {
  calculateDataFraction(level: string, driveCount: number): number {
    const usableDrives = driveCount

    switch (level) {
      case 'stripe': return 1.0
      case 'mirror': return 0.5
      case 'raidz1':
      case 'draid1': return (usableDrives - 1) / usableDrives
      case 'raidz2':
      case 'draid2': return (usableDrives - 2) / usableDrives
      case 'raidz3':
      case 'draid3': return (usableDrives - 3) / usableDrives
      default: return 1.0
    }
  }

  calculateOverhead(rawCapacity: number, options: ZfsOptions): number {
    // ZFS slop space: clamp(capacity/32, 128 MiB, 128 GiB)
    const slopSpace = Math.min(
      Math.max(rawCapacity / 32, 128 * 1024 * 1024),
      128 * 1024 * 1024 * 1024
    )
    return slopSpace
  }
}

// volumetry/index.ts - orchestrator (refactored from 1141 → 200-300 lines)
import { RaidVolumetryStrategy } from './strategies/raid'
import { ZfsVolumetryStrategy } from './strategies/zfs'
// ... other strategies

const strategies: Record<TopologyType, VolumetryStrategy> = {
  standard: new RaidVolumetryStrategy(),
  zfs: new ZfsVolumetryStrategy(),
  // ... other topologies
}

function getDataFraction(topology: Topology, driveCount: number, options: any): number {
  const strategy = strategies[topology.type]
  return strategy.calculateDataFraction(topology.level, driveCount, options)
}
```

### Pattern 3: TypeScript Exhaustive Type Checking
**What:** Use discriminated unions and never type to ensure all topology cases are handled
**When to use:** Switch statements on union types that may evolve over time
**Example:**
```typescript
// Source: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
// types/topology.ts - discriminated union with literal type property
type StandardTopology = {
  type: 'standard'
  level: 'RAID0' | 'RAID1' | 'RAID5' | 'RAID6' | 'RAID10'
}

type ZfsTopology = {
  type: 'zfs'
  level: 'stripe' | 'mirror' | 'raidz1' | 'raidz2' | 'raidz3'
}

type CephTopology = {
  type: 'ceph'
  level: 'replicated_2x' | 'replicated_3x' | 'ec_4_2' | 'ec_8_3'
}

type Topology = StandardTopology | ZfsTopology | CephTopology

// Exhaustive checking helper
function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${x}`)
}

// Usage in calculation engine
function getDataFraction(topology: Topology, driveCount: number): number {
  switch (topology.type) {
    case 'standard':
      return calculateRaidDataFraction(topology.level, driveCount)
    case 'zfs':
      return calculateZfsDataFraction(topology.level, driveCount)
    case 'ceph':
      return calculateCephDataFraction(topology.level, driveCount)
    default:
      // TypeScript error if new topology type added without case
      return assertNever(topology)
  }
}

// If you add a new topology type to the union:
// type Topology = StandardTopology | ZfsTopology | CephTopology | VsanTopology
// TypeScript will error at the switch default case until you add:
// case 'vsan_esa': return calculateVsanDataFraction(...)
```

### Anti-Patterns to Avoid
- **God Components**: Don't keep adding to TopologyPanel, extract per-topology concerns
- **Massive Switch Statements**: Don't nest switches or add more cases, extract to strategy pattern
- **Type Assertions in Switches**: Don't use `as any` to bypass type errors, fix the discriminated union
- **Shared State in Strategies**: Keep strategy classes stateless, pass all data as parameters
- **Breaking Tests During Refactoring**: Run tests after each small extraction, not after full refactor

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding unused dependencies | Manual package.json review | depcheck npm package | Analyzes import statements across all files, catches transitive deps |
| Measuring cyclomatic complexity | Manual code review | Biome built-in complexity rules | Automated enforcement, CI integration, consistent standards |
| Refactoring TypeScript | Manual cut-paste-test cycles | VS Code Extract Method refactoring | Type-safe, updates all references, preserves behavior |
| Component composition context | Manual prop drilling | React Context API | Built-in, optimized, familiar pattern for shared state |
| Type exhaustiveness checking | Runtime validation | TypeScript never type | Compile-time safety, zero runtime cost, catches missing cases |

**Key insight:** Modern TypeScript/React tooling provides refactoring automation that's safer and faster than manual changes. VS Code's "Extract to function" and "Extract to constant" refactorings update all references and preserve types, eliminating entire classes of refactoring bugs.

## Common Pitfalls

### Pitfall 1: Breaking Tests During Large Refactorings
**What goes wrong:** Refactor entire component/engine in one session, discover tests fail, can't identify which change broke what
**Why it happens:** Attempting to refactor too much at once without incremental validation
**How to avoid:**
- Extract one topology at a time (start with simplest: RAID0/stripe)
- Run full test suite after each extraction: `npm test`
- Commit after each successful extraction with passing tests
- If tests fail, undo last change and try smaller extraction
**Warning signs:**
- Multiple hours of refactoring without running tests
- "I'll fix the tests after I finish refactoring" thinking
- Test failures with no clear cause
**Example workflow:**
```bash
# 1. Extract ZfsOptionsPanel
npm test  # Verify baseline (should pass)
# ... create ZfsOptionsPanel.tsx, update TopologyPanel.tsx ...
npm test  # Verify extraction didn't break behavior
git add src/components/inputs/topology-options/ZfsOptionsPanel.tsx
git commit -m "refactor: extract ZFS options to separate panel"

# 2. Extract next topology
npm test  # Verify still passing
# ... extract VsanOptionsPanel.tsx ...
npm test  # Verify again
git commit -m "refactor: extract vSAN options to separate panel"
```

### Pitfall 2: Type Assertions to Bypass Exhaustive Checking
**What goes wrong:** Add `as any` or `@ts-ignore` to silence TypeScript errors in switch statements instead of fixing the type issue
**Why it happens:** Exhaustive checking errors seem like compiler bugs when they're actually catching real missing cases
**How to avoid:**
- If `assertNever(x)` errors, it means you're missing a case
- Check the type definition for all possible union members
- Add missing case or update type definition
- Never use `as any` in switch default cases
**Warning signs:**
```typescript
// BAD - silencing legitimate type error
default:
  return (topology as any).level === 'new_level' ? 0.8 : 1.0

// GOOD - fix by adding case or updating type
type Topology = StandardTopology | ZfsTopology | NewTopology  // Add to union
case 'new_topology':  // Add case
  return calculateNewTopologyDataFraction(topology.level, driveCount)
```

### Pitfall 3: Strategy Pattern with Shared Mutable State
**What goes wrong:** Strategy classes store state between calls, causing calculation errors when same strategy instance used for multiple configurations
**Why it happens:** Treating strategies as stateful services instead of stateless algorithms
**How to avoid:**
- Keep all strategy classes stateless
- Pass all data as method parameters
- Use `readonly` properties for immutable configuration
- Create new strategy instances or use singleton with no state
**Warning signs:**
```typescript
// BAD - mutable state in strategy
class ZfsVolumetryStrategy implements VolumetryStrategy {
  private driveCount: number = 0  // State persists between calls!

  calculateDataFraction(level: string, driveCount: number): number {
    this.driveCount = driveCount  // Mutation
    return this.internalCalculation()
  }
}

// GOOD - stateless strategy
class ZfsVolumetryStrategy implements VolumetryStrategy {
  calculateDataFraction(level: string, driveCount: number): number {
    // All data from parameters, no stored state
    const usableDrives = driveCount
    return (usableDrives - this.getParityDrives(level)) / usableDrives
  }

  private getParityDrives(level: string): number {
    // Pure function, no state
    switch (level) {
      case 'raidz1': return 1
      case 'raidz2': return 2
      case 'raidz3': return 3
      default: return 0
    }
  }
}
```

### Pitfall 4: Component Extraction Without Proper TypeScript Types
**What goes wrong:** Extracted components accept loose types like `any` or `Topology` instead of discriminated union types, losing type safety
**Why it happens:** Copying props from original component without tightening types for extracted component
**How to avoid:**
- Use discriminated union types for extracted panels: `Topology & { type: 'zfs' }`
- TypeScript will enforce that component only receives correct topology type
- Props become self-documenting (can only be used for ZFS configurations)
**Warning signs:**
```typescript
// BAD - loose typing
interface ZfsOptionsPanelProps {
  topology: Topology  // Could be any topology type!
  onChange: (topology: Topology) => void
}

// GOOD - tight typing with discriminated union
interface ZfsOptionsPanelProps {
  topology: Topology & { type: 'zfs' }  // TypeScript enforces ZFS-only
  onChange: (topology: Topology) => void
}

// Now TypeScript catches errors:
function TopologyPanel({ topology }: { topology: Topology }) {
  if (topology.type === 'standard') {
    // TypeScript error - can't pass RAID topology to ZFS panel
    return <ZfsOptionsPanel topology={topology} onChange={...} />
  }
}
```

### Pitfall 5: Removing "Unused" Dependencies That Are Actually Used
**What goes wrong:** Run depcheck, see html2canvas listed as unused, remove it, PDF export breaks in production
**Why it happens:** Transitive dependencies (dependencies of dependencies) or dynamic imports not detected by static analysis
**How to avoid:**
- Check if "unused" dependency is in package.json (direct) or package-lock.json only (transitive)
- Search codebase for dynamic imports: `grep -r "import(" src/`
- Search for require statements: `grep -r "require(" src/`
- Check if dependency is peer dependency of another library
- Test feature that might use dependency (e.g., PDF export)
**Warning signs:**
```bash
# depcheck says html2canvas is unused
$ depcheck
Unused dependencies
* html2canvas

# But check if it's transitive
$ npm ls html2canvas
raidy@0.1.0
└─┬ jspdf@4.0.0
  └── html2canvas@1.4.1  # It's a dependency of jspdf!

# Don't remove it from package.json (it's not there)
# Only remove from vite.config.ts manual chunks if truly unused
```

## Code Examples

Verified patterns from official sources:

### Extract Method Refactoring (TypeScript)
```typescript
// Source: VS Code TypeScript Refactoring
// https://code.visualstudio.com/docs/typescript/typescript-refactoring

// BEFORE: Large switch statement in getDataFraction (500+ lines)
function getDataFraction(topology: Topology, driveCount: number, options: any): number {
  const usableDrives = driveCount

  switch (topology.type) {
    case 'standard':
      switch (topology.level) {
        case 'RAID0': return 1.0
        case 'RAID1': return 0.5
        case 'RAID5': return (usableDrives - 1) / usableDrives
        case 'RAID6': return (usableDrives - 2) / usableDrives
        // ... 10 more RAID levels
      }
    case 'zfs':
      switch (topology.level) {
        case 'stripe': return 1.0
        case 'mirror': return 0.5
        // ... 6 more ZFS levels
      }
    // ... 11 more topology types with nested switches
  }
}

// AFTER: Extracted methods (VS Code "Extract to method" refactoring)
function getDataFraction(topology: Topology, driveCount: number, options: any): number {
  switch (topology.type) {
    case 'standard': return calculateRaidDataFraction(topology.level, driveCount)
    case 'zfs': return calculateZfsDataFraction(topology.level, driveCount)
    case 's2d': return calculateS2dDataFraction(topology.level, driveCount, options.s2dOptions)
    case 'ceph': return calculateCephDataFraction(topology.level, options.cephOptions)
    case 'vsan_esa': return calculateVsanEsaDataFraction(topology.level, driveCount)
    // ... other topologies
    default: assertNever(topology)
  }
}

// Each extracted function handles one topology type (20-30 lines each)
function calculateRaidDataFraction(level: string, driveCount: number): number {
  const usableDrives = driveCount

  switch (level) {
    case 'RAID0': return 1.0
    case 'RAID1': return 0.5
    case 'RAID5': return (usableDrives - 1) / usableDrives
    case 'RAID6': return (usableDrives - 2) / usableDrives
    case 'RAID10': return 0.5
    case 'RAID50': return (usableDrives - 2) / usableDrives
    case 'RAID60': return (usableDrives - 4) / usableDrives
    default: return 1.0
  }
}
```

### Compound Component with Context (React)
```typescript
// Source: https://www.patterns.dev/react/compound-pattern/
// Shared form controls for topology options panels

// topology-options/shared/TopologyContext.tsx
interface TopologyContextValue {
  topology: Topology
  onChange: (topology: Topology) => void
}

const TopologyContext = createContext<TopologyContextValue | null>(null)

export function useTopologyContext() {
  const context = useContext(TopologyContext)
  if (!context) {
    throw new Error('useTopologyContext must be used within TopologyProvider')
  }
  return context
}

export function TopologyProvider({
  topology,
  onChange,
  children
}: {
  topology: Topology
  onChange: (topology: Topology) => void
  children: ReactNode
}) {
  return (
    <TopologyContext.Provider value={{ topology, onChange }}>
      {children}
    </TopologyContext.Provider>
  )
}

// topology-options/shared/TopologySlider.tsx - reusable control
export function TopologySlider({
  label,
  value,
  min,
  max,
  optionKey,
}: {
  label: string
  value: number
  min: number
  max: number
  optionKey: string
}) {
  const { topology, onChange } = useTopologyContext()

  return (
    <div>
      <Label>{label}</Label>
      <Slider
        value={value}
        min={min}
        max={max}
        onChange={(newValue) => {
          // Update topology options based on type
          const updatedTopology = { ...topology }
          if (topology.type === 'zfs') {
            updatedTopology.zfsOptions = {
              ...topology.zfsOptions,
              [optionKey]: newValue,
            }
          }
          onChange(updatedTopology)
        }}
      />
    </div>
  )
}

// Usage in ZfsOptionsPanel
export function ZfsOptionsPanel({ topology, onChange }: ZfsOptionsPanelProps) {
  return (
    <TopologyProvider topology={topology} onChange={onChange}>
      <div className="zfs-options">
        <TopologySlider
          label="ashift (sector size power)"
          value={topology.zfsOptions?.ashift ?? 12}
          min={9}
          max={16}
          optionKey="ashift"
        />
        <TopologySlider
          label="Compression Ratio"
          value={topology.zfsOptions?.compressionRatio ?? 1.5}
          min={1.0}
          max={3.0}
          optionKey="compressionRatio"
        />
      </div>
    </TopologyProvider>
  )
}
```

### Biome Configuration for Production
```json
// Source: https://biomejs.dev/linter/
// biome.json - production-ready configuration
{
  "$schema": "https://biomejs.dev/schemas/2.3.11/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error",
        "noUnusedFunctionParameters": "error"
      },
      "style": {
        "useConst": "error",
        "noNonNullAssertion": "warn"  // Warn instead of error for tests
      },
      "complexity": {
        "noExcessiveCognitiveComplexity": {
          "level": "warn",
          "options": {
            "maxAllowedComplexity": 10
          }
        }
      },
      "a11y": {
        "useButtonType": "error"  // Fix missing button type attributes
      }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint + Prettier (127+ packages) | Biome (single binary) | 2023-2024 | 10-25x faster linting, simpler config, one tool to install |
| Class-based error boundaries | react-error-boundary hooks | 2021 | Functional components, better composability, already implemented in Phase 3 |
| Manual prop drilling | Compound components with Context | 2019+ | Cleaner APIs, less repetition, industry standard pattern |
| Runtime type checking | TypeScript exhaustive checking | TypeScript 2.0+ | Compile-time safety, zero runtime cost, catches errors before deployment |
| Manual refactoring | VS Code Extract Method | VS Code 1.40+ | Type-safe refactoring, automatic reference updates, fewer bugs |

**Deprecated/outdated:**
- TSLint: Deprecated in 2019, replaced by ESLint (which is now being replaced by Biome for many projects)
- React.FC type: No longer recommended by React team, use explicit props types instead
- Class components for new code: Hooks are standard since React 16.8 (2019)

## Open Questions

Things that couldn't be fully resolved:

1. **html2canvas actual usage by jspdf**
   - What we know: html2canvas is transitive dependency of jspdf@4.0.0, listed in vite.config manual chunks
   - What's unclear: Whether jspdf 4.0 actually uses html2canvas or if it's legacy from older versions
   - Recommendation: Test PDF export after removing from manual chunks. If export still works, html2canvas loading was unnecessary overhead. Check jspdf 4.0 changelog for html2canvas removal.

2. **Optimal component granularity**
   - What we know: Industry recommends components under 300 lines, single responsibility principle
   - What's unclear: Whether to create shared TopologyFormGroup wrapper or use composition with existing FormControls
   - Recommendation: Start with direct use of existing FormControls (Label, Slider, etc.). Only extract shared wrapper if pattern repeats 3+ times across topology panels.

3. **Strategy pattern vs functional approach**
   - What we know: Strategy pattern uses classes implementing interface. Functional approach uses object with functions.
   - What's unclear: Which approach fits better with existing TypeScript/React codebase patterns
   - Recommendation: Use object-based strategy (functional) to match existing codebase style. Example: `const strategies = { standard: { calculate: (args) => ... }, zfs: { calculate: (args) => ... } }` instead of classes.

4. **Biome vs ESLint migration timing**
   - What we know: Biome already configured and working well (only 8 errors). Project uses Biome 2.3.11.
   - What's unclear: Whether to add more Biome rules or keep minimal configuration
   - Recommendation: Keep current Biome configuration. Only add complexity rules if cyclomatic complexity becomes issue post-refactoring. Biome's recommended ruleset is sufficient for production.

## Sources

### Primary (HIGH confidence)
- [React Official Docs - Thinking in React](https://react.dev/learn/thinking-in-react) - Component composition best practices
- [TypeScript Official Docs - Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) - Exhaustive type checking with never
- [VS Code TypeScript Refactoring](https://code.visualstudio.com/docs/typescript/typescript-refactoring) - Extract method refactoring
- [Biome Official Linter Docs](https://biomejs.dev/linter/) - Configuration and rules
- Project files: tsconfig.app.json (strict mode already enabled), biome.json (current config), package.json (dependencies)

### Secondary (MEDIUM confidence)
- [Frontend Mastery - Advanced React Component Composition](https://frontendmastery.com/posts/advanced-react-component-composition-guide/) - Compound component patterns verified with official React patterns
- [Refactoring Guru - Strategy Pattern TypeScript](https://refactoring.guru/design-patterns/strategy/typescript/example) - Canonical design pattern reference
- [Fullstory - Discriminated Unions and Exhaustiveness](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/) - Practical exhaustive checking examples
- [Better Stack - Biome vs ESLint 2026](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/) - Performance comparisons verified
- [depcheck npm package](https://www.npmjs.com/package/depcheck) - Official dependency analysis tool

### Tertiary (LOW confidence)
- [Medium - Strategy Pattern in TypeScript](https://medium.com/@robinviktorsson/a-guide-to-the-strategy-design-pattern-in-typescript-and-node-js-with-practical-examples-c3d6984a2050) - General pattern tutorial, not project-specific
- [DEV Community - Composition Pattern](https://dev.to/ricardolmsilva/composition-pattern-in-react-28mj) - Community best practices, not canonical
- [Sanyam Arya - Cyclomatic Complexity](https://www.sanyamarya.com/blog/mastering-cyclomatic-complexity-maintainable-code/) - General complexity reduction, not TypeScript-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in package.json and working, verified with npm ls and package.json
- Architecture patterns: HIGH - Official TypeScript and React documentation, industry-standard patterns
- Strategy pattern: HIGH - Canonical design pattern with TypeScript examples from Refactoring Guru
- Component composition: HIGH - Official React documentation and verified frontend architecture guides
- Exhaustive checking: HIGH - Official TypeScript documentation with never type usage
- Biome configuration: HIGH - Official Biome documentation, current project already using Biome successfully
- Refactoring strategies: MEDIUM - Mix of official docs (VS Code refactoring) and community best practices
- Dependency audit: MEDIUM - Verified depcheck tool but html2canvas usage needs manual testing
- Pitfalls: MEDIUM - Based on web search findings and general refactoring knowledge, not project-specific validation

**Research date:** 2026-01-18
**Valid until:** 2026-04-18 (90 days - stable technologies, TypeScript/React patterns change slowly)

**Tools verified:**
- Biome 2.3.11 - Already configured, 8 lint errors found
- TypeScript 5.9.3 - Strict mode enabled, zero violations
- html2canvas 1.4.1 - Transitive dependency via jspdf@4.0.0, not directly imported in src/
- Vitest 4.0.16 - 75%+ coverage from Phase 2, provides safety net for refactoring

**Codebase analysis:**
- TopologyPanel.tsx: 1647 lines (needs split to ~200-300 main + 100-150 per topology)
- volumetry/index.ts: 1141 lines with 16 switch statements (needs strategy extraction)
- Current test coverage: 75%+ from Phase 2 (excellent for refactoring safety)
- TypeScript strict mode: Enabled with all flags (noFallthroughCasesInSwitch active)
