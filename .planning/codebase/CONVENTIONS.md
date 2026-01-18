# Coding Conventions

**Analysis Date:** 2026-01-16

## Naming Patterns

**Files:**

- Components: PascalCase with `.tsx` extension (e.g., `HardwarePanel.tsx`, `FormControls.tsx`)
- Utilities/hooks: camelCase with `.ts` extension (e.g., `useCalculations.ts`, `units.ts`)
- Types: camelCase with `.ts` extension (e.g., `drive.ts`, `topology.ts`, `config.ts`)
- Slices (Zustand): camelCase with `Slice` suffix (e.g., `hardwareSlice.ts`, `topologySlice.ts`)
- Workers: camelCase with `Worker` suffix (e.g., `resilienceWorker.ts`)
- Barrel files: `index.ts` for re-exports

**Functions:**

- camelCase for all functions
- Verb-noun pattern for actions: `setDriveCount`, `calculateVolumetry`, `formatBytes`
- `use` prefix for React hooks: `useCalculations`, `useFormatBytes`, `useMediaQuery`
- `create` prefix for factory functions: `createHardwareSlice`, `createAdvancedSlice`
- `get` prefix for getters: `getDataFraction`, `getControllerOptions`, `getDefaultFormFactor`
- `validate` prefix for validators: `validateConfiguration`, `validateCephRam`
- `calculate` prefix for calculation engines: `calculateVolumetry`, `calculatePerformance`

**Variables:**

- camelCase for variables and parameters
- UPPER_SNAKE_CASE for constants: `BINARY`, `DECIMAL`, `CONTROLLER_LIMITS`, `FILESYSTEM_OVERHEAD`
- Descriptive names with units where applicable: `driveCapacityBytes`, `rebuildTimeHours`, `serverPowerWatts`

**Types:**

- PascalCase for interfaces and type aliases: `Drive`, `Topology`, `VolumetryResult`
- Suffix conventions:
  - `State` for store state interfaces: `HardwareState`, `TopologyState`
  - `Options` for configuration objects: `ZfsOptions`, `CephOptions`, `PowerFlexOptions`
  - `Result` for calculation outputs: `VolumetryResult`, `PerformanceResult`
  - `Input` for function parameters: `VolumetryInput`, `PerformanceInput`
  - `Slice` for Zustand slices: `HardwareSlice`, `TopologySlice`
- String literal union types for enums: `DriveType`, `TopologyType`, `BlockSize`

**Components:**

- PascalCase for React components: `HardwarePanel`, `OutputDashboard`, `LanguageSwitcher`
- Named exports (not default exports): `export function App() {}`

## Code Style

**Formatting:**

- Tool: Biome (version 2.3.11)
- Config file: `biome.json`
- Key settings:
  - Indent: 2 spaces
  - Line width: 100 characters
  - Quote style: Single quotes
  - Semicolons: As needed (omitted when optional)

**Linting:**

- Tool: Biome (combined formatter/linter)
- Key rules enabled:
  - `noUnusedImports`: error
  - `noUnusedVariables`: error
  - `useConst`: error
  - `noNonNullAssertion`: warn
- Run command: `npm run lint` (check) or `npm run lint:fix` (auto-fix)

**Format command:**

```bash
npm run format     # Auto-format all files
npm run lint       # Check for issues
npm run lint:fix   # Fix issues automatically
```

## Import Organization

**Order:**

1. Node built-ins: `import { resolve } from 'node:path'`
2. React/framework imports: `import { useMemo } from 'react'`
3. Third-party libraries: `import { create } from 'zustand'`
4. Internal path aliases (alphabetically):
   - `@/` root source
   - `@components/`
   - `@data/`
   - `@engines/`
   - `@hooks/`
   - `@store/`
   - `@types/`
   - `@utils/`
5. Relative imports: `./`, `../`

**Path Aliases:**
Configured in `tsconfig.app.json` and `vite.config.ts`:

```typescript
'@/*': ['src/*']
'@engines/*': ['src/engines/*']
'@components/*': ['src/components/*']
'@store/*': ['src/store/*']
'@types/*': ['src/types/*']
'@utils/*': ['src/utils/*']
'@data/*': ['src/data/*']
'@hooks/*': ['src/hooks/*']
```

**Import examples:**

```typescript
// External libraries
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";

// Path alias imports
import drivesData from "@/data/drives.json";
import { calculateVolumetry } from "@/engines/volumetry";
import { useConfigStore } from "@/store";
import type { Drive, Topology } from "@/types";
import { formatBytes } from "@/utils";
```

**Type-only imports:**

- Use `import type` for type-only imports to improve tree-shaking:

```typescript
import type { Drive, DriveConnectivity } from "@/types";
import type { StateCreator } from "zustand";
```

## Error Handling

**Patterns:**

- Guard clauses with early returns for invalid states
- Explicit error objects in workers: `{ type: 'ERROR', payload: error.message }`
- Validation functions return `null` for valid or `ValidationAlert` for issues
- Use `instanceof Error` check when catching: `error instanceof Error ? error.message : 'Unknown error'`

**Worker error handling:**

```typescript
try {
  runSimulation(message.payload);
} catch (error) {
  postMessage({
    type: "ERROR",
    payload: error instanceof Error ? error.message : "Unknown error",
  });
}
```

**Validation pattern:**

```typescript
function validateDriveCount(
  driveCount: number,
  topology: Topology
): ValidationAlert | null {
  if (topology.level === "raidz1" && driveCount < 3) {
    return {
      severity: "error",
      code: "ZFS_RAIDZ1_MIN_DRIVES",
      message: "ZFS RAIDZ1 requires minimum 3 drives.",
    };
  }
  return null; // Valid
}
```

**Entry point guard:**

```typescript
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
```

## Logging

**Framework:** Browser console (no external logging framework)

**Patterns:**

- No explicit logging in production code observed
- Errors handled via validation alerts shown in UI
- Worker communication via typed messages

## Comments

**When to Comment:**

- Module-level JSDoc block for file purpose
- JSDoc for exported functions with `@param`, `@returns`, `@example`
- Inline comments for complex calculations or non-obvious logic
- Reference spec formulas in calculation engines

**JSDoc pattern:**

```typescript
/**
 * Format bytes to human-readable string with correct unit labels.
 *
 * @param bytes - Value in bytes
 * @param system - 'binary' (TiB/GiB) or 'decimal' (TB/GB)
 * @returns Formatted string with appropriate unit
 *
 * @example
 * formatBytes(1099511627776, 'binary')  // "1.0 TiB"
 * formatBytes(1000000000000, 'decimal') // "1.0 TB"
 */
export function formatBytes(bytes: number, system: UnitSystem = 'binary'): string {
```

**Spec reference pattern:**

```typescript
/**
 * Calculate complete volumetry results.
 * Implements spec formulas:
 * - Ceph: C_safe = C_usable x safeCapacityThreshold (default 0.85)
 * - NetApp: C_eff = (C_raw - RAID_overhead) x (1 - snap%) x DRR x (1 - WAFL%)
 * - Synology: System partition 20-30GB per disk
 * - PowerFlex FG: 12-15% metadata overhead
 * - ZFS: Slop space 1/64 = 1.5625%
 */
```

## Function Design

**Size:** Functions should be focused on a single responsibility. Utility functions are typically 10-50 lines. Calculation engines can be longer (100-300 lines) with clear internal structure.

**Parameters:**

- Use interface for functions with 3+ parameters: `VolumetryInput`, `PerformanceInput`
- Destructure input objects at function start
- Optional parameters use `?` suffix
- Default values in destructuring when appropriate

**Return Values:**

- Return typed objects for complex results
- Return `null` for "not found" or "no issue" cases
- Use discriminated unions for state variants: `{ type: 'ERROR', payload }` vs `{ type: 'RESULT', payload }`

**Example pattern:**

```typescript
export interface VolumetryInput {
  drive: Drive;
  driveCount: number;
  hotSpares: number;
  topology: Topology;
  // ... more fields
}

export function calculateVolumetry(input: VolumetryInput): VolumetryResult {
  const {
    drive,
    driveCount,
    hotSpares,
    topology,
    // ... destructure all
  } = input;

  // Implementation
  return { rawCapacity, usableCapacity /* ... */ };
}
```

## Module Design

**Exports:**

- Named exports only (no default exports)
- Export functions and types from implementation files
- Re-export through barrel files (`index.ts`)

**Barrel Files:**

- Each feature directory has an `index.ts` for re-exports
- Separate `export type` for types vs `export` for values
- Located at: `src/types/index.ts`, `src/components/layout/index.ts`, `src/store/slices/index.ts`, etc.

**Barrel file pattern:**

```typescript
// src/types/index.ts
export type {
  Drive,
  DriveConnectivity,
  DriveDatabase, // ... type exports
} from "./drive";
export { CONNECTIVITY_TO_TYPES, getDefaultFormFactor } from "./drive";
```

## Component Patterns

**Function components with hooks:**

```typescript
export function HardwarePanel() {
  const { t } = useTranslation("hardware");
  const { driveId, setDriveId } = useConfigStore();

  const filteredDrives = useMemo(() => {
    // Memoized computation
  }, [dependencies]);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  return <div className="space-y-5">{/* JSX */}</div>;
}
```

**Store access pattern:**

```typescript
// Select specific state
const unitSystem = useConfigStore((state) => state.unitSystem);

// Or destructure multiple
const { driveId, driveCount, setDriveId } = useConfigStore();
```

## TypeScript Strict Mode

**Enabled strict checks in `tsconfig.app.json`:**

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "strictFunctionTypes": true,
  "strictBindCallApply": true,
  "noImplicitThis": true,
  "alwaysStrict": true,
  "noUncheckedIndexedAccess": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
}
```

**Handle nullable access:**

```typescript
// With noUncheckedIndexedAccess
const drive = drives[driveId]; // Drive | undefined
if (!drive) {
  return {
    /* error state */
  };
}
// drive is now Drive
```

---

_Convention analysis: 2026-01-16_
