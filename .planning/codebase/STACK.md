# Technology Stack

**Analysis Date:** 2025-01-16

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code, strict mode enabled
- JSX/TSX - React component markup

**Secondary:**
- JSON - Configuration, data files, i18n translations
- CSS - Styling via Tailwind CSS

## Runtime

**Environment:**
- Node.js 20.x (specified in CI workflow)
- Browser (ES2022 target, ESNext modules)
- Web Workers for Monte Carlo simulations

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- React 19.2.0 - UI framework (functional components + hooks)
- Vite 7.2.4 - Build tool and dev server
- TypeScript - Strict mode with noImplicitAny, strictNullChecks, noUncheckedIndexedAccess

**State Management:**
- Zustand 5.0.9 - Global state with URL hash persistence
- Custom URL storage via `lz-string` compression

**Styling:**
- Tailwind CSS 4.1.18 - Utility-first CSS
- PostCSS 8.5.6 - CSS processing
- Autoprefixer 10.4.23 - Vendor prefixing

**Internationalization:**
- i18next 25.7.4 - Core i18n library
- react-i18next 16.5.3 - React bindings
- i18next-browser-languagedetector 8.2.0 - Language detection

**Testing:**
- Vitest 4.0.16 - Test runner (Vite-native)
- @vitest/coverage-v8 4.0.16 - Code coverage
- @vitest/ui 4.0.16 - Visual test UI

**Visualization:**
- Recharts 3.6.0 - React charting library
- D3-Sankey 0.12.3 - Sankey diagram layout

**PDF Export:**
- jsPDF 4.0.0 - PDF generation
- jspdf-autotable 5.0.7 - Table formatting for PDF

**Linting/Formatting:**
- Biome 2.3.11 - Linting and formatting (replaces ESLint + Prettier)

**Security:**
- Snyk 1.1301.2 - Vulnerability scanning

## Key Dependencies

**Critical:**
- `zustand` 5.0.9 - Entire state management with URL persistence
- `react` 19.2.0 - UI rendering
- `recharts` 3.6.0 - All capacity/performance visualizations
- `i18next` + `react-i18next` - Internationalization (EN/FR/DE/IT)

**Infrastructure:**
- `lz-string` 1.5.0 - URL state compression for shareable links
- `js-yaml` 4.1.1 - YAML export functionality
- `d3-sankey` 0.12.3 - Capacity waterfall diagram

**Build:**
- `@vitejs/plugin-react` 5.1.1 - React Fast Refresh
- `@tailwindcss/vite` 4.1.18 - Tailwind CSS integration

## Configuration

**TypeScript:**
- Config: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Target: ES2022
- Strict mode: All strict flags enabled
- Path aliases: `@/*`, `@engines/*`, `@components/*`, `@store/*`, `@types/*`, `@utils/*`, `@data/*`, `@hooks/*`

**Build:**
- Config: `vite.config.ts`
- Base path: `/raidy/` (for GitHub Pages)
- Source maps: Enabled
- Chunk splitting: vendor-react, vendor-pdf, vendor-state

**Linting/Formatting:**
- Config: `biome.json`
- Indent: 2 spaces
- Quotes: Single
- Semicolons: As needed
- Line width: 100

**CSS:**
- Config: Inline in `src/index.css` via `@theme` directive
- Dark mode: Default (color-scheme: dark)
- Custom theme colors: primary, capacity, overhead, parity, bottleneck, safe

## Platform Requirements

**Development:**
- Node.js 20.x
- npm (latest)
- Modern browser with ES2022 support

**Production:**
- Static hosting (no server required)
- GitHub Pages deployment configured
- PWA-ready (Single Page Application)

**Browser Support:**
- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2022 features required
- Web Workers API required for Monte Carlo simulations

## Scripts

```bash
npm run dev          # Development server (Vite)
npm run build        # Production build (tsc + Vite)
npm run preview      # Preview production build
npm run typecheck    # TypeScript type checking
npm run lint         # Biome linting
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format code with Biome
npm test             # Run tests (Vitest)
npm run test:ui      # Visual test UI
npm run test:coverage # Coverage report
npm run security     # Snyk dependency scan
npm run security:code # Snyk code analysis
```

---

*Stack analysis: 2025-01-16*
