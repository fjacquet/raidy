# Testing Patterns

**Analysis Date:** 2026-01-16

## Test Framework

**Runner:**

- Vitest (version 4.0.16)
- Config: Inline in `vite.config.ts` (no separate vitest.config.ts)
- Uses Vite's testing integration

**Assertion Library:**

- Vitest built-in assertions (Chai-compatible)
- `expect()` API

**Coverage:**

- @vitest/coverage-v8 (version 4.0.16)
- V8 coverage provider

**Run Commands:**

```bash
npm test              # Run all tests (watch mode by default)
npm run test:ui       # Run with Vitest UI dashboard
npm run test:coverage # Run with coverage report
```

## Test File Organization

**Location:**

- Dedicated test directory: `tests/`
- Subdirectories mirror source structure: `tests/engines/`
- Currently empty - tests need to be written

**Naming:**

- Pattern: `[module].test.ts` or `[module].spec.ts`
- Examples: `volumetry.test.ts`, `performance.test.ts`

**Structure:**

```
tests/
  engines/
    volumetry.test.ts
    performance.test.ts
    sustainability.test.ts
  utils/
    units.test.ts
    validators.test.ts
  hooks/
    useCalculations.test.ts
```

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { calculateVolumetry } from "@/engines/volumetry";
import type { VolumetryInput } from "@/engines/volumetry";

describe("calculateVolumetry", () => {
  let baseInput: VolumetryInput;

  beforeEach(() => {
    baseInput = {
      drive: mockDrive,
      driveCount: 12,
      hotSpares: 1,
      // ... setup common input
    };
  });

  describe("RAID 5 calculations", () => {
    it("should calculate correct usable capacity for RAID 5", () => {
      const result = calculateVolumetry({
        ...baseInput,
        topology: { type: "standard", level: "RAID5" },
      });

      // n-1 data drives for RAID 5
      const expectedUsable = mockDrive.capacity_raw * 10; // 11 data drives - 1 parity
      expect(result.usableCapacity).toBeCloseTo(expectedUsable, -6); // Within 1MB
    });
  });
});
```

**Patterns:**

- `describe()` for grouping related tests
- `it()` for individual test cases (prefer over `test()`)
- `beforeEach()` for setup common to all tests in a suite
- Arrange-Act-Assert structure within each test

## Mocking

**Framework:** Vitest built-in mocking (`vi`)

**Patterns:**

```typescript
import { vi, describe, it, expect } from "vitest";

// Mock a module
vi.mock("@/data/drives.json", () => ({
  default: {
    "test-drive": {
      id: "test-drive",
      model: "Test Drive",
      type: "SSD_NVMe",
      capacity_raw: 1000000000000, // 1TB
      // ... other fields
    },
  },
}));

// Spy on a function
const consoleSpy = vi.spyOn(console, "error");

// Mock timers for async tests
vi.useFakeTimers();
vi.advanceTimersByTime(1000);

// Restore mocks
afterEach(() => {
  vi.restoreAllMocks();
});
```

**What to Mock:**

- External data files (`drives.json`)
- Browser APIs (localStorage, URL)
- Console methods for error testing
- Timers for time-dependent code
- Web Workers for unit tests

**What NOT to Mock:**

- Pure calculation functions (test actual logic)
- Type definitions
- Internal utilities within same module

## Fixtures and Factories

**Test Data:**

```typescript
// tests/fixtures/drives.ts
import type { Drive } from "@/types";

export const mockHddDrive: Drive = {
  id: "test-hdd-24tb",
  model: "Test HDD 24TB",
  type: "HDD",
  capacity_raw: 24 * 1000 * 1000 * 1000 * 1000, // 24TB decimal
  sector_size: 4096,
  performance: {
    iops_read: 180,
    iops_write: 170,
    bandwidth_read_mb: 270,
    bandwidth_write_mb: 260,
  },
  reliability: {
    ure_rate: 14,
    afr: 0.44,
    dwpd: 0,
  },
  power: {
    idle_watts: 5,
    load_watts: 9,
  },
  cost_usd: 450,
};

export const mockNvmeDrive: Drive = {
  id: "test-nvme-1920gb",
  model: "Test NVMe 1.92TB",
  type: "SSD_NVMe",
  capacity_raw: 1920 * 1000 * 1000 * 1000, // 1.92TB
  sector_size: 4096,
  formFactor: "U.2",
  performance: {
    iops_read: 750000,
    iops_write: 150000,
    bandwidth_read_mb: 6800,
    bandwidth_write_mb: 4000,
  },
  reliability: {
    ure_rate: 17,
    afr: 0.35,
    dwpd: 1,
  },
  power: {
    idle_watts: 5,
    load_watts: 18,
  },
  cost_usd: 250,
};
```

**Factory functions:**

```typescript
// tests/factories/topology.ts
import type { Topology, ZfsOptions } from "@/types";
import { DEFAULT_ZFS_OPTIONS } from "@/types";

export function createTopology(type: string, level: string): Topology {
  return { type, level } as Topology;
}

export function createZfsOptions(overrides?: Partial<ZfsOptions>): ZfsOptions {
  return { ...DEFAULT_ZFS_OPTIONS, ...overrides };
}
```

**Location:**

- `tests/fixtures/` for static test data
- `tests/factories/` for factory functions

## Coverage

**Requirements:** None enforced currently (coverage tooling installed but no thresholds set)

**Recommended targets:**

- Calculation engines (`src/engines/`): 90%+ coverage
- Utility functions (`src/utils/`): 90%+ coverage
- Validators (`src/utils/validators.ts`): 90%+ coverage
- Components: Focus on logic, not rendering

**View Coverage:**

```bash
npm run test:coverage
# Opens HTML report or outputs to console
```

**Key files requiring tests per CLAUDE.md:**

- RAID 5/6 math against industry formulas
- ZFS overhead matching OpenZFS documentation
- Results within 1% of WintelGuy and NetApp calculators

## Test Types

**Unit Tests:**

- Scope: Individual functions, calculation engines
- Location: `tests/engines/`, `tests/utils/`
- Focus: Pure functions with deterministic outputs
- Priority: HIGH - math accuracy is critical

**Integration Tests:**

- Scope: Store interactions, hook behavior
- Location: `tests/hooks/`, `tests/store/`
- Focus: State management, data flow
- Priority: MEDIUM

**E2E Tests:**

- Framework: Not configured
- Status: Not implemented
- Note: Consider Playwright for future browser testing

## Common Patterns

**Async Testing:**

```typescript
it("should complete Monte Carlo simulation", async () => {
  const worker = new Worker("./resilienceWorker.ts");

  const result = await new Promise((resolve) => {
    worker.onmessage = (e) => {
      if (e.data.type === "RESULT") {
        resolve(e.data.payload);
      }
    };
    worker.postMessage({ type: "START", payload: simulationInput });
  });

  expect(result.survivalRate).toBeGreaterThan(0.99);
});
```

**Error Testing:**

```typescript
it("should throw error for missing root element", () => {
  expect(() => {
    // Code that should throw
    throw new Error("Root element not found");
  }).toThrowError("Root element not found");
});

it("should return validation error for insufficient drives", () => {
  const result = validateDriveCount(2, { type: "zfs", level: "raidz1" });

  expect(result).not.toBeNull();
  expect(result?.severity).toBe("error");
  expect(result?.code).toBe("ZFS_RAIDZ1_MIN_DRIVES");
});
```

**Floating Point Comparisons:**

```typescript
// For capacity calculations (within 1MB tolerance)
expect(result.usableCapacity).toBeCloseTo(expectedCapacity, -6);

// For percentages (within 0.1%)
expect(result.efficiency).toBeCloseTo(expectedEfficiency, 1);

// For ratios
expect(result.compressionRatio).toBeCloseTo(1.5, 2);
```

**Parameterized Tests:**

```typescript
describe.each([
  ["RAID5", 11, 0.909], // 11 data drives / 12 total
  ["RAID6", 10, 0.833], // 10 data drives / 12 total
  ["RAID10", 6, 0.5], // 6 data drives / 12 total (mirrored)
])("Standard RAID %s efficiency", (level, dataDrives, expectedEfficiency) => {
  it(`should calculate ${expectedEfficiency * 100}% efficiency`, () => {
    const result = calculateVolumetry({
      ...baseInput,
      topology: { type: "standard", level },
    });

    expect(result.efficiency / 100).toBeCloseTo(expectedEfficiency, 2);
  });
});
```

## Validation Requirements from CLAUDE.md

**Required test coverage:**

1. RAID 5/6 math against industry formulas
2. ZFS overhead matches OpenZFS documentation
3. Web Worker stability on mobile browsers
4. Results within 1% of WintelGuy and NetApp Storage Efficiency Calculator

**Example validation test:**

```typescript
describe("Industry formula validation", () => {
  it("RAID 5 usable capacity matches WintelGuy formula", () => {
    // WintelGuy formula: (N-1) * DriveCapacity
    const driveCount = 12;
    const driveCapacity = 24 * 1000 * 1000 * 1000 * 1000; // 24TB
    const expectedUsable = (driveCount - 1) * driveCapacity;

    const result = calculateVolumetry({
      drive: mockHddDrive,
      driveCount,
      hotSpares: 0,
      topology: { type: "standard", level: "RAID5" },
      // ... other required fields
    });

    // Within 1% tolerance
    const tolerance = expectedUsable * 0.01;
    expect(result.usableCapacity).toBeCloseTo(
      expectedUsable,
      -Math.log10(tolerance)
    );
  });

  it("ZFS slop space matches OpenZFS spec (1/64)", () => {
    // OpenZFS reserves spa_slop_shift = 5 (1/32 of pool)
    // Actually 1/64 per recent OpenZFS versions
    const poolCapacity = 100 * 1024 * 1024 * 1024 * 1024; // 100 TiB
    const expectedSlop = poolCapacity / 64;

    const result = calculateVolumetry({
      drive: mockNvmeDrive,
      driveCount: 10,
      hotSpares: 0,
      topology: { type: "zfs", level: "raidz2" },
      zfsOptions: DEFAULT_ZFS_OPTIONS,
      // ... other fields
    });

    expect(result.slopOverhead).toBeCloseTo(expectedSlop, -6);
  });
});
```

## Test Execution

**Local development:**

```bash
npm test                    # Watch mode
npm test -- --run           # Single run (CI mode)
npm test -- volumetry       # Run specific test file
npm test -- --reporter=verbose  # Detailed output
```

**CI integration:**

- Not currently configured
- Recommended: `npm test -- --run` in CI pipeline

---

_Testing analysis: 2026-01-16_
