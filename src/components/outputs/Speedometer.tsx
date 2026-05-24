/**
 * Speedometer gauge for performance visualization.
 * Shows throughput or IOPS with an animated needle.
 */

import { useMemo } from 'react'

interface SpeedometerProps {
  value: number
  max: number
  label: string
  unit: string
  size?: number
  thresholds?: { value: number; color: string }[]
  /** Optional DOM id (used to capture an individual gauge for PPTX export). */
  id?: string
}

// Default color thresholds (percentage of max)
const DEFAULT_THRESHOLDS = [
  { value: 0.33, color: '#22c55e' }, // green
  { value: 0.66, color: '#eab308' }, // yellow
  { value: 1.0, color: '#ef4444' }, // red
]

export function Speedometer({
  value,
  max,
  label,
  unit,
  size = 180,
  thresholds = DEFAULT_THRESHOLDS,
  id,
}: SpeedometerProps) {
  const { angle, color, formattedValue } = useMemo(() => {
    const percent = Math.min(value / max, 1)
    // Map 0-1 to -135 to 135 degrees (270 degree arc)
    const angle = -135 + percent * 270

    // Find color based on thresholds
    let color = thresholds[0]?.color || '#22c55e'
    for (const t of thresholds) {
      if (percent <= t.value) {
        color = t.color
        break
      }
      color = t.color
    }

    // Format value
    let formattedValue: string
    if (value >= 1000000) {
      formattedValue = `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      formattedValue = `${(value / 1000).toFixed(1)}K`
    } else {
      formattedValue = value.toFixed(0)
    }

    return { angle, color, formattedValue }
  }, [value, max, thresholds])

  const center = size / 2
  const radius = size * 0.4
  const strokeWidth = size * 0.08
  const innerRadius = radius - strokeWidth / 2

  // Arc path for the gauge background
  const arcPath = useMemo(() => {
    const startAngle = -135 * (Math.PI / 180)
    const endAngle = 135 * (Math.PI / 180)

    const x1 = center + innerRadius * Math.cos(startAngle)
    const y1 = center + innerRadius * Math.sin(startAngle)
    const x2 = center + innerRadius * Math.cos(endAngle)
    const y2 = center + innerRadius * Math.sin(endAngle)

    return `M ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 1 1 ${x2} ${y2}`
  }, [center, innerRadius])

  // Arc path for the filled portion
  const filledArcPath = useMemo(() => {
    const startAngle = -135 * (Math.PI / 180)
    const endAngle = angle * (Math.PI / 180)

    if (endAngle <= startAngle) return ''

    const x1 = center + innerRadius * Math.cos(startAngle)
    const y1 = center + innerRadius * Math.sin(startAngle)
    const x2 = center + innerRadius * Math.cos(endAngle)
    const y2 = center + innerRadius * Math.sin(endAngle)

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0

    return `M ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${x2} ${y2}`
  }, [center, innerRadius, angle])

  // Needle path
  const needlePath = useMemo(() => {
    const needleLength = innerRadius * 0.85
    const needleBase = 6
    const rad = angle * (Math.PI / 180)

    const tipX = center + needleLength * Math.cos(rad)
    const tipY = center + needleLength * Math.sin(rad)

    const baseRad1 = (angle + 90) * (Math.PI / 180)
    const baseRad2 = (angle - 90) * (Math.PI / 180)

    const base1X = center + needleBase * Math.cos(baseRad1)
    const base1Y = center + needleBase * Math.sin(baseRad1)
    const base2X = center + needleBase * Math.cos(baseRad2)
    const base2Y = center + needleBase * Math.sin(baseRad2)

    return `M ${tipX} ${tipY} L ${base1X} ${base1Y} L ${base2X} ${base2Y} Z`
  }, [center, innerRadius, angle])

  // Tick marks
  const ticks = useMemo(() => {
    const tickCount = 9
    const result = []

    for (let i = 0; i <= tickCount; i++) {
      const tickAngle = -135 + (i / tickCount) * 270
      const rad = tickAngle * (Math.PI / 180)

      const outerR = innerRadius + strokeWidth / 2 + 2
      const innerR = innerRadius + strokeWidth / 2 + (i % 3 === 0 ? 10 : 6)

      const x1 = center + outerR * Math.cos(rad)
      const y1 = center + outerR * Math.sin(rad)
      const x2 = center + innerR * Math.cos(rad)
      const y2 = center + innerR * Math.sin(rad)

      result.push({ x1, y1, x2, y2, major: i % 3 === 0 })
    }

    return result
  }, [center, innerRadius, strokeWidth])

  return (
    <div id={id} className="flex flex-col items-center">
      <svg
        width={size}
        height={size * 0.7}
        viewBox={`0 0 ${size} ${size * 0.7}`}
        aria-label={`${label} gauge`}
      >
        <title>{label} Performance Gauge</title>
        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-surface-700"
        />

        {/* Colored gradient segments */}
        {thresholds.map((t, i) => {
          const prevPercent = i === 0 ? 0 : (thresholds[i - 1]?.value ?? 0)
          const startAngle = -135 + prevPercent * 270
          const endAngle = -135 + t.value * 270

          const startRad = startAngle * (Math.PI / 180)
          const endRad = endAngle * (Math.PI / 180)

          const x1 = center + innerRadius * Math.cos(startRad)
          const y1 = center + innerRadius * Math.sin(startRad)
          const x2 = center + innerRadius * Math.cos(endRad)
          const y2 = center + innerRadius * Math.sin(endRad)

          const largeArc = endAngle - startAngle > 180 ? 1 : 0

          return (
            <path
              key={`threshold-${t.value}-${t.color}`}
              d={`M ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${x2} ${y2}`}
              fill="none"
              stroke={t.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              opacity={0.2}
            />
          )
        })}

        {/* Filled arc */}
        {filledArcPath && (
          <path
            d={filledArcPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        )}

        {/* Tick marks */}
        {ticks.map((tick) => (
          <line
            key={`tick-${tick.x1.toFixed(2)}-${tick.y1.toFixed(2)}`}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="currentColor"
            strokeWidth={tick.major ? 2 : 1}
            className="text-slate-500"
          />
        ))}

        {/* Needle */}
        <path d={needlePath} fill={color} className="transition-all duration-500" />

        {/* Center circle */}
        <circle cx={center} cy={center} r={8} fill="currentColor" className="text-slate-400" />
      </svg>

      {/* Value display */}
      <div className="text-center -mt-2">
        <p className="text-2xl font-bold text-white font-mono">{formattedValue}</p>
        <p className="text-xs text-slate-400">{unit}</p>
      </div>

      {/* Label */}
      <p className="text-sm text-slate-300 mt-1">{label}</p>
    </div>
  )
}
