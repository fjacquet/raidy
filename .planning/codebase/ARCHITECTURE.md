# Architecture

**Analysis Date:** 2026-01-16

## Pattern Overview

**Overall:** Component-Based SPA with Reactive State Management

**Key Characteristics:**

- Single Page Application (SPA) with no backend - all logic runs client-side
- Progressive Web App (PWA) capabilities for offline use
- URL-based state persistence via LZ-compressed hash parameters
- Unidirectional data flow: Store -> Hooks -> Components -> Store
- Calculation engines isolated from UI in pure TypeScript modules
- Web Workers for CPU-intensive Monte Carlo simulations

## Layers

**Presentation Layer:**

- Purpose: Render UI and capture user input
- Location: `src/components/`
- Contains: React functional components, layout containers, visualization widgets
- Depends on: Hooks, Store, Types, i18n
- Used by: App entry point (`src/App.tsx`)

**State Management Layer:**

- Purpose: Centralized application state with URL persistence
- Location: `src/store/`
- Contains: Zustand store with sliced state (hardware, topology, workload, advanced)
- Depends on: Types, URL storage utility
- Used by: Components via hooks, calculation engines

**Business Logic Layer:**

- Purpose: Storage calculation algorithms (volumetry, performance, sustainability, resilience)
- Location: `src/engines/`
- Contains: Pure TypeScript calculation functions, no React dependencies
- Depends on: Types, Drive data
- Used by: `useCalculations` hook

**Data Layer:**

- Purpose: Static drive database and type definitions
- Location: `src/data/`, `src/types/`
- Contains: `drives.json` with 50+ drive specifications, TypeScript interfaces
- Depends on: Nothing (base layer)
- Used by: Engines, Store, Components

**Worker Layer:**

- Purpose: Background Monte Carlo resilience simulations
- Location: `src/workers/`
- Contains: ES module Web Worker for parallel execution
- Depends on: Types
- Used by: `useResilience` hook

**Utility Layer:**

- Purpose: Shared helpers for export, formatting, validation
- Location: `src/utils/`
- Contains: PDF/YAML/Ansible/Terraform export, unit formatting, validators
- Depends on: Types
- Used by: Components, Hooks

## Data Flow

**Configuration -> Calculation -> Display:**

1. User modifies input in `InputSidebar` panel components
2. Component calls store action (e.g., `setDriveCount(12)`)
3. Zustand store updates state and persists to URL hash via `urlHashStorage`
4. React re-renders components subscribed to changed state
5. `useCalculations` hook memoizes engine calls with new config
6. Engines compute volumetry/performance/sustainability results
7. `OutputDashboard` displays results via charts and metrics

**State Management:**

- Store: Zustand with `persist` middleware using custom `urlHashStorage`
- State serialization: JSON -> LZ-string compression -> URL hash
- State slices: hardware, topology, workload, advanced (each in separate file)
- State partitioning: Only config values persisted, not actions

**Monte Carlo Simulation Flow:**

1. `useResilience` hook spawns Web Worker on mount
2. Worker receives drive specs, topology, and simulation count
3. Worker runs 10,000 simulations in background
4. Worker posts progress updates and final result back to main thread
5. Hook updates component state with results

## Key Abstractions

**Topology:**

- Purpose: Represents any storage configuration (RAID, ZFS, S2D, vSAN, Ceph, etc.)
- Examples: `src/types/topology.ts`
- Pattern: Discriminated union type `{ type: TopologyType; level: TopologyLevel }`
- Supports 13 topology types with type-specific levels

**Drive:**

- Purpose: Complete drive specification for calculations
- Examples: `src/types/drive.ts`, `src/data/drives.json`
- Pattern: Interface with nested objects for performance, reliability, power
- Fields: capacity, IOPS, bandwidth, AFR, URE rate, DWPD, power consumption

**CalculationResults:**

- Purpose: Complete output from all calculation engines
- Examples: `src/types/results.ts`
- Pattern: Composite object with volumetry, performance, sustainability, resilience results
- Includes breakdown arrays for visualizations

**Store Slice:**

- Purpose: Modular state segment with defaults and actions
- Examples: `src/store/slices/hardwareSlice.ts`
- Pattern: Zustand `StateCreator` function returning state + setters
- Combined in `configStore.ts` via spread operator

## Entry Points

**Application Entry:**

- Location: `src/main.tsx`
- Triggers: Browser navigation to index.html
- Responsibilities: Initialize React, i18n, render root App component

**Calculation Entry:**

- Location: `src/hooks/useCalculations.ts`
- Triggers: Store state changes via useMemo dependencies
- Responsibilities: Orchestrate all engine calculations, return combined results

**Worker Entry:**

- Location: `src/workers/resilienceWorker.ts`
- Triggers: `useResilience` hook instantiation
- Responsibilities: Run Monte Carlo simulation, post progress/results

**HTML Entry:**

- Location: `index.html`
- Triggers: Direct URL navigation
- Responsibilities: Load Vite module, mount React app

## Error Handling

**Strategy:** Graceful degradation with error arrays in results

**Patterns:**

- Calculation errors collected in `CalculationResults.errors` array
- Missing drive returns zeroed results with error message
- Worker errors caught and surfaced via hook's `error` state
- URL parse errors fallback to default configuration
- Console warnings for non-critical failures (state persistence)

## Cross-Cutting Concerns

**Logging:** Console warnings only (`console.warn`) for state persistence failures

**Validation:**

- `src/utils/validators.ts` provides topology validation rules
- Input components enforce min/max via store setters (e.g., `Math.max(1, count)`)

**Internationalization:**

- react-i18next with 4 languages (en, fr, de, it)
- 8 namespaces: common, topology, hardware, workload, advanced, output, validation, pdf
- Detection: querystring `?lang=` -> localStorage -> browser preference -> English

**Authentication:** None (client-side only application)

**Theming:**

- Tailwind CSS with dark mode as default
- Custom color palette: surface-_, primary-_, accent-\*
- Defined in `src/index.css` with CSS custom properties

---

_Architecture analysis: 2026-01-16_
