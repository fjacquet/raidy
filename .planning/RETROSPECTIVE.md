# Retrospective

## Milestone: v1.2 — Dell Calculation Accuracy

**Shipped:** 2026-03-25
**Phases:** 6 | **Plans:** 7

### What Was Built

- PowerVault ADAPT: dynamic formula replaces hardcoded constants (28pp error fix)
- PowerStore DRE: drive-count-aware RAID-5/6 geometry (5-22pp error fix)
- PowerStore system overhead: configurable 5% deduction matching Dell Sizer
- PowerScale N+x: serverCount fix for multi-drive-per-node clusters (19pp error fix)
- PowerFlex/ObjectScale: 11 reference validation tests (zero divergence found)
- Test coverage pushed from 70% to 84.13% with 236 new tests

### What Worked

- **TDD protocol (skip→RED→GREEN→delete)** — Prevented testing wrong formulas; every fix was validated against external reference before code changed
- **Dell Sizer as single source of truth** — Having a concrete reference tool eliminated ambiguity about correct values
- **Strategy pattern** — All Dell platform fixes were surgical changes to individual strategy files; no cascading changes needed
- **Parallel validation phases** — PowerFlex/ObjectScale (Phase 12) ran independently from PowerStore/PowerScale work
- **Reference vector fixtures** — Centralized `dell-vectors.ts` file made tests self-documenting with source citations

### What Was Inefficient

- **Coverage threshold discovery** — Didn't realize coverage was below 75% until Phase 13 planning; could have tracked this earlier
- **RTK output truncation** — Rust Token Killer truncated vitest coverage output, requiring workaround (direct node invocation); wasted debugging time

### Patterns Established

- Dell reference vector pattern: typed interface + array of vectors in `tests/fixtures/dell-vectors.ts`
- `describe.each(vectors)` for parametric validation tests
- Platform system overhead pattern: configurable field on PlatformOptions → overheadCalculator → breakdown entry
- Options threading through `calculateDataFraction(level, driveCount, options?)` for platform-specific parameters

### Key Lessons

- **Always check coverage before milestone's final phase** — would have avoided surprise coverage gap
- **Dell KB articles are more reliable than guessing** — KB 000188491 had exact DRE thresholds
- **Validation-only phases are valuable** — Phase 12 found zero issues, confirming existing code was correct; this confidence is worth the investment

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 | v1.2 |
|--------|------|------|------|
| Phases | 6 | 1 | 6 |
| Plans | 30 | 3 | 7 |
| Tests at end | ~645 | ~645 | 881 |
| Coverage at end | ~70% | ~70% | 84.13% |
