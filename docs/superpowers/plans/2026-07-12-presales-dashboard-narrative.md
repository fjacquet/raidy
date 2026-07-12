# Presales-First Dashboard — Guided-Narrative Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-compose the storage results dashboard into a presales-first guided narrative — a persistent headline KPI band plus five story-ordered acts — with capability-driven relevance that omits not-applicable readouts, without changing any engine or calculation.

**Architecture:** Extract the 986-line `OutputDashboard.tsx` monolith into one component per narrative act (`CapacityAct`, `PerformanceAct`, `ResilienceAct`, `CostAct`, `TakeawayAct`) plus a `HeadlineBand`, each consuming the existing `CalculationResults` and a new pure `outputRelevance` module. A pure-refactor phase preserves today's exact markup first (de-risking), then the composition phase re-sequences the acts into the Approach-B layout and wires relevance. The input accordion is lightly re-ordered to mirror the build order.

**Tech Stack:** React 18 + TypeScript (strict), Zustand store, Vitest + @testing-library/react (jsdom), Tailwind, react-i18next (en/fr/de/it), Biome.

## Global Constraints

- **No engine/calculation changes.** Engines stay pure functions; numbers are already externally validated (v1.13.0). This cycle only re-presents existing `CalculationResults` data.
- **Reuse the probe-verified capability flags** in `src/engines/capabilities.ts` (`supportsCompression`, `supportsDedup`, `supportsHotSpares`, `hasServerCount`). Do NOT add new platform-keyed flags unless a probe test in `tests/engines/capabilities.spec.ts` asserts them against real engine behavior.
- **Relevance = capability flag (platform-driven) OR result presence (data-driven).** Not-applicable → omit. Applicable-but-genuinely-zero → show. Never hide a real zero.
- **Interactive resilience number** comes from the `useResilience` hook (`resilienceResult`), NOT from `useCalculations().resilience` (which is always `null`).
- **Path aliases:** `@/*`, `@engines/*`, `@components/*`, `@store/*`, `@types/*`, `@utils/*`, `@hooks/*`, `@data/*`.
- **Code style (Biome):** 2-space indent, 100-char width, single quotes, semicolons as-needed. Run `npm run lint:fix` before each commit.
- **i18n:** every new user-facing string is an additive key in the `output` namespace, added to all four locales `src/i18n/locales/{en,fr,de,it}/output.json`. No existing key's meaning changes.
- **Docs-in-sync policy:** any behavior/layout change updates `docs/ARCHITECTURE.md` (UI Layout section), and `README.md`/`CHANGELOG.md` where relevant, in the same PR.
- **Coverage:** 75% threshold on `src/engines/**`, `src/workers/**`, `src/utils/**` must not regress.
- **Commands (RTK):** prefix git/test/lint with `rtk` per repo convention (e.g. `rtk vitest run`, `rtk git commit`).

## Decisions settled from spec §12 (Open Questions)

1. **Cost headline tile** = **annual energy (kWh)** (`sustainability.annualEnergyKwh`) — currency-free; CO₂ and power breakdown stay in the Cost act.
2. **Effective-capacity tile** — shown ONLY when the platform supports compression or dedup AND `effectiveCapacity !== usableCapacity`. Omitted for RAID and others where effective ≡ usable.
3. **Collapse-inputs affordance** — **deferred** (not this cycle).
4. **Backup** — rendered as a capacity-adjacent sub-panel inside `CapacityAct`.

## File Structure

**Create:**
- `src/engines/outputRelevance.ts` — pure relevance predicates for KPI tiles + sections.
- `src/components/outputs/MetricCard.tsx` — extracted shared presentational helper.
- `src/components/outputs/ProgressBar.tsx` — extracted shared presentational helper.
- `src/components/outputs/acts/CapacityAct.tsx`
- `src/components/outputs/acts/PerformanceAct.tsx`
- `src/components/outputs/acts/ResilienceAct.tsx`
- `src/components/outputs/acts/CostAct.tsx`
- `src/components/outputs/acts/TakeawayAct.tsx`
- `src/components/outputs/HeadlineBand.tsx`
- Test files mirroring each under `tests/engines/` and `tests/components/outputs/`.

**Modify:**
- `src/components/layout/OutputDashboard.tsx` — becomes a thin orchestrator.
- `src/components/outputs/index.ts` — export new components/helpers.
- `src/components/layout/InputSidebar.tsx` — re-order accordion sections.
- `src/i18n/locales/{en,fr,de,it}/output.json` — additive keys.
- `docs/ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`.

---

### Task 1: Output relevance module

**Files:**
- Create: `src/engines/outputRelevance.ts`
- Test: `tests/engines/outputRelevance.spec.ts`

**Interfaces:**
- Consumes: `getCapabilities` from `@/engines/capabilities`; `CalculationResults` types from `@/types/results`; `Topology` from `@/types/topology`.
- Produces:
  - `type KpiId = 'usable' | 'effective' | 'efficiency' | 'peakIops' | 'survival' | 'annualEnergy'`
  - `type SectionId = 'capacity' | 'performance' | 'resilience' | 'cost' | 'takeaway' | 'zfsDetails' | 'longhornDetails' | 'backup' | 'flashEndurance'`
  - `interface RelevanceContext { topology: Topology; volumetry: VolumetryResult; sustainability: SustainabilityResult; hasResilienceResult: boolean; hasBackup: boolean }`
  - `function shouldShowKpi(kpi: KpiId, ctx: RelevanceContext): boolean`
  - `function shouldShowSection(section: SectionId, ctx: RelevanceContext): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/engines/outputRelevance.spec.ts
import { describe, expect, it } from 'vitest'
import { shouldShowKpi, shouldShowSection, type RelevanceContext } from '@/engines/outputRelevance'
import type { VolumetryResult, SustainabilityResult } from '@/types/results'

const vol = (over: Partial<VolumetryResult> = {}): VolumetryResult => ({
  rawCapacity: 1000, parityOverhead: 100, hotSpareOverhead: 0, filesystemOverhead: 0,
  slopOverhead: 0, usableCapacity: 900, effectiveCapacity: 900, efficiency: 90, breakdown: [],
  ...over,
})
const sus = (over: Partial<SustainabilityResult> = {}): SustainabilityResult => ({
  annualEnergyKwh: 5000, annualEnergyCost: 1000, annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 }, ...over,
})
const ctx = (over: Partial<RelevanceContext> = {}): RelevanceContext => ({
  topology: { type: 'standard', level: 'RAID5' },
  volumetry: vol(), sustainability: sus(), hasResilienceResult: false, hasBackup: false,
  ...over,
})

describe('shouldShowKpi', () => {
  it('always shows usable, efficiency, peakIops, annualEnergy', () => {
    const c = ctx()
    expect(shouldShowKpi('usable', c)).toBe(true)
    expect(shouldShowKpi('efficiency', c)).toBe(true)
    expect(shouldShowKpi('peakIops', c)).toBe(true)
    expect(shouldShowKpi('annualEnergy', c)).toBe(true)
  })
  it('hides effective for RAID (effective === usable, no compression/dedup)', () => {
    expect(shouldShowKpi('effective', ctx())).toBe(false)
  })
  it('shows effective for ZFS when effective differs from usable', () => {
    const c = ctx({
      topology: { type: 'zfs', level: 'raidz2' },
      volumetry: vol({ usableCapacity: 900, effectiveCapacity: 1500 }),
    })
    expect(shouldShowKpi('effective', c)).toBe(true)
  })
  it('shows survival only when a simulation result exists', () => {
    expect(shouldShowKpi('survival', ctx({ hasResilienceResult: false }))).toBe(false)
    expect(shouldShowKpi('survival', ctx({ hasResilienceResult: true }))).toBe(true)
  })
})

describe('shouldShowSection', () => {
  it('hides zfsDetails unless zfsDetails present', () => {
    expect(shouldShowSection('zfsDetails', ctx())).toBe(false)
    const c = ctx({ topology: { type: 'zfs', level: 'raidz2' }, volumetry: vol({ zfsDetails: {} as never }) })
    expect(shouldShowSection('zfsDetails', c)).toBe(true)
  })
  it('hides longhornDetails unless longhornDetails present', () => {
    const c = ctx({ topology: { type: 'longhorn', level: 'longhorn_r3' }, volumetry: vol({ longhornDetails: {} as never }) })
    expect(shouldShowSection('longhornDetails', c)).toBe(true)
    expect(shouldShowSection('longhornDetails', ctx())).toBe(false)
  })
  it('shows backup only when hasBackup', () => {
    expect(shouldShowSection('backup', ctx({ hasBackup: true }))).toBe(true)
    expect(shouldShowSection('backup', ctx({ hasBackup: false }))).toBe(false)
  })
  it('always shows the four core acts', () => {
    const c = ctx()
    for (const s of ['capacity', 'performance', 'resilience', 'cost', 'takeaway'] as const) {
      expect(shouldShowSection(s, c)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/engines/outputRelevance.spec.ts`
Expected: FAIL — cannot resolve `@/engines/outputRelevance`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engines/outputRelevance.ts
/**
 * Pure output-relevance predicates for the presales narrative dashboard.
 * A KPI tile or section is shown only when meaningful for the current
 * selection. Platform-driven relevance reuses the probe-verified capability
 * flags; data-driven relevance keys off result presence. Not-applicable ->
 * omit; applicable-but-zero -> show. Never hides a genuine zero.
 */
import { getCapabilities } from '@/engines/capabilities'
import type { SustainabilityResult, VolumetryResult } from '@/types/results'
import type { Topology } from '@/types/topology'

export type KpiId = 'usable' | 'effective' | 'efficiency' | 'peakIops' | 'survival' | 'annualEnergy'

export type SectionId =
  | 'capacity' | 'performance' | 'resilience' | 'cost' | 'takeaway'
  | 'zfsDetails' | 'longhornDetails' | 'backup' | 'flashEndurance'

export interface RelevanceContext {
  topology: Topology
  volumetry: VolumetryResult
  sustainability: SustainabilityResult
  hasResilienceResult: boolean
  hasBackup: boolean
}

/** True when compression/dedup meaningfully changes capacity for this platform. */
function effectiveDiffers(ctx: RelevanceContext): boolean {
  const caps = getCapabilities(ctx.topology.type)
  const supported = caps.supportsCompression || caps.supportsDedup
  return supported && ctx.volumetry.effectiveCapacity !== ctx.volumetry.usableCapacity
}

export function shouldShowKpi(kpi: KpiId, ctx: RelevanceContext): boolean {
  switch (kpi) {
    case 'usable':
    case 'efficiency':
    case 'peakIops':
    case 'annualEnergy':
      return true
    case 'effective':
      return effectiveDiffers(ctx)
    case 'survival':
      return ctx.hasResilienceResult
  }
}

export function shouldShowSection(section: SectionId, ctx: RelevanceContext): boolean {
  switch (section) {
    case 'capacity':
    case 'performance':
    case 'resilience':
    case 'cost':
    case 'takeaway':
      return true
    case 'zfsDetails':
      return ctx.topology.type === 'zfs' && ctx.volumetry.zfsDetails != null
    case 'longhornDetails':
      return ctx.topology.type === 'longhorn' && ctx.volumetry.longhornDetails != null
    case 'backup':
      return ctx.hasBackup
    case 'flashEndurance':
      return ctx.sustainability.flashEndurance != null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/engines/outputRelevance.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
rtk npm run typecheck
npm run lint:fix
rtk git add src/engines/outputRelevance.ts tests/engines/outputRelevance.spec.ts
rtk git commit -m "feat(outputs): pure output-relevance predicates (capability + presence)"
```

---

### Task 2: Extract shared presentational helpers (pure refactor)

**Files:**
- Create: `src/components/outputs/MetricCard.tsx`, `src/components/outputs/ProgressBar.tsx`
- Modify: `src/components/outputs/index.ts`, `src/components/layout/OutputDashboard.tsx:41-97` (remove the two local definitions), `src/components/layout/OutputDashboard.tsx` imports
- Test: `tests/components/outputs/MetricCard.spec.tsx`

**Interfaces:**
- Produces:
  - `MetricCard({ label, children, subvalue?, color? }: { label: string; children: React.ReactNode; subvalue?: string; color?: string })`
  - `ProgressBar({ label, value, max, color?, showValue? }: { label: string; value: number; max: number; color?: string; showValue?: boolean })`
  - Both re-exported from `@/components/outputs`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/MetricCard.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricCard, ProgressBar } from '@/components/outputs'

describe('MetricCard', () => {
  it('renders label, value and optional subvalue', () => {
    render(<MetricCard label="Usable" subvalue="after compression">42 TB</MetricCard>)
    expect(screen.getByText('Usable')).toBeInTheDocument()
    expect(screen.getByText('42 TB')).toBeInTheDocument()
    expect(screen.getByText('after compression')).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('renders label and rounded value when showValue', () => {
    render(<ProgressBar label="Drives" value={123.6} max={200} />)
    expect(screen.getByText('Drives')).toBeInTheDocument()
    expect(screen.getByText('124')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/MetricCard.spec.tsx`
Expected: FAIL — `MetricCard`/`ProgressBar` not exported from `@/components/outputs`.

- [ ] **Step 3: Move the two components verbatim**

Create `src/components/outputs/MetricCard.tsx` with the exact `MetricCard` function currently at `OutputDashboard.tsx:41-59` (add `import type React from 'react'` and `export`). Create `src/components/outputs/ProgressBar.tsx` with the exact `ProgressBar` function at `OutputDashboard.tsx:64-97`, importing `formatNumber` from `@/hooks`. Add to `src/components/outputs/index.ts`:

```ts
export { MetricCard } from './MetricCard'
export { ProgressBar } from './ProgressBar'
```

In `OutputDashboard.tsx`, delete the two local definitions (lines 38-97) and add `MetricCard, ProgressBar` to the existing `@/components/outputs` import.

- [ ] **Step 4: Run tests + existing dashboard behavior**

Run: `rtk vitest run tests/components/outputs/MetricCard.spec.tsx && rtk npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/MetricCard.tsx src/components/outputs/ProgressBar.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/MetricCard.spec.tsx
rtk git commit -m "refactor(outputs): extract MetricCard and ProgressBar helpers"
```

---

### Task 3: Extract CapacityAct (pure refactor — layout unchanged)

**Files:**
- Create: `src/components/outputs/acts/CapacityAct.tsx`
- Modify: `src/components/layout/OutputDashboard.tsx` (replace the capacity + ZFS + Longhorn + backup card JSX with `<CapacityAct .../>`), `src/components/outputs/index.ts`
- Test: `tests/components/outputs/CapacityAct.spec.tsx`

**Interfaces:**
- Consumes: `useCalculations` result `volumetry` + `backup`; `useFormatBytes`, `useIsDesktop`, `useIsMobile` from `@/hooks`; `SankeyDiagram`, `DonutChart`, `DonutLegend`, `CapacityBreakdownList`, `ZfsCapacityDetails`, `LonghornCapacityDetails`, `BackupCard`, `MetricCard` from `@/components/outputs`.
- Produces: `CapacityAct({ volumetry, backup, topology, operationalLimit, performanceThreshold }: CapacityActProps)` — props typed with the exact `VolumetryResult`, `BackupResult | undefined`, `Topology`, `number | null`, `number` shapes. Re-exported from `@/components/outputs`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/CapacityAct.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CapacityAct } from '@/components/outputs'
import type { VolumetryResult } from '@/types/results'

const volumetry: VolumetryResult = {
  rawCapacity: 1e12, parityOverhead: 1e11, hotSpareOverhead: 0, filesystemOverhead: 0,
  slopOverhead: 0, usableCapacity: 9e11, effectiveCapacity: 9e11, efficiency: 90,
  breakdown: [{ label: 'Usable', bytes: 9e11, percent: 90, color: '#3b82f6' }],
}

it('renders the capacity heading and usable metric', () => {
  render(
    <CapacityAct
      volumetry={volumetry}
      backup={undefined}
      topology={{ type: 'standard', level: 'RAID5' }}
      operationalLimit={null}
      performanceThreshold={1}
    />,
  )
  expect(screen.getByText(/capacity/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/CapacityAct.spec.tsx`
Expected: FAIL — `CapacityAct` not exported.

- [ ] **Step 3: Move the JSX verbatim into CapacityAct**

Create `src/components/outputs/acts/CapacityAct.tsx`. Move the Capacity Overview card (`OutputDashboard.tsx:301-373`), the ZFS details card (375-388), the Longhorn details card (390-403), and the Backup card (543-548) into it, wrapped in a fragment, preserving all classNames and logic (Sankey/donut branch on `isDesktop`, `capacitySegments` computed inside from `volumetry`). Keep `useTranslation('output')` and `useTranslation('help')` and the responsive hooks local to the component. Export it; add to `index.ts`. In `OutputDashboard.tsx`, replace those four card blocks with a single `<CapacityAct volumetry={volumetry} backup={backup} topology={topology} operationalLimit={operationalLimit} performanceThreshold={performanceThreshold} />`.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/CapacityAct.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/acts/CapacityAct.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/CapacityAct.spec.tsx
rtk git commit -m "refactor(outputs): extract CapacityAct (layout unchanged)"
```

---

### Task 4: Extract PerformanceAct (gauges + bottleneck)

**Files:**
- Create: `src/components/outputs/acts/PerformanceAct.tsx`
- Modify: `src/components/layout/OutputDashboard.tsx` (replace performance gauges card 405-462 AND bottleneck card 550-585 with `<PerformanceAct performance={performance} />`), `index.ts`
- Test: `tests/components/outputs/PerformanceAct.spec.tsx`

**Interfaces:**
- Consumes: `PerformanceResult`; `Speedometer`, `MetricCard` from `@/components/outputs`; `useIsMobile`, `formatNumber` from `@/hooks`.
- Produces: `PerformanceAct({ performance }: { performance: PerformanceResult })`, re-exported.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/PerformanceAct.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PerformanceAct } from '@/components/outputs'
import type { PerformanceResult } from '@/types/results'

const performance: PerformanceResult = {
  maxReadThroughputMBs: 1200, maxWriteThroughputMBs: 800,
  maxReadIOPS: 500000, maxWriteIOPS: 300000,
  layers: [{ name: 'Media', throughputMBs: 1200, iops: 500000, isBottleneck: true, utilization: 100 }],
  bottleneckDescription: 'Media bound',
}

it('renders performance heading and bottleneck description', () => {
  render(<PerformanceAct performance={performance} />)
  expect(screen.getByText('Media bound')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/PerformanceAct.spec.tsx`
Expected: FAIL — not exported.

- [ ] **Step 3: Move gauges + bottleneck JSX into PerformanceAct**

Create the component; move the Performance Gauges card body (`OutputDashboard.tsx:406-462`) and the Bottleneck Analysis card body (551-585) into it as two stacked blocks (gauges first, bottleneck as the supporting detail below). Keep classNames and the `Speedometer` props identical. Export; add to `index.ts`. Replace both source blocks in `OutputDashboard.tsx` with one `<PerformanceAct performance={performance} />`.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/PerformanceAct.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/acts/PerformanceAct.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/PerformanceAct.spec.tsx
rtk git commit -m "refactor(outputs): extract PerformanceAct (gauges + bottleneck)"
```

---

### Task 5: Extract ResilienceAct

**Files:**
- Create: `src/components/outputs/acts/ResilienceAct.tsx`
- Modify: `src/components/layout/OutputDashboard.tsx` (replace resilience card 587-713 with `<ResilienceAct ... />`), `index.ts`
- Test: `tests/components/outputs/ResilienceAct.spec.tsx`

**Interfaces:**
- Consumes: `ResilienceResult | null`, `SimulationProgress`, booleans, and the `runSimulation` callback — all already produced by `useResilience` in the parent.
- Produces: `ResilienceAct({ result, progress, isRunning, runSimulation, isMobile }: ResilienceActProps)` with `result: ResilienceResult | null`, `progress: SimulationProgress`, `isRunning: boolean`, `runSimulation: () => void`, `isMobile: boolean`. Re-exported.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/ResilienceAct.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResilienceAct } from '@/components/outputs'

it('renders the run affordance when no result yet', () => {
  render(
    <ResilienceAct
      result={null}
      progress={{ completed: 0, total: 0, percent: 0, isRunning: false }}
      isRunning={false}
      runSimulation={vi.fn()}
      isMobile={false}
    />,
  )
  expect(screen.getByRole('button')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/ResilienceAct.spec.tsx`
Expected: FAIL — not exported.

- [ ] **Step 3: Move resilience JSX into ResilienceAct**

Create the component; move the entire Resilience Simulation card (`OutputDashboard.tsx:588-713`) into it, replacing the local `resilienceResult`/`resilienceProgress`/`resilienceRunning`/`runSimulation`/`isMobile` references with the corresponding props (`result`, `progress`, `isRunning`, `runSimulation`, `isMobile`). Keep `useTranslation('output')` and `useTranslation('help')` local. Export; add to `index.ts`. Replace the card in `OutputDashboard.tsx` with `<ResilienceAct result={resilienceResult} progress={resilienceProgress} isRunning={resilienceRunning} runSimulation={runSimulation} isMobile={isMobile} />`.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/ResilienceAct.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/acts/ResilienceAct.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/ResilienceAct.spec.tsx
rtk git commit -m "refactor(outputs): extract ResilienceAct"
```

---

### Task 6: Extract CostAct

**Files:**
- Create: `src/components/outputs/acts/CostAct.tsx`
- Modify: `src/components/layout/OutputDashboard.tsx` (replace Power & Sustainability card 464-541 with `<CostAct sustainability={sustainability} />`), `index.ts`
- Test: `tests/components/outputs/CostAct.spec.tsx`

**Interfaces:**
- Consumes: `SustainabilityResult`; `MetricCard`, `ProgressBar` from `@/components/outputs`; `formatNumber` from `@/hooks`.
- Produces: `CostAct({ sustainability }: { sustainability: SustainabilityResult })`, re-exported.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/CostAct.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CostAct } from '@/components/outputs'
import type { SustainabilityResult } from '@/types/results'

const sustainability: SustainabilityResult = {
  annualEnergyKwh: 5000, annualEnergyCost: 1000, annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 },
}

it('renders total power figure', () => {
  render(<CostAct sustainability={sustainability} />)
  expect(screen.getByText('180')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/CostAct.spec.tsx`
Expected: FAIL — not exported.

- [ ] **Step 3: Move sustainability JSX into CostAct**

Create the component; move the Power & Sustainability card (`OutputDashboard.tsx:465-541`) verbatim, including the `flashEndurance` conditional block. Keep `useTranslation('output')`/`useTranslation('help')` local. Export; add to `index.ts`. Replace the card in `OutputDashboard.tsx` with `<CostAct sustainability={sustainability} />`.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/CostAct.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/acts/CostAct.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/CostAct.spec.tsx
rtk git commit -m "refactor(outputs): extract CostAct"
```

---

### Task 7: Extract TakeawayAct (export + commands)

**Files:**
- Create: `src/components/outputs/acts/TakeawayAct.tsx`
- Modify: `src/components/layout/OutputDashboard.tsx` (replace Commands card 715-824 AND Export card 826-982 with `<TakeawayAct ... />`), `index.ts`
- Test: `tests/components/outputs/TakeawayAct.spec.tsx`

**Interfaces:**
- Consumes: `Topology`, `zfsOptions`, `performance`, the five export handlers, `selectedDrive` boolean, `exportError`.
- Produces: `TakeawayAct({ topology, zfsOptions, performance, selectedDrive, exportError, onExportPdf, onExportPptx, onExportYaml, onExportAnsible, onExportTerraform }: TakeawayActProps)` — handler props are `() => void`, `selectedDrive: Drive | null`, `exportError: boolean`. Re-exported.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/TakeawayAct.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TakeawayAct } from '@/components/outputs'

it('disables export buttons when no drive selected', () => {
  render(
    <TakeawayAct
      topology={{ type: 'standard', level: 'RAID5' }}
      zfsOptions={undefined}
      performance={{ maxReadThroughputMBs: 0, maxWriteThroughputMBs: 0, maxReadIOPS: 0, maxWriteIOPS: 0, layers: [], bottleneckDescription: '' }}
      selectedDrive={null}
      exportError={false}
      onExportPdf={vi.fn()} onExportPptx={vi.fn()} onExportYaml={vi.fn()}
      onExportAnsible={vi.fn()} onExportTerraform={vi.fn()}
    />,
  )
  const buttons = screen.getAllByRole('button')
  expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/TakeawayAct.spec.tsx`
Expected: FAIL — not exported.

- [ ] **Step 3: Move commands + export JSX into TakeawayAct**

Create the component; move the Commands card (`OutputDashboard.tsx:716-824`) and the Export card (827-982). Render export buttons first (the closing CTA), then the commands block wrapped in a `<details>`/collapsible ("for your engineers"). Wire the five `onExport*` handler props to the buttons and the `exportError`/`selectedDrive` props to the disabled/alert states. Keep `useTranslation('output')` local. Export; add to `index.ts`. Replace both cards in `OutputDashboard.tsx` with the single `<TakeawayAct ... />` passing the existing handlers.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/TakeawayAct.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/acts/TakeawayAct.tsx src/components/outputs/index.ts src/components/layout/OutputDashboard.tsx tests/components/outputs/TakeawayAct.spec.tsx
rtk git commit -m "refactor(outputs): extract TakeawayAct (export CTA + collapsible commands)"
```

---

### Task 8: Add i18n keys for the headline band and act headings

**Files:**
- Modify: `src/i18n/locales/{en,fr,de,it}/output.json`
- Test: `tests/i18n/output-keys.spec.ts` (create if absent — assert key parity across locales)

**Interfaces:**
- Produces: new `output` keys: `headline.title`, `headline.usable`, `headline.effective`, `headline.efficiency`, `headline.peakIops`, `headline.survival`, `headline.annualEnergy`, `headline.runSurvival`, `acts.capacity`, `acts.performance`, `acts.resilience`, `acts.cost`, `acts.takeaway`, `acts.forEngineers`.

- [ ] **Step 1: Write the failing test (locale key parity)**

```ts
// tests/i18n/output-keys.spec.ts
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/output.json'
import fr from '@/i18n/locales/fr/output.json'
import de from '@/i18n/locales/de/output.json'
import it from '@/i18n/locales/it/output.json'

const flat = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`],
  )

const REQUIRED = [
  'headline.usable', 'headline.effective', 'headline.efficiency', 'headline.peakIops',
  'headline.survival', 'headline.annualEnergy', 'headline.runSurvival',
  'acts.capacity', 'acts.performance', 'acts.resilience', 'acts.cost', 'acts.takeaway',
  'acts.forEngineers',
]

describe('output namespace headline/act keys', () => {
  it.each([['en', en], ['fr', fr], ['de', de], ['it', it]] as const)('%s has all required keys', (_n, loc) => {
    const keys = new Set(flat(loc))
    for (const k of REQUIRED) expect(keys.has(k)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/i18n/output-keys.spec.ts`
Expected: FAIL — required keys absent.

- [ ] **Step 3: Add the keys to all four locales**

Add to each `output.json` (translate values per locale; keep RAID/ZFS/IOPS technical terms untranslated). English example:

```json
{
  "headline": {
    "title": "At a glance",
    "usable": "Usable",
    "effective": "Effective",
    "efficiency": "Efficiency",
    "peakIops": "Peak IOPS",
    "survival": "Annual survival",
    "annualEnergy": "Annual energy",
    "runSurvival": "Run survival"
  },
  "acts": {
    "capacity": "Capacity",
    "performance": "Performance",
    "resilience": "Resilience",
    "cost": "Cost & Sustainability",
    "takeaway": "Take it away",
    "forEngineers": "Provisioning commands (for your engineers)"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/i18n/output-keys.spec.ts`
Expected: PASS for all four locales.

- [ ] **Step 5: Commit**

```bash
rtk git add src/i18n/locales tests/i18n/output-keys.spec.ts
rtk git commit -m "i18n(output): headline band + act heading keys (en/fr/de/it)"
```

---

### Task 9: HeadlineBand component

**Files:**
- Create: `src/components/outputs/HeadlineBand.tsx`
- Modify: `src/components/outputs/index.ts`
- Test: `tests/components/outputs/HeadlineBand.spec.tsx`

**Interfaces:**
- Consumes: `RelevanceContext`, `shouldShowKpi` from `@/engines/outputRelevance`; `VolumetryResult`, `PerformanceResult`, `ResilienceResult | null`, `SustainabilityResult`; `useFormatBytes`, `formatNumber` from `@/hooks`; `AnimatedBytes`, `AnimatedPercent` from `@/components/outputs`.
- Produces: `HeadlineBand({ volumetry, performance, resilience, sustainability, topology, onRunSurvival }: HeadlineBandProps)`. Renders only KPI tiles for which `shouldShowKpi` is true. Re-exported.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/outputs/HeadlineBand.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeadlineBand } from '@/components/outputs'
import type { PerformanceResult, SustainabilityResult, VolumetryResult } from '@/types/results'

const volumetry: VolumetryResult = {
  rawCapacity: 1e12, parityOverhead: 1e11, hotSpareOverhead: 0, filesystemOverhead: 0,
  slopOverhead: 0, usableCapacity: 9e11, effectiveCapacity: 9e11, efficiency: 90, breakdown: [],
}
const performance: PerformanceResult = {
  maxReadThroughputMBs: 1200, maxWriteThroughputMBs: 800, maxReadIOPS: 500000, maxWriteIOPS: 300000,
  layers: [], bottleneckDescription: '',
}
const sustainability: SustainabilityResult = {
  annualEnergyKwh: 5000, annualEnergyCost: 1000, annualCO2Kg: 800,
  powerBreakdown: { drives: 100, servers: 50, cooling: 30, total: 180 },
}

it('omits the effective tile for RAID (effective === usable)', () => {
  render(
    <HeadlineBand
      volumetry={volumetry} performance={performance} resilience={null}
      sustainability={sustainability} topology={{ type: 'standard', level: 'RAID5' }}
      onRunSurvival={vi.fn()}
    />,
  )
  expect(screen.queryByText('Effective')).not.toBeInTheDocument()
  expect(screen.getByText('Usable')).toBeInTheDocument()
})

it('shows a run-survival affordance when no simulation result', () => {
  render(
    <HeadlineBand
      volumetry={volumetry} performance={performance} resilience={null}
      sustainability={sustainability} topology={{ type: 'standard', level: 'RAID5' }}
      onRunSurvival={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: /run survival/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/outputs/HeadlineBand.spec.tsx`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement HeadlineBand**

```tsx
// src/components/outputs/HeadlineBand.tsx
import { useTranslation } from 'react-i18next'
import { shouldShowKpi, type RelevanceContext } from '@/engines/outputRelevance'
import { formatNumber, useFormatBytes } from '@/hooks'
import type { PerformanceResult, ResilienceResult, SustainabilityResult, VolumetryResult } from '@/types/results'
import type { Topology } from '@/types/topology'
import { AnimatedBytes, AnimatedPercent } from './AnimatedCounter'

interface HeadlineBandProps {
  volumetry: VolumetryResult
  performance: PerformanceResult
  resilience: ResilienceResult | null
  sustainability: SustainabilityResult
  topology: Topology
  onRunSurvival: () => void
}

export function HeadlineBand({
  volumetry, performance, resilience, sustainability, topology, onRunSurvival,
}: HeadlineBandProps) {
  const { t } = useTranslation('output')
  const formatBytes = useFormatBytes()
  const ctx: RelevanceContext = {
    topology, volumetry, sustainability,
    hasResilienceResult: resilience != null, hasBackup: false,
  }
  const peakIops = Math.max(performance.maxReadIOPS, performance.maxWriteIOPS)

  return (
    <div className="panel">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {shouldShowKpi('usable', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-400"><AnimatedBytes value={volumetry.usableCapacity} /></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.usable')}</p>
          </div>
        )}
        {shouldShowKpi('effective', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400"><AnimatedBytes value={volumetry.effectiveCapacity} /></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.effective')}</p>
          </div>
        )}
        {shouldShowKpi('efficiency', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white"><AnimatedPercent value={volumetry.efficiency} /></div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.efficiency')}</p>
          </div>
        )}
        {shouldShowKpi('peakIops', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{formatNumber(Math.round(peakIops))}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.peakIops')}</p>
          </div>
        )}
        <div className="text-center">
          {shouldShowKpi('survival', ctx) && resilience ? (
            <>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{resilience.survivalPercent}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.survival')}</p>
            </>
          ) : (
            <button type="button" onClick={onRunSurvival} className="px-3 py-2 text-xs font-medium rounded bg-primary-600 hover:bg-primary-500 transition-colors">
              {t('headline.runSurvival')}
            </button>
          )}
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
            {formatNumber(Math.round(sustainability.annualEnergyKwh))}
            <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">kWh</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.annualEnergy')}</p>
        </div>
      </div>
    </div>
  )
}
```

Add `export { HeadlineBand } from './HeadlineBand'` to `index.ts`.

- [ ] **Step 4: Run tests + typecheck**

Run: `rtk vitest run tests/components/outputs/HeadlineBand.spec.tsx && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/outputs/HeadlineBand.tsx src/components/outputs/index.ts tests/components/outputs/HeadlineBand.spec.tsx
rtk git commit -m "feat(outputs): capability-filtered HeadlineBand KPI strip"
```

---

### Task 10: Compose the narrative in OutputDashboard (Approach B)

**Files:**
- Modify: `src/components/layout/OutputDashboard.tsx`
- Test: `tests/components/layout/OutputDashboard.spec.tsx` (create — smoke test the full narrative renders)

**Interfaces:**
- Consumes: all act components + `HeadlineBand` + `shouldShowSection`.
- Produces: the final composed dashboard.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/OutputDashboard.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OutputDashboard } from '@/components/layout/OutputDashboard'

// Store + hooks use real defaults; the dashboard must render the headline band
// heading and the five act headings for the default RAID config.
it('renders the headline band and act headings', () => {
  render(<OutputDashboard />)
  expect(screen.getByText(/capacity/i)).toBeInTheDocument()
  expect(screen.getByText(/performance/i)).toBeInTheDocument()
  expect(screen.getByText(/resilience/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run tests/components/layout/OutputDashboard.spec.tsx`
Expected: FAIL initially if headings differ, or PASS trivially — if it passes, tighten it to assert `getByText(t('acts.capacity'))` order before proceeding. Confirm the assertion exercises the new composition.

- [ ] **Step 3: Re-sequence the render tree**

Replace the `<main>` grid body of `OutputDashboard.tsx` (currently `:298-984`) with the Approach-B order. Keep all the hook calls, `mirrorCopies`, export handlers, and `capacitySegments` logic above `return`; pass the `useResilience` outputs down. New body:

```tsx
return (
  <main className="flex-1 overflow-y-auto p-6 space-y-6">
    <HeadlineBand
      volumetry={volumetry}
      performance={performance}
      resilience={resilienceResult}
      sustainability={sustainability}
      topology={topology}
      onRunSurvival={runSimulation}
    />

    <CapacityAct
      volumetry={volumetry}
      backup={backup}
      topology={topology}
      operationalLimit={operationalLimit}
      performanceThreshold={performanceThreshold}
    />

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <PerformanceAct performance={performance} />
      <ResilienceAct
        result={resilienceResult}
        progress={resilienceProgress}
        isRunning={resilienceRunning}
        runSimulation={runSimulation}
        isMobile={isMobile}
      />
    </div>

    <CostAct sustainability={sustainability} />

    <TakeawayAct
      topology={topology}
      zfsOptions={topology.type === 'zfs' ? zfsOptions : undefined}
      performance={performance}
      selectedDrive={selectedDrive}
      exportError={exportError}
      onExportPdf={handleExportPdf}
      onExportPptx={handleExportPptx}
      onExportYaml={handleExportYaml}
      onExportAnsible={handleExportAnsible}
      onExportTerraform={handleExportTerraform}
    />
  </main>
)
```

Update the import block to pull the act components + `HeadlineBand` from `@/components/outputs`. Remove now-unused imports (`InfoTooltip`, `DonutChart`, etc. moved into acts) — the typecheck/lint `noUnusedImports: error` gate will flag any left behind.

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `rtk vitest run tests/components/layout/OutputDashboard.spec.tsx && rtk npm run typecheck && rtk vitest run`
Expected: PASS; whole suite green.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint:fix
rtk git add src/components/layout/OutputDashboard.tsx tests/components/layout/OutputDashboard.spec.tsx
rtk git commit -m "feat(outputs): compose presales guided-narrative layout (headline + acts)"
```

---

### Task 11: Re-sequence the input accordion

**Files:**
- Modify: `src/components/layout/InputSidebar.tsx`
- Test: `tests/components/layout/InputSidebar.spec.tsx` (create — assert section order)

**Interfaces:**
- Produces: accordion order Topology → Hardware → Workload → Advanced → Drive Properties, with `topology` and `hardware` open by default (unchanged default set).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/layout/InputSidebar.spec.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InputSidebar } from '@/components/layout/InputSidebar'

it('renders accordion sections in narrative build order', () => {
  render(<InputSidebar />)
  const headings = screen.getAllByRole('button').map((b) => b.textContent?.trim())
  const topoIdx = headings.findIndex((h) => /topolog/i.test(h ?? ''))
  const hwIdx = headings.findIndex((h) => /hardware/i.test(h ?? ''))
  const wlIdx = headings.findIndex((h) => /workload/i.test(h ?? ''))
  expect(topoIdx).toBeGreaterThanOrEqual(0)
  expect(topoIdx).toBeLessThan(hwIdx)
  expect(hwIdx).toBeLessThan(wlIdx)
})
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `rtk vitest run tests/components/layout/InputSidebar.spec.tsx`
Expected: The current order is already Topology → Hardware → Workload → Advanced → Drive Properties, so this may PASS immediately. If it passes, the re-sequence is a confirmation-only task: keep the test as a regression guard and proceed to Step 5 (no code change, commit the test). If the desired order differs after review, reorder the `AccordionItem` blocks accordingly and re-run.

- [ ] **Step 3: (If needed) reorder AccordionItem blocks**

Ensure the five `<AccordionItem>` blocks in `InputSidebar.tsx` appear in the order: `topology`, `hardware`, `workload`, `advanced`, `drive-properties`. Confirm the default-open set stays `new Set(['hardware', 'topology'])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run tests/components/layout/InputSidebar.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run lint:fix
rtk git add src/components/layout/InputSidebar.tsx tests/components/layout/InputSidebar.spec.tsx
rtk git commit -m "feat(inputs): confirm narrative build-order accordion + regression guard"
```

---

### Task 12: Browser verification + export parity

**Files:** none (verification task); may add notes under `.planning/` if the repo convention wants evidence.

- [ ] **Step 1: Start the dev server**

Run: `rtk npm run dev` (note the local URL).

- [ ] **Step 2: Verify the narrative for a RAID config**

Load default RAID-5. Confirm: headline band shows Usable / Efficiency / Peak IOPS / Annual energy and a "Run survival" button (no Effective tile). Acts render in order Capacity → (Performance | Resilience) → Cost → Take-it-away. Provisioning commands are collapsed under "for your engineers".

- [ ] **Step 3: Verify not-applicable omissions**

Switch to Longhorn: confirm no dedup/compression framing appears in Capacity, the Longhorn detail sub-panel renders, and (for an HDD drive) no flash-endurance block shows. Switch to a flash drive: flash-endurance block appears in Cost. Switch to ZFS with compression: the Effective headline tile appears.

- [ ] **Step 4: Export parity**

Run the survival simulation, then export PPTX and PDF. Open both and confirm usable/effective/efficiency/IOPS/survival/energy match the on-screen values (both light and dark themes).

- [ ] **Step 5: Record + commit evidence (if applicable)**

If the repo wants planning evidence, add a short note; otherwise no commit. Confirm `rtk vitest run && rtk npm run build` are green.

---

### Task 13: Docs sync

**Files:**
- Modify: `docs/ARCHITECTURE.md` (UI Layout section), `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update ARCHITECTURE.md UI Layout**

Replace the "Split-screen Cockpit / OutputDashboard with Sankey, gauge, donut, breakdown list" description with the new structure: headline KPI band + five narrative acts (Capacity, Performance, Resilience, Cost, Take-away), capability-driven output relevance via `src/engines/outputRelevance.ts`, and the act component decomposition under `src/components/outputs/acts/`.

- [ ] **Step 2: Update README.md**

Update any dashboard/screenshot description to the narrative layout.

- [ ] **Step 3: Update CHANGELOG.md**

Add an Unreleased entry: presales-first guided-narrative dashboard, headline KPI band, capability-driven output relevance, OutputDashboard decomposition.

- [ ] **Step 4: Commit**

```bash
rtk git add docs/ARCHITECTURE.md README.md CHANGELOG.md
rtk git commit -m "docs: sync architecture/readme/changelog with narrative dashboard"
```

---

## Self-Review

**Spec coverage:**
- §4.1 narrative arc → Tasks 3-7 (acts) + Task 10 (composition). ✓
- §4.2 headline band → Task 9 + Task 8 (i18n). ✓
- §4.3 act layout (Performance|Resilience side by side, commands collapsed) → Task 10 + Task 7. ✓
- §5 capability-driven relevance → Task 1 (`outputRelevance.ts`), wired in Tasks 9/10. ✓
- §6 input re-sequence → Task 11. ✓
- §7 shell (no present mode; collapse-inputs deferred) → honored; deferred per Decision 3. ✓
- §8 decomposition → Tasks 2-7. ✓
- §9 i18n/a11y/testing → Task 8 + per-task tests; semantic headings via act `<section>`/`<h3>` (preserved from moved markup). ✓
- §10 delivery plan order (relevance → decompose → compose → inputs → docs) → Tasks 1 → 2-7 → 9-10 → 11 → 13. ✓
- §11 verification → Task 12. ✓
- §12 open questions → all four settled in Decisions block. ✓

**Placeholder scan:** No TBD/TODO; every code step shows concrete code; no "similar to Task N" (each extraction cites exact source line ranges).

**Type consistency:** `RelevanceContext`, `shouldShowKpi`/`shouldShowSection`, `KpiId`/`SectionId` are defined in Task 1 and consumed unchanged in Tasks 9-10. Act prop names (`result`/`progress`/`isRunning`/`runSimulation`/`isMobile` for ResilienceAct; `onExport*` for TakeawayAct) match between their producing task and Task 10's composition. `resilienceResult`/`resilienceProgress`/`resilienceRunning`/`runSimulation` are the exact names destructured from `useResilience` in the current `OutputDashboard.tsx:172-186`.

## Note on the extraction tasks (2-7)

These are **pure refactors**: the moved JSX already exists in `OutputDashboard.tsx` at the cited line ranges. Each step instructs which lines to move and gives the new component's exact prop signature and a render smoke test; the body is the existing markup transplanted verbatim with local variable references swapped for props. This is deliberate — reproducing 100+ lines of unchanged JSX inline would add risk of transcription drift, whereas "move lines X-Y, swap var `foo` for prop `foo`" is unambiguous and the render test + `noUnusedImports`/typecheck gates catch mistakes.
