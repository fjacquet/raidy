/**
 * Regression guard for issue #104: option fields collected from the UI (or persisted in the
 * schema) that no engine ever reads. The bug is worse than a missing control, because the tool
 * silently implies the input matters when it does not.
 *
 * #104 removed four such fields — `synologyOptions.btrfsOverhead`, `objectscaleOptions.fillRatePercent`,
 * `objectscaleOptions.networkEfficiencyFactor`, and `cephOptions.walDbRatio` — after verifying each
 * had no reader anywhere in `src/engines/`. This test pins their absence so a future change cannot
 * silently reintroduce one of these exact fields under the same name.
 *
 * A fully general version of this guard — walk every field of every `DEFAULT_*_OPTIONS` object and
 * assert it is read somewhere in `src/engines/` — was investigated and rejected as impractical to
 * ship correctly today. A literal-text sweep (grepping engine sources for `.fieldName`) surfaces
 * roughly a dozen additional pre-existing fields with the exact same unconsumed pattern, spread
 * across other platforms this issue does not touch: `objectscaleOptions.objectSizeKB` (has a live
 * UI slider, its type comment even claims it "impacts performance calculations" — it does not),
 * `powerstoreOptions.model`, `vsanOptions.diskGroupMode`, `vsanOptions.encryption`,
 * `raidControllerOptions.readPolicy`/`writePolicy`, `powerflexOptions.ecScheme`, and others. Some
 * of those are probably legitimate informational-only fields (mirroring the precedent set for
 * BeeGFS's `chunkSizeKb`/`numTargets` in issue #78); others may be real instances of this same bug
 * class. Telling the two apart requires the same one-field-at-a-time investigation this issue did
 * for its four fields — a dozen times over — which is a full follow-up audit, not something to
 * rush into an allowlist here. Shipping a blanket "every field must be read in src/engines/" test
 * today would either fail immediately on fields nobody has verified yet, or require guessing which
 * ones are "informational" without the citation-level rigor #104 held itself to — both worse than
 * not having the test. Filing that broader audit as a follow-up issue is the honest path forward.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
} from '@/types/topology'

describe('#104 removed fields do not reappear', () => {
  it('synologyOptions no longer has btrfsOverhead', () => {
    expect(Object.keys(DEFAULT_SYNOLOGY_OPTIONS)).not.toContain('btrfsOverhead')
  })

  it('objectscaleOptions no longer has fillRatePercent or networkEfficiencyFactor', () => {
    const keys = Object.keys(DEFAULT_OBJECTSCALE_OPTIONS)
    expect(keys).not.toContain('fillRatePercent')
    expect(keys).not.toContain('networkEfficiencyFactor')
  })

  it('cephOptions no longer has walDbRatio', () => {
    expect(Object.keys(DEFAULT_CEPH_OPTIONS)).not.toContain('walDbRatio')
  })
})
