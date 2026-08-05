# ADR 0004 — Engines are pure functions, and never speak to the user

- **Status:** Accepted
- **Date:** 2026-08-05 (recorded retroactively)

## Context

`src/engines/**` computes every published number. Those numbers end up in four places with
different lifetimes: the live dashboard, a PDF report, a PowerPoint deck, and a URL someone
pastes into a proposal months later.

## Decision

Engines are **pure functions**: no React, no DOM, no store access, and — the part that keeps being
rediscovered — **no i18n**. An engine returns data describing what it found; the render site turns
that into a sentence.

## Consequences

**This is testable without a harness.** Validation vectors call the engines directly with plain
objects (`tests/fixtures/*-vectors.ts`), which is why the suite can pin capacity to within 1% of
WintelGuy and NetApp's calculator without rendering anything.

**It has been violated three times, each time producing the same bug.** An engine or hook built an
English sentence and handed it to the UI:

- `getRecommendations()` in `useResilience.ts` — six hardcoded strings (#125)
- `identifyBottleneck()` — `"Bottleneck: Controller (8000 MB/s)"` (#139)
- The Dell option panels' level descriptions (#142)

French, German and Italian users read English in those places, beside fully translated
surroundings. Two sweeps (#71, #72) missed them because they were not in `validators.ts` or a
component.

**Translating at the render site is not a style preference.** `ResilienceResult.recommendations`
is produced once when the worker replies and then held in state; translating at that moment
freezes the language, so a user switching FR→DE afterwards keeps reading French. The same applies
to the PDF path, where the document is produced long after the calculation ran. So the fix in both
cases was to return keys or structured data, not to call `i18n.t()` earlier.

**Corollary: pre-rendered prose in a result type is a smell.** `PerformanceResult` carried
`bottleneckDescription: string` for two years. Prefer a discriminated union — `BottleneckStatus`
is the worked example — and let each consumer phrase it.

## Alternatives rejected

- **Inject a `t` function into the engines.** Makes every engine call site carry i18n state, makes
  the vectors need a translator stub, and still freezes the PDF's language at calculation time.
- **Translate in a post-processing layer.** Same freezing problem, plus a second place to keep in
  sync with the result types.
