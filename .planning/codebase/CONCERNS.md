# Codebase Concerns

**Analysis Date:** 2026-01-16

## Tech Debt

**No Test Coverage:**

- Issue: The codebase has zero test files despite vitest being configured in `package.json`
- Files: `/tests/engines/` (empty directory), no `*.test.ts` or `*.spec.ts` files anywhere
- Impact: No automated verification of RAID calculations, capacity formulas, or Monte Carlo simulations. High risk of regressions when making changes to calculation engines.
- Fix approach: Create unit tests starting with critical engines (`src/engines/volumetry/index.ts`, `src/engines/performance/index.ts`, `src/workers/resilienceWorker.ts`). Per CLAUDE.md requirements, validate RAID 5/6 math against industry formulas and ZFS overhead against OpenZFS documentation.

**Massive TopologyPanel Component:**

- Issue: `src/components/inputs/TopologyPanel.tsx` is 1647 lines - a monolithic component handling all 13+ topology types
- Files: `src/components/inputs/TopologyPanel.tsx`
- Impact: Difficult to maintain, test, and modify. Adding new topologies requires editing this large file. High cognitive load for developers.
- Fix approach: Extract each topology's options panel into separate components (e.g., `ZfsOptionsPanel.tsx`, `VsanOptionsPanel.tsx`, `CephOptionsPanel.tsx`). Use composition pattern with shared form controls.

**Large Calculation Engines:**

- Issue: Volumetry engine has 1044 lines with complex branching for 13 topology types
- Files: `src/engines/volumetry/index.ts`, `src/engines/performance/index.ts` (734 lines)
- Impact: `getDataFraction()` function has 500+ lines of switch statements. High cyclomatic complexity. Hard to verify correctness.
- Fix approach: Extract topology-specific calculations into separate modules (e.g., `volumetry/zfs.ts`, `volumetry/vsan.ts`). Use strategy pattern for topology-specific logic.

**Worker Abort Not Implemented:**

- Issue: Monte Carlo worker has placeholder for abort functionality
- Files: `src/workers/resilienceWorker.ts:275-276`
- Impact: Users cannot cancel long-running simulations (100,000 iterations). Potential for unresponsive UI during heavy calculations.
- Fix approach: Implement cooperative cancellation using a flag checked in the simulation loop. Consider Web Worker `AbortController` pattern.

**Missing Vitest Configuration:**

- Issue: No `vitest.config.ts` file despite vitest being a dependency
- Files: `vite.config.ts` (exists but no vitest config section)
- Impact: Test framework not properly configured. `npm test` fails with "No test files found"
- Fix approach: Add vitest configuration to `vite.config.ts` or create separate `vitest.config.ts` with proper test setup, coverage thresholds, and path aliases.

## Known Bugs

**URL State Parsing Fails Silently:**

- Symptoms: Invalid URL hash state is swallowed with console.warn, app falls back to defaults
- Files: `src/store/urlStorage.ts:27-29`
- Trigger: Share a malformed URL or manually edit URL hash
- Workaround: App gracefully degrades to default state, but user loses shared configuration

## Security Considerations

**URL Hash State Injection:**

- Risk: Configuration is stored in URL hash using LZ-string compression. Malicious URLs could inject unexpected state values.
- Files: `src/store/urlStorage.ts`, `src/store/configStore.ts`
- Current mitigation: LZ-string compression adds some obfuscation; TypeScript types enforce shape; Zustand persist validates version
- Recommendations: Add explicit validation layer for all deserialized state values. Implement bounds checking on numeric inputs. Add Content Security Policy for static deployment.

**Client-Side PDF Generation:**

- Risk: jspdf processes user-provided configuration data for PDF export
- Files: `src/utils/exportPdf.ts`
- Current mitigation: No user-provided HTML/text directly rendered
- Recommendations: Ensure all values are sanitized before PDF rendering. Review jspdf usage for any XSS vectors.

**No Rate Limiting on Monte Carlo:**

- Risk: Monte Carlo simulation runs 100,000 iterations with no resource limits
- Files: `src/workers/resilienceWorker.ts`, `src/hooks/useResilience.ts`
- Current mitigation: Web Worker runs in separate thread, doesn't block UI
- Recommendations: Add iteration limits. Consider mobile device detection to reduce simulation count. Add memory monitoring.

## Performance Bottlenecks

**Monte Carlo Simulation:**

- Problem: 100,000 iterations run synchronously within Web Worker
- Files: `src/workers/resilienceWorker.ts:193-223`
- Cause: Single-threaded loop without yielding. Progress updates every 1% (1000 iterations)
- Improvement path: Split into smaller chunks with `setTimeout(0)` between batches. Consider Web Worker pool for parallel simulation. Reduce default to 10,000 iterations with option to run more.

**Recalculation on Every State Change:**

- Problem: All calculations re-run when any configuration changes
- Files: `src/hooks/useCalculations.ts`, React effects in dashboard
- Cause: No memoization boundaries between independent calculations
- Improvement path: Add selective memoization using `useMemo` with proper dependency arrays. Consider `react-query` or similar for caching expensive calculations.

**Large Dependency Chunks:**

- Problem: jspdf + jspdf-autotable bundle is ~600KB
- Files: `vite.config.ts:30` (chunkSizeWarningLimit raised to 700KB)
- Cause: PDF generation libraries are inherently large
- Improvement path: Currently using lazy loading via manual chunks. Could add dynamic import for PDF export to defer loading until first use.

## Fragile Areas

**Topology Type Switch Statements:**

- Files: `src/engines/volumetry/index.ts:186-509`, `src/engines/performance/index.ts:121-364`
- Why fragile: Adding a new topology type requires changes in 5+ switch statements across multiple files. Missing a case results in incorrect calculations with no compile-time error.
- Safe modification: When adding new topology, grep for all `topology.type` or `topology.level` switch statements. Add exhaustive type checking with TypeScript.
- Test coverage: None - high risk area

**URL State Schema:**

- Files: `src/store/configStore.ts:165-202`
- Why fragile: URL state must remain backward compatible. Changing property names or types breaks shared links.
- Safe modification: Use versioned schema with migration functions. Never rename existing properties.
- Test coverage: None

**Monte Carlo Formula Accuracy:**

- Files: `src/workers/resilienceWorker.ts:59-177`
- Why fragile: Statistical model includes correlated failures, URE calculations, stress factors. Subtle bugs could produce misleading survival rates.
- Safe modification: Document all formulas with sources. Validate against industry benchmarks.
- Test coverage: None - critical gap

## Scaling Limits

**Web Worker Memory:**

- Current capacity: Handles 100,000 simulations
- Limit: Browser memory limits (~2GB on most browsers)
- Scaling path: Current implementation is memory-efficient (no large arrays). Main concern is mobile devices with 1GB limits.

**URL Length:**

- Current capacity: LZ-string compression keeps URLs manageable (~1-2KB for typical configs)
- Limit: ~2000 characters for universal browser compatibility
- Scaling path: Add fallback to localStorage if URL exceeds limit. Show warning to users.

**Drive Database:**

- Current capacity: `src/data/drives.json` loaded entirely at startup
- Limit: Not tested with large drive databases
- Scaling path: If drive count exceeds 1000+, consider lazy loading or search indexing.

## Dependencies at Risk

**React 19 (Pre-release):**

- Risk: Using React 19.2.0 which is recent/cutting-edge
- Impact: Potential for undiscovered bugs, breaking changes in minor versions
- Migration plan: Monitor React 19 stability. Have rollback plan to React 18 if issues arise.

**Tailwind v4 (Recently Released):**

- Risk: Using Tailwind CSS v4.1.18 with new Vite plugin
- Impact: New major version, potential configuration differences from v3
- Migration plan: Monitor for issues. Most styling is standard utility classes.

**html2canvas (PDF dependency):**

- Risk: Listed in vite config manual chunks but may not be actively used
- Impact: Adds to bundle size without benefit
- Migration plan: Audit PDF export to confirm if html2canvas is needed. Remove if unused.

## Missing Critical Features

**Input Validation:**

- Problem: No comprehensive validation on user inputs before calculation
- Blocks: Invalid configurations (e.g., RAID5 with 2 drives) pass to engines before validators catch them
- Files: Validators exist in `src/utils/validators.ts` but only produce alerts, don't prevent calculations

**Error Boundaries:**

- Problem: No React error boundaries around calculation-heavy components
- Blocks: A calculation error could crash the entire app instead of showing graceful error
- Files: No error boundary components found

**Offline Support:**

- Problem: PWA capabilities mentioned in CLAUDE.md but no service worker found
- Blocks: App cannot work offline despite being a static SPA

## Test Coverage Gaps

**Calculation Engines (Critical):**

- What's not tested: RAID capacity formulas, ZFS overhead calculations, parity efficiency, write penalties
- Files: `src/engines/volumetry/index.ts`, `src/engines/performance/index.ts`
- Risk: Core value proposition of the app depends on calculation accuracy. Bugs could mislead users into incorrect storage decisions.
- Priority: **Critical** - These must be tested first

**Monte Carlo Simulation:**

- What's not tested: Statistical accuracy, URE probability calculations, correlated failure modeling
- Files: `src/workers/resilienceWorker.ts`
- Risk: Incorrect survival rate predictions could give false confidence in storage resilience
- Priority: **High**

**URL State Persistence:**

- What's not tested: Serialize/deserialize roundtrip, backward compatibility, compression/decompression
- Files: `src/store/urlStorage.ts`, `src/store/configStore.ts`
- Risk: Shared URLs could break or produce wrong configurations
- Priority: **Medium**

**Form Validation:**

- What's not tested: Validator rules, alert generation, error/warning classification
- Files: `src/utils/validators.ts`
- Risk: Users could configure invalid setups without warnings
- Priority: **Medium**

**UI Components:**

- What's not tested: Form controls, dashboard rendering, responsive behavior
- Files: `src/components/**/*`
- Risk: Visual regressions, accessibility issues, mobile breakage
- Priority: **Low** - Less critical than calculation accuracy

---

_Concerns audit: 2026-01-16_
