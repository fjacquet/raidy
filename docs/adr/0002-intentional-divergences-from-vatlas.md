# ADR 0002 — Intentional divergences from vatlas

- **Status:** Accepted
- **Date:** 2026-05-24

## Context

Raidy and **vatlas** are sibling single-page apps that share a stack (React 19, Vite 8, Tailwind v4, Biome, Zustand 5, Vitest, react-i18next) and, as of this milestone, share developer conventions: Biome config, TypeScript layout, the test-typecheck split, dependency versions, the CI/security pipeline, and documentation structure (see [ADR-0001](./0001-supply-chain-audit-gate.md)).

That convergence is deliberate and ongoing. This ADR records the places where raidy **intentionally differs** from vatlas, so the differences are understood as product decisions rather than drift to be "fixed."

## Decision — these divergences are intentional and stay

| Area | vatlas | raidy | Why raidy differs |
|---|---|---|---|
| **State persistence** | Privacy-first: zero browser storage of data; refresh = data gone | Zustand state serialized to the URL hash (LZ-String) | "Copy URL to Share" is a core raidy feature — a scenario must be reproducible from a link. raidy has no sensitive payload (it's a calculator), so there is no privacy invariant to protect. |
| **Store shape** | Inputs-only `Map`, all derivation in a single `useEstateView` `useMemo` | Slice-based store + focused calculation hooks | raidy's inputs map cleanly to independent slices (hardware/topology/workload/advanced) and per-engine hooks. |
| **i18n languages** | EN, FR | EN, FR, DE, IT (Swiss locales) | raidy targets the Swiss market; four national languages with apostrophe number formatting. |
| **Charts** | Centralized ECharts (SVG renderer), bundle-gated | Recharts + D3-sankey + custom gauges | raidy's visuals (capacity waterfall/Sankey, speedometers, donut) predate the convergence and are not worth a rewrite. |
| **Service worker / PWA** | `vite-plugin-pwa` (audited `src/sw.ts`) | none | Not a product requirement for raidy. |
| **Supply-chain checks** | SheetJS CDN-tarball pin + SW privacy-guard envelope | telemetry denylist only | raidy has no `xlsx` dependency and no service worker, so those checks are inapplicable. |
| **PPTX export theme** | Fixed "Midnight" deck — ignores the app theme | Follows the app's light/dark theme (light deck in light mode, dark deck in dark) | raidy users wanted the export to match what they see; charts are already theme-aware, so the deck adapts via a light/dark `BRAND` palette + theme-matched capture background. |

## Consequences

- The shared conventions (tooling, CI, docs) are kept in sync with vatlas; the rows above are explicitly out of scope for any future "make it match vatlas" effort.
- If any of these product decisions changes (e.g. raidy adds a privacy mode, or migrates charts), update this ADR rather than silently diverging further.
