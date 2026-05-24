/**
 * Contextual help tooltip component.
 * Shows an info icon that displays explanatory text on hover (desktop) or tap (mobile).
 * No external dependencies — uses Tailwind CSS and existing hooks.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useIsTouchDevice } from '@/hooks'

interface InfoTooltipProps {
  content: string
}

export function InfoTooltip({ content }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isTouch = useIsTouchDevice()
  const ref = useRef<HTMLDivElement>(null)
  const tooltipId = useId()

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])

  // Click-outside-to-close for touch devices
  useEffect(() => {
    if (!isOpen || !isTouch) return

    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [isOpen, isTouch])

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={isTouch ? toggle : undefined}
        onMouseEnter={isTouch ? undefined : open}
        onMouseLeave={isTouch ? undefined : close}
        onFocus={isTouch ? undefined : open}
        onBlur={isTouch ? undefined : close}
        aria-describedby={isOpen ? tooltipId : undefined}
        className="text-slate-500 dark:text-slate-400 hover:text-primary-400 focus:text-primary-400 transition-colors focus:outline-none"
        aria-label="Help"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full mt-1 z-50 bg-slate-100 dark:bg-surface-700 border border-slate-200 dark:border-surface-600 rounded-lg p-3 shadow-lg text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-xs sm:max-w-sm animate-tooltip-in"
        >
          {content}
        </div>
      )}
    </div>
  )
}
