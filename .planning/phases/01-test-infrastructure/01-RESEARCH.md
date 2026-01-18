# Phase 1: Test Infrastructure - Research

**Researched:** 2026-01-18
**Domain:** Vitest test infrastructure for React + TypeScript applications
**Confidence:** HIGH

## Summary

Vitest 4.0 is a fast, modern testing framework built on Vite, offering native ESM and TypeScript support with a Jest-compatible API. For React 19 + TypeScript projects using Vite, the recommended stack is Vitest 4.x with V8 coverage provider, React Testing Library, and jsdom environment.

The project already has Vitest 4.0.16, @vitest/coverage-v8, and @vitest/ui installed. Configuration should be added to the existing vite.config.ts (not a separate vitest.config.ts file) to leverage existing path aliases and build configuration. Path aliases defined in vite.config.ts are automatically inherited by Vitest without additional mapping.

Vitest 4.0 includes breaking changes from v3: coverage.all option removed (replaced by coverage.include), poolOptions restructured to top-level maxWorkers, and improved V8 coverage with AST-based remapping for Istanbul-level accuracy at V8 speed.

**Primary recommendation:** Configure Vitest in vite.config.ts with jsdom environment, V8 coverage provider at 75-80% thresholds, and install React Testing Library dependencies (@testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom).

## Standard Stack

The established libraries/tools for React + TypeScript + Vitest testing:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.0.16 | Test runner and assertion library | Built for Vite, native ESM/TS, Jest-compatible API, 10x faster than Jest |
| @vitest/coverage-v8 | 4.0.16 | Code coverage reporting | V8 coverage with AST remapping = Istanbul accuracy + V8 speed |
| @testing-library/react | ^16.x | React component testing utilities | Industry standard, focuses on user behavior, React 19 compatible |
| @testing-library/jest-dom | ^6.x | Custom DOM matchers | Provides semantic matchers (toBeInTheDocument, toHaveClass) |
| jsdom | ^25.x | Browser environment emulation | Mature DOM implementation, wider API support than happy-dom |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/user-event | ^14.x | User interaction simulation | Realistic user events (click, type, hover) |
| @vitest/ui | 4.0.16 | Browser-based test UI | Visual test debugging, already installed |
| happy-dom | ^15.x | Lightweight DOM alternative | 2-3x faster than jsdom, use if APIs are sufficient |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsdom | happy-dom | Faster but missing advanced browser APIs (WebGL, SVG manipulation) |
| V8 coverage | Istanbul coverage | Slower execution, higher memory, but works in all runtimes (Bun, Cloudflare Workers) |
| vite.config.ts | vitest.config.ts | Separate file has higher priority but duplicates alias config |

**Installation:**
```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── engines/              # Calculation engines
│   └── __tests__/       # Engine tests (if using __tests__ pattern)
├── components/           # React components
│   └── __tests__/       # Component tests
├── utils/                # Utility functions
│   └── __tests__/       # Utility tests
└── test/
    └── setup.ts         # Global test setup file
```

### Pattern 1: Configuration in vite.config.ts (Recommended)
**What:** Add test configuration to existing vite.config.ts instead of separate vitest.config.ts
**When to use:** When Vitest should inherit Vite's resolve.alias, plugins, and build settings
**Example:**
```typescript
// Source: https://vitest.dev/config/
import { defineConfig } from 'vite'

export default defineConfig({
  // ... existing Vite config (plugins, resolve.alias, etc.)
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,ts,jsx,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.config.{js,ts}',
        'src/test/**',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
})
```

### Pattern 2: Global Test Setup File
**What:** Centralized setup for jest-dom matchers and test cleanup
**When to use:** Always - provides DOM matchers and automatic cleanup
**Example:**
```typescript
// Source: https://testing-library.com/docs/react-testing-library/setup/
// src/test/setup.ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Automatic cleanup after each test
afterEach(() => {
  cleanup()
})
```

### Pattern 3: Test File Naming Convention
**What:** Use `.test.ts` or `.spec.ts` suffix for test files
**When to use:** Default Vitest pattern, automatically discovered
**Example:**
```
src/engines/volumetry.ts          # Source file
src/engines/volumetry.test.ts     # Test file (discovered automatically)
```

### Pattern 4: TypeScript Path Alias Support
**What:** Vitest automatically inherits path aliases from vite.config.ts resolve.alias
**When to use:** Always - no additional configuration needed
**Example:**
```typescript
// Test file can use existing path aliases
import { calculateCapacity } from '@engines/volumetry'
import { Button } from '@components/ui/Button'
// No additional vitest.config.ts alias mapping required
```

### Anti-Patterns to Avoid
- **Separate vitest.config.ts without need:** Creates configuration duplication, aliases must be redefined. Only use if you need Vitest-specific overrides that conflict with Vite build config.
- **Manual cleanup calls in every test:** Use setupFiles with afterEach(cleanup) instead of calling cleanup in each test.
- **fireEvent over userEvent:** fireEvent dispatches DOM events directly; userEvent simulates real user interactions (better for testing behavior).
- **Testing implementation details:** Avoid testing internal state, function calls, or component structure. Test user-visible behavior.
- **Using getByTestId as first choice:** Follow query priority: getByRole > getByLabelText > getByPlaceholText > getByText > getByDisplayValue > getByTestId (last resort).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM matchers (element exists, has class, etc.) | Custom expect extensions | @testing-library/jest-dom | 50+ semantic matchers, handles edge cases (detached nodes, aria attributes) |
| User interaction simulation | Manual event.dispatchEvent() | @testing-library/user-event | Realistic interaction sequences (focus, blur, keyboard nav), accessibility checks |
| Path alias mapping to Vitest | Manual vitest.config.ts aliases or vite-tsconfig-paths plugin | Use existing vite.config.ts resolve.alias | Vitest inherits Vite aliases automatically, no duplication needed |
| Test environment setup | Custom jsdom initialization | Vitest environment: 'jsdom' config | Handles DOM globals (window, document), cleanup, and environment isolation |
| Coverage reporting | Custom coverage instrumentation | @vitest/coverage-v8 | V8 coverage with AST remapping = Istanbul accuracy at native speed |
| Async test utilities | setTimeout/setInterval polling | waitFor, findBy queries from RTL | Handles timing, retries, and provides clear error messages |

**Key insight:** Vitest + React Testing Library ecosystem is mature and handles edge cases that custom solutions miss (e.g., userEvent handles keyboard modifiers, focus management, clipboard API; jest-dom handles Shadow DOM, ARIA attributes).

## Common Pitfalls

### Pitfall 1: React 19 Peer Dependency Warnings
**What goes wrong:** npm install shows peer dependency warnings: "@testing-library/react expects react@^18.0.0"
**Why it happens:** @testing-library/react's package.json hasn't updated peerDependencies to include React 19 (as of Jan 2026)
**How to avoid:** Use `npm install --legacy-peer-deps` or add to .npmrc:
```
legacy-peer-deps=true
```
**Warning signs:** WARN messages during npm install mentioning React version mismatch
**Impact:** Cosmetic only - tests work correctly despite warnings. RTL is functionally compatible with React 19.

### Pitfall 2: Vitest 4.0 Coverage Configuration Breaking Changes
**What goes wrong:** Tests run but coverage fails with "coverage.all is not a valid option"
**Why it happens:** Vitest 4 removed coverage.all and coverage.extensions options
**How to avoid:** Use coverage.include pattern instead:
```typescript
// OLD (Vitest 3):
coverage: {
  all: true,
  extensions: ['.ts', '.tsx']
}

// NEW (Vitest 4):
coverage: {
  include: ['src/**/*.{ts,tsx}']
}
```
**Warning signs:** Error messages mentioning deprecated coverage options during test run
**Reference:** https://vitest.dev/guide/migration.html#vitest-4

### Pitfall 3: setupFiles Path Resolution Issues
**What goes wrong:** "Cannot find module './src/test/setup.ts'" error
**Why it happens:** setupFiles paths are resolved relative to project root, not vite.config.ts location
**How to avoid:** Use root-relative paths or absolute paths with __dirname:
```typescript
// WRONG:
setupFiles: ['./setup.ts']

// CORRECT (root-relative):
setupFiles: ['./src/test/setup.ts']

// CORRECT (absolute):
setupFiles: [resolve(__dirname, './src/test/setup.ts')]
```
**Warning signs:** Module resolution errors when running vitest, even though file exists

### Pitfall 4: Missing jsdom Installation
**What goes wrong:** Tests fail with "ReferenceError: document is not defined"
**Why it happens:** environment: 'jsdom' configured but jsdom package not installed
**How to avoid:** Install jsdom as devDependency:
```bash
npm install -D jsdom
```
**Warning signs:** Runtime errors referencing DOM globals (document, window, HTMLElement) in test output

### Pitfall 5: Forgetting globals: true Import Requirements
**What goes wrong:** Tests fail with "describe is not defined", "it is not defined"
**Why it happens:** If globals: false (or omitted), describe/it/expect must be imported in each test file
**How to avoid:** Either set globals: true in config OR import in every test:
```typescript
// With globals: true in config:
describe('MyComponent', () => { /* ... */ })

// With globals: false (default):
import { describe, it, expect } from 'vitest'
describe('MyComponent', () => { /* ... */ })
```
**Warning signs:** ReferenceError for test functions in test files

### Pitfall 6: __tests__ Directory Not Auto-Discovered
**What goes wrong:** Tests in src/components/__tests__/ not running
**Why it happens:** Default include pattern is **/*.{test,spec}.{js,ts,jsx,tsx}, which doesn't match __tests__ directories
**How to avoid:** Add to include pattern if using __tests__ convention:
```typescript
test: {
  include: [
    '**/*.{test,spec}.{js,ts,jsx,tsx}',
    '**/__tests__/**/*.{js,ts,jsx,tsx}'
  ]
}
```
**Warning signs:** Test count is lower than expected, specific directories silently skipped

## Code Examples

Verified patterns from official sources:

### Example 1: Basic Component Test with React Testing Library
```typescript
// Source: https://testing-library.com/docs/react-testing-library/setup/
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Button } from '@components/ui/Button'

describe('Button', () => {
  it('calls onClick handler when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Submit</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

### Example 2: Testing Pure Functions (Calculation Engines)
```typescript
// Source: https://vitest.dev/guide/
import { describe, it, expect } from 'vitest'
import { calculateRAID5Capacity } from '@engines/volumetry'

describe('calculateRAID5Capacity', () => {
  it('calculates usable capacity for 4 drives', () => {
    const result = calculateRAID5Capacity({
      driveCount: 4,
      driveCapacityBytes: 1_000_000_000_000, // 1TB
    })

    // RAID 5 with 4 drives = 3 drives usable
    expect(result.usableBytes).toBe(3_000_000_000_000)
    expect(result.efficiency).toBeCloseTo(0.75)
  })

  it('throws error for less than 3 drives', () => {
    expect(() => {
      calculateRAID5Capacity({ driveCount: 2, driveCapacityBytes: 1e12 })
    }).toThrow('RAID 5 requires at least 3 drives')
  })
})
```

### Example 3: Testing Async Operations
```typescript
// Source: https://testing-library.com/docs/react-testing-library/setup/
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DriveSelector } from '@components/DriveSelector'

describe('DriveSelector', () => {
  it('loads drive options from JSON', async () => {
    render(<DriveSelector />)

    // Wait for async data load
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    // Or use findBy queries (built-in waitFor)
    const selector = await screen.findByRole('combobox')
    expect(selector).toBeInTheDocument()
  })
})
```

### Example 4: Coverage Configuration in vite.config.ts
```typescript
// Source: https://vitest.dev/config/coverage
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@engines': resolve(__dirname, './src/engines'),
      '@components': resolve(__dirname, './src/components'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,ts,jsx,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.config.{js,ts}',
        'src/test/**',
        'src/main.tsx', // App entry point
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Jest + ts-jest + babel | Vitest native TS/ESM | Vitest 1.0 (2023) | 5-10x faster test execution, no transpilation config |
| coverage.all: true | coverage.include patterns | Vitest 4.0 (Dec 2024) | Explicit file inclusion, better performance |
| V8 coverage (fast, inaccurate) | V8 + AST remapping | Vitest 3.2.0 (2024) | Istanbul accuracy at V8 speed |
| poolOptions.threads.maxThreads | maxWorkers (top-level) | Vitest 4.0 (Dec 2024) | Simplified config, unified threads/forks |
| Separate @vitest/browser package | Included in provider packages | Vitest 4.0 (Dec 2024) | Cleaner dependencies |
| react-test-renderer | @testing-library/react | React 19 (2024) | react-test-renderer deprecated, RTL recommended |

**Deprecated/outdated:**
- **coverage.all option:** Removed in Vitest 4, use coverage.include instead
- **coverage.extensions option:** Removed in Vitest 4, use glob patterns in coverage.include
- **poolOptions configuration:** Restructured in Vitest 4, use top-level maxWorkers, isolate, execArgv
- **basic reporter:** Removed in Vitest 4, use default reporter with summary: false
- **react-test-renderer:** Deprecated in React 19, migrate to React Testing Library

## Open Questions

Things that couldn't be fully resolved:

1. **React 19 act() warnings persistence**
   - What we know: Multiple users report "not configured to support act(...)" warnings in React 19 + RTL + Vitest setups (GitHub issue #1413)
   - What's unclear: Whether this is resolved in latest RTL versions, or if it's a cosmetic warning
   - Recommendation: Monitor test output for act() warnings. If they appear and are cosmetic (tests pass), suppress with custom setup. If tests fail, investigate RTL version compatibility.
   - Source: https://github.com/testing-library/react-testing-library/issues/1413

2. **Optimal coverage threshold per file type**
   - What we know: Industry recommends 75-80% overall, but no consensus on per-module thresholds (UI components vs calculation engines vs utils)
   - What's unclear: Should calculation engines require 90%+ coverage while UI components stay at 70%?
   - Recommendation: Start with uniform 75% threshold. After baseline established, consider per-file thresholds using coverage.perFile configuration.

3. **happy-dom vs jsdom for this project**
   - What we know: happy-dom is 2-3x faster but missing some APIs; jsdom more complete
   - What's unclear: Which missing happy-dom APIs (if any) are used by Recharts, D3-sankey, jspdf
   - Recommendation: Start with jsdom (safe choice). If tests are slow, benchmark with happy-dom and verify all tests pass.

## Sources

### Primary (HIGH confidence)
- [Vitest Configuration Documentation](https://vitest.dev/config/) - Configuration structure, test options
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage) - V8 vs Istanbul, thresholds, reporters
- [Vitest 4.0 Announcement](https://vitest.dev/blog/vitest-4) - Breaking changes, new features
- [Vitest Migration Guide](https://vitest.dev/guide/migration.html) - v3 to v4 migration steps
- [React Testing Library Setup](https://testing-library.com/docs/react-testing-library/setup/) - RTL + Vitest integration
- [Vitest Test Environment](https://vitest.dev/guide/environment) - jsdom/happy-dom configuration

### Secondary (MEDIUM confidence)
- [OneUpTime React Vitest Guide (Jan 2026)](https://oneuptime.com/blog/post/2026-01-15-unit-test-react-vitest-testing-library/view) - Complete setup example
- [Upgrading to Vitest 3, Vite 6 and React 19](https://www.thecandidstartup.org/2025/03/31/vitest-3-vite-6-react-19.html) - Real-world upgrade experience
- [Google Testing Blog: Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html) - Industry coverage thresholds
- [Frontend Masters: Vitest Coverage Configuration](https://frontendmasters.com/courses/enterprise-ui-dev/vitest-code-coverage-configuration/) - Enterprise patterns
- [Vitest jsdom vs happy-dom Discussion](https://github.com/vitest-dev/vitest/discussions/1607) - Environment comparison

### Tertiary (LOW confidence)
- [React 19 RTL peer dependency conflicts (Medium)](https://medium.com/@zachshallbetter/resolving-react-19-dependency-conflicts-without-downgrading-ee0a808af2eb) - Community workaround
- [Vitest GitHub Discussion #7545](https://github.com/vitest-dev/vitest/discussions/7545) - React 19 + Vitest + MUI compatibility

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation, current versions verified, Jan 2026 guides
- Architecture: HIGH - Official Vitest docs, verified examples from RTL docs
- Pitfalls: HIGH - Official migration guide, community issues with verified fixes
- Coverage thresholds: MEDIUM - Industry consensus (75-80%) from multiple authoritative sources (Google, Codecov), but no absolute standard

**Research date:** 2026-01-18
**Valid until:** 2026-02-18 (30 days - stable technology)
**Technology maturity:** Stable - Vitest 4.0 released Dec 2024, API considered stable
