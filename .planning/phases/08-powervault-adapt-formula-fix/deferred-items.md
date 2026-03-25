# Deferred Items - Phase 08

## Out-of-Scope Pre-existing Issues

### Coverage Below 75% Threshold

**Discovered during:** Task 3 final validation
**Issue:** `npm run test:coverage` reports coverage for lines/functions/statements/branches at ~69-70%, below the 75% threshold configured in vitest.config.ts
**Status:** Pre-existing before Phase 08 — our changes (adding new tests) only improve coverage
**Scope:** Out of scope — unrelated to PowerVault ADAPT formula fix
**Recommended action:** Dedicate a plan to add tests for uncovered code paths in `src/engines/` and `src/workers/`

### resilienceWorker.ts lint warnings

**Discovered during:** Task 2 lint check
**Issue:** Multiple `lint/style/noNonNullAssertion` warnings in `src/workers/resilienceWorker.ts` (lines 198+)
**Status:** Pre-existing, warns only (not errors per CLAUDE.md: `noNonNullAssertion: warn`)
**Scope:** Out of scope
**Recommended action:** Review and replace `!` assertions with proper null checks

### .planning/config.json formatting

**Discovered during:** Task 2 lint check
**Issue:** Biome formatter reports `.planning/config.json` missing trailing newline
**Status:** Pre-existing
**Scope:** Out of scope (planning file, not source code)
