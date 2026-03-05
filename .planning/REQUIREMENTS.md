# Requirements: Raidy — Dependency Maintenance

**Defined:** 2026-03-05
**Core Value:** Calculation accuracy for storage infrastructure decisions. If Raidy gives wrong capacity numbers or resilience predictions, users could make incorrect (and costly) storage decisions. Everything else can fail; the math cannot.

## v1.1 Requirements

Requirements for milestone v1.1 Dependency Maintenance. Each maps to roadmap phases.

### Dependencies (Production)

- [x] **DEP-01**: Update dompurify from 3.3.1 to 3.3.2 (security library patch)
- [x] **DEP-02**: Update react-i18next from 16.5.4 to 16.5.5 (i18n library patch)

### Dev Dependencies

- [x] **DEVDEP-01**: Update @biomejs/biome from 2.3.11 to 2.4.6 (linter minor version)
- [x] **DEVDEP-02**: Update jsdom from 27.4.0 to 28.1.0 (test environment minor version)
- [x] **DEVDEP-03**: Update @types/node from 24.11.0 to 25.3.3 (Node.js type definitions major version)

### Verification

- [x] **VERIFY-01**: All automated tests pass after dependency updates (npm test — all tests green)
- [x] **VERIFY-02**: Linter passes with zero errors after updates (npm run lint)
- [x] **VERIFY-03**: TypeScript strict-mode typecheck passes after updates (npm run typecheck)
- [x] **VERIFY-04**: Production build succeeds without warnings after updates (npm run build)

## v2 Requirements

(None — dependency updates are fully scoped to v1.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Updating React, Vite, or Tailwind | Major framework versions — separate milestone due to higher risk |
| Adding new dependencies | Not part of this maintenance pass |
| Removing unused dependencies | Separate cleanup effort |
| Updating non-listed packages | Only packages flagged by `npm outdated` in scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEP-01 | Phase 7 | Complete |
| DEP-02 | Phase 7 | Complete |
| DEVDEP-01 | Phase 7 | Complete |
| DEVDEP-02 | Phase 7 | Complete |
| DEVDEP-03 | Phase 7 | Complete |
| VERIFY-01 | Phase 7 | Complete |
| VERIFY-02 | Phase 7 | Complete |
| VERIFY-03 | Phase 7 | Complete |
| VERIFY-04 | Phase 7 | Complete |

**Coverage:**
- v1.1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after initial definition*
