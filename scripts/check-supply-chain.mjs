#!/usr/bin/env node
// Supply-chain gate for raidy.
//
// raidy is a 100% client-side simulator with no backend and no telemetry. The
// only sanctioned outbound surface is the user explicitly sharing a config via
// the URL hash ("Copy URL to Share"). A bundled analytics / error-reporting SDK
// would be a latent exfiltration path for that configuration data, so we deny
// the whole class at the dependency level.
//
// One check, one script (KISS): a telemetry denylist over package.json
// dependencies AND devDependencies. Pure core (`evaluateSupplyChain`) + a thin
// CLI so the gate is unit-testable. Runs on a bare Node runtime (reads one file,
// no deps). Wired as the `check:supply-chain` + `prebuild` npm scripts and as a
// CI step BEFORE `npm ci`, so a tainted package.json never installs.
//
// Exit 0 = clean. Exit 1 = violation (with a clear message).
import { readFileSync } from 'node:fs'

const FORBIDDEN_PATTERNS = [
  /^@sentry\//,
  /^posthog-/,
  /^@posthog\//,
  /^posthog$/,
  /^@amplitude\//,
  /^amplitude-/,
  /^mixpanel/,
  /^@datadog\//,
  /^logrocket/,
  /^@bugsnag\//,
  /^heap-analytics/,
  /^segment-analytics/,
  /^@segment\//,
  /^fullstory/,
  /^@fullstory\//,
  /^@hotjar\//,
  /^hotjar/,
  /^@google-analytics\//,
  /^gtag/,
]

/**
 * Pure supply-chain evaluation.
 * @param {{ pkg: object }} input  pkg — parsed package.json
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function evaluateSupplyChain({ pkg }) {
  const errors = []
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const names = Object.keys(allDeps)

  const telemetry = names.filter((name) => FORBIDDEN_PATTERNS.some((re) => re.test(name)))
  if (telemetry.length > 0) {
    errors.push(`forbidden telemetry/analytics packages in package.json: ${telemetry.join(', ')}`)
  }

  return { ok: errors.length === 0, errors }
}

// ── CLI ───────────────────────────────────────────────────────────────────
// Only runs when executed directly, not when imported by a test.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const { ok, errors } = evaluateSupplyChain({ pkg })
  if (!ok) {
    console.error('SUPPLY-CHAIN VIOLATION:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('check-supply-chain: OK')
  process.exit(0)
}
