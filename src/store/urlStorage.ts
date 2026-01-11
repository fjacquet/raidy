/**
 * Custom StateStorage implementation for URL hash persistence.
 * Uses LZ compression to keep URLs manageable.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { StateStorage } from 'zustand/middleware'

/**
 * Custom StateStorage that syncs state to URL hash with LZ compression.
 * Enables "Copy URL to Share" functionality without backend.
 */
export const urlHashStorage: StateStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null

    const hash = window.location.hash.slice(1)
    if (!hash) return null

    try {
      const searchParams = new URLSearchParams(hash)
      const compressed = searchParams.get(key)
      if (!compressed) return null

      const decompressed = decompressFromEncodedURIComponent(compressed)
      return decompressed
    } catch (error) {
      console.warn('Failed to parse URL hash state:', error)
      return null
    }
  },

  setItem: (key: string, newValue: string): void => {
    if (typeof window === 'undefined') return

    try {
      const compressed = compressToEncodedURIComponent(newValue)
      const searchParams = new URLSearchParams(window.location.hash.slice(1))
      searchParams.set(key, compressed)

      // Update URL without triggering navigation or history entry
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#${searchParams.toString()}`,
      )
    } catch (error) {
      console.warn('Failed to persist state to URL:', error)
    }
  },

  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.hash.slice(1))
    searchParams.delete(key)

    const newHash = searchParams.toString()
    window.history.replaceState(
      null,
      '',
      newHash
        ? `${window.location.pathname}${window.location.search}#${newHash}`
        : `${window.location.pathname}${window.location.search}`,
    )
  },
}

/**
 * Generate a shareable URL with current configuration.
 */
export function getShareableUrl(): string {
  return window.location.href
}

/**
 * Copy shareable URL to clipboard.
 */
export async function copyShareableUrl(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(getShareableUrl())
    return true
  } catch {
    return false
  }
}
