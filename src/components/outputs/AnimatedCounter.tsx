/**
 * Animated number counter with smooth transitions.
 */

import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  duration?: number
  formatter?: (value: number) => string
  className?: string
}

// Default formatter for numbers
function defaultFormatter(value: number): string {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toFixed(0)
}

// Easing function for smooth animation
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - 2 ** (-10 * t)
}

export function AnimatedCounter({
  value,
  duration = 800,
  formatter = defaultFormatter,
  className = '',
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const previousValue = useRef(value)
  const animationRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const startValue = previousValue.current
    const endValue = value
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutExpo(progress)

      const currentValue = startValue + (endValue - startValue) * easedProgress
      setDisplayValue(currentValue)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        previousValue.current = endValue
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [value, duration])

  return <span className={className}>{formatter(displayValue)}</span>
}

/**
 * Animated bytes counter with appropriate unit formatting.
 */
export function AnimatedBytes({
  value,
  duration = 800,
  className = '',
}: {
  value: number
  duration?: number
  className?: string
}) {
  const formatter = (v: number): string => {
    if (v >= 1024 ** 5) {
      return `${(v / 1024 ** 5).toFixed(1)} PB`
    }
    if (v >= 1024 ** 4) {
      return `${(v / 1024 ** 4).toFixed(1)} TB`
    }
    if (v >= 1024 ** 3) {
      return `${(v / 1024 ** 3).toFixed(1)} GB`
    }
    return `${(v / 1024 ** 2).toFixed(0)} MB`
  }

  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      formatter={formatter}
      className={className}
    />
  )
}

/**
 * Animated currency counter.
 */
export function AnimatedCurrency({
  value,
  duration = 800,
  className = '',
}: {
  value: number
  duration?: number
  className?: string
}) {
  const formatter = (v: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v)
  }

  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      formatter={formatter}
      className={className}
    />
  )
}

/**
 * Animated percentage counter.
 */
export function AnimatedPercent({
  value,
  decimals = 1,
  duration = 800,
  className = '',
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
}) {
  const formatter = (v: number): string => `${v.toFixed(decimals)}%`

  return (
    <AnimatedCounter
      value={value}
      duration={duration}
      formatter={formatter}
      className={className}
    />
  )
}
