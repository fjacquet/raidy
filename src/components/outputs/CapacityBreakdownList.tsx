/**
 * Vertical capacity breakdown list for mobile devices.
 * Shows the same data as Sankey diagram in a stacked bar format.
 */

import { useTranslation } from 'react-i18next'
import { useFormatBytes } from '@/hooks'
import type { VolumetryResult } from '@/types/results'

interface CapacityBreakdownListProps {
  volumetry: VolumetryResult
}

interface BreakdownItem {
  label: string
  value: number
  color: string
  isOverhead: boolean
}

// Colors matching SankeyDiagram
const COLORS = {
  raw: '#64748b', // slate-500
  parity: '#f97316', // orange-500
  hotSpare: '#eab308', // yellow-500
  slop: '#a855f7', // purple-500
  filesystem: '#ec4899', // pink-500
  usable: '#3b82f6', // blue-500
  effective: '#22c55e', // green-500
}

export function CapacityBreakdownList({ volumetry }: CapacityBreakdownListProps) {
  const { t } = useTranslation('output')
  const formatBytes = useFormatBytes()

  const {
    rawCapacity,
    parityOverhead,
    hotSpareOverhead,
    slopOverhead,
    filesystemOverhead,
    usableCapacity,
    effectiveCapacity,
  } = volumetry

  // Build breakdown items
  const items: BreakdownItem[] = []

  // Raw capacity (always shown)
  items.push({
    label: t('capacity.breakdown.rawCapacity'),
    value: rawCapacity,
    color: COLORS.raw,
    isOverhead: false,
  })

  // Overhead items (only if > 0)
  if (parityOverhead > 0) {
    items.push({
      label: t('capacity.breakdown.parity'),
      value: -parityOverhead,
      color: COLORS.parity,
      isOverhead: true,
    })
  }

  if (hotSpareOverhead > 0) {
    items.push({
      label: t('capacity.breakdown.hotSpares'),
      value: -hotSpareOverhead,
      color: COLORS.hotSpare,
      isOverhead: true,
    })
  }

  if (slopOverhead > 0) {
    items.push({
      label: t('capacity.breakdown.zfsSlop'),
      value: -slopOverhead,
      color: COLORS.slop,
      isOverhead: true,
    })
  }

  if (filesystemOverhead > 0) {
    items.push({
      label: t('capacity.breakdown.filesystemOverhead'),
      value: -filesystemOverhead,
      color: COLORS.filesystem,
      isOverhead: true,
    })
  }

  // Usable capacity
  items.push({
    label: t('capacity.breakdown.usableCapacity'),
    value: usableCapacity,
    color: COLORS.usable,
    isOverhead: false,
  })

  // Effective capacity (if different from usable due to compression/dedup)
  if (Math.abs(effectiveCapacity - usableCapacity) > 1024 * 1024) {
    const gain = effectiveCapacity - usableCapacity
    items.push({
      label:
        gain > 0
          ? t('capacity.breakdown.compressionGain')
          : t('capacity.breakdown.effectiveCapacity'),
      value: gain > 0 ? gain : effectiveCapacity,
      color: COLORS.effective,
      isOverhead: false,
    })
  }

  // Calculate max value for bar scaling
  const maxValue = rawCapacity

  return (
    <div className="space-y-2">
      <ul className="space-y-2 list-none m-0 p-0" aria-label="Capacity breakdown">
        {items.map((item) => {
          const absValue = Math.abs(item.value)
          const percentage = (absValue / maxValue) * 100
          const displayPercentage = ((absValue / rawCapacity) * 100).toFixed(1)

          return (
            <li key={item.label} className="space-y-1">
              {/* Label row */}
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-600 dark:text-surface-300 flex items-center gap-2">
                  {/* Color indicator */}
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  {item.label}
                </span>
                <span className="font-mono text-slate-800 dark:text-surface-200">
                  {item.isOverhead ? '−' : ''}
                  {formatBytes(absValue)}
                  <span className="text-slate-500 dark:text-surface-500 ml-1">
                    ({displayPercentage}%)
                  </span>
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="h-2 bg-slate-100 dark:bg-surface-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${item.label}: ${formatBytes(absValue)}`}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, percentage)}%`,
                    backgroundColor: item.color,
                    opacity: item.isOverhead ? 0.7 : 1,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>

      {/* Summary line */}
      <div className="pt-2 mt-2 border-t border-slate-200 dark:border-surface-700">
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-slate-800 dark:text-surface-200">
            {t('capacity.breakdown.effectiveCapacity')}
          </span>
          <span className="font-mono text-green-400">{formatBytes(effectiveCapacity)}</span>
        </div>
        <div className="text-xs text-slate-500 dark:text-surface-500 mt-1">
          {((effectiveCapacity / rawCapacity) * 100).toFixed(1)}% {t('capacity.breakdown.ofRaw')}
        </div>
      </div>
    </div>
  )
}
