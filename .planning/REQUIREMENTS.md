# Requirements

## v1 Requirements

### Testing & Validation

**Calculation Engine Tests:**
- [ ] **TEST-01**: Volumetry engine has unit tests for all RAID levels (0/1/1E/3/4/5/5E/5EE/6/10/50/60) with known capacity values
- [ ] **TEST-02**: Volumetry engine has unit tests for all ZFS topologies (Stripe/Mirror/RAID-Z1/Z2/Z3/dRAID1/2/3) with ZFS overhead validation
- [ ] **TEST-03**: Volumetry engine has unit tests for vSAN (OSA/ESA), S2D, Ceph, Nutanix topologies
- [ ] **TEST-04**: Performance engine has unit tests for IOPS calculations with write penalty validation (R5/R6)
- [ ] **TEST-05**: Performance engine has unit tests for bottleneck chain logic (media/controller/bus/network)
- [ ] **TEST-06**: Monte Carlo resilience worker has unit tests for URE probability calculations
- [ ] **TEST-07**: Monte Carlo resilience worker has unit tests for correlated failure modeling
- [ ] **TEST-08**: Monte Carlo resilience worker has statistical accuracy validation (confidence intervals)

**Industry Validation:**
- [ ] **TEST-09**: RAID 5/6 capacity calculations match WintelGuy calculator within 1% for standard configurations
- [ ] **TEST-10**: ZFS overhead calculations match OpenZFS documentation for slop factor, ashift padding
- [ ] **TEST-11**: vSAN efficiency matches VMware documentation for ESA/OSA adaptive efficiency ranges
- [ ] **TEST-12**: Performance write penalties match industry formulas (RAID 5 = 4x, RAID 6 = 6x)

**Infrastructure:**
- [ ] **TEST-13**: Vitest configuration is properly set up with coverage thresholds and path aliases
- [ ] **TEST-14**: URL state serialization/deserialization roundtrip tests with backward compatibility validation
- [ ] **TEST-15**: Form validator tests for all validation rules (min drives, valid RAID configs, etc.)
- [ ] **TEST-16**: Coverage reporting is configured and enforces minimum thresholds (80%+ for calculation engines)

### Security

**Input Validation:**
- [ ] **SEC-01**: URL state deserialization validates all numeric values against min/max bounds
- [ ] **SEC-02**: URL state deserialization validates topology type against allowed enum values
- [ ] **SEC-03**: All form inputs have server-side style validation before reaching calculation engines
- [ ] **SEC-04**: Drive count, capacity, and performance values are sanitized and bounds-checked
- [ ] **SEC-05**: Configuration state validation rejects malformed or out-of-range values with clear error messages

**Application Security:**
- [ ] **SEC-06**: Content Security Policy headers are configured for static deployment (Vercel/Netlify/GitHub Pages)
- [ ] **SEC-07**: PDF export sanitizes all user-provided values before jspdf rendering
- [ ] **SEC-08**: PDF generation has XSS vector review for text insertion points
- [ ] **SEC-09**: Dependency vulnerability scan passes with zero high/critical vulnerabilities (Snyk)
- [ ] **SEC-10**: LZ-string decompression has error handling for malicious payloads

### Code Quality

**Component Refactoring:**
- [ ] **QUAL-01**: TopologyPanel component is split into per-topology option components (ZfsOptionsPanel, VsanOptionsPanel, etc.)
- [ ] **QUAL-02**: Topology option components use composition pattern with shared form controls
- [ ] **QUAL-03**: Volumetry engine extracts topology-specific logic into separate modules (volumetry/raid.ts, volumetry/zfs.ts, etc.)
- [ ] **QUAL-04**: Volumetry engine uses strategy pattern for topology-specific calculations
- [ ] **QUAL-05**: Performance engine extracts topology-specific logic into separate modules
- [ ] **QUAL-06**: Calculation engines have reduced cyclomatic complexity (max 10 per function)

**Error Handling:**
- [ ] **QUAL-07**: React error boundary wraps calculation dashboard to catch engine failures
- [ ] **QUAL-08**: React error boundary shows user-friendly error message with "Reset Configuration" action
- [ ] **QUAL-09**: Invalid configuration validation prevents calculations from running (not just warnings)
- [ ] **QUAL-10**: Calculation engine errors are logged with context for debugging
- [ ] **QUAL-11**: URL hash parsing failures show user notification instead of silent console.warn

**Code Health:**
- [ ] **QUAL-12**: All Biome lint errors are fixed (zero warnings/errors)
- [ ] **QUAL-13**: TypeScript strict mode violations are resolved
- [ ] **QUAL-14**: Unused dependencies are removed (html2canvas audit)
- [ ] **QUAL-15**: Fragile switch statements use exhaustive type checking with TypeScript

### Performance

**Optimization:**
- [ ] **PERF-01**: Calculation hooks use useMemo with proper dependency arrays to prevent unnecessary recalculation
- [ ] **PERF-02**: Volumetry, performance, and sustainability calculations are independently memoized
- [ ] **PERF-03**: Monte Carlo worker supports abort/cancellation via AbortController pattern
- [ ] **PERF-04**: Monte Carlo default iterations reduced from 100,000 to 10,000 with "Run Extended" option
- [ ] **PERF-05**: Monte Carlo simulation splits into chunks with cooperative yielding (setTimeout batches)

**Bundle Optimization:**
- [ ] **PERF-06**: Unused dependencies are audited and removed (html2canvas, others)
- [ ] **PERF-07**: PDF export is dynamically imported to defer loading until first use
- [ ] **PERF-08**: Bundle size stays under 2MB total with proper chunking strategy

### Bug Fixes

- [ ] **BUG-01**: URL hash state parsing shows user notification on failure (not silent)
- [ ] **BUG-02**: Monte Carlo worker implements abort functionality (currently placeholder)
- [ ] **BUG-03**: Vitest configuration file exists with proper test setup

### Production Validation

- [ ] **PROD-01**: All tests pass in CI/CD pipeline (GitHub Actions)
- [ ] **PROD-02**: Build completes with zero TypeScript errors
- [ ] **PROD-03**: Lint passes with zero Biome errors/warnings
- [ ] **PROD-04**: Security scan passes with zero high/critical vulnerabilities
- [ ] **PROD-05**: Production build is tested and verified on GitHub Pages deployment path

## v2 Requirements

<!-- Deferred improvements, not blocking launch -->

- **PWA-01**: Service worker implementation for offline support
- **PWA-02**: App manifest with install prompt for mobile
- **PERF-09**: Web Worker pool for parallel Monte Carlo simulations
- **PERF-10**: Advanced memoization with react-query for calculation caching
- **QUAL-16**: Component library extraction for shared form controls
- **QUAL-17**: Accessibility audit (WCAG 2.1 AA compliance)
- **TEST-17**: Visual regression testing for dashboard components
- **TEST-18**: E2E tests for critical user flows (configure → calculate → export)

## Out of Scope

- **Backend infrastructure** — Raidy must remain static client-side SPA, no server-side processing or databases
- **Calculation algorithm changes** — Only validate existing math, don't modify proven formulas without explicit validation
- **Breaking URL schema changes** — Shared links must remain valid, requires versioned migration if needed
- **Mobile native apps** — PWA/responsive web is sufficient delivery mechanism
- **User accounts or saved configs** — URL sharing handles persistence needs
- **Real-time collaboration** — Single-user calculation tool
- **Custom drive database editing** — Users work with provided drive specifications
- **Legacy browser support** — No IE11, only modern ES2022 browsers

## Traceability

<!-- Updated by roadmapper with phase mappings -->

| Requirement | Phase | Status |
|-------------|-------|--------|
| (To be filled by roadmapper) | | |

---
*Last updated: 2026-01-17*
