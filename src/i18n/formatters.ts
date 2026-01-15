/**
 * Locale-aware formatting utilities for Swiss number conventions
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

/**
 * Format a number as a percentage
 */
export function formatPercent(value: number, language: Language, decimals = 1): string {
  return new Intl.NumberFormat(LOCALE_MAP[language], {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100)
}

/**
 * Format currency (CHF for Swiss context)
 */
export function formatCurrency(value: number, language: Language, currency = 'USD'): string {
  return new Intl.NumberFormat(LOCALE_MAP[language], {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format bytes with locale-aware number formatting
 */
export function formatBytesLocalized(bytes: number, language: Language, useBinary = true): string {
  if (bytes === 0) return '0 B'

  const k = useBinary ? 1024 : 1000
  const sizes = useBinary
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB']
    : ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / k ** i

  return `${formatNumber(value, language, { maximumFractionDigits: 2 })} ${sizes[i]}`
}
