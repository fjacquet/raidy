/**
 * Single capacity row with dual-unit (binary/decimal) display.
 *
 * Shared by the per-platform capacity detail cards (ZFS, Longhorn, BeeGFS), which all render
 * the same label/description/value layout. Each used to keep a private copy, and the copies had
 * already begun to diverge — ZFS carried `isSubtraction` while the others had dropped it — so a
 * styling change had to be applied in three places with nothing enforcing they stayed identical.
 */

import { formatBytesBoth } from '@/utils/units'

export interface CapacityRowProps {
  label: string
  bytes: number
  description?: string
  /** Render the value as a deduction, with a minus sign and warning colour */
  isSubtraction?: boolean
  highlight?: boolean
  color?: string
}

export function CapacityRow({
  label,
  bytes,
  description,
  isSubtraction = false,
  highlight = false,
  color = 'text-slate-600 dark:text-slate-300',
}: CapacityRowProps) {
  const formatted = formatBytesBoth(bytes)
  const sign = isSubtraction ? '−' : ''

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 ${highlight ? 'bg-white dark:bg-surface-800 -mx-3 px-3 rounded' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${highlight ? 'text-slate-900 dark:text-white' : color}`}>
          {label}
        </span>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="font-mono text-sm mt-1 sm:mt-0 sm:text-right flex-shrink-0">
        <span
          className={
            isSubtraction
              ? 'text-orange-400'
              : highlight
                ? 'text-green-400'
                : 'text-slate-800 dark:text-slate-200'
          }
        >
          {sign}
          {formatted.binary}
        </span>
        <span className="text-slate-500 dark:text-slate-500 ml-2">
          ({sign}
          {formatted.decimal})
        </span>
      </div>
    </div>
  )
}
