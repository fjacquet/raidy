/**
 * General sweep for issue #110 (successor to the narrow #104 guard it replaces): every field
 * of every `DEFAULT_*_OPTIONS` object in src/types/topology.ts must either be read somewhere
 * real — an engine (`src/engines/**`), the resilience worker's non-worker callers, or one of a
 * short list of known non-UI consumer files (`validators.ts`, `exportConfig.ts`,
 * `TakeawayAct.tsx`) — or be named in the `ALLOWLIST` below with a reason.
 *
 * #104 removed four fields with no consumer at all (`synologyOptions.btrfsOverhead`,
 * `objectscaleOptions.fillRatePercent`/`networkEfficiencyFactor`, `cephOptions.walDbRatio`).
 * #110 completed the sweep #104's guard test only pinned the shadow of: walking every option
 * field turned up roughly a dozen more in the same "collected, never read" shape, plus a few
 * that are read but only by UI-preset or report-generation code, not a calculation engine.
 * Each one was investigated individually (see CHANGELOG.md's Unreleased entry and the
 * doc-comment on the field itself in topology.ts) and resolved one of three ways:
 *
 *   1. Wired into a real engine calculation (e.g. `netAppOptions.compression`/`dedup` now gate
 *      `dataReductionRatio` in capacityEnhancements.ts, matching every sibling platform's
 *      `<flag> ? ratio : 1.0` pattern).
 *   2. Deleted, field and control together, when no UI exposed it, no engine read it, and no
 *      citable rule would wire it up (e.g. `zfsOptions.slogDevice`/`l2arcDevice`,
 *      `nutanixOptions.replicationFactor`/`erasureCoding`/`ecStripe` — duplicates of what the
 *      `nutanix_*` topology level already encodes — `powerFlexOptions.ecScheme`/`storagePools`/
 *      `faultSets`, `objectscaleOptions.objectSizeKB`).
 *   3. Kept informational by decision — the #78 BeeGFS precedent (`chunkSizeKb`/`numTargets`/
 *      `network`) — when the field is a genuine platform tunable a user expects to configure or
 *      record, but this tool has no citable formula for its capacity/performance effect. Every
 *      such field's hint text in its options panel says so ("For reference only... not used in
 *      any calculation"), matching `BeeGfsOptionsPanel.tsx`'s wording.
 *
 * This test enforces the invariant going forward: a field that isn't in ALLOWLIST must have a
 * real reader, so a future field can't silently join the unconsumed pile between audits.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BEEGFS_OPTIONS,
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_LONGHORN_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
} from '@/types/topology'

/** Every field here has a doc comment on its type explaining the same reason inline. */
const ALLOWLIST: Record<string, string[]> = {
  DEFAULT_ZFS_OPTIONS: [
    'specialVdev', // informational by decision — real ZFS tunable, no citable capacity formula
  ],
  DEFAULT_CONTROLLER_OPTIONS: [
    'readPolicy', // informational by decision — see RaidControllerOptions.writePolicy doc comment
    'writePolicy', // informational by decision — sustained-IOPS reasoning documented on the field
  ],
  DEFAULT_VSAN_OPTIONS: [
    'encryption', // informational by decision — vSAN DARE has no published capacity tax
  ],
  DEFAULT_POWERSTORE_OPTIONS: [
    'model', // wired indirectly: UI preset writes systemOverheadPercent, which IS engine-read
  ],
  DEFAULT_CEPH_OPTIONS: [
    'backend', // informational by decision — no per-backend overhead split to apply
    'encryption', // informational by decision — dm-crypt has no published capacity tax
    'journalOnSsd', // informational by decision — legacy FileStore concept, superseded by walDbOffload
  ],
  DEFAULT_LONGHORN_OPTIONS: [
    'overProvisioningPercent', // informational by decision — echoed to results, not used in any formula
  ],
  DEFAULT_SYNOLOGY_OPTIONS: [
    'modelSeries', // informational by decision — same filesystem/parity math applies to every series
    'ssdCache', // informational by decision — additive hardware, not a capacity reduction
    'cacheMode', // informational by decision — see ssdCache
  ],
  DEFAULT_NETAPP_OPTIONS: [
    'platform', // informational by decision — WAFL/DRR math applies uniformly across platforms
    'adpVersion', // informational by decision — recovered fraction depends on layout, not modelled
    'zeroDetection', // informational by decision — folded into the user-entered dataReductionRatio
  ],
  DEFAULT_BEEGFS_OPTIONS: [
    // The original #78 precedent this whole allowlist mirrors: real BeeGFS tunables with real
    // per-target/per-file effects on hardware, but this engine reports cluster aggregates only
    // and has no per-file layer for them to act on. See BeeGfsOptionsPanel.tsx's hint text
    // (chunkSizeHint/numTargetsHint/networkHint) and the doc comments on BeeGfsOptions itself.
    'chunkSizeKb',
    'numTargets',
    'network',
  ],
}

/** Files, outside src/engines and src/workers, known to be real (non-UI-setter) consumers. */
const EXTRA_CONSUMER_FILES = [
  'src/utils/validators.ts',
  'src/utils/exportConfig.ts',
  'src/components/outputs/acts/TakeawayAct.tsx',
]

const REPO_ROOT = join(__dirname, '..', '..')

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectTsFiles(full, out)
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.spec.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Concatenated source of every legitimate consumer location: engines, workers (except
 * resilienceWorker.ts — owned by other in-flight work, out of scope here), and the specific
 * non-engine files known to read option fields for real effects (validation warnings, exported
 * CLI/config text) rather than merely rendering the control that sets them.
 */
function buildConsumerCorpus(): string {
  const files = [
    ...collectTsFiles(join(REPO_ROOT, 'src/engines')),
    ...collectTsFiles(join(REPO_ROOT, 'src/workers')).filter(
      (f) => !f.endsWith('resilienceWorker.ts'),
    ),
    ...EXTRA_CONSUMER_FILES.map((f) => join(REPO_ROOT, f)),
  ]
  return files.map((f) => readFileSync(f, 'utf-8')).join('\n')
}

const CONSUMER_CORPUS = buildConsumerCorpus()

function isFieldConsumed(field: string): boolean {
  // Literal-text sweep: does `.fieldName` appear anywhere in the consumer corpus? Matches the
  // approach #104's guard test documented and rejected shipping broadly at the time — it is
  // coarse (a field could coincidentally share a name with an unrelated property), but for this
  // codebase's field-naming conventions it is accurate enough to gate on, and any false negative
  // fails loudly (a real field forced into ALLOWLIST with a dishonest reason) rather than
  // silently passing.
  const pattern = new RegExp(`\\.${field}\\b`)
  return pattern.test(CONSUMER_CORPUS)
}

/**
 * Every DEFAULT_*_OPTIONS constant is a closed interface with no index signature (by design —
 * that's what lets TypeScript catch a typo'd field name at every real call site). This file only
 * needs read-only key enumeration, not the specific shape, so this helper widens deliberately for
 * that one purpose.
 */
function opt(name: string, options: object): { name: string; options: Record<string, unknown> } {
  return { name, options: options as Record<string, unknown> }
}

const OPTION_SETS: Array<{ name: string; options: Record<string, unknown> }> = [
  opt('DEFAULT_ZFS_OPTIONS', DEFAULT_ZFS_OPTIONS),
  opt('DEFAULT_S2D_OPTIONS', DEFAULT_S2D_OPTIONS),
  opt('DEFAULT_CONTROLLER_OPTIONS', DEFAULT_CONTROLLER_OPTIONS),
  opt('DEFAULT_VSAN_OPTIONS', DEFAULT_VSAN_OPTIONS),
  opt('DEFAULT_OBJECTSCALE_OPTIONS', DEFAULT_OBJECTSCALE_OPTIONS),
  opt('DEFAULT_POWERSTORE_OPTIONS', DEFAULT_POWERSTORE_OPTIONS),
  opt('DEFAULT_POWERSCALE_OPTIONS', DEFAULT_POWERSCALE_OPTIONS),
  opt('DEFAULT_CEPH_OPTIONS', DEFAULT_CEPH_OPTIONS),
  opt('DEFAULT_LONGHORN_OPTIONS', DEFAULT_LONGHORN_OPTIONS),
  opt('DEFAULT_BEEGFS_OPTIONS', DEFAULT_BEEGFS_OPTIONS),
  opt('DEFAULT_POWERFLEX_OPTIONS', DEFAULT_POWERFLEX_OPTIONS),
  opt('DEFAULT_NUTANIX_OPTIONS', DEFAULT_NUTANIX_OPTIONS),
  opt('DEFAULT_SYNOLOGY_OPTIONS', DEFAULT_SYNOLOGY_OPTIONS),
  opt('DEFAULT_NETAPP_OPTIONS', DEFAULT_NETAPP_OPTIONS),
]

describe('every option field is either consumed or explicitly allowlisted (#110)', () => {
  for (const { name, options } of OPTION_SETS) {
    describe(name, () => {
      for (const field of Object.keys(options)) {
        const allowlisted = ALLOWLIST[name]?.includes(field) ?? false

        it(`${field}${allowlisted ? ' (allowlisted)' : ''}`, () => {
          if (allowlisted) {
            // Sanity check: allowlist entries must name a real field, not a typo that would
            // silently exempt nothing.
            expect(Object.keys(options)).toContain(field)
            return
          }
          expect(
            isFieldConsumed(field),
            `${name}.${field} is not read anywhere in src/engines/, src/workers/ ` +
              `(excl. resilienceWorker.ts), or ${EXTRA_CONSUMER_FILES.join(', ')}. ` +
              `Either wire it into a real calculation, delete it, or add it to ALLOWLIST ` +
              `in this file with a reason (and a matching doc comment on the field itself).`,
          ).toBe(true)
        })
      }
    })
  }

  it('ALLOWLIST does not reference an options set outside OPTION_SETS', () => {
    const knownNames = new Set(OPTION_SETS.map((s) => s.name))
    for (const name of Object.keys(ALLOWLIST)) {
      expect(knownNames.has(name), `ALLOWLIST references unknown options set '${name}'`).toBe(true)
    }
  })
})
