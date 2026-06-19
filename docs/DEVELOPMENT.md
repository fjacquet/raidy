# Development

Day-to-day workflow: the dev loop, type checking, linting, and the conventions that keep the engines correct. For the test strategy and coverage gates see [TESTING.md](./TESTING.md); for the CI pipeline and security gates see [CONFIGURATION.md](./CONFIGURATION.md); for the module structure see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Commands

All scripts are in `package.json`. A `Makefile` wraps the common ones (`make dev`, `make build`, `make test`, `make all`).

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR at `http://localhost:5173/raidy/`. |
| `npm run build` | Production build: `tsc -b && vite build`. The `prebuild` hook runs the supply-chain gate first. |
| `npm run preview` | Serve the production build locally for a final smoke check. |
| `npm run typecheck` | Type-checks the app (`tsc --noEmit`) **and** the test project (`tsc --noEmit -p tsconfig.test.json`). |
| `npm run lint` | `biome check .` (lint + format check). |
| `npm run lint:fix` | `biome check --write .` — apply safe fixes + organize imports. |
| `npm run format` | `biome format --write .`. |
| `npm run test` | `vitest` in watch mode. |
| `npm run test:run` | `vitest run` — single CI-style pass. |
| `npm run test:coverage` | `vitest run --coverage` (engines/workers/utils gated ≥75%). |
| `npm run test:ui` | Vitest browser UI. |
| `npm run check:supply-chain` | Telemetry/analytics denylist over `package.json`. Also runs as the `prebuild` hook. |
| `npm run check:bundle-size` | Post-build gz budget check on the eager `index` and lazy `vendor-pdf` chunks. |

Typical inner loop: `npm run dev` in one terminal; run `npm run typecheck`, `npm run lint`, and `npm run test:run` before every commit.

## Code style — Biome

Linting and formatting are a single tool: **Biome** (`@biomejs/biome`, `^2.4.15`), configured in `biome.json`. No ESLint, no Prettier.

- Single quotes in JS/TS, no semicolons (`semicolons: asNeeded`), 2-space indent, 100-char line width.
- `noUnusedImports` / `noUnusedVariables` / `useConst` are **errors**.
- `noNonNullAssertion` is a **warning** (used in tests where a value is logically guaranteed).
- `noConsole` is an **error** in `src/**` (only `console.warn`/`console.error` allowed); **off** for tests and `scripts/**/*.mjs`.
- Imports are organized automatically via the assist action.

## TypeScript

Strict mode throughout, split into three configs (referenced by a solution `tsconfig.json`):

- **`tsconfig.app.json`** — application code (`src/**`, tests excluded). `strict` + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`, `resolveJsonModule`. Path aliases (`@/*`, `@engines/*`, `@components/*`, `@store/*`, `@types/*`, `@utils/*`, `@data/*`, `@hooks/*`) — no `baseUrl` (resolution is relative under `moduleResolution: bundler`).
- **`tsconfig.test.json`** — extends the app config, adds `vitest/globals` types, includes `tests/**` and `src/test/**`. This is why `npm run typecheck` actually compiles the test suite.
- **`tsconfig.node.json`** — build tooling (`vite.config.ts`).

> Note: the solution `tsconfig.json` is references-only, so a bare `tsc --noEmit` is a no-op. The `typecheck` script runs the app and test projects explicitly, and `tsc -b` (inside `build`) compiles the referenced projects.

Path aliases are mirrored in `vite.config.ts` and `vitest.config.ts` `resolve.alias`.

## Engine architecture

`src/engines/**` are **pure functions** — no React, no DOM, no store. Each platform implements a strategy registered in the engine's `index.ts` (see [ARCHITECTURE.md](./ARCHITECTURE.md)). To add a platform: add a strategy file, register it, add types in `src/types/topology.ts`, add a store slice option, and add a UI options panel.

## Git & commits

- Default branch: **`main`**.
- Conventional-commit style with phase/scope: `<type>(<scope>): …`, e.g. `feat(17-02): …`, `fix(pptx): …`, `chore(deps): …`.
- CI runs the full gate set on push/PR to `main` — run `npm run typecheck`, `npm run lint`, and `npm run test:run` locally first.

## Theming (light/dark)

Class-based dark mode via Tailwind's `@custom-variant dark` (see `src/index.css`). The `dark` class on `<html>` is driven by `src/hooks/useTheme.ts` (states: `auto`/`light`/`dark`, persisted as `localStorage['raidy-theme']`, `auto` follows the OS). An inline FOUC script in `index.html` applies the theme before first paint. The header `ThemeToggle` (`src/components/common/ThemeToggle.tsx`) switches it.

**Convention:** every color utility needs both a light default and a `dark:` override — e.g. `bg-white dark:bg-surface-800`, `text-slate-900 dark:text-white`, `text-slate-500 dark:text-slate-400`. A class with no `dark:` counterpart renders invisible in one theme. Saturated/semantic colors (`primary-*`, `capacity`/`overhead`/`parity`, explicit chart palette colors) read on both — leave them. Shared classes `.panel`/`.label`/`.accordion-trigger` already carry both variants. The PPTX export and chart captures follow the active theme (`exportPptx.ts` `BRAND`/`BRAND_LIGHT`, `captureChart.ts` background).
