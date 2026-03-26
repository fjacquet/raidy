# Milestones

## v1.2 Dell Calculation Accuracy — shipped 2026-03-25

**Phases:** 8-13 (6 phases, 7 plans)
**Tests:** 645 → 881 (+236)
**Coverage:** 70% → 84.13%

**Accomplishments:**

1. PowerVault ADAPT formula: dynamic `((N-2)/N) * stripe_efficiency` replaces hardcoded 85%/87% (28pp error fix)
2. PowerStore DRE: drive-count-aware RAID-5/6 geometry replaces hardcoded 75%/80% (5-22pp error fix)
3. PowerStore system overhead: configurable 5% deduction matches Dell Sizer 5200Q within 2%
4. PowerScale N+x: uses serverCount (node count) instead of driveCount (19pp error fix)
5. PowerFlex/ObjectScale: 11 reference tests confirm correct EC/mirror formulas, zero divergence
6. Test coverage pushed to 84.13% with 236 new tests across utility, performance, and sustainability modules

**Archives:** [ROADMAP](milestones/v1.2-ROADMAP.md) | [REQUIREMENTS](milestones/v1.2-REQUIREMENTS.md)

---

## v1.1 Dependency Maintenance — shipped 2026-03-05

**Phases:** 7 (1 phase, 3 plans)

**Accomplishments:**

1. Updated dompurify 3.3.1→3.3.2 and react-i18next 16.5.4→16.5.5
2. Updated @biomejs/biome 2.3.11→2.4.6, jsdom 27.4→28.1, @types/node 24.11→25.3
3. All quality gates verified passing after updates

---

## v1.0 Production Ready — shipped 2026-01-18

**Phases:** 1-6 (6 phases, 30 plans)

**Accomplishments:**

1. Test infrastructure with Vitest, coverage thresholds, and path aliases
2. Calculation validation against WintelGuy, OpenZFS, and vendor documentation
3. Security hardening with Zod schemas, DOMPurify, CSP headers
4. Code quality with strategy pattern refactoring, error boundaries, exhaustive type checking
5. Extracted monolithic components into per-topology panels and strategy modules
