# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **See Also**: [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system architecture, data flow diagrams, and component documentation. **Keep ARCHITECTURE.md up-to-date when making architectural changes.**

## Project Overview

**Raidy** is a browser-based simulator for modern storage infrastructure (RAID, ZFS, vSAN, S2D, Nutanix, Dell, NetApp, Ceph, Synology). Single Page Application with no backend — all calculation logic runs client-side. State is persisted in the URL hash via LZ-String compression, enabling "Copy URL to Share".

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
npm run test:coverage  # Coverage report (75% threshold on engines/workers/utils)
npm run test:ui        # Vitest browser UI
```

A `Makefile` wraps these commands: `make dev`, `make build`, `make test`, `make all` (lint + typecheck + build).

## Code Style (Biome)

- **Formatter**: 2-space indent, 100-char line width, single quotes, semicolons as-needed
- **Linter**: `noUnusedImports: error`, `noUnusedVariables: error`, `useConst: error`, `noNonNullAssertion: warn`
- Run `npm run lint:fix` before committing

## Path Aliases

Configured in both `tsconfig.app.json` and `vitest.config.ts`:

```
@/*          → src/*
@engines/*   → src/engines/*
@components/* → src/components/*
@store/*     → src/store/*
@types/*     → src/types/*
@utils/*     → src/utils/*
@data/*      → src/data/*
@hooks/*     → src/hooks/*
```

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

- **Drive database**: `src/data/drives.json` (~4K lines) — all drive specs loaded at startup
- **Type definitions**: `src/types/topology.ts` (~730 lines) — the Topology discriminated union is central to the entire app
- **i18n translations**: `src/i18n/locales/{en,fr,de,it}/` — 8 namespace files per language

## Internationalization

Four Swiss languages: EN (default), FR, DE, IT. Uses `react-i18next` with 8 namespaces (common, topology, hardware, workload, advanced, output, validation, pdf).

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

## Git & CI

- **Main branch**: `maincd`
- **CI** (`.github/workflows/ci.yml`): Runs `npm test`, `npm run typecheck`, `npm run lint` on push/PR
- **Deployment** (`.github/workflows/static.yml`): Builds and deploys to GitHub Pages on push to `maincd`
- **Base path**: `/raidy/` (configured in `vite.config.ts` for GitHub Pages)
