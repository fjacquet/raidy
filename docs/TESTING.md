# Testing

## Framework

[Vitest](https://vitest.dev) with the `jsdom` environment and globals enabled. Config in `vitest.config.ts`; setup in `src/test/setup.ts` (jest-dom matchers + automatic cleanup). Tests live under `tests/`, mirroring `src/`, with the `.spec.ts(x)` suffix.

```bash
npm run test          # watch mode
npm run test:run      # single CI-style pass
npm run test:coverage # coverage report
npm run test:ui       # browser UI
npm test -- tests/engines/volumetry.spec.ts   # single file
```

> **Run `npm run test:coverage` on its own.** Vitest wipes `coverage/` (its `reportsDirectory`)
> on start, so a second vitest invocation running concurrently — a watch-mode session, another
> terminal, an editor test runner — makes the coverage run fail with
> `Something removed the coverage directory "coverage/.tmp"`. It is a collision, not a real
> coverage failure: stop the other run and re-run. No extra flags are needed otherwise.
>
> CI is unaffected: the shared workflow (`fjacquet/ci/.github/workflows/web-ci.yml`) runs
> `test:run` and never invokes `test:coverage`, so the two cannot collide there. Keep it that
> way — a coverage job added alongside the existing test job would have to run in a separate
> job or a separate `reportsDirectory`.


## Type-checking the tests

The test suite is type-checked, not just executed: `npm run typecheck` runs `tsc --noEmit -p tsconfig.test.json` over `tests/**`. Test files must satisfy the same strict settings as `src/` (including `noUncheckedIndexedAccess`). Use the real domain types and `DEFAULT_*_OPTIONS` (from `@/types/topology`) when constructing fixtures; do not paper over type errors with `as any` / `@ts-ignore` (reserved only for the deliberate invalid-input tests).

## Fixtures & validation vectors

`tests/fixtures/` holds reference vectors: `raid-vectors.ts`, `zfs-vectors.ts`, `vsan-vectors.ts`,
`performance-vectors.ts`, `dell-vectors.ts`, and — added by the phase-18 quality audit —
`s2d-vectors.ts`, `nutanix-vectors.ts`, `netapp-vectors.ts`, `ceph-vectors.ts`,
`synology-vectors.ts`, and `longhorn-vectors.ts`, exercised via the shared `vector-harness.ts`.
Engine results are validated against external references — **each vector's result must be within
1% of its recorded source**: WintelGuy and the NetApp Storage Efficiency Calculator for the
original RAID/ZFS/vSAN vectors, Dell Sizer for the ME5/ADAPT vectors, and — added by the phase-18
quality audit — Microsoft Learn (S2D), the Nutanix Bible (Nutanix), docs.netapp.com (NetApp),
docs.ceph.com (Ceph), the Synology RAID Calculator (Synology), and longhorn.io (Longhorn). Each
phase-18 vector records its own source URL inline and in
`.planning/phases/18-quality-audit/18-AUDIT.md`.

## Property-based testing

[`fast-check`](https://fast-check.dev) drives exhaustive input validation on the engines — invariants (e.g. usable ≤ raw, monotonic parity overhead) hold across generated inputs, not just hand-picked cases.

## Coverage gates

`v8` provider, **75% threshold** (lines/functions/branches/statements) on:

- `src/engines/**/*.ts`
- `src/workers/**/*.ts`
- `src/utils/**/*.ts`

Component tests mock `react-i18next`'s `useTranslation`, so they assert structure/behavior, not real translation output. JSX in tests uses the automatic runtime (Vite 8 default) — no `import React` needed.

## i18n key parity

`tests/i18n/parity.spec.ts` guards the four locales (`en`, `fr`, `de`, `it`) under `src/i18n/locales/` against drift from the `en` reference. It discovers the locale and namespace lists from disk (no hand-listed file pairs) and, for every namespace, recursively flattens nested keys to dotted paths, then asserts both directions per locale: no `en` key is missing from the translation, and no translation key is an orphan absent from `en`. Failures name the exact locale, namespace, and missing/orphan key path. This is what catches raw i18n keys rendering on screen (missing translation) and dead/typo'd keys (orphan translation) before they ship.

## Before pushing

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

The same gates (plus supply-chain, audit, OSV, and bundle-size) run in CI — see [CONFIGURATION.md](./CONFIGURATION.md).
