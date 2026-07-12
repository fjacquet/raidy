import type React from 'react'

/**
 * Metric card component with animated values.
 */
export function MetricCard({
  label,
  children,
  subvalue,
  color = 'text-slate-900 dark:text-white',
}: {
  label: string
  children: React.ReactNode
  subvalue?: string
  color?: string
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{children}</div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      {subvalue && <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{subvalue}</p>}
    </div>
  )
}
