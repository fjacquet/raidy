# ADR 0001 — Supply-chain and dependency-advisory gates

- **Status:** Accepted
- **Date:** 2026-05-24

## Context

Raidy ships as a static, 100% client-side bundle to GitHub Pages. It has no backend, so the dependency tree *is* the attack surface: a compromised or telemetry-bearing package would execute in users' browsers, and the app's "Copy URL to Share" feature means configuration data is the only thing of value to exfiltrate. The project previously gated on Snyk (`npx snyk test`) in a separate `ci.yml`, which required a token and ran disconnected from the deploy pipeline.

We aligned raidy's developer conventions with the sibling project **vatlas** (treated as the reference), whose hardened single-pipeline approach we adopt here.

## Decision

Consolidate CI into one workflow (`.github/workflows/static.yml`) with layered, tokenless supply-chain defenses, gated at **LOW severity and above**:

1. **Telemetry denylist** (`scripts/check-supply-chain.mjs`) — fails if any analytics/error-reporting SDK appears in `package.json`. Runs before `npm ci` and as the `prebuild` hook.
2. **`npm audit --audit-level=low`** — npm advisory DB.
3. **OSV-Scanner** (`osv-scanner.toml`) — OSV.dev advisories, SARIF uploaded to the Security tab, build fails on LOW+ findings.
4. **CycloneDX SBOM** — generated for prod deps, archived, and attached to GitHub Releases on `v*` tags.

Snyk and the `security`/`security:code` scripts are removed.

## Consequences

- No external token required; everything runs in-pipeline on every push/PR.
- The strict LOW+ posture surfaces advisories early (it required bumping `dompurify` to 3.4.5 to land clean). Genuine false positives are waived in `osv-scanner.toml` with a justification and an `ignoreUntil` expiry — never silently.
- CodeQL (`codeql.yml`) remains separate and unchanged.
