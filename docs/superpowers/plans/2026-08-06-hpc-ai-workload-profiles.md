# HPC / AI Workload Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four hardcoded workload presets with a data-driven catalogue that shows six HPC/AI profiles on BeeGFS and the existing four everywhere else, add a `512K` block size, and move the neutral workload defaults to values realistic for parallel filesystems.

**Architecture:** A new constant table (`src/data/workloadProfiles.ts`) holds every profile and a class-per-topology map. `WorkloadPanel` renders whatever that table yields for the current topology instead of four inline `onClick` handlers. No calculation engine changes beyond one new entry in the block-size byte table.

**Tech Stack:** TypeScript (strict), React 19, Zustand, react-i18next, Vitest + Testing Library, Biome, Knip.

**Spec:** `docs/superpowers/specs/2026-08-06-hpc-ai-workload-profiles-design.md`

## Global Constraints

- **Formatter/linter is Biome**: 2-space indent, 100-char line width, single quotes, semicolons as-needed. Run `npm run lint:fix` before every commit.
- **Path aliases**: import via `@/`, `@engines/`, `@components/`, `@store/`, `@types/`, `@utils/`, `@data/`, `@hooks/`. Never write a relative path that crosses a directory boundary in `src/`.
- **i18n keys must appear as full literal strings in `src/**`.** `tests/i18n/orphanKeys.spec.ts` scans source text for literal key substrings. ``t(`presets.${id}`)`` is invisible to it. Keys are stored whole in the data table for exactly this reason.
- **All four locales stay in lockstep.** Every key added to `src/i18n/locales/en/*.json` must be added to `fr`, `de`, and `it` with the same shape. `tests/i18n/parity.spec.ts` enforces this.
- **Technical terms stay untranslated**: RAID, ZFS, NVMe, IOPS, HPC, AI/IA, EDA, CAE, BeeGFS, checkpointing.
- **Docs change in the same commit as behavior.** Any change to config, CI, dependencies, or behavior updates the matching file in `docs/` (plus `README.md`/`CHANGELOG.md` where relevant). Stale docs are a defect, not a follow-up.
- **Component tests must stub `window.matchMedia`.** jsdom does not implement it and `InfoTooltip` reaches it through `useIsTouchDevice`.
- **`npm run check:dead` (Knip) runs in the pre-commit hook and in `prebuild`.** An export nothing imports fails the build. Run it on the main checkout — it reports false positives inside `.claude/worktrees/*`.
- **Do not run `git commit --no-verify`.** It only defers the same gate to build time.

---

### Task 1: Add the `512K` block size

The six HPC profiles need `512K`, which the `BlockSize` enum does not currently offer. Both consuming tables are `Record<BlockSize, …>`, so the compiler names every site that must change.

**Files:**
- Modify: `src/types/config.ts:26`
- Modify: `src/engines/performance/index.ts:73-81`
- Modify: `src/components/inputs/WorkloadPanel.tsx:12-20` and `:118-126`
- Modify: `src/i18n/locales/en/workload.json`, `fr/workload.json`, `de/workload.json`, `it/workload.json`
- Test: `tests/engines/performance/blockSize512k.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `'512K'` as a member of `BLOCK_SIZES` and therefore of the `BlockSize` union. Task 2 and Task 4 both use it.

- [ ] **Step 1: Write the failing test**

Create `tests/engines/performance/blockSize512k.spec.ts`:

```tsx
/**
 * `512K` sits between `256K` and `1M` in the block-size enum, and the throughput model must
 * see it that way. The failure this guards is a copy-paste in `BLOCK_SIZE_BYTES` — an entry
 * added with a neighbour's byte count compiles cleanly (the Record is satisfied), renders a
 * `512K` option in the panel, and silently computes 256K's numbers.
 *
 * Monotonicity alone would not catch that (a duplicate value is still ordered), so the second
 * assertion demands a strict increase at some drive count: if `512K` mapped to 262144, no
 * configuration could produce one.
 */

import { describe, expect, it } from 'vitest'
import { calculatePerformance, type PerformanceInput } from '@/engines/performance'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
} from '@/types'
import { BLOCK_SIZES, type BlockSize } from '@/types/config'
import type { Topology } from '@/types/topology'
import { testSsdNvme } from '../../fixtures/performance-vectors'

const TOPOLOGY: Topology = { type: 'standard', level: 'RAID6' }

function inputFor(driveCount: number, blockSize: BlockSize): PerformanceInput {
  return {
    drive: testSsdNvme,
    driveCount,
    hotSpares: 0,
    serverCount: 1,
    topology: TOPOLOGY,
    controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS, controller: 'perc_h965i' },
    readPercent: 100,
    randomPercent: 100,
    blockSize,
    networkSpeed: '400GbE',
    pcieGen: 'gen5',
    pcieLanes: 'x16',
    powerFlexOptions: DEFAULT_POWERFLEX_OPTIONS,
    cephOptions: DEFAULT_CEPH_OPTIONS,
    nutanixOptions: DEFAULT_NUTANIX_OPTIONS,
    beeGfsOptions: DEFAULT_BEEGFS_OPTIONS,
  }
}

describe('512K block size', () => {
  it('is offered by the enum, between 256K and 1M', () => {
    expect(BLOCK_SIZES).toContain('512K')
    expect(BLOCK_SIZES.indexOf('256K')).toBeLessThan(BLOCK_SIZES.indexOf('512K'))
    expect(BLOCK_SIZES.indexOf('512K')).toBeLessThan(BLOCK_SIZES.indexOf('1M'))
  })

  it('never reads below 256K or above 1M at the same configuration', () => {
    for (const drives of [1, 4, 24, 96]) {
      const small = calculatePerformance(inputFor(drives, '256K')).maxReadThroughputMBs
      const mid = calculatePerformance(inputFor(drives, '512K')).maxReadThroughputMBs
      const large = calculatePerformance(inputFor(drives, '1M')).maxReadThroughputMBs
      expect(mid).toBeGreaterThanOrEqual(small)
      expect(mid).toBeLessThanOrEqual(large)
    }
  })

  it('is a distinct byte count, not a duplicate of a neighbour', () => {
    const strictlyAbove256K = [1, 4, 24, 96].some(
      (drives) =>
        calculatePerformance(inputFor(drives, '512K')).maxReadThroughputMBs >
        calculatePerformance(inputFor(drives, '256K')).maxReadThroughputMBs,
    )
    expect(strictlyAbove256K).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/engines/performance/blockSize512k.spec.ts --run
```

Expected: a TypeScript/runtime failure on `'512K'` not being assignable to `BlockSize`, or `expect(BLOCK_SIZES).toContain('512K')` failing. Either is the correct red.

- [ ] **Step 3: Add `512K` to the enum**

`src/types/config.ts` line 26 — insert between `'256K'` and `'1M'`:

```ts
/** Workload block size options */
export const BLOCK_SIZES = ['4K', '8K', '16K', '64K', '128K', '256K', '512K', '1M'] as const
```

- [ ] **Step 4: Run the typechecker to list every site the compiler now rejects**

```bash
npm run typecheck
```

Expected: errors on `BLOCK_SIZE_BYTES` (`src/engines/performance/index.ts`) and `BLOCK_SIZE_LABELS` (`src/components/inputs/WorkloadPanel.tsx`) — both are `Record<BlockSize, …>` and are now missing a key. This is the exhaustiveness working; those two are the complete list.

- [ ] **Step 5: Add the byte count**

`src/engines/performance/index.ts`, inside `BLOCK_SIZE_BYTES`, between `'256K'` and `'1M'`:

```ts
  '512K': 524288,
```

- [ ] **Step 6: Add the panel label and hint**

`src/components/inputs/WorkloadPanel.tsx`, inside `BLOCK_SIZE_LABELS`, between `'256K'` and `'1M'`:

```ts
  '512K': '512K',
```

And in the hint paragraph (currently lines 118-126), between the `256K` and `1M` lines:

```tsx
          {blockSize === '512K' && t('blockSize.hint512k')}
```

- [ ] **Step 7: Add `hint512k` to all four locales**

`src/i18n/locales/en/workload.json`, in `blockSize`, after `hint256k`:

```json
    "hint512k": "512K - HPC scratch, AI training data",
```

`fr/workload.json`:

```json
    "hint512k": "512K - Scratch HPC, données d'entraînement IA",
```

`de/workload.json`:

```json
    "hint512k": "512K - HPC-Scratch, KI-Trainingsdaten",
```

`it/workload.json`:

```json
    "hint512k": "512K - Scratch HPC, dati di training IA",
```

- [ ] **Step 8: Run the new test, the i18n suite, and the typechecker**

```bash
npm test -- tests/engines/performance/blockSize512k.spec.ts tests/i18n --run
npm run typecheck
```

Expected: all pass. If the third assertion ("distinct byte count") fails, the byte value in Step 5 is wrong — it is `524288`, not a neighbour's value.

- [ ] **Step 9: Run the full suite to catch anything that assumed seven block sizes**

```bash
npm run test:run
```

Expected: pass. A failure here means some test enumerated `BLOCK_SIZES` and asserted its length or contents; update that assertion to include `512K`.

- [ ] **Step 10: Lint and commit**

```bash
npm run lint:fix
git add src/types/config.ts src/engines/performance/index.ts \
        src/components/inputs/WorkloadPanel.tsx src/i18n/locales \
        tests/engines/performance/blockSize512k.spec.ts
git commit -m "feat(workload): add 512K block size"
```

---

### Task 2: Build the workload profile catalogue

Turn the presets into a data table, classed per platform. Nothing consumes it yet — Task 3 wires it in. Knip would flag an unused export, so this task ships the table together with the spec that imports it, and Step 8 verifies the gate is satisfied.

**Files:**
- Create: `src/data/workloadProfiles.ts`
- Test: `tests/data/workloadProfiles.spec.ts` (create)

**Interfaces:**
- Consumes: `BlockSize` and `BLOCK_SIZES` from `@/types/config` (now including `'512K'` from Task 1); `TopologyType` from `@/types/topology`.
- Produces, all consumed by Task 3:
  - `type ProfileClass = 'hpc' | 'general'`
  - `interface WorkloadProfile { id: string; labelKey: string; class: ProfileClass; readPercent: number; randomPercent: number; blockSize: BlockSize }`
  - `const WORKLOAD_PROFILES: readonly WorkloadProfile[]`
  - `const TOPOLOGY_PROFILE_CLASSES: Record<TopologyType, readonly ProfileClass[]>`
  - `function profilesForTopology(type: TopologyType): readonly WorkloadProfile[]`
  - `function isHpcTopology(type: TopologyType): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/data/workloadProfiles.spec.ts`:

```ts
/**
 * The preset buttons are data now, and two things about that data are load-bearing.
 *
 * Every `labelKey` must resolve in all four locales: react-i18next renders a missing key as its
 * own name, so a typo ships the literal text `presets.aiTraining` on screen — in a language the
 * author may not read, with every other test green.
 *
 * Every topology must map to a non-empty class list, or its panel renders an empty grid. The
 * `Record<TopologyType, …>` catches an omitted platform at compile time; this catches an empty
 * array, which the type system permits.
 */

import { describe, expect, it } from 'vitest'
import {
  isHpcTopology,
  profilesForTopology,
  TOPOLOGY_PROFILE_CLASSES,
  WORKLOAD_PROFILES,
} from '@/data/workloadProfiles'
import de from '@/i18n/locales/de/workload.json'
import en from '@/i18n/locales/en/workload.json'
import fr from '@/i18n/locales/fr/workload.json'
import it from '@/i18n/locales/it/workload.json'
import { BLOCK_SIZES } from '@/types/config'
import type { TopologyType } from '@/types/topology'

const LOCALES: Record<string, unknown> = { en, fr, de, it }

/** Resolves 'presets.aiTraining' against a parsed locale file. */
function lookup(bundle: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      bundle,
    )
}

describe('workload profile catalogue', () => {
  it('holds well-formed values', () => {
    for (const p of WORKLOAD_PROFILES) {
      expect(p.readPercent).toBeGreaterThanOrEqual(0)
      expect(p.readPercent).toBeLessThanOrEqual(100)
      expect(p.randomPercent).toBeGreaterThanOrEqual(0)
      expect(p.randomPercent).toBeLessThanOrEqual(100)
      expect(BLOCK_SIZES).toContain(p.blockSize)
    }
  })

  it('has unique ids', () => {
    const ids = WORKLOAD_PROFILES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves every label in all four locales', () => {
    for (const p of WORKLOAD_PROFILES) {
      for (const [lang, bundle] of Object.entries(LOCALES)) {
        const value = lookup(bundle, p.labelKey)
        expect(typeof value, `${lang} is missing ${p.labelKey}`).toBe('string')
        expect(String(value).length).toBeGreaterThan(0)
      }
    }
  })

  it('gives every topology at least one profile', () => {
    for (const type of Object.keys(TOPOLOGY_PROFILE_CLASSES) as TopologyType[]) {
      expect(TOPOLOGY_PROFILE_CLASSES[type].length).toBeGreaterThan(0)
      expect(profilesForTopology(type).length).toBeGreaterThan(0)
    }
  })

  it('gives BeeGFS the HPC profiles and no general ones', () => {
    const ids = profilesForTopology('beegfs').map((p) => p.id)
    expect(ids).toContain('aiTraining')
    expect(ids).toContain('aiCheckpointing')
    expect(ids).not.toContain('database')
    expect(isHpcTopology('beegfs')).toBe(true)
  })

  it('leaves standard RAID with the general profiles only', () => {
    const ids = profilesForTopology('standard').map((p) => p.id)
    expect(ids).toContain('database')
    expect(ids).toContain('fileServer')
    expect(ids).not.toContain('aiTraining')
    expect(isHpcTopology('standard')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/data/workloadProfiles.spec.ts --run
```

Expected: FAIL — cannot resolve `@/data/workloadProfiles`.

- [ ] **Step 3: Write the catalogue**

Create `src/data/workloadProfiles.ts`:

```ts
/**
 * Workload presets, as data.
 *
 * These were four inline `onClick` bodies in WorkloadPanel — Database, File Server, Video
 * Streaming, Backup — and none of them describes a workload BeeGFS is deployed for. A parallel
 * filesystem serves HPC scratch, AI training and checkpointing, genomics and EDA; offering its
 * users an OLTP preset misrepresents the sizing before a single number is computed.
 *
 * So each profile carries a class, each topology declares which classes it serves, and the panel
 * renders the intersection. BeeGFS gets six HPC profiles; every other platform keeps the same
 * four it had, unchanged in both values and order.
 *
 * WHY NOT src/engines/capabilities.ts — the other per-topology map in this codebase. Every flag
 * there is asserted against real engine behaviour by tests/engines/capabilities.spec.ts, which is
 * what stops it drifting. Workload fit is an editorial judgement with no engine behaviour to
 * probe. Parking an unprobeable flag in that file would weaken the invariant that makes it worth
 * trusting.
 *
 * WHY labelKey HOLDS A WHOLE PATH — tests/i18n/orphanKeys.spec.ts scans src/**\/*.{ts,tsx} for
 * literal key substrings, so a literal here is visible to it. A template at the call site
 * (`t(`presets.${id}`)`) would not be, and would need a DYNAMIC_PREFIXES exemption covering the
 * whole subtree — the weaker check.
 *
 * Block sizes: the source recommendations give ranges ("512K to 1M"). `blockSize` is an enum, so
 * each profile takes one value from within its range — the larger end where throughput dominates,
 * the smaller where the pipeline is mixed.
 */

import type { BlockSize } from '@/types/config'
import type { TopologyType } from '@/types/topology'

/** Which audience a profile describes. A platform may serve more than one. */
export type ProfileClass = 'hpc' | 'general'

export interface WorkloadProfile {
  /** Stable identity, used as the React key and in tests. */
  id: string
  /** Full literal i18n path in the `workload` namespace — see the note above. */
  labelKey: string
  class: ProfileClass
  readPercent: number
  randomPercent: number
  blockSize: BlockSize
}

export const WORKLOAD_PROFILES: readonly WorkloadProfile[] = [
  // HPC / AI — from the BeeGFS workload recommendations.
  {
    id: 'aiTraining',
    labelKey: 'presets.aiTraining',
    class: 'hpc',
    readPercent: 70,
    randomPercent: 30,
    blockSize: '512K',
  },
  {
    id: 'aiCheckpointing',
    labelKey: 'presets.aiCheckpointing',
    class: 'hpc',
    readPercent: 20,
    randomPercent: 10,
    blockSize: '1M',
  },
  {
    id: 'hpcScratch',
    labelKey: 'presets.hpcScratch',
    class: 'hpc',
    readPercent: 60,
    randomPercent: 20,
    blockSize: '1M',
  },
  {
    id: 'genomics',
    labelKey: 'presets.genomics',
    class: 'hpc',
    readPercent: 65,
    randomPercent: 40,
    blockSize: '256K',
  },
  {
    id: 'edaCae',
    labelKey: 'presets.edaCae',
    class: 'hpc',
    readPercent: 55,
    randomPercent: 35,
    blockSize: '256K',
  },
  {
    id: 'aiInference',
    labelKey: 'presets.aiInference',
    class: 'hpc',
    readPercent: 80,
    randomPercent: 25,
    blockSize: '512K',
  },

  // General purpose — these four reproduce the previous inline buttons exactly.
  {
    id: 'database',
    labelKey: 'presets.database',
    class: 'general',
    readPercent: 70,
    randomPercent: 80,
    blockSize: '8K',
  },
  {
    id: 'fileServer',
    labelKey: 'presets.fileServer',
    class: 'general',
    readPercent: 90,
    randomPercent: 20,
    blockSize: '128K',
  },
  {
    id: 'videoStreaming',
    labelKey: 'presets.videoStreaming',
    class: 'general',
    readPercent: 95,
    randomPercent: 10,
    blockSize: '1M',
  },
  {
    id: 'backup',
    labelKey: 'presets.backup',
    class: 'general',
    readPercent: 20,
    randomPercent: 5,
    blockSize: '1M',
  },
]

/**
 * Which profile classes each platform serves. Exhaustive over TopologyType — a new platform
 * fails to compile until someone decides which audience it is for.
 *
 * Only BeeGFS is HPC today. Ceph and Longhorn appear in HPC deployments too; making either
 * `['hpc', 'general']` is a one-line change when there is a reason to make it.
 */
export const TOPOLOGY_PROFILE_CLASSES: Record<TopologyType, readonly ProfileClass[]> = {
  standard: ['general'],
  zfs: ['general'],
  s2d: ['general'],
  proprietary: ['general'],
  vsan_osa: ['general'],
  vsan_esa: ['general'],
  ceph: ['general'],
  powerflex: ['general'],
  powerstore: ['general'],
  powerscale: ['general'],
  objectscale: ['general'],
  nutanix: ['general'],
  powervault: ['general'],
  longhorn: ['general'],
  beegfs: ['hpc'],
}

/** The profiles to offer for a topology, in catalogue order. */
export function profilesForTopology(type: TopologyType): readonly WorkloadProfile[] {
  const classes = TOPOLOGY_PROFILE_CLASSES[type]
  return WORKLOAD_PROFILES.filter((p) => classes.includes(p.class))
}

/** True when the panel should use the HPC heading and show the BeeGFS guidance note. */
export function isHpcTopology(type: TopologyType): boolean {
  return TOPOLOGY_PROFILE_CLASSES[type].includes('hpc')
}
```

- [ ] **Step 4: Add the six profile labels to `en`**

`src/i18n/locales/en/workload.json`, inside `presets`, after `label`:

```json
    "labelHpc": "HPC / AI Workload Profile",
    "aiTraining": "AI Training Data",
    "aiCheckpointing": "AI Checkpointing",
    "hpcScratch": "HPC Scratch / Simulation",
    "genomics": "Genomics / Life Sciences",
    "edaCae": "EDA / CAE",
    "aiInference": "AI Inference Repository",
    "hpcGuidance": "BeeGFS is generally optimized for parallel HPC and AI workloads such as scratch space, training data access, and checkpointing. It is not typically the preferred choice for transactional databases, general-purpose file serving, or standard video streaming workloads.",
```

- [ ] **Step 5: Add the same keys to `fr`, `de`, `it`**

`src/i18n/locales/fr/workload.json`, inside `presets`:

```json
    "labelHpc": "Profil de charge HPC / IA",
    "aiTraining": "Données d'entraînement IA",
    "aiCheckpointing": "Checkpointing IA",
    "hpcScratch": "Scratch HPC / Simulation",
    "genomics": "Génomique / Sciences du vivant",
    "edaCae": "EDA / CAE",
    "aiInference": "Référentiel d'inférence IA",
    "hpcGuidance": "BeeGFS est généralement optimisé pour les charges parallèles HPC et IA : espace scratch, accès aux données d'entraînement et checkpointing. Ce n'est habituellement pas le choix privilégié pour les bases de données transactionnelles, le partage de fichiers généraliste ou le streaming vidéo classique.",
```

`src/i18n/locales/de/workload.json`, inside `presets`:

```json
    "labelHpc": "HPC-/KI-Arbeitslast-Profil",
    "aiTraining": "KI-Trainingsdaten",
    "aiCheckpointing": "KI-Checkpointing",
    "hpcScratch": "HPC-Scratch / Simulation",
    "genomics": "Genomik / Life Sciences",
    "edaCae": "EDA / CAE",
    "aiInference": "KI-Inferenz-Repository",
    "hpcGuidance": "BeeGFS ist in der Regel für parallele HPC- und KI-Arbeitslasten optimiert: Scratch-Speicher, Zugriff auf Trainingsdaten und Checkpointing. Für transaktionale Datenbanken, allgemeine Dateidienste oder klassisches Video-Streaming ist es üblicherweise nicht die bevorzugte Wahl.",
```

`src/i18n/locales/it/workload.json`, inside `presets`:

```json
    "labelHpc": "Profilo carico HPC / IA",
    "aiTraining": "Dati training IA",
    "aiCheckpointing": "Checkpointing IA",
    "hpcScratch": "Scratch HPC / Simulazione",
    "genomics": "Genomica / Scienze della vita",
    "edaCae": "EDA / CAE",
    "aiInference": "Repository inferenza IA",
    "hpcGuidance": "BeeGFS è generalmente ottimizzato per carichi paralleli HPC e IA: spazio scratch, accesso ai dati di training e checkpointing. Non è tipicamente la scelta preferita per database transazionali, file serving generico o streaming video standard.",
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm test -- tests/data/workloadProfiles.spec.ts --run
```

Expected: PASS, all six cases.

- [ ] **Step 7: Run the i18n suite**

```bash
npm test -- tests/i18n --run
```

Expected: PASS. `parity.spec.ts` confirms the four locales carry identical key sets. `orphanKeys.spec.ts` finds each new key as a literal — the labels through `workloadProfiles.ts`, and `presets.labelHpc` / `presets.hpcGuidance` only once Task 3 writes them into the panel. **If `orphanKeys` fails on those two keys, that is expected at this point**: proceed, and Task 3 Step 7 re-runs the suite once the panel references them.

- [ ] **Step 8: Run the dead-code gate**

```bash
npm run check:dead
```

Expected: PASS. If Knip reports `ProfileClass` or `TOPOLOGY_PROFILE_CLASSES` as an unused export, do **not** delete them — both are consumed by the spec and by Task 3. Confirm `knip.json` includes `tests/**` in its entry patterns and report the finding rather than working around it.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint:fix
git add src/data/workloadProfiles.ts src/i18n/locales tests/data/workloadProfiles.spec.ts
git commit -m "feat(workload): add HPC/AI profile catalogue"
```

---

### Task 3: Render profiles from the catalogue

`WorkloadPanel` stops hardcoding four buttons and renders whatever the catalogue yields for the current topology, with an HPC heading and guidance note on BeeGFS.

**Files:**
- Modify: `src/components/inputs/WorkloadPanel.tsx:41-54` (store selection) and `:149-198` (the preset block)
- Test: `tests/components/workloadPanelProfiles.spec.tsx` (create)

**Interfaces:**
- Consumes: `profilesForTopology`, `isHpcTopology`, `WorkloadProfile` from `@/data/workloadProfiles` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/components/workloadPanelProfiles.spec.tsx`:

```tsx
/**
 * The preset grid is topology-dependent: BeeGFS gets HPC/AI profiles, everything else keeps the
 * general-purpose four. The failure this guards is a filter that silently degrades to "show
 * everything" — ten buttons render, the panel still looks plausible, and a BeeGFS user is offered
 * an OLTP preset again.
 *
 * react-i18next is mocked to the identity function (the pattern in GuideView.spec.tsx), so the
 * assertions read on key paths rather than English copy and stay valid if the copy is reworded.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  // `i18n` is included because transitive imports (useFormatBytes, InfoTooltip) read the
  // language off the hook's return value; without it they throw on undefined.
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { WorkloadPanel } from '@/components/inputs/WorkloadPanel'
import { useConfigStore } from '@/store'

describe('WorkloadPanel profile grid', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
    useConfigStore.getState().resetToDefaults()
  })

  it('offers the HPC profiles on BeeGFS and none of the general ones', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    render(<WorkloadPanel />)

    expect(screen.getByText('presets.aiTraining')).toBeInTheDocument()
    expect(screen.getByText('presets.aiCheckpointing')).toBeInTheDocument()
    expect(screen.queryByText('presets.database')).not.toBeInTheDocument()
    expect(screen.queryByText('presets.videoStreaming')).not.toBeInTheDocument()
  })

  it('offers the general profiles on standard RAID and none of the HPC ones', () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)

    expect(screen.getByText('presets.database')).toBeInTheDocument()
    expect(screen.getByText('presets.fileServer')).toBeInTheDocument()
    expect(screen.queryByText('presets.aiTraining')).not.toBeInTheDocument()
  })

  it('shows the HPC heading and guidance note only on BeeGFS', () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    const { unmount } = render(<WorkloadPanel />)
    expect(screen.getByText('presets.labelHpc')).toBeInTheDocument()
    expect(screen.getByText('presets.hpcGuidance')).toBeInTheDocument()
    unmount()

    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)
    expect(screen.getByText('presets.label')).toBeInTheDocument()
    expect(screen.queryByText('presets.hpcGuidance')).not.toBeInTheDocument()
  })

  it('applies all three values when a profile is clicked', async () => {
    useConfigStore.getState().setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    render(<WorkloadPanel />)

    await userEvent.click(screen.getByText('presets.aiCheckpointing'))

    const state = useConfigStore.getState()
    expect(state.readPercent).toBe(20)
    expect(state.randomPercent).toBe(10)
    expect(state.blockSize).toBe('1M')
  })

  it('leaves the general profiles behaving exactly as before', async () => {
    useConfigStore.getState().setTopology({ type: 'standard', level: 'RAID6' })
    render(<WorkloadPanel />)

    await userEvent.click(screen.getByText('presets.database'))

    const state = useConfigStore.getState()
    expect(state.readPercent).toBe(70)
    expect(state.randomPercent).toBe(80)
    expect(state.blockSize).toBe('8K')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/components/workloadPanelProfiles.spec.tsx --run
```

Expected: FAIL — `presets.aiTraining` is not in the document, because the panel still renders four hardcoded buttons.

- [ ] **Step 3: Import the catalogue and select the topology**

In `src/components/inputs/WorkloadPanel.tsx`, add to the imports:

```tsx
import {
  isHpcTopology,
  profilesForTopology,
  type WorkloadProfile,
} from '@/data/workloadProfiles'
```

and add `topology` to the store destructuring (currently lines 45-54):

```tsx
  const {
    topology,
    readPercent,
    blockSize,
    randomPercent,
    dailyWriteVolume,
    setReadPercent,
    setBlockSize,
    setRandomPercent,
    setDailyWriteVolume,
  } = useConfigStore()
```

- [ ] **Step 4: Derive the profiles and the apply handler**

Immediately after the existing `writePercent` / `sequentialPercent` lines:

```tsx
  const profiles = profilesForTopology(topology.type)
  const isHpc = isHpcTopology(topology.type)

  const applyProfile = (profile: WorkloadProfile) => {
    setReadPercent(profile.readPercent)
    setRandomPercent(profile.randomPercent)
    setBlockSize(profile.blockSize)
  }
```

- [ ] **Step 5: Replace the preset block**

Replace the whole `{/* Workload Presets */}` block (currently lines 149-198) with:

```tsx
      {/* Workload Profiles — data-driven, filtered by platform. See src/data/workloadProfiles.ts */}
      <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
        <Label>{isHpc ? t('presets.labelHpc') : t('presets.label')}</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => applyProfile(profile)}
              className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
            >
              {t(profile.labelKey)}
            </button>
          ))}
        </div>
        {isHpc && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {t('presets.hpcGuidance')}
          </p>
        )}
      </div>
```

- [ ] **Step 6: Run the test and confirm it passes**

```bash
npm test -- tests/components/workloadPanelProfiles.spec.tsx --run
```

Expected: PASS, all five cases. The last one is the regression guard — the general profiles must still apply 70 / 80 / `8K` for Database, exactly as the deleted inline handler did.

- [ ] **Step 7: Run the i18n suite and the typechecker**

```bash
npm test -- tests/i18n --run
npm run typecheck
```

Expected: PASS. `presets.labelHpc` and `presets.hpcGuidance` are now literals in the panel, so `orphanKeys` sees them.

- [ ] **Step 8: Run the full suite and the dead-code gate**

```bash
npm run test:run
npm run check:dead
```

Expected: PASS.

- [ ] **Step 9: Lint and commit**

```bash
npm run lint:fix
git add src/components/inputs/WorkloadPanel.tsx tests/components/workloadPanelProfiles.spec.tsx
git commit -m "feat(workload): render presets from the profile catalogue"
```

---

### Task 4: Move the neutral defaults, bump to 3.0.0, update docs

The default workload (70 % read, 50 % random, 64K) is shaped for general-purpose block storage. The new neutral is 60 / 25 / 512K.

**This rewrites existing shared URLs.** `partialize` runs `omitDefaults`, so a hash created before this change carries nothing for a field left at its default and will render at the new value after it. The repository has done this once — `hotSpares` 1→0 in v2.0.0 — and the precedent is a major bump. Hence 2.1.0 → 3.0.0 and a CHANGELOG entry that names the URL effect, not just the new numbers.

**Files:**
- Modify: `src/store/slices/workloadSlice.ts:20-23`
- Modify: `package.json:4`
- Modify: `CHANGELOG.md`
- Modify: `docs/USER-GUIDE.md`
- Test: `tests/store/workloadDefaults.spec.ts` (create)

**Interfaces:**
- Consumes: `'512K'` from `BLOCK_SIZES` (Task 1).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/store/workloadDefaults.spec.ts`:

```ts
/**
 * The neutral workload defaults, pinned.
 *
 * These values are not free to drift: `partialize` runs `omitDefaults`, so any field left at its
 * default is absent from the shared URL and is restored from whatever the default happens to be
 * at read time. Changing one silently rewrites every link that never touched that field — which
 * is why this test exists to make the change deliberate and to date it against a version bump.
 */

import { describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('neutral workload defaults', () => {
  it('starts at the parallel-filesystem neutral, not the general-purpose one', () => {
    useConfigStore.getState().resetToDefaults()
    const state = useConfigStore.getState()

    expect(state.readPercent).toBe(60)
    expect(state.randomPercent).toBe(25)
    expect(state.blockSize).toBe('512K')
    expect(state.dailyWriteVolume).toBe(1024 ** 4) // 1 TB, unchanged
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test -- tests/store/workloadDefaults.spec.ts --run
```

Expected: FAIL — `expected 70 to be 60`.

- [ ] **Step 3: Change the defaults**

`src/store/slices/workloadSlice.ts`, in `createWorkloadSlice`:

```ts
  // Default state — neutral for parallel/HPC workloads, which is what most platforms in the
  // catalogue serve. Changing any of these rewrites shared URLs; see tests/store/workloadDefaults.spec.ts.
  readPercent: 60,
  blockSize: '512K',
  randomPercent: 25,
  dailyWriteVolume: 1 * TB,
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test -- tests/store/workloadDefaults.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
npm run test:run
```

Expected: PASS. If `tests/utils/urlStorage.spec.ts` or `tests/store/urlPersistenceOptions.spec.ts` fails, read the failure before editing: those fixtures set workload fields explicitly and round-trip them, which is default-independent. A failure there means a test asserted on the *size* or *contents* of the omitted set; update that assertion to the new defaults rather than reverting Step 3.

- [ ] **Step 6: Bump the version**

`package.json` line 4:

```json
  "version": "3.0.0",
```

- [ ] **Step 7: Write the CHANGELOG entry**

`CHANGELOG.md`, under `## [Unreleased]`, above the existing `### Documented` section:

```markdown
### Added

- **HPC / AI workload profiles.** The workload panel's presets are now a catalogue
  (`src/data/workloadProfiles.ts`) classed per platform rather than four inline handlers. BeeGFS
  offers six profiles drawn from how parallel filesystems are actually deployed — AI Training
  Data, AI Checkpointing, HPC Scratch / Simulation, Genomics / Life Sciences, EDA / CAE, AI
  Inference Repository — under an "HPC / AI Workload Profile" heading with a note on what BeeGFS
  is and is not a good fit for. Every other platform keeps the same four presets, unchanged.
- **`512K` block size**, between `256K` and `1M`. Four of the HPC profiles need it, and it was
  the gap in the enum for large-block sequential work.

### Changed

- **The neutral workload defaults moved: 70 % read → 60 %, 50 % random → 25 %, `64K` → `512K`.**
  Daily write volume is unchanged at 1 TB.

  **This changes what previously shared URLs display.** The hash omits any field sitting at its
  default (`omitDefaults` in `src/store/configStore.ts`), so a link created before this release
  that never touched the read mix, random mix, or block size will now render at the new values
  rather than the old ones. The numbers it shows will differ from the numbers its author saw.
  This is the same class of change as `hotSpares` 1 → 0 in v2.0.0, and it is why this release is
  a major bump. Links that explicitly set those fields are unaffected.
```

- [ ] **Step 8: Update the user guide**

`docs/USER-GUIDE.md`, replace item 3 of "The five-minute path":

```markdown
3. **Workload** — read/write mix, random/sequential mix, block size, daily writes. The profile
   buttons underneath set the first three in one click, and which profiles you see depends on the
   platform: BeeGFS offers HPC and AI profiles (training data, checkpointing, scratch, genomics,
   EDA/CAE, inference), everything else offers the general-purpose four (database, file server,
   video streaming, backup). Performance and endurance both depend on this; capacity does not.
```

- [ ] **Step 9: Verify the whole gate set**

```bash
npm run lint
npm run typecheck
npm run test:run
npm run check:dead
npm run build
```

Expected: all pass. `build` also runs `check:supply-chain` and `check:dead`.

- [ ] **Step 10: Commit**

```bash
git add src/store/slices/workloadSlice.ts package.json CHANGELOG.md docs/USER-GUIDE.md \
        tests/store/workloadDefaults.spec.ts
git commit -m "feat(workload)!: move neutral defaults to 60/25/512K

BREAKING CHANGE: shared URLs created before this release that left the read
mix, random mix, or block size at their defaults now render at the new values.
The hash omits default-valued fields, so those links carry no record of what
their author saw."
```

---

## Verification

After Task 4, confirm the feature end to end rather than trusting the suite alone:

- [ ] `npm run dev`, select **BeeGFS** in the Topology panel, open **Workload**: heading reads "HPC / AI Workload Profile", six buttons, guidance note beneath, no Database button.
- [ ] Click **AI Checkpointing**: read mix goes to 20 % R, random to 10 %, block size to `1M`.
- [ ] Switch topology to **Standard RAID 6**: heading reverts to "Workload Preset", four buttons, no guidance note.
- [ ] Switch language to FR, DE, IT: every profile button and the guidance note render translated text, not a key path like `presets.aiTraining`.
- [ ] Click **Copy URL to Share**, open the link in a new tab: the workload panel shows the same values.
