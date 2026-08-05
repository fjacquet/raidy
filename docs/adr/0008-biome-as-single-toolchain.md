# ADR 0008 — Biome replaces ESLint and Prettier

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

The conventional JavaScript setup is ESLint for linting and Prettier for formatting: two tools,
two configs, two plugin ecosystems, and a well-known class of conflicts where one reformats what
the other flags.

## Decision

**Biome** (`biome.json`) does both. There is no ESLint and no Prettier in `package.json`.

Settings: 2-space indent, 100-char lines, single quotes, semicolons as-needed. Import organisation
runs as an assist action. `noUnusedImports`, `noUnusedVariables` and `useConst` are **errors**;
`noNonNullAssertion` is a warning (tests use it where a value is logically guaranteed); `noConsole`
is an error in `src/**` but off for tests and `scripts/**/*.mjs`.

## Consequences

- One command (`npm run lint`) covers both concerns, and `lint:fix` cannot fight itself.
- Rules that exist in the ESLint ecosystem and not in Biome are simply unavailable. Nothing has
  been missed badly enough to reverse the decision.
- **Biome is file-scoped, so it cannot see dead exports.** That gap is real and is covered
  separately — see [ADR-0010](./0010-dead-code-gate.md).
- Formatting is not negotiable per-file, which removes a category of review argument.

## Alternatives rejected

- **ESLint + Prettier.** The conventional choice, and the slower one; the conflict class is
  avoidable rather than manageable.
- **Biome for formatting, ESLint for linting.** Keeps the second config and most of the cost while
  giving up the single-command property.
