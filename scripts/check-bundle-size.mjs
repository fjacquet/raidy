#!/usr/bin/env node
// Bundle-size gate for raidy.
//
// Regression tripwires on the two chunks that matter, measured GZIPPED (what
// users actually download). Thresholds sit just above the current sizes — when
// a change pushes a chunk past its budget, CI fails and forces a conscious
// decision (tree-shake, code-split, or bump the budget here on purpose).
//
//   - The eager app chunk `index-<hash>.js` — first-paint payload. Bloat here
//     directly hurts load time.
//   - The lazy `vendor-pdf-<hash>.js` chunk (jspdf + jspdf-autotable) — fetched
//     only on PDF export. The classic regression is html2canvas (a jspdf
//     optionalDependency we don't use) creeping back in and ballooning it.
//
// Chunks are selected by FILENAME: vite.config.ts pins `vendor-pdf` via
// manualChunks, and the main app chunk is emitted as `index-<hash>.js`
// (distinct from the `index.es-<hash>.js` vendor chunk). Bare Node runtime
// (node:fs + node:zlib, no deps). POST-build gate — run `npm run build` first.
//
// Exit 0 = clean. Exit 1 = violation / misuse (with a clear message).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ASSETS_DIR = 'dist/assets'
const KIB = 1024

// [filename matcher, max gzipped bytes, human label]
const BUDGETS = [
  { match: /^index-[^/]+\.js$/, maxGzip: 420 * KIB, label: 'eager app chunk (index)' },
  { match: /^vendor-pdf-[^/]+\.js$/, maxGzip: 170 * KIB, label: 'lazy PDF vendor chunk' },
]

if (!existsSync(ASSETS_DIR)) {
  console.error(
    'check-bundle-size: dist/assets/ not found — run `npm run build` first (this is a post-build gate).',
  )
  process.exit(1)
}

const jsChunks = readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js'))
let exitCode = 0

for (const { match, maxGzip, label } of BUDGETS) {
  const matched = jsChunks.filter((f) => match.test(f))
  if (matched.length === 0) {
    console.error(`check-bundle-size: expected a chunk matching ${match} (${label}) — none found.`)
    exitCode = 1
    continue
  }
  for (const file of matched) {
    const gzBytes = gzipSync(readFileSync(join(ASSETS_DIR, file))).length
    const gzKib = (gzBytes / KIB).toFixed(1)
    const limitKib = (maxGzip / KIB).toFixed(1)
    if (gzBytes > maxGzip) {
      console.error(`BUNDLE-SIZE VIOLATION — ${label} exceeds its gz budget.`)
      console.error(`  chunk:   ${file}`)
      console.error(`  gzipped: ${gzBytes} bytes (${gzKib} KiB)`)
      console.error(`  limit:   ${maxGzip} bytes (${limitKib} KiB)`)
      exitCode = 1
    } else {
      console.log(`check-bundle-size: ${file} = ${gzKib} KiB gz ≤ ${limitKib} KiB (${label})`)
    }
  }
}

if (exitCode === 0) console.log('check-bundle-size: OK')
process.exit(exitCode)
