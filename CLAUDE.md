# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **See Also**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system architecture and data flow. Also in `docs/`: [ENGINES.md](./docs/ENGINES.md) (per-platform formulas and their sources), [USER-GUIDE.md](./docs/USER-GUIDE.md), [DEVELOPMENT.md](./docs/DEVELOPMENT.md), [TESTING.md](./docs/TESTING.md), [CONFIGURATION.md](./docs/CONFIGURATION.md) (CI & security gates), [GETTING-STARTED.md](./docs/GETTING-STARTED.md), [SECURITY.md](./docs/SECURITY.md), [adr/](./docs/adr/) (architecture decisions), and [vendor-specs/](./docs/vendor-specs/) (the source material the engines were built from).
>
> **Docs stay in sync with code.** Any change to config, CI, dependencies, or behavior must update the matching doc in `docs/` (and `README.md`/`CHANGELOG.md` where relevant) in the *same commit*. Stale docs are treated as a defect, not a follow-up.

## Project Overview

**Raidy** is a browser-based simulator for modern storage infrastructure (RAID, ZFS, vSAN, S2D, Nutanix, Dell, NetApp, Ceph, Synology, Longhorn, BeeGFS). Single Page Application with no backend — all calculation logic runs client-side. State is persisted in the URL hash via LZ-String compression, enabling "Copy URL to Share".

## Build & Development Commands

```bash
npm install            # Install dependencies
npm run dev            # Development server (Vite HMR)
npm run build          # Type check + production build
npm run typecheck      # TypeScript strict mode validation
npm run lint           # Biome linter
npm run lint:fix       # Biome auto-fix
npm run format         # Biome formatter
npm test               # Run tests (Vitest, watch mode)
npm test -- path/to/test.spec.ts   # Single test file
npm run test:run       # Single CI-style pass
npm run test:coverage  # Coverage report (75% threshold on engines/workers/utils)
npm run test:ui        # Vitest browser UI
npm run check:dead     # Knip — unused exports, files, deps. Pre-commit hook AND prebuild.
npm run check:supply-chain   # Telemetry denylist. Also prebuild.
npm run check:bundle-size    # Gz budgets, after a build
```

`npm install` arms `.githooks/pre-commit` (via the `prepare` script), which runs `check:dead`.
`npm run build` runs both `check:supply-chain` and `check:dead` first, so `--no-verify` defers a
failure to build time rather than avoiding it.

A `Makefile` wraps these commands: `make dev`, `make build`, `make test`, `make all` (lint + typecheck + build).

## Code Style (Biome)

- **Formatter**: 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **Linter**: `noUnusedImports: error`, `noUnusedVariables: error`, `useConst: error`, `noNonNullAssertion: warn`
- Run `npm run lint:fix` before committing

## Path Aliases

`@/*`, `@engines/*`, `@components/*`, `@store/*`, `@types/*`, `@utils/*`, `@data/*`, `@hooks/*`.
Declared in `tsconfig.app.json` and mirrored in `vite.config.ts` / `vitest.config.ts` — read those
rather than a copy here, which is how the list drifts.

## Architecture

### Data Flow

1. User modifies configuration → Zustand store updates → URL hash updates (LZ-compressed)
2. `useCalculations()` hook watches store, delegates to independent calculation hooks
3. Each hook calls its engine (pure functions) and returns memoized results
4. `OutputDashboard` renders results (Sankey, gauges, charts)

### Four Calculation Engines

All engines are pure functions in `src/engines/` using the **strategy pattern** — each storage platform has its own strategy implementation.

| Engine | Location | Purpose |
|--------|----------|---------|
| **Volumetry** | `src/engines/volumetry/` | Usable capacity, parity overhead, filesystem losses, compression/dedup |
| **Performance** | `src/engines/performance/` | IOPS, throughput, bottleneck chain (Media→Controller→PCIe→Network) |
| **Resilience** | `src/workers/resilienceWorker.ts` | Monte Carlo simulation (100K iterations in Web Worker) |
| **Sustainability** | `src/engines/sustainability/` | Power, CO2 emissions, flash endurance, TCO |

### Engine Strategy Pattern

Each engine follows the same structure:

```
src/engines/<module>/
├── index.ts           # Orchestrator — selects and calls strategy
├── strategies/
│   ├── VolumetryStrategy.ts  # Interface
│   ├── raid.ts        # Standard RAID implementation
│   ├── zfs.ts         # ZFS implementation
│   ├── vsan.ts        # vSAN implementation
│   └── ...            # One per platform
├── helpers/           # Shared calculation utilities
└── overhead/          # Filesystem/platform overhead calculators
```

To add a new platform: add a strategy file, register it in `index.ts`, add types in `src/types/topology.ts`, add store options in the topology slice, and create a UI options panel.

### Hook Architecture

Calculation hooks have focused dependencies to avoid unnecessary recalculations:

- `useCalculations()` — Main orchestrator, composes results from sub-hooks
- `useVolumetryCalc()` — Watches topology + hardware + advanced settings
- `usePerformanceCalc()` — Watches workload + hardware + topology
- `useSustainabilityCalc()` — Watches hardware + advanced (PUE, carbon region)
- `useResilience()` — Coordinates Web Worker, watches drive reliability + topology

### State Management

Zustand store composed of slices (`src/store/slices/`):

- **HardwareSlice**: driveId, driveCount, serverCount, connectivity
- **TopologySlice**: topology type+level, hotSpares, platform-specific options (zfsOptions, vsanOptions, etc.)
- **WorkloadSlice**: readPercent, blockSize, randomPercent, dailyWriteVolume
- **AdvancedSlice**: compressionRatio, networkSpeed, pue, carbonRegion, unitSystem

URL persistence via `src/store/urlStorage.ts` — state serialized to JSON, compressed with LZ-String, stored in `#raidy=<data>`.

### UI Layout

Split-screen "Cockpit" (`src/components/layout/Cockpit.tsx`):
- **Left**: `InputSidebar` with accordion panels (Topology, Hardware, Workload, Advanced)
- **Right**: `OutputDashboard` with Sankey diagram, speedometer, donut chart, breakdown list

Platform-specific input panels live in `src/components/inputs/topology-options/`.

## Key Data Files

- **Drive database**: `src/data/drives.json` (~1.9K lines, 72 drives) — all drive specs loaded at startup
- **Type definitions**: `src/types/topology.ts` (~1000 lines) — the Topology discriminated union is central to the entire app
- **i18n translations**: `src/i18n/locales/{en,fr,de,it}/` — 10 namespace files per language

## Internationalization

Four Swiss languages: EN (default), FR, DE, IT. Uses `react-i18next` with 10 namespaces (common, topology, hardware, workload, advanced, output, validation, pdf, help, guide).

- Swiss locale number formatting: apostrophe separator (`1'000.50`)
- Language detection: URL param (`?lang=fr`) → localStorage → browser → fallback EN
- Technical terms (RAID, ZFS, NVMe, IOPS) remain untranslated
- Key convention: `t('topology:level.raid5.description')`

## Testing

- **Framework**: Vitest with jsdom environment, globals enabled
- **Test files**: `tests/` directory mirrors `src/` structure
- **Fixtures**: `tests/fixtures/` contains validation vectors (raid-vectors.ts, zfs-vectors.ts, vsan-vectors.ts, performance-vectors.ts)
- **Property-based testing**: Uses `fast-check` for exhaustive input validation
- **Coverage**: v8 provider, 75% threshold on `src/engines/**`, `src/workers/**`, `src/utils/**`
- **Validation target**: Results must be within 1% of WintelGuy and NetApp Storage Efficiency Calculator

## Gotchas

- **Worker tests: never `vi.spyOn(Math, 'random')`** — the spy records every call and the Monte Carlo worker draws millions, exhausting the heap before any assertion runs. Assign `Math.random` directly, restore in `afterEach`.
- **Changing a store default rewrites old shared URLs** — `partialize` runs `omitDefaults`, so the hash carries only non-default values. A link made under the old default silently adopts the new one (bit v2.0.0's `hotSpares` 1→0).
- **`SimulationInput.serverCount` is overloaded four ways** — fault-group count, BeeGFS storage-target count, real host count for replica placement (`assignNodesRoundRobin`), and PowerScale's first node-pool node count (driving `isPowerScaleMirrorRegion` and `distributeAcrossGroups`). Changing the group count corrupts placement.
- **Removing an option field: delete it from `src/utils/schemas.ts` too** — nested `z.object()` strips unknown keys but *requires* declared ones, so a type-only removal breaks URL parsing.
- **i18n: write full key paths at call sites**, not ``t(`prefix.${x}.body`)`` — `tests/i18n/orphanKeys.spec.ts` scans literally, so templates are invisible; a `DYNAMIC_PREFIXES` entry exempts the whole subtree and is weaker.
- **Component tests rendering input panels must stub `window.matchMedia`** — jsdom lacks it and `InfoTooltip` calls it through `useIsTouchDevice`.
- **`check:dead` fails spuriously inside `.claude/worktrees/*`** — the worktree's `node_modules` is nearly empty, so knip reports unlisted binaries and unused devDeps. Run the gate on the main checkout.
- **PowerScale does not use the generic volumetry path** — `calculateVolumetry` returns early into `src/engines/volumetry/powerscale/`. Adding a shared overhead to the generic path will silently skip PowerScale.
- **`src/data/powerscale*.json` are generated** — edit `scripts/build-powerscale-catalog.mjs` and regenerate; hand edits are lost. Regenerating changes three artifacts (both JSON files and `tests/fixtures/powerscale-powersizer.csv.gz`) that must be committed together.
- **PowerScale claims in a brief are not evidence** — protection availability, node bounds and drive sizes vary per model and per drive size. Probe `src/data/powerscaleNodes.json` before writing a test vector; four fabricated vendor values reached briefs on the OneFS branch and every one was caught by an implementer reading the catalog.
- **`Closes #A and #B` only closes #A** — repeat the keyword per issue.

## Git & CI

- **Main branch**: `main`
- **CI is federated** to reusable workflows in `fjacquet/ci@v1`. The local files are thin callers:
  `ci.yml`, `security.yml`, `deploy.yml` (Pages on push to `main`), `release.yml` (`v*` tags),
  `dependabot-automerge.yml`. There is no `static.yml` or `codeql.yml` — see
  [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).
- **Base path**: `/raidy/` (configured in `vite.config.ts` for GitHub Pages)
