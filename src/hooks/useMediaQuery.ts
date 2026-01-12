/**
 * Media query hooks for responsive behavior.
 * Uses window.matchMedia for efficient viewport detection.
 */

import { useEffect, useState } from 'react'

/**
 * Generic hook for any media query string.
 * @param query - CSS media query string (e.g., '(max-width: 767px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // SSR-safe: default to false on server
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const media = window.matchMedia(query)

    // Set initial value
    setMatches(media.matches)

    // Create listener
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)

    // Modern browsers use addEventListener
    media.addEventListener('change', listener)

    return () => media.removeEventListener('change', listener)
  }, [query])

  return matches
}

/**
 * Tailwind breakpoint values in pixels.
 * Matches Tailwind CSS v4 defaults.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

/**
 * Hook to detect mobile devices (< 768px).
 * Corresponds to Tailwind's `md:` breakpoint.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`)
}

/**
 * Hook to detect tablet devices (768px - 1023px).
 * Between Tailwind's `md:` and `lg:` breakpoints.
 */
export function useIsTablet(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`)
}

/**
 * Hook to detect desktop devices (>= 1024px).
 * Corresponds to Tailwind's `lg:` breakpoint and above.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`)
}

/**
 * Hook to detect wide screens (>= 1280px).
 * Corresponds to Tailwind's `xl:` breakpoint and above.
 */
export function useIsWideScreen(): boolean {
  return useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`)
}

/**
 * Hook to detect touch devices.
 * Uses pointer: coarse media query for reliable touch detection.
 */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(pointer: coarse)')
}

/**
 * Hook to detect reduced motion preference.
 * Useful for disabling animations for accessibility.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
