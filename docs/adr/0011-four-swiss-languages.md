# ADR 0011 — Four Swiss languages, and technical terms stay untranslated

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

Raidy targets the Swiss market, where a presales document may be read in German, French or Italian
by people who nonetheless say "RAID", "IOPS" and "NVMe" in English.

## Decision

**EN (reference), FR, DE, IT**, via `react-i18next`, ten namespaces per locale. Detection order:
`?lang=` URL parameter → localStorage → browser → EN.

**Technical terms are not translated.** RAID, ZFS, NVMe, IOPS, PCIe, and product names stay as
they are, in every locale. Numbers use Swiss formatting — apostrophe thousands separator
(`1'000.50`).

## Consequences

**Two tests enforce it, in opposite directions**, and both are needed:

- `tests/i18n/parity.spec.ts` — every `en` key exists in the other three, and none of them has a
  key `en` lacks. Catches a raw key rendering on screen in a language the developer may not read.
- `tests/i18n/orphanKeys.spec.ts` — every `en` key is reachable from the source. A dead key passes
  parity forever, because all four locales agree on it.

**The orphan scan is literal**, so runtime-assembled keys need a documented `DYNAMIC_PREFIXES`
entry — or, better, the full key written out at the call site, which keeps the guarantee that
deleting a usage surfaces the key.

**Interpolate, never concatenate.** A sentence assembled from fragments cannot be reordered by a
translator, and German and Italian need to reorder. This is a recurring review point rather than a
one-off.

**A wrong sweep is worse than no sweep.** In 2026-08, a scan of "orphaned" keys initially condemned
284 candidates, of which **151 were live translations shadowed by hardcoded English** — the FR
locale said "Agrégat, sans redondance" while the component rendered `'Stripe, no redundancy'`.
Acting on the raw scan would have deleted real translations while leaving the actual bug.

## Alternatives rejected

- **EN + FR only**, matching the sibling project. Insufficient for the Swiss market.
- **Translating technical terms.** Tested badly against how the audience speaks; "matrice de
  disques indépendants redondante" helps nobody.
