/**
 * General sweep for issue #110 (successor to the narrow #104 guard it replaces): every field
 * of every `DEFAULT_*_OPTIONS` object in src/types/topology.ts must either be read somewhere
 * real — an engine (`src/engines/**`), the resilience worker's non-worker callers, or one of a
 * short list of known non-UI consumer files (`validators.ts`, `TakeawayAct.tsx`) — or be named
 * in the `ALLOWLIST` below with a reason.
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
 *   3. Kept informational by decision, with hint text on the control saying so.
 *
 * **Category 3 no longer exists.** The 2026-08-05 input-panel relevance sweep deleted all 22 of
 * those fields, controls and locale keys together, on the finding that a control followed by a
 * sentence explaining it does nothing is worse than no control. The ALLOWLIST is down from
 * twenty entries to two, and both of those are genuinely indirect rather than informational:
 * the controller read/write policies, and `powerstoreOptions.model`, whose UI preset writes the
 * engine-read `systemOverheadPercent`.
 *
 * This test enforces the invariant going forward: a field that isn't in ALLOWLIST must have a
 * real reader, so a future field can't silently join the unconsumed pile between audits. Read
 * the KNOWN LIMITS on `isFieldConsumed` before trusting a pass — three of the 22 deleted fields
 * passed this test right up until they were deleted by hand.
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
  DEFAULT_CONTROLLER_OPTIONS: [
    'readPolicy', // informational by decision — see RaidControllerOptions.writePolicy doc comment
    'writePolicy', // informational by decision — sustained-IOPS reasoning documented on the field
  ],
  DEFAULT_POWERSTORE_OPTIONS: [
    'model', // wired indirectly: UI preset writes systemOverheadPercent, which IS engine-read
  ],
}

/**
 * Fields that change VISIBLE OUTPUT but no COMPUTED NUMBER.
 *
 * These pass the sweep only because `EXTRA_CONSUMER_FILES` treats any read in validators /
 * TakeawayAct as real. That is a loophole wide enough to admit a genuinely dead
 * field that happens to be logged somewhere, so the category is named here rather than left to
 * pass by accident. They are deliberately kept: unlike the fields deleted in the 2026-08-05
 * relevance sweep, moving these changes something the user can see.
 *
 * Each entry is asserted below to have NO reader in src/engines or src/workers — if one gains
 * a real calculation, it graduates out of this list and the assertion says so.
 */
const UI_ONLY_CONSUMERS: Record<string, string> = {
  compressionType: 'generates the `zfs set compression=` line in the Takeaway provisioning card',
  raidType: 'drives a NETAPP_RAID_TEC_RECOMMENDED validation warning, not a capacity figure',
}

/**
 * `longhornOptions.diskMode` belongs to this category by behaviour — the engine reads it only
 * to copy it into `longhornDetails` for a results-card label, and its panel handler writes the
 * two fields that actually move capacity. It is NOT listed above because this test cannot
 * honestly assert it: a text sweep cannot tell an echo from a calculation, and `diskMode` does
 * appear in src/engines/volumetry/index.ts. Claiming it here would assert something the test
 * does not check. Recorded in prose instead of as a false green.
 */

/** Files, outside src/engines and src/workers, known to be real (non-UI-setter) consumers. */
const EXTRA_CONSUMER_FILES = [
  'src/utils/validators.ts',
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
  return files.map((f) => stripComments(readFileSync(f, 'utf-8'))).join('\n')
}

/**
 * Remove block and line comments before matching.
 *
 * Without this the sweep counts a comment as a use, which is not a hypothetical: BeeGFS's
 * `numTargets` passed for months on the strength of a doc comment in
 * performance/strategies/beegfs.ts stating that it is "deliberately NOT consulted". A comment
 * explaining that a field is unused was enough to convince the test the field was used.
 *
 * Deliberately naive — no string/regex-literal awareness. A field name inside a string literal
 * still counts, which is the conservative direction: it can only make the test more permissive,
 * never fail a field that is genuinely read.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

const CONSUMER_CORPUS = buildConsumerCorpus()

/**
 * Literal-text sweep: does `.fieldName` appear anywhere in the (comment-stripped) consumer
 * corpus?
 *
 * KNOWN LIMITS — this test is a net, not a proof, and two audits have now caught it passing
 * fields that nothing consumed:
 *
 *  1. **Name collision.** The match is on the bare field name, so `powervaultOptions.model` and
 *     `.tiering` passed on `drive.model` in validators.ts and `cephOptions.tiering` in
 *     shared/tiering.ts. Owner-qualified matching would fix this but produces false negatives
 *     wherever an engine destructures its options object first, which is common here.
 *  2. **Echo-only reads.** A field copied into a results object counts as consumed even though
 *     it feeds no calculation — `longhornOptions.overProvisioningPercent` passed that way.
 *
 * A field this test passes is therefore *not* proven live; a field it fails IS proven dead.
 * Treat a pass as "no evidence of death", and confirm by hand before concluding a field earns
 * its place.
 */
function isFieldConsumed(field: string): boolean {
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

/**
 * The UI-only category, asserted rather than left to pass by accident.
 *
 * Each field here must be readable ONLY from the extra consumer files — never from an engine
 * or worker. That is what makes it "changes visible output, changes no number". If one is
 * wired into a calculation later, this fails and the field graduates out of the list.
 */
describe('UI-only consumers change visible output but no computed number', () => {
  const engineCorpus = [
    ...collectTsFiles(join(REPO_ROOT, 'src/engines')),
    ...collectTsFiles(join(REPO_ROOT, 'src/workers')).filter(
      (f) => !f.endsWith('resilienceWorker.ts'),
    ),
  ]
    .map((f) => stripComments(readFileSync(f, 'utf-8')))
    .join('\n')

  for (const [field, reason] of Object.entries(UI_ONLY_CONSUMERS)) {
    it(`${field} — ${reason}`, () => {
      expect(
        new RegExp(`\\.${field}\\b`).test(engineCorpus),
        `${field} is now read by an engine or worker. If it feeds a real calculation it is no ` +
          `longer UI-only: remove it from UI_ONLY_CONSUMERS. If the read is incidental, rename ` +
          `to avoid the collision.`,
      ).toBe(false)
    })
  }
})
