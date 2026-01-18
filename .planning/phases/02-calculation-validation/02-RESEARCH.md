# Phase 2: Calculation Validation - Research

**Researched:** 2026-01-18
**Domain:** Mathematical calculation testing, Monte Carlo simulation validation, storage system formula verification
**Confidence:** HIGH

## Summary

Phase 2 requires validating complex storage calculation engines against industry references (WintelGuy, OpenZFS docs, VMware vSAN specs). The challenge is testing 13 topology types with branching logic, Monte Carlo stochastic simulations, and ensuring backward compatibility of URL state serialization.

The standard approach combines multiple testing strategies:
1. **Table-driven tests** using Vitest's `test.each()` for parametric testing of known test vectors
2. **Property-based testing** with fast-check for generative validation of mathematical invariants
3. **Snapshot testing** for regression detection and backward compatibility
4. **Statistical validation** for Monte Carlo simulations with confidence intervals
5. **Golden master comparison** against authoritative external calculators

Current test infrastructure (Phase 1) provides Vitest with jsdom, 75% coverage thresholds, and V8 coverage provider with AST-based remapping (as accurate as Istanbul since Vitest 3.2.0).

**Primary recommendation:** Use table-driven tests as the foundation (test.each with manually verified test vectors), layer property-based tests for edge case discovery, and validate Monte Carlo output statistically rather than deterministically.

## Standard Stack

The established libraries/tools for calculation validation testing:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 2.x | Test runner | Already configured, jsdom environment operational |
| @vitest/coverage-v8 | 2.x | Code coverage | AST-based remapping since 3.2.0 matches Istanbul accuracy with V8 speed |
| fast-check | 3.x | Property-based testing | Industry standard for generative testing, works with any test runner |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/jest-dom | 6.x | Extended matchers | Already installed, useful for validation assertions |
| happy-dom | N/A | DOM environment | NOT recommended for Web Worker tests (use jsdom) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| V8 coverage | Istanbul coverage | V8 now equally accurate (Vitest 3.2.0+), faster |
| fast-check | Manual edge cases | Property-based finds cases you wouldn't think of |
| test.each | Individual tests | Table-driven reduces duplication, easier to add cases |

**Installation:**
```bash
npm install fast-check --save-dev
# Vitest and coverage already installed from Phase 1
```

## Architecture Patterns

### Recommended Test Structure
```
tests/
├── engines/
│   ├── volumetry.spec.ts           # RAID/ZFS/vSAN capacity formulas
│   ├── volumetry.vectors.ts         # Test vector data tables
│   ├── performance.spec.ts          # IOPS, write penalties
│   └── sustainability.spec.ts       # TCO, power calculations
├── workers/
│   └── resilience.spec.ts           # Monte Carlo statistical validation
├── utils/
│   ├── validators.spec.ts           # Form validation rules
│   └── urlStorage.spec.ts           # Serialization roundtrip
└── fixtures/
    ├── raid-reference-vectors.json  # Golden master from WintelGuy
    └── zfs-reference-vectors.json   # Golden master from OpenZFS
```

### Pattern 1: Table-Driven Test with External Vectors
**What:** Separate test data from test logic, use Vitest test.each() for parametric execution
**When to use:** Testing calculation formulas with known inputs/outputs
**Example:**
```typescript
// Source: https://vitest.dev/api/
// Pattern: Table-driven tests with test.each

import { describe, expect, it } from 'vitest'

// Test vectors in separate file for maintainability
const raidVectors = [
  { level: 'RAID0', drives: 4, driveSize: 1000, expected: 4000, tolerance: 0.01 },
  { level: 'RAID1', drives: 2, driveSize: 1000, expected: 1000, tolerance: 0.01 },
  { level: 'RAID5', drives: 4, driveSize: 1000, expected: 3000, tolerance: 0.01 },
  { level: 'RAID6', drives: 6, driveSize: 1000, expected: 4000, tolerance: 0.01 },
  // Add more vectors from WintelGuy manual verification
]

describe.each(raidVectors)('RAID Capacity: $level', ({ level, drives, driveSize, expected, tolerance }) => {
  it(`${drives}x ${driveSize}GB should yield ${expected}GB usable`, () => {
    const result = calculateCapacity(level, drives, driveSize)

    // Use toBeCloseTo for floating-point tolerance
    expect(result).toBeCloseTo(expected, Math.log10(1 / tolerance))
  })
})
```

### Pattern 2: Property-Based Testing for Mathematical Invariants
**What:** Generative testing that verifies properties hold across randomized inputs
**When to use:** Discovering edge cases, validating mathematical laws (commutativity, bounds checking)
**Example:**
```typescript
// Source: https://fast-check.dev/
import fc from 'fast-check'

describe('RAID Capacity Properties', () => {
  it('RAID 0 capacity equals sum of all drives', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 24 }), // driveCount
        fc.integer({ min: 100, max: 20000 }), // driveSize GB
        (driveCount, driveSize) => {
          const result = calculateCapacity('RAID0', driveCount, driveSize)
          const expectedRaw = driveCount * driveSize

          // Account for filesystem overhead (2-3%)
          expect(result).toBeGreaterThan(expectedRaw * 0.97)
          expect(result).toBeLessThanOrEqual(expectedRaw)
        }
      ),
      { numRuns: 100 } // Run 100 random combinations
    )
  })

  it('Adding drives to RAID 5 increases capacity monotonically', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }), // Start drives
        fc.integer({ min: 1000, max: 10000 }), // Drive size
        (startDrives, driveSize) => {
          const baseline = calculateCapacity('RAID5', startDrives, driveSize)
          const expanded = calculateCapacity('RAID5', startDrives + 1, driveSize)

          expect(expanded).toBeGreaterThan(baseline)
        }
      )
    )
  })
})
```

### Pattern 3: Snapshot Testing for Backward Compatibility
**What:** Capture serialized state as snapshots, detect unintended changes
**When to use:** URL state serialization, configuration export (JSON/YAML), PDF generation
**Example:**
```typescript
// Source: https://vitest.dev/guide/snapshot
import { expect, it } from 'vitest'

it('URL state serialization preserves configuration', () => {
  const config = {
    topology: 'RAID5',
    drives: 8,
    driveModel: 'wd-gold-12tb',
    hotSpares: 1,
  }

  const serialized = serializeToURL(config)
  const deserialized = deserializeFromURL(serialized)

  // Exact match assertion
  expect(deserialized).toEqual(config)

  // Also snapshot for regression detection
  expect(serialized).toMatchSnapshot()
})

it('handles legacy v1.0 URL format (backward compatibility)', () => {
  const legacyURL = 'v=1.0&t=5&d=8&m=wd-gold-12tb'
  const deserialized = deserializeFromURL(legacyURL)

  // Should migrate to current format
  expect(deserialized.topology).toBe('RAID5')
  expect(deserialized.drives).toBe(8)

  // Snapshot detects if migration logic changes
  expect(deserialized).toMatchSnapshot()
})
```

### Pattern 4: Monte Carlo Statistical Validation
**What:** Test stochastic simulations by validating statistical properties, not exact values
**When to use:** Resilience Worker URE probability, MTTDL calculations
**Example:**
```typescript
// Source: Research on Monte Carlo validation best practices
import { describe, expect, it } from 'vitest'

describe('Monte Carlo Resilience Worker', () => {
  it('RAID 5 survival rate falls within confidence interval', async () => {
    const config = {
      raidLevel: 'RAID5',
      driveCount: 8,
      driveCapacityBytes: 4_000_000_000_000, // 4TB
      rebuildSpeedMBs: 100,
      ureRate: 14 as const,
      afrPercent: 1.0,
      simulationCount: 10000, // Production count for accuracy
    }

    const result = await runMonteCarloSimulation(config)

    // With 10k simulations, confidence interval ≈ ±1%
    // RAID 5 with 8x 4TB drives, 1% AFR should have ~95-99% survival
    expect(result.survivalRate).toBeGreaterThan(0.94)
    expect(result.survivalRate).toBeLessThan(1.0)

    // Validate confidence interval is reported
    expect(result.confidenceInterval).toBeDefined()
    expect(result.confidenceInterval.lower).toBeLessThan(result.survivalRate)
    expect(result.confidenceInterval.upper).toBeGreaterThan(result.survivalRate)
  })

  it('produces consistent results across runs (within statistical variance)', async () => {
    const config = { /* ... */ simulationCount: 1000 }

    const run1 = await runMonteCarloSimulation(config)
    const run2 = await runMonteCarloSimulation(config)

    // With 1000 simulations, expect ±3% variance
    const variance = Math.abs(run1.survivalRate - run2.survivalRate)
    expect(variance).toBeLessThan(0.03)
  })
})
```

### Pattern 5: Web Worker Testing in jsdom
**What:** Mock self.postMessage and test worker logic directly
**When to use:** Testing resilienceWorker.ts Monte Carlo engine
**Example:**
```typescript
// Source: Existing resilience.spec.ts + Vitest Web Worker best practices
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock worker context BEFORE importing worker
const mockPostMessage = vi.fn()
vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  onmessage: null,
})

describe('Resilience Worker', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
    vi.resetModules() // Fresh import each test
  })

  it('posts RESULT message with survival rate', async () => {
    await import('@/workers/resilienceWorker')

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: { /* config */ },
      },
    } as MessageEvent)

    // Find RESULT message in postMessage calls
    const resultCall = mockPostMessage.mock.calls.find(
      (call) => call[0].type === 'RESULT'
    )

    expect(resultCall).toBeDefined()
    expect(resultCall[0].payload.survivalRate).toBeGreaterThan(0)
  })
})
```

### Anti-Patterns to Avoid
- **Hard-coded expected values without source citation:** Always document where test vectors come from (manual WintelGuy calculation, OpenZFS spec section X.Y)
- **Exact equality for floating-point:** Use `toBeCloseTo()` with explicit tolerance, not `toBe()` or `toEqual()`
- **Testing Monte Carlo with exact values:** Validate statistical bounds and confidence intervals, not precise survival rates
- **Coupling test data with test logic:** Separate test vectors into dedicated files/constants for maintainability
- **Skipping edge cases:** Test minimum/maximum drive counts, zero capacity, mixed drive types
- **No backward compatibility tests:** URL format changes break user-shared links; always test legacy format migration

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Floating-point comparison | Custom epsilon logic | `toBeCloseTo(expected, precision)` | Handles edge cases, standard precision parameter |
| Generative test data | Random test cases | fast-check property-based testing | Finds edge cases systematically, shrinks to minimal failure |
| Snapshot updates | Manual JSON comparison | `toMatchSnapshot()` | Auto-updates with --update flag, version controlled |
| Statistical validation | Manual standard deviation | Confidence interval formulas (±1.96σ for 95%) | Industry standard, well-tested |
| Web Worker mocking | Custom message queue | Vitest `vi.stubGlobal('self', ...)` | Framework-supported, handles MessageEvent correctly |
| Test vector generation | Manual calculator runs | Scripted extraction from WintelGuy/OpenZFS APIs | Reproducible, versionable |

**Key insight:** Mathematical testing requires precision tooling. Vitest's `toBeCloseTo()` isn't just convenience - it handles floating-point representation edge cases that manual epsilon checks miss. Similarly, fast-check's shrinking algorithm (reducing failing inputs to minimal cases) is complex to implement correctly.

## Common Pitfalls

### Pitfall 1: Floating-Point Arithmetic Errors
**What goes wrong:** Tests fail with "expected 3000 but got 2999.9999999998" despite correct calculation logic
**Why it happens:** JavaScript uses IEEE 754 double precision; 0.1 + 0.2 ≠ 0.3 exactly
**How to avoid:**
- Use `toBeCloseTo(expected, precision)` for all numerical assertions
- Set precision based on tolerance (1% tolerance ≈ 2 decimal places for percentages)
- Document tolerance explicitly: `// WintelGuy requires ±1% tolerance`
**Warning signs:** Test failures with values differing in 10th+ decimal place

### Pitfall 2: Testing Monte Carlo Deterministically
**What goes wrong:** Monte Carlo tests are flaky - sometimes pass, sometimes fail with identical code
**Why it happens:** Simulations use random number generation; outcomes vary run-to-run
**How to avoid:**
- Test statistical properties (survival rate within range) not exact values
- Calculate confidence intervals: with 10k simulations, 95% CI ≈ ±1.96 × sqrt(p(1-p)/n)
- Use fixed random seed for reproducible tests (if needed for debugging)
- Validate consistency: run simulation 10 times, standard deviation should be small
**Warning signs:** Intermittent test failures with "expected 0.987 but got 0.985"

### Pitfall 3: Coverage Theater Instead of Validation
**What goes wrong:** 100% coverage achieved but calculations still incorrect
**Why it happens:** Tests execute code paths but don't validate correctness against authoritative sources
**How to avoid:**
- Every test vector must cite source: "WintelGuy 4x 1TB RAID 5 = 3TB" with URL
- Compare against external calculators, not internal re-implementation
- Use property-based testing to find edge cases coverage metrics miss
- Test boundary conditions explicitly (1 drive, max drives, zero capacity)
**Warning signs:** All tests pass but user reports incorrect calculations

### Pitfall 4: Ignoring Backward Compatibility
**What goes wrong:** URL format update breaks all user-shared links from previous versions
**Why it happens:** Serialization logic changes without migration path testing
**How to avoid:**
- Maintain test fixtures for all historical URL formats (v1.0, v1.1, etc.)
- Snapshot current serialization format to detect unintended changes
- Test migration: legacy format → deserialize → re-serialize → should update format
- Version the state schema explicitly
**Warning signs:** GitHub issues reporting "my saved link doesn't work anymore"

### Pitfall 5: Web Worker Testing with happy-dom
**What goes wrong:** Worker tests fail with "MessageEvent data is undefined"
**Why it happens:** happy-dom doesn't polyfill MessageEvent constructor properly, unlike jsdom
**How to avoid:**
- Use jsdom environment for Web Worker tests (already configured)
- Mock `self.postMessage` before importing worker code
- Call `vi.resetModules()` between tests to get fresh worker instance
- If forced to use happy-dom, add MessageEvent polyfill to test setup
**Warning signs:** `expect(event.data).toBeDefined()` fails despite worker posting data

### Pitfall 6: Switch Statement Coverage Without Logic Validation
**What goes wrong:** Volumetry engine has 13 topology branches, all executed, but RAID 5E formula is still wrong
**Why it happens:** Branch coverage ≠ correctness validation
**How to avoid:**
- At minimum one validated test vector per switch case
- For complex cases (vSAN ESA adaptive efficiency), test multiple sub-branches
- Use table-driven tests to systematically cover all RAID levels
- Cross-reference against authoritative formulas (not just "does it run?")
**Warning signs:** 100% branch coverage but TEST-09 requirement (WintelGuy ±1%) fails

## Code Examples

Verified patterns from official sources and existing codebase:

### Floating-Point Comparison with Tolerance
```typescript
// Source: https://vitest.dev/api/expect.html#tobecloseto
import { expect, it } from 'vitest'

it('RAID 5 capacity calculation matches WintelGuy within 1%', () => {
  // WintelGuy reference: 8x 1TB drives RAID 5 = 7TB usable
  // Source: https://wintelguy.com/raidcalc.pl (manual verification)
  const input = createInput(8, { type: 'standard', level: 'RAID5' })
  const result = calculateVolumetry(input)

  const expectedGB = 7000
  const actualGB = result.usableCapacity / 1_000_000_000

  // 1% tolerance = 2 decimal places in percentage terms
  // Formula: Math.abs(expected - actual) < 0.5 * 10^(-precision)
  expect(actualGB).toBeCloseTo(expectedGB, 1) // ±5GB tolerance for 7TB
})
```

### Table-Driven RAID Test Vectors
```typescript
// Source: Existing volumetry.spec.ts + table-driven pattern
// tests/engines/volumetry.vectors.ts
export const standardRAIDVectors = [
  {
    name: 'RAID 0: 4x 1TB',
    level: 'RAID0' as const,
    drives: 4,
    driveSize: 1_000_000_000_000,
    expectedUsable: 4_000_000_000_000,
    tolerance: 0.02, // 2% for filesystem overhead
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 5: 8x 1TB',
    level: 'RAID5' as const,
    drives: 8,
    driveSize: 1_000_000_000_000,
    expectedUsable: 7_000_000_000_000,
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  {
    name: 'RAID 6: 12x 4TB',
    level: 'RAID6' as const,
    drives: 12,
    driveSize: 4_000_000_000_000,
    expectedUsable: 40_000_000_000_000,
    tolerance: 0.01,
    source: 'WintelGuy RAID Calculator',
    url: 'https://wintelguy.com/raidcalc.pl',
  },
  // Add vectors for RAID 1/1E/3/4/5E/5EE/10/50/60
]

// tests/engines/volumetry.spec.ts
import { describe, expect, test } from 'vitest'
import { standardRAIDVectors } from './volumetry.vectors'

describe.each(standardRAIDVectors)(
  'Standard RAID Capacity Validation',
  ({ name, level, drives, driveSize, expectedUsable, tolerance, source, url }) => {
    test(`${name} matches ${source}`, () => {
      const input = createInput(drives, { type: 'standard', level })
      const result = calculateVolumetry(input)

      const toleranceBytes = expectedUsable * tolerance
      expect(result.usableCapacity).toBeGreaterThan(expectedUsable - toleranceBytes)
      expect(result.usableCapacity).toBeLessThanOrEqual(expectedUsable + toleranceBytes)
    })
  }
)
```

### ZFS Overhead Validation (1/32 Slop Factor)
```typescript
// Source: https://openzfs.github.io/openzfs-docs/man/master/7/zpoolprops.7.html
import { expect, it } from 'vitest'

it('ZFS applies 1/32 slop factor overhead', () => {
  // OpenZFS spec: 1/(2^spa_slop_shift) reserved, default shift=5 (1/32)
  // Source: https://openzfs.github.io/openzfs-docs/Performance and Tuning/Module Parameters.html

  const input = createInput(4, { type: 'zfs', level: 'stripe' })
  const result = calculateVolumetry(input)

  const rawCapacity = 4_000_000_000_000 // 4TB total
  const expectedSlop = rawCapacity / 32 // ~125GB
  const expectedUsable = rawCapacity - expectedSlop

  // Account for both slop (3.125%) and filesystem overhead (~2%)
  expect(result.usableCapacity).toBeLessThan(rawCapacity * 0.95)
  expect(result.usableCapacity).toBeCloseTo(expectedUsable, -10) // ±10GB tolerance
})

it('ZFS slop has minimum 128MiB and maximum 128GiB', () => {
  // Small pool: slop should be at least 128MiB
  const smallInput = createInput(1, { type: 'zfs', level: 'stripe' })
  const smallResult = calculateVolumetry(smallInput)
  const smallSlop = smallInput.drive.capacity_raw - smallResult.usableCapacity
  expect(smallSlop).toBeGreaterThanOrEqual(128 * 1024 * 1024)

  // Huge pool: slop should cap at 128GiB
  const hugeInput = createInput(100, { type: 'zfs', level: 'stripe' })
  const hugeResult = calculateVolumetry(hugeInput)
  const hugeSlop = (hugeInput.drive.capacity_raw * 100) - hugeResult.usableCapacity
  expect(hugeSlop).toBeLessThanOrEqual(128 * 1024 * 1024 * 1024)
})
```

### VMware vSAN ESA Adaptive Efficiency
```typescript
// Source: https://blogs.vmware.com/cloud-foundation/2022/09/08/adaptive-raid-5-erasure-coding-with-the-express-storage-architecture-in-vsan-8/
import { expect, it } from 'vitest'

it('vSAN ESA adapts RAID-5 stripe width based on cluster size', () => {
  // VMware spec: 3-5 hosts = 2+1 (1.5x overhead), 6+ hosts = 4+1 (1.25x overhead)

  // Small cluster (4 hosts)
  const smallCluster = createInput(12, {
    type: 'vsan',
    vsanType: 'esa',
    ftt: 1,
    ftm: 'erasure',
  })
  smallCluster.serverCount = 4

  const smallResult = calculateVolumetry(smallCluster)
  const smallEfficiency = smallResult.usableCapacity / smallResult.rawCapacity

  // 2+1 scheme = 66.67% efficiency (1/1.5)
  expect(smallEfficiency).toBeCloseTo(0.6667, 2)

  // Large cluster (8 hosts)
  const largeCluster = { ...smallCluster }
  largeCluster.serverCount = 8

  const largeResult = calculateVolumetry(largeCluster)
  const largeEfficiency = largeResult.usableCapacity / largeResult.rawCapacity

  // 4+1 scheme = 80% efficiency (1/1.25)
  expect(largeEfficiency).toBeCloseTo(0.80, 2)
})
```

### RAID Write Penalty Validation
```typescript
// Source: https://www.massivegrid.com/blog/understanding-raid-write-penalties-raid-0-1-5-and-6-explained/
// Industry formula: RAID 5 = 4x penalty, RAID 6 = 6x penalty
import { expect, it } from 'vitest'

it('RAID 5 applies 4x write penalty for random I/O', () => {
  const input = createPerformanceInput('RAID5', 8, testDrive)
  const result = calculatePerformance(input)

  // Single drive: 150 IOPS write
  // RAID 5 random write: 150 / 4 = 37.5 IOPS per drive
  // 8 drives with 1 parity = 7 data drives × 37.5 = 262.5 total write IOPS
  const expectedWriteIOPS = (testDrive.performance.iops_write / 4) * 7

  expect(result.randomWriteIOPS).toBeCloseTo(expectedWriteIOPS, 0)
})

it('RAID 6 applies 6x write penalty for random I/O', () => {
  const input = createPerformanceInput('RAID6', 8, testDrive)
  const result = calculatePerformance(input)

  // RAID 6 formula: (drives - 2) × (single_drive_IOPS / 6)
  const expectedWriteIOPS = (testDrive.performance.iops_write / 6) * 6

  expect(result.randomWriteIOPS).toBeCloseTo(expectedWriteIOPS, 0)
})
```

### URE Probability Calculation
```typescript
// Source: https://www.diskinternals.com/raid-recovery/raid-5-rebuild-failure-probability/
import { expect, it } from 'vitest'

it('calculates URE probability during RAID rebuild', () => {
  // URE rate 10^14 = 1 error per 100TB read
  // Rebuilding 7x 4TB drives = reading 28TB
  // Probability = 1 - (1 - 1/10^14)^(28×10^12 bytes)

  const config = {
    raidLevel: 'RAID5',
    driveCount: 8,
    driveCapacityBytes: 4_000_000_000_000,
    ureRate: 14 as const, // 10^14
    rebuildSpeedMBs: 100,
    afrPercent: 1.0,
    simulationCount: 10000,
  }

  const result = calculateResilienceMetrics(config)

  // Expected URE probability ≈ 0.28% (28TB / 100TB)
  expect(result.ureRiskDuringRebuild).toBeGreaterThan(0.0025)
  expect(result.ureRiskDuringRebuild).toBeLessThan(0.0035)
})
```

### Backward Compatibility Migration Test
```typescript
// Source: https://vitest.dev/guide/snapshot + backward compatibility best practices
import { expect, it } from 'vitest'

it('migrates v1.0 URL format to v2.0 preserving configuration', () => {
  // Legacy format (v1.0): ?v=1.0&t=5&d=8&m=wd-gold-12tb&hs=1
  const legacyURL = 'v=1.0&t=5&d=8&m=wd-gold-12tb&hs=1'

  const deserialized = deserializeFromURL(legacyURL)

  // Should detect version and migrate
  expect(deserialized.version).toBe('2.0')
  expect(deserialized.topology.type).toBe('standard')
  expect(deserialized.topology.level).toBe('RAID5')
  expect(deserialized.driveCount).toBe(8)
  expect(deserialized.driveModel).toBe('wd-gold-12tb')
  expect(deserialized.hotSpares).toBe(1)

  // Re-serialization should use new format
  const reserialized = serializeToURL(deserialized)
  expect(reserialized).toContain('v=2.0')
  expect(reserialized).not.toContain('t=5') // Old topology encoding
})

it('snapshots current URL format for regression detection', () => {
  const config = {
    version: '2.0',
    topology: { type: 'standard', level: 'RAID5' },
    driveCount: 8,
    driveModel: 'wd-gold-12tb',
  }

  const serialized = serializeToURL(config)

  // If format changes unintentionally, this will fail
  expect(serialized).toMatchSnapshot()
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Istanbul coverage | V8 coverage with AST remapping | Vitest 3.2.0 (2024) | Same accuracy, 2-3x faster |
| happy-dom for all tests | jsdom for Web Workers | 2024 | MessageEvent compatibility |
| Manual test vectors | Property-based testing with fast-check | 2023+ | Discovers edge cases automatically |
| Exact Monte Carlo assertions | Statistical bounds + confidence intervals | Industry standard | Eliminates flaky tests |
| Hardcoded test data | Table-driven with test.each | Modern best practice | Easier to add/maintain cases |

**Deprecated/outdated:**
- **expect.closeTo() utility function**: Built into Vitest now as `toBeCloseTo()` matcher
- **Custom snapshot assertion libraries**: Vitest has native `toMatchSnapshot()` support
- **Separate Istanbul install**: V8 provider now handles branch coverage accurately

## Open Questions

Things that couldn't be fully resolved:

1. **WintelGuy Test Vector Extraction**
   - What we know: WintelGuy calculators exist for RAID, ZFS, vSAN, NetApp (19 RAID levels supported)
   - What's unclear: No published API or test vector dataset; requires manual calculation and recording
   - Recommendation: Create scripted extraction (Puppeteer/Playwright) or manually verify 5-10 key configurations per topology type and document as golden master fixtures

2. **OpenZFS ashift Padding Calculation**
   - What we know: ashift determines minimum IO size (2^ashift), affects alignment overhead
   - What's unclear: Exact formula for capacity loss due to padding on non-aligned recordsize
   - Recommendation: Test with OpenZFS documentation examples, accept 2-3% tolerance range for padding overhead combined with slop

3. **vSAN ESA Efficiency Range**
   - What we know: Adaptive RAID-5 uses 2+1 or 4+1 depending on cluster size
   - What's unclear: Exact efficiency for edge cases (exactly 6 hosts, mixed drive types, compression interaction)
   - Recommendation: Use VMware's documented ranges (67-80%), validate with VMware official calculator if available

4. **Monte Carlo Confidence Interval Formula**
   - What we know: Standard 95% CI = ±1.96 × sqrt(p(1-p)/n) for binomial distribution
   - What's unclear: Whether to use normal approximation or exact binomial for edge cases (very high/low survival rates)
   - Recommendation: Use normal approximation for p > 0.1 and n > 100; document assumption in code comments

5. **Legacy URL Format Support Depth**
   - What we know: Need backward compatibility for user-shared links
   - What's unclear: How many historical versions to maintain (v1.0, v1.1, v1.2...?)
   - Recommendation: Support one major version back (v2.x reads v1.x), snapshot test all formats, deprecate >2 years old with warning

## Sources

### Primary (HIGH confidence)
- [Vitest API Documentation - expect.toBeCloseTo()](https://vitest.dev/api/expect.html) - Floating-point comparison
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage) - V8 provider configuration and thresholds
- [Vitest Snapshot Testing](https://vitest.dev/guide/snapshot) - Backward compatibility testing
- [OpenZFS Module Parameters](https://openzfs.github.io/openzfs-docs/Performance and Tuning/Module Parameters.html) - Slop factor, ashift documentation
- [VMware vSAN ESA Adaptive RAID-5 Blog](https://blogs.vmware.com/cloud-foundation/2022/09/08/adaptive-raid-5-erasure-coding-with-the-express-storage-architecture-in-vsan-8/) - Efficiency formulas
- [fast-check Official Documentation](https://fast-check.dev/) - Property-based testing integration
- [WintelGuy RAID Capacity Calculator](https://wintelguy.com/raidcalc.pl) - Reference for test vectors
- [WintelGuy RAID Performance Calculator](https://wintelguy.com/raidperf.pl) - Write penalty validation

### Secondary (MEDIUM confidence)
- [Understanding RAID Write Penalties - MassiveGRID](https://www.massivegrid.com/blog/understanding-raid-write-penalties-raid-0-1-5-and-6-explained/) - Industry standard formulas
- [RAID 5 Rebuild Failure Probability - DiskInternals](https://www.diskinternals.com/raid-recovery/raid-5-rebuild-failure-probability/) - URE calculations
- [Table-Driven Testing with TypeScript - Brendan Goodenough](https://goodenough.nz/blog/table-driven-testing-with-typescript) - Parametric test patterns
- [Approval Tests Guide](https://understandlegacycode.com/approval-tests/) - Golden master testing
- [Vitest Web Worker Testing - GitHub Discussion](https://github.com/vitest-dev/vitest/discussions/1607) - jsdom vs happy-dom

### Tertiary (LOW confidence)
- [Monte Carlo A/B Testing Paper (arXiv)](https://arxiv.org/html/2411.06701v1) - Statistical validation concepts (general research, not JavaScript-specific)
- [Test Coverage Thresholds - Qt Blog](https://www.qt.io/quality-assurance/blog/is-70-80-90-or-100-code-coverage-good-enough) - Industry standards (C++/Qt context)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vitest already operational, fast-check is mature and widely adopted
- Architecture patterns: HIGH - Table-driven and property-based testing are established practices, examples verified against official docs
- Authoritative sources: MEDIUM - WintelGuy exists but no published test vector API; OpenZFS docs comprehensive but ashift padding formula unclear
- Monte Carlo validation: MEDIUM - Statistical formulas standard but application to specific RAID scenarios needs validation
- Web Worker testing: HIGH - jsdom approach verified in existing codebase, MessageEvent issue documented

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - stable domain, test frameworks evolve slowly)
