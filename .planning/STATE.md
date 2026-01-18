# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

**Current focus:** Phase 2 - Calculation Validation

## Current Position

Phase: 2 of 6 (Calculation Validation)
Plan: 3 of X (Performance Engine Validation)
Status: In progress
Last activity: 2026-01-18 - Completed 02-03-PLAN.md (Performance Engine Validation)

Progress: ███░░░░░░░ 33% (5/15 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 4.6 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 - Test Infrastructure | 2/2 | 3min | 1.5min |
| 2 - Calculation Validation | 3/X | 20min | 6.7min |

## Accumulated Context

### Decisions

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01-01 | Coverage thresholds set at 75% | Research recommended 75-80% for production-ready projects. Provides quality gate while remaining achievable for complex calculation engines. |
| 01-01 | Use jsdom environment for tests | Required for React component testing - provides browser globals (document, window, HTMLElement) not available in node environment. |
| 01-01 | setupFiles references ./src/test/setup.ts | Prepares jest-dom matchers and test cleanup (file created in Plan 01-02). |
| 01-02 | Global jest-dom matchers via setup file | Provides semantic DOM matchers globally to avoid repeated imports in every test file. Cleaner test code. |
| 01-02 | Automatic cleanup after each test | Prevents memory leaks and state pollution between tests using afterEach cleanup hook. |
| 02-01 | WintelGuy RAID Calculator as industry reference | Industry-standard calculator, widely trusted, easy to verify manually. 1% tolerance accounts for filesystem overhead variations. |
| 02-01 | Table-driven testing with describe.each | Reduces code duplication, makes adding test vectors trivial, provides clear failure messages. |
| 02-01 | Property-based testing with fast-check | Discovers edge cases manual tests miss, validates formulas across wide input ranges. 50 runs per test for balance. |
| 02-01 | Write penalty formulas documented in tests | Critical for Module B (Performance Engine) implementation. Establishes industry-validated formulas early. |
| 02-03 | MassiveGRID and WintelGuy as industry references | Industry-standard sources for write penalty validation, widely cited in storage documentation. Formulas match real-world behavior. |
| 02-03 | Bottleneck chain testing approach | Test all four bottleneck layers (media/controller/bus/network) with Math.min logic to help users identify performance-limiting factors. |
| 02-03 | Property-based IOPS validation | Validate IOPS scaling behavior across wide range of configurations. Ensures formulas work correctly for all drive counts and types. |
| 02-03 | XFS alignment calculation validation | Correct XFS alignment critical for optimal performance. Validate sunit/swidth formulas (swidth = sunit × data_drives). |
| 02-05 | Future URL versioning strategy documented | Prepares for v2.0 migration when breaking changes needed. Pattern: #v=2.0 param, version detection, legacy migration. |
| 02-05 | Table-driven validator tests for systematic coverage | Array of test cases with expectedErrorCode ensures all topology constraints validated. Easy to extend. |
| 02-05 | Error messages must explain WHY and HOW to fix | User-facing validation requires actionable feedback. Messages include minimum requirements and specific recommendations. |
| 02-05 | Browser API mocking with vi.stubGlobal | URL storage uses window/navigator APIs. Per-test mocking keeps tests fast without browser automation. |

### Pending Todos

(None yet)

### Blockers/Concerns

(None yet)

## Session Continuity

Last session: 2026-01-18T06:30:05Z
Stopped at: Completed 02-03-PLAN.md (Performance Engine Validation)
Resume file: None - Phase 2 in progress
