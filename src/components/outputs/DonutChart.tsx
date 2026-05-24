/**
 * Donut chart for capacity breakdown visualization.
 */

import { useMemo } from 'react'

interface DonutSegment {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}

export function DonutChart({
  segments,
  size = 200,
  thickness = 30,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const { paths } = useMemo(() => {
    const total = segments.reduce((sum, s) => sum + s.value, 0)
    if (total === 0) return { paths: [], total: 0 }

    const center = size / 2
    const radius = (size - thickness) / 2

    let currentAngle = -90 // Start at top

    const paths = segments
      .filter((s) => s.value > 0)
      .map((segment) => {
        const percent = segment.value / total
        const angle = percent * 360

        const startAngle = currentAngle
        const endAngle = currentAngle + angle

        // Convert to radians
        const startRad = (startAngle * Math.PI) / 180
        const endRad = (endAngle * Math.PI) / 180

        // Calculate arc points
        const x1 = center + radius * Math.cos(startRad)
        const y1 = center + radius * Math.sin(startRad)
        const x2 = center + radius * Math.cos(endRad)
        const y2 = center + radius * Math.sin(endRad)

        // Large arc flag (1 if angle > 180)
        const largeArc = angle > 180 ? 1 : 0

        const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`

        currentAngle = endAngle

        return {
          ...segment,
          path,
          percent,
        }
      })

    return { paths, total }
  }, [segments, size, thickness])

  if (paths.length === 0) {
    return (
      <div
        id="donut-chart"
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-slate-500"
      >
        No data
      </div>
    )
  }

  return (
    <div id="donut-chart" className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-label="Capacity breakdown chart">
        <title>Capacity Breakdown</title>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size - thickness) / 2}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-surface-700"
        />

        {/* Segments */}
        {paths.map((segment) => (
          <path
            key={`segment-${segment.label.replace(/\s+/g, '-').toLowerCase()}`}
            d={segment.path}
            fill="none"
            stroke={segment.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            className="transition-all duration-500"
          >
            <title>
              {segment.label}: {(segment.percent * 100).toFixed(1)}%
            </title>
          </path>
        ))}
      </svg>

      {/* Center text */}
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-2xl font-bold text-white">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-slate-400">{centerLabel}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * Legend for the donut chart.
 */
export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="space-y-2">
      {segments
        .filter((s) => s.value > 0)
        .map((segment) => {
          const percent = total > 0 ? (segment.value / total) * 100 : 0
          return (
            <div
              key={`legend-${segment.label.replace(/\s+/g, '-').toLowerCase()}`}
              className="flex items-center gap-2 text-sm"
            >
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-slate-400 flex-1">{segment.label}</span>
              <span className="text-slate-300 font-mono">{percent.toFixed(1)}%</span>
            </div>
          )
        })}
    </div>
  )
}
