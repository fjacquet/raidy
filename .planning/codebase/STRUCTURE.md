# Codebase Structure

**Analysis Date:** 2026-01-16

## Directory Layout

```
raidy/
├── src/                    # Source code root
│   ├── assets/             # Static assets (images, icons)
│   ├── components/         # React components
│   │   ├── common/         # Reusable form controls
│   │   ├── inputs/         # Configuration input panels
│   │   ├── layout/         # Page structure components
│   │   └── outputs/        # Visualization and display components
│   ├── data/               # Static data files (drives.json)
│   ├── engines/            # Pure calculation logic
│   │   ├── performance/    # Performance bottleneck engine
│   │   ├── resilience/     # Monte Carlo (empty, uses worker)
│   │   ├── sustainability/ # Energy/CO2/endurance engine
│   │   └── volumetry/      # Capacity calculation engine
│   ├── hooks/              # React custom hooks
│   ├── i18n/               # Internationalization
│   │   └── locales/        # Translation files (en, fr, de, it)
│   ├── store/              # Zustand state management
│   │   └── slices/         # Modular state slices
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   │   └── export/         # Export utilities (empty, code in parent)
│   └── workers/            # Web Workers for background tasks
├── tests/                  # Test files
│   └── engines/            # Engine unit tests (empty)
├── public/                 # Static public files
├── doc/                    # Documentation
│   └── spec/               # Specifications
├── .github/                # GitHub configuration
│   └── workflows/          # CI/CD workflows
├── .planning/              # GSD planning documents
│   └── codebase/           # Codebase analysis docs
├── dist/                   # Build output (generated)
└── node_modules/           # Dependencies (generated)
```

## Directory Purposes

**`src/components/`:**
- Purpose: All React UI components
- Contains: Functional components with hooks, JSX rendering
- Key files: Layout components define overall structure

**`src/components/common/`:**
- Purpose: Reusable form input components
- Contains: `FormControls.tsx` (Label, NumberInput, Select, Slider, Toggle, SegmentedControl), `LanguageSwitcher.tsx`
- Key files: `FormControls.tsx` - all form primitives

**`src/components/inputs/`:**
- Purpose: Configuration panels for left sidebar
- Contains: Panel components for each config section
- Key files: `TopologyPanel.tsx` (60KB, largest), `HardwarePanel.tsx`, `WorkloadPanel.tsx`, `AdvancedPanel.tsx`, `DrivePropertiesPanel.tsx`, `TieringPanel.tsx`

**`src/components/layout/`:**
- Purpose: Page-level layout structure
- Contains: Main layout container and regions
- Key files: `Cockpit.tsx` (split-screen container), `Header.tsx`, `InputSidebar.tsx`, `OutputDashboard.tsx`

**`src/components/outputs/`:**
- Purpose: Visualization and result display components
- Contains: Charts, diagrams, animated counters
- Key files: `SankeyDiagram.tsx`, `DonutChart.tsx`, `Speedometer.tsx`, `CapacityBreakdownList.tsx`, `ZfsCapacityDetails.tsx`, `AnimatedCounter.tsx`

**`src/engines/`:**
- Purpose: Core calculation algorithms (Module A/B/C/D)
- Contains: Pure TypeScript calculation functions
- Key files: `volumetry/index.ts` (34KB), `performance/index.ts` (24KB), `sustainability/index.ts` (6KB)

**`src/store/`:**
- Purpose: Zustand state management
- Contains: Store configuration, slices, URL persistence
- Key files: `configStore.ts` (main store), `urlStorage.ts` (URL hash persistence), `slices/` (modular state)

**`src/store/slices/`:**
- Purpose: Modular state segments
- Contains: State + actions for each domain
- Key files: `hardwareSlice.ts`, `topologySlice.ts`, `workloadSlice.ts`, `advancedSlice.ts`

**`src/types/`:**
- Purpose: TypeScript type definitions
- Contains: Interfaces, type aliases, constants
- Key files: `topology.ts` (25KB, all topology types), `drive.ts`, `config.ts`, `results.ts`, `worker.ts`, `index.ts` (central export)

**`src/utils/`:**
- Purpose: Shared utility functions
- Contains: Export generators, formatters, validators
- Key files: `exportConfig.ts` (Ansible/Terraform), `exportPdf.ts`, `units.ts`, `validators.ts`

**`src/hooks/`:**
- Purpose: React custom hooks
- Contains: Calculation orchestration, resilience simulation, media queries
- Key files: `useCalculations.ts` (main calculation hook), `useResilience.ts` (Monte Carlo), `useMediaQuery.ts`

**`src/i18n/`:**
- Purpose: Internationalization configuration and translations
- Contains: i18next setup, locale files
- Key files: `index.ts` (i18n init), `config.ts`, `formatters.ts`, `locales/{lang}/*.json`

**`src/data/`:**
- Purpose: Static data files
- Contains: Drive database
- Key files: `drives.json` (90KB, 50+ drive definitions)

**`src/workers/`:**
- Purpose: Web Worker scripts for background processing
- Contains: Monte Carlo simulation worker
- Key files: `resilienceWorker.ts`

## Key File Locations

**Entry Points:**
- `index.html`: HTML entry, loads Vite module
- `src/main.tsx`: React entry, initializes app
- `src/App.tsx`: Root component, renders Cockpit

**Configuration:**
- `package.json`: Dependencies and scripts
- `vite.config.ts`: Build configuration with path aliases
- `tsconfig.json`: TypeScript configuration
- `biome.json`: Linting and formatting rules
- `src/i18n/config.ts`: i18n configuration constants

**Core Logic:**
- `src/engines/volumetry/index.ts`: Capacity calculations
- `src/engines/performance/index.ts`: Performance bottleneck analysis
- `src/engines/sustainability/index.ts`: Energy and carbon calculations
- `src/hooks/useCalculations.ts`: Calculation orchestration

**State Management:**
- `src/store/configStore.ts`: Main Zustand store with all slices
- `src/store/urlStorage.ts`: URL hash persistence with LZ compression

**Testing:**
- `tests/`: Test directory root
- `tests/engines/`: Engine unit tests (currently empty)

## Naming Conventions

**Files:**
- Components: PascalCase (`TopologyPanel.tsx`, `SankeyDiagram.tsx`)
- Hooks: camelCase with `use` prefix (`useCalculations.ts`, `useResilience.ts`)
- Utilities: camelCase (`exportConfig.ts`, `validators.ts`)
- Types: camelCase (`topology.ts`, `drive.ts`)
- Store slices: camelCase with `Slice` suffix (`hardwareSlice.ts`)
- Translations: lowercase (`common.json`, `topology.json`)

**Directories:**
- All lowercase, singular or plural based on content
- Component subdirs match component categories (`inputs/`, `outputs/`, `layout/`)

**Exports:**
- Components: Named exports (`export function TopologyPanel()`)
- Types: Named exports via `index.ts` barrel files
- Hooks: Named exports (`export function useCalculations()`)
- Utilities: Named exports with descriptive names

## Where to Add New Code

**New Feature (e.g., new storage topology):**
1. Add types: `src/types/topology.ts` - new topology type and level
2. Add calculations: `src/engines/volumetry/index.ts` - efficiency calculation
3. Add UI: `src/components/inputs/TopologyPanel.tsx` - selector option
4. Add translations: `src/i18n/locales/{lang}/topology.json`
5. Tests: `tests/engines/` (create test file)

**New Component:**
- Input panel: `src/components/inputs/{Name}Panel.tsx`
- Output visualization: `src/components/outputs/{Name}.tsx`
- Common control: `src/components/common/FormControls.tsx` (extend) or new file
- Layout: `src/components/layout/{Name}.tsx`
- Export from: respective `index.ts` barrel file

**New Calculation Engine:**
- Create: `src/engines/{engineName}/index.ts`
- Add types: `src/types/results.ts` - result interface
- Wire up: `src/hooks/useCalculations.ts` - call engine
- Export from: `src/engines/` (if barrel exists)

**New Utility:**
- General: `src/utils/{utilityName}.ts`
- Export-related: `src/utils/export{Type}.ts`
- Export from: `src/utils/index.ts`

**New Hook:**
- Create: `src/hooks/use{HookName}.ts`
- Export from: `src/hooks/index.ts`

**New Translations:**
- Add keys to all 4 locales: `src/i18n/locales/{en,fr,de,it}/{namespace}.json`

**New Store State:**
- Create slice: `src/store/slices/{domain}Slice.ts`
- Combine: `src/store/configStore.ts` - spread into store
- Export: `src/store/slices/index.ts`

## Special Directories

**`dist/`:**
- Purpose: Production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**`.planning/`:**
- Purpose: GSD planning and analysis documents
- Generated: No (manual/AI-generated)
- Committed: Depends on project preference

**`public/`:**
- Purpose: Static files copied to dist root
- Generated: No
- Committed: Yes

**`.github/workflows/`:**
- Purpose: GitHub Actions CI/CD pipelines
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-01-16*
