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

## Type-checking the tests

The test suite is type-checked, not just executed: `npm run typecheck` runs `tsc --noEmit -p tsconfig.test.json` over `tests/**`. Test files must satisfy the same strict settings as `src/` (including `noUncheckedIndexedAccess`). Use the real domain types and `DEFAULT_*_OPTIONS` (from `@/types/topology`) when constructing fixtures; do not paper over type errors with `as any` / `@ts-ignore` (reserved only for the deliberate invalid-input tests).

## Fixtures & validation vectors

`tests/fixtures/` holds reference vectors (`raid-vectors.ts`, `zfs-vectors.ts`, `vsan-vectors.ts`, `performance-vectors.ts`). Engine results are validated against external references — **results must be within 1% of WintelGuy and the NetApp Storage Efficiency Calculator** (and Dell Sizer for the ME5 vectors).

## Property-based testing

[`fast-check`](https://fast-check.dev) drives exhaustive input validation on the engines — invariants (e.g. usable ≤ raw, monotonic parity overhead) hold across generated inputs, not just hand-picked cases.

## Coverage gates

`v8` provider, **75% threshold** (lines/functions/branches/statements) on:

- `src/engines/**/*.ts`
- `src/workers/**/*.ts`
- `src/utils/**/*.ts`

Component tests mock `react-i18next`'s `useTranslation`, so they assert structure/behavior, not real translation output. JSX in tests uses the automatic runtime (Vite 8 default) — no `import React` needed.

## Before pushing

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

The same gates (plus supply-chain, audit, OSV, and bundle-size) run in CI — see [CONFIGURATION.md](./CONFIGURATION.md).
