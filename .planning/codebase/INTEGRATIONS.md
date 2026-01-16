# External Integrations

**Analysis Date:** 2025-01-16

## APIs & External Services

**None** - This is a fully client-side application with no external API dependencies.

All calculations and data processing happen in the browser:
- Volumetry calculations: `src/engines/volumetry/index.ts`
- Performance calculations: `src/engines/performance/index.ts`
- Sustainability calculations: `src/engines/sustainability/index.ts`
- Monte Carlo simulations: `src/workers/resilienceWorker.ts` (Web Worker)

## Data Storage

**Databases:**
- None - No database connection

**Local Storage:**
- Browser localStorage for language preference (`raidy-language` key)
- URL hash for state persistence (Zustand + lz-string compression)
  - Implementation: `src/store/urlStorage.ts`
  - Enables shareable configuration URLs

**File Storage:**
- None - No cloud file storage
- Static JSON data bundled at build time: `src/data/drives.json`

**Caching:**
- None - No external caching service
- Browser caching for static assets

## Authentication & Identity

**Auth Provider:**
- None - No authentication required
- Application is fully public/anonymous

## Monitoring & Observability

**Error Tracking:**
- None - No error tracking service

**Logs:**
- Console logging only (development)
- `console.warn` for non-critical issues (URL parsing failures)

**Analytics:**
- None - No analytics integration

## CI/CD & Deployment

**Hosting:**
- GitHub Pages (static hosting)
- Base URL: `/raidy/`
- URL: `https://fjacquet.github.io/raidy/`

**CI Pipeline:**
- GitHub Actions
- Workflow: `.github/workflows/static.yml`
- Triggers: Push to `maincd` branch, manual dispatch
- Steps:
  1. Checkout code
  2. Setup Node.js 20
  3. Install dependencies (`npm ci`)
  4. Type check (`npm run typecheck`)
  5. Lint (`npm run lint`)
  6. Build (`npm run build`)
  7. Deploy to GitHub Pages

**Security Scanning:**
- Snyk (manual via `npm run security`)
- No automated security scanning in CI

## Environment Configuration

**Required env vars:**
- None - No environment variables required

**Build-time configuration:**
- `vite.config.ts` - Base path, chunk splitting
- All configuration is static/committed

**Secrets location:**
- None - No secrets required

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Browser APIs Used

**Core:**
- Web Workers API - Monte Carlo simulations (`src/workers/resilienceWorker.ts`)
- History API - URL state management (`window.history.replaceState`)
- Clipboard API - Copy shareable URL (`navigator.clipboard.writeText`)
- Blob API - File downloads (PDF, YAML, Terraform, Ansible exports)

**Storage:**
- localStorage - Language preference persistence

**i18n:**
- `Intl.NumberFormat` - Swiss locale number formatting (apostrophe separator)

## Export Integrations

The application generates configuration files for external tools (no runtime integration):

**Infrastructure-as-Code:**
- Ansible playbooks: `src/utils/exportConfig.ts` (`exportToAnsible`)
- Terraform configurations: `src/utils/exportConfig.ts` (`exportToTerraform`)
- YAML configs: `src/utils/exportConfig.ts` (`exportToYaml`)

**Documents:**
- PDF reports: `src/utils/exportPdf.ts` (jsPDF + jspdf-autotable)

## Data Sources

**Static Data (bundled at build):**
- Drive database: `src/data/drives.json` (~90KB)
  - Contains specifications for HDDs and SSDs
  - Includes performance, reliability, power, and cost data
  - Loaded synchronously at app initialization

**i18n Translations (bundled at build):**
- Location: `src/i18n/locales/{en,fr,de,it}/`
- 8 namespaces per language: common, topology, hardware, workload, advanced, output, validation, pdf

## Third-Party Service Dependencies

| Service | Purpose | Required |
|---------|---------|----------|
| GitHub Pages | Hosting | Yes (for deployment) |
| GitHub Actions | CI/CD | Yes (for deployment) |
| npm Registry | Package installation | Development only |

**Runtime third-party dependencies: None**

The application is fully self-contained and can run offline after initial load.

---

*Integration audit: 2025-01-16*
