# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **See Also**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system architecture and data flow. Also in `docs/`: [DEVELOPMENT.md](./docs/DEVELOPMENT.md), [TESTING.md](./docs/TESTING.md), [CONFIGURATION.md](./docs/CONFIGURATION.md) (CI & security gates), [GETTING-STARTED.md](./docs/GETTING-STARTED.md), [SECURITY.md](./docs/SECURITY.md), and [adr/](./docs/adr/) (architecture decisions).
>
> **Docs stay in sync with code.** Any change to config, CI, dependencies, or behavior must update the matching doc in `docs/` (and `README.md`/`CHANGELOG.md` where relevant) in the *same commit*. Stale docs are treated as a defect, not a follow-up.

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

- **Drive database**: `src/data/drives.json` (~1.9K lines, 72 drives) — all drive specs loaded at startup
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

- **Main branch**: `main`
- **CI** (`.github/workflows/ci.yml`): Runs `npm test`, `npm run typecheck`, `npm run lint` on push/PR
- **Deployment** (`.github/workflows/static.yml`): Builds and deploys to GitHub Pages on push to `main`
- **Base path**: `/raidy/` (configured in `vite.config.ts` for GitHub Pages)

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->