# Getting Started

Raidy is a 100% client-side Vite + React app. There is no backend, no database, and no environment file to provision.

## Prerequisites

- **Node.js 24** (the CI build runs on Node 24; 20+ works locally).
- **npm** (the repo ships a `package-lock.json`).

## Setup

```bash
git clone https://github.com/fjacquet/raidy.git
cd raidy
npm install
```

## Run the dev server

```bash
npm run dev
```

The app serves at `http://localhost:5173/raidy/` — note the `/raidy/` base path, which mirrors the GitHub Pages deploy target (`https://fjacquet.github.io/raidy/`).

## First steps

- Pick a **storage platform** and **topology level** in the left "Configuration" sidebar (Topology → Hardware → Workload → Advanced).
- Results update live on the right: capacity waterfall, performance gauges, sustainability, backup sizing, bottleneck analysis, and Monte Carlo resilience.
- Use **Copy URL to Share** — the full configuration is serialized into the URL hash (LZ-String compressed), so a link reproduces the exact scenario.
- Switch language with `?lang=fr|de|it` or the header selector (EN/FR/DE/IT, Swiss locales).

## Verify your checkout

```bash
npm run typecheck      # app + test type-check, 0 errors
npm run lint           # Biome, 0 errors
npm run test:run       # full Vitest suite
npm run build          # tsc -b + vite build (runs the supply-chain gate first)
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full command reference and conventions, [TESTING.md](./TESTING.md) for the test strategy, and [CONFIGURATION.md](./CONFIGURATION.md) for the CI pipeline and security gates.
