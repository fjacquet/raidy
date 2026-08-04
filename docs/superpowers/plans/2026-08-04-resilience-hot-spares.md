# Resilience Hot Spares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove hot spares from the drive population the resilience Monte Carlo simulates, on the same rule volumetry and performance already use.

**Architecture:** Two subtraction sites in `src/hooks/useResilience.ts` — the naive fallback path inside `runSimulation`, and `tieredPlatformScope`. Both apply `usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount`, clamped at 0. BeeGFS already subtracts inside its own resolver and is not touched.

**Tech Stack:** TypeScript strict, React 19 hooks, Vitest + `@testing-library/react`, existing `installMockWorker` fixture.

## Global Constraints

- The rule is copied verbatim from `src/hooks/useVolumetryCalc.ts:80`, not re-invented:
  `const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount`
- Every subtraction is clamped with `Math.max(0, …)`. Never a negative count, never a fabricated drive.
- `groupCount` / `SimulationInput.serverCount` must not change at either site.
- `resolveBeeGfsSimulationScope` and the BeeGFS table entry are **not** modified. Subtracting again at the call site would double-count.
- No existing test may be edited. If an existing test asserts an unadjusted population with `hotSpares > 0`, it is asserting the defect — STOP and report BLOCKED rather than editing it.
- Verification after every task: `rtk npm run lint:fix`, `rtk npm run typecheck`, `rtk npx vitest run`. All must be clean.
- Branch from `main` (PR #85 on `fix/url-schema-hardening` is unrelated and still open). Branch name: `fix/resilience-hot-spares`.
- Commit messages use conventional-commit prefixes (`fix:`, `docs:`, `test:`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/hooks/useResilience.ts` | Both subtraction sites | 1, 2 |
| `tests/hooks/useResilienceHotSpares.spec.ts` | All hot-spare population assertions, both paths | 1, 2 |
| `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md` | Documentation of the behaviour change and the residual gap | 2 |

---

### Task 1: Subtract hot spares on the naive path

**Files:**
- Modify: `src/hooks/useResilience.ts` (around `:424-444`, inside `runSimulation`)
- Test: `tests/hooks/useResilienceHotSpares.spec.ts` (create)

**Interfaces:**
- Consumes: `usesDistributedSpares` from `@/types` (already exported; see `src/types/topology.ts:340`), `effectiveServerCount` from `@/engines/capabilities` (already imported in this file), `installMockWorker` from `tests/fixtures/mock-worker`.
- Produces: a local `const totalHotSpares: number` inside `runSimulation`, defined before the `scope` resolution so Task 2 can hand it to `tieredPlatformScope`.

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/useResilienceHotSpares.spec.ts`:

```ts
/**
 * The simulated population must exclude hot spares, on the same rule volumetry
 * (`useVolumetryCalc.ts:80`) and performance (`usePerformanceCalc.ts:77`) use. A spare holds no
 * data, so counting it as a data-bearing member inflated the failure population and reported a
 * worse survival rate than the configuration has. Issue #80.
 *
 * Platforms using distributed spares (vSAN) subtract zero — the rule is what holds their
 * population fixed, not the absence of a subtraction, which is why they are asserted here too.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useResilience } from '@/hooks/useResilience'
import type { Topology } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'
import { installMockWorker } from '../fixtures/mock-worker'
import { capacityDrive } from '../fixtures/tiering-fixtures'

let posted: SimulationInput[] = []
let uninstall: () => void

beforeEach(() => {
  ;({ posted, uninstall } = installMockWorker())
})

afterEach(() => {
  uninstall()
})

function runWith(
  topology: Topology,
  hotSpares: number,
  extra: Record<string, unknown> = {},
  driveCount = 12,
  serverCount = 2,
): SimulationInput {
  const { result } = renderHook(() =>
    useResilience({
      drive: capacityDrive,
      driveCount,
      serverCount,
      hotSpares,
      topology,
      simulationCount: 10,
      autoRun: false,
      ...extra,
    }),
  )
  act(() => {
    result.current.runSimulation()
  })
  const input = posted[0]
  if (!input) throw new Error('no simulation input was posted')
  return input
}

const RAID6: Topology = { type: 'standard', level: 'raid6' }
const ZFS: Topology = { type: 'zfs', level: 'raidz2' }

describe('useResilience hot spares — naive path', () => {
  it('excludes hot spares from the simulated population (standard RAID)', () => {
    // 12 drives x 2 servers = 24, minus 1 spare per server = 22
    expect(runWith(RAID6, 1).driveCount).toBe(22)
  })

  it('applies to every non-tiered platform, not just standard RAID (ZFS)', () => {
    expect(runWith(ZFS, 1).driveCount).toBe(22)
  })

  it('leaves a spare-free configuration exactly as it was', () => {
    expect(runWith(RAID6, 0).driveCount).toBe(24)
  })

  it('does not change the fault-group count', () => {
    expect(runWith(RAID6, 1).serverCount).toBe(2)
  })

  it('clamps at zero when spares consume the whole population', () => {
    expect(runWith(RAID6, 99).driveCount).toBe(0)
  })

  it('subtracts nothing for vSAN ESA, which rebuilds from distributed slack', () => {
    const esa: Topology = { type: 'vsan_esa', level: 'vsan_esa_raid5' }
    expect(runWith(esa, 3).driveCount).toBe(24)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/hooks/useResilienceHotSpares.spec.ts`

Expected: the first two cases and the clamp case FAIL, reporting `expected 24 to be 22` (and `24` where `0` was expected). The `hotSpares: 0`, group-count, and vSAN ESA cases pass already — they pin invariance, and their passing before the fix is the point.

- [ ] **Step 3: Implement the subtraction**

In `src/hooks/useResilience.ts`, add `usesDistributedSpares` to the existing `@/types` import, then inside `runSimulation`, immediately after the `effServerCount` line and before the `scope` resolution, insert:

```ts
    // A hot spare holds no data, so its failure is not a data-loss event. Volumetry
    // (useVolumetryCalc.ts:80) and performance (usePerformanceCalc.ts:77) already remove spares
    // from their populations on this exact rule; resilience did not, which inflated the failure
    // population and understated survival for every configuration with a spare (#80).
    // vSAN rebuilds from distributed slack space rather than dedicated spare drives, so
    // usesDistributedSpares zeroes the subtraction there.
    const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount
```

Then change the population line:

```ts
    const totalDriveCount = scope
      ? scope.driveCount
      : Math.max(0, driveCount * effServerCount - totalHotSpares)
```

Leave the `groupCount` line unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk npx vitest run tests/hooks/useResilienceHotSpares.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite**

Run: `rtk npm run lint:fix && rtk npm run typecheck && rtk npx vitest run`

Expected: all green. If a pre-existing resilience test now fails because it asserted an unadjusted population with `hotSpares > 0`, do not edit it — report BLOCKED with the file, line and assertion.

- [ ] **Step 6: Commit**

```bash
rtk git add src/hooks/useResilience.ts tests/hooks/useResilienceHotSpares.spec.ts
rtk git commit -m "fix(resilience): exclude hot spares from the simulated population (naive path)"
```

---

### Task 2: Subtract hot spares in `tieredPlatformScope`, and document the change

**Files:**
- Modify: `src/hooks/useResilience.ts` — `tieredPlatformScope` (`:173-193`) and its doc comment (`:169-171`)
- Modify: `tests/hooks/useResilienceHotSpares.spec.ts` (append a second `describe`)
- Modify: `CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`

**Interfaces:**
- Consumes: `SimulationScopeContext` already carries `hotSpares` and `topology` — no signature change. `resolveBeeGfsSimulationScope` is exported from the same module and is used by the BeeGFS regression test below.
- Produces: nothing new for later tasks; this is the last code task.

- [ ] **Step 1: Write the failing test**

Append to `tests/hooks/useResilienceHotSpares.spec.ts`. Add these imports to the existing import block at the top of the file:

```ts
import { resolveBeeGfsSimulationScope, useResilience } from '@/hooks/useResilience'
import { DEFAULT_BEEGFS_OPTIONS, DEFAULT_S2D_OPTIONS, DEFAULT_VSAN_OPTIONS } from '@/types'
import { buildTieringConfig, capacityDrive } from '../fixtures/tiering-fixtures'
```

(merging the `useResilience` and `capacityDrive` imports with the ones already there rather than duplicating them), then append:

```ts
/** 2 fast + 6 capacity drives per node — the shared shape used by the other tiering specs. */
const tiering = buildTieringConfig(2, 6)

describe('useResilience hot spares — tiered path', () => {
  it('excludes hot spares from the capacity tier (S2D)', () => {
    const s2d: Topology = { type: 's2d', level: 'mirror' }
    const input = runWith(s2d, 1, {
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: true, tieringConfig: tiering },
    })
    // 6 capacity drives x 2 nodes = 12, minus 1 spare per node = 10
    expect(input.driveCount).toBe(10)
    expect(input.serverCount).toBe(2)
  })

  it('subtracts nothing for vSAN OSA, which rebuilds from distributed slack', () => {
    const osa: Topology = { type: 'vsan_osa', level: 'vsan_osa_raid1' }
    const input = runWith(osa, 3, {
      vsanOptions: { ...DEFAULT_VSAN_OPTIONS, tiering },
    })
    expect(input.driveCount).toBe(12)
  })

  it('clamps at zero when spares exceed the capacity tier', () => {
    const s2d: Topology = { type: 's2d', level: 'mirror' }
    const input = runWith(s2d, 99, {
      s2dOptions: { ...DEFAULT_S2D_OPTIONS, storageTiers: true, tieringConfig: tiering },
    })
    expect(input.driveCount).toBe(0)
  })

  it('does not subtract twice for BeeGFS, which applies spares in its own resolver', () => {
    const beegfs: Topology = { type: 'beegfs', level: 'beegfs_raid6' }
    const input = runWith(beegfs, 1, { beeGfsOptions: DEFAULT_BEEGFS_OPTIONS })
    const expected = resolveBeeGfsSimulationScope(12, 2, 1, DEFAULT_BEEGFS_OPTIONS)
    expect(input.driveCount).toBe(expected.driveCount)
    expect(input.serverCount).toBe(expected.groupCount)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npx vitest run tests/hooks/useResilienceHotSpares.spec.ts`

Expected: the S2D case FAILS with `expected 12 to be 10`, and the clamp case FAILS with `expected 12 to be 0`. The vSAN OSA and BeeGFS cases pass already — both pin invariance.

- [ ] **Step 3: Implement the subtraction**

In `tieredPlatformScope`, destructure `hotSpares` from the context and apply the rule:

```ts
function tieredPlatformScope({
  topology,
  serverCount,
  hotSpares,
  s2dOptions,
  vsanOptions,
  cephOptions,
  nutanixOptions,
}: SimulationScopeContext): PlatformSimulationScope | null {
  const tiering = resolveTiering(topology, serverCount, {
    s2dOptions,
    vsanOptions,
    cephOptions,
    nutanixOptions,
  })
  if (!tiering) return null
  const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount
  return {
    driveCount: Math.max(0, tiering.capacityTierDriveCount - totalHotSpares),
    groupCount: serverCount,
    mediaDrive: tiering.capacityTierDrive,
  }
}
```

`serverCount` here is already `effServerCount` — the call site passes the clamped value.

Replace the doc-comment paragraph at `:169-171` ("Hot spares are not subtracted here — no platform's resilience population subtracts them today (issue #80)…") with:

```
 * Hot spares come off the capacity tier, clamped at zero, mirroring
 * `src/engines/volumetry/index.ts:178`, which clamps the identical quantity the identical way.
 * vSAN rebuilds from distributed slack rather than dedicated spare drives, so
 * `usesDistributedSpares` zeroes the subtraction for it.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk npx vitest run tests/hooks/useResilienceHotSpares.spec.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Update the documentation**

`CHANGELOG.md`, under the current unreleased `### Fixed`:

```markdown
- **Resilience: hot spares are no longer simulated as data-bearing drives** (#80). The Monte Carlo
  population now excludes hot spares on the same rule volumetry and performance use
  (`usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount`, clamped at zero), on both
  the naive and the tiered path. Survival rates rise for every platform configured with spares;
  vSAN is unchanged, since it rebuilds from distributed slack rather than dedicated spare drives.
  The default configuration ships one hot spare, so the out-of-the-box number moves.
```

`docs/ARCHITECTURE.md`, resilience section: state that the simulated population excludes hot
spares on the same rule as the other two engines, that BeeGFS applies it inside its own resolver,
and that the worker does not credit a spare for shortening the rebuild window.

`docs/BACKLOG.md`: add an item recording the residual gap — the simulation has no concept of a
standby drive, so a hot spare's main real contribution (a shorter rebuild exposure window) is
still unmodelled. Follow the file's existing item format.

- [ ] **Step 6: Run the full suite**

Run: `rtk npm run lint:fix && rtk npm run typecheck && rtk npx vitest run`
Expected: all green, no existing test edited.

- [ ] **Step 7: Commit**

```bash
rtk git add src/hooks/useResilience.ts tests/hooks/useResilienceHotSpares.spec.ts CHANGELOG.md docs/ARCHITECTURE.md docs/BACKLOG.md
rtk git commit -m "fix(resilience): exclude hot spares from the tiered capacity population"
```
