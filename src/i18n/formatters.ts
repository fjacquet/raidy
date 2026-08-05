/**
 * Locale-aware formatting utilities for Swiss number conventions.
 *
 * Only `formatNumber` lives here now. `formatPercent`, `formatCurrency` and
 * `formatBytesLocalized` were removed in the 2026-08-05 dead-code sweep: nothing
 * imported them. Note that a live `formatCurrency` exists in
 * `src/hooks/useCalculations.ts` — the two were easy to confuse, and that
 * confusion is why the one here survived earlier reviews.
 */

import { type Language, LOCALE_MAP } from './config'

/**
 * Format a number using Swiss locale conventions (apostrophe thousands separator)
 */
export function formatNumber(
  value: number,
  language: Language,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(LOCALE_MAP[language], {
    maximumFractionDigits: 2,
    ...options,
  }).format(value)
}
