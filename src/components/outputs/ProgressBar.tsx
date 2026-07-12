import { formatNumber } from '@/hooks'

/**
 * Progress bar with label.
 */
export function ProgressBar({
  label,
  value,
  max,
  color = 'bg-primary-500',
  showValue = true,
}: {
  label: string
  value: number
  max: number
  color?: string
  showValue?: boolean
}) {
  const percent = Math.min((value / max) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        {showValue && (
          <span className="font-mono text-slate-600 dark:text-slate-300">
            {formatNumber(Math.round(value))}
          </span>
        )}
      </div>
      <div className="h-2 bg-slate-100 dark:bg-surface-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
