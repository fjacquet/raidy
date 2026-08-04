/**
 * Custom StateStorage implementation for URL hash persistence.
 * Uses LZ compression to keep URLs manageable.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { toast } from 'sonner'
import type { StateStorage } from 'zustand/middleware'
import { validateUrlState } from '@/utils/schemas'

/**
 * Zustand's `persist` middleware (via `createJSONStorage`) wraps the
 * partialized state in `{ state, version }` before it ever reaches this
 * module's `setItem` — see `zustand/middleware.js`'s `setItem`/`getItem`
 * (`storage.setItem(name, JSON.stringify(newValue))` where
 * `newValue = { state: options.partialize(...), version: options.version }`),
 * and `hydrate()` reading `deserializedStorageValue.state` /
 * `.version` back out. The compressed hash therefore decodes to that
 * envelope, and nothing else — a payload that is not `{ state, version }`
 * cannot have come from any released version of this app and is rejected
 * as a corrupt link rather than treated as a legacy shape.
 */
interface PersistEnvelope {
  state: unknown
  version?: number
}

function isPersistEnvelope(value: unknown): value is PersistEnvelope {
  if (typeof value !== 'object' || value === null || !('state' in value)) return false
  const state = (value as Record<string, unknown>).state
  return typeof state === 'object' && state !== null
}

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
      if (!decompressed) return null

      const parsed = JSON.parse(decompressed)

      // Validate the REAL config payload, not the persist envelope wrapping it. A payload that
      // is not an envelope cannot have come from any released version — `createJSONStorage` has
      // wrapped state in `{ state, version }` since the initial commit — so it is treated as a
      // corrupt link rather than a legacy one.
      if (!isPersistEnvelope(parsed)) {
        console.error('Configuration link is not in the expected format')
        toast.error('Invalid configuration link', {
          description: 'The shared configuration link is invalid. Using default settings instead.',
          duration: 5000,
        })
        return null
      }
      const validated = validateUrlState(parsed.state)

      if (!validated) {
        // Validation failed - notify user with toast
        console.error('Configuration link is invalid or corrupted')
        toast.error('Invalid configuration link', {
          description: 'The shared configuration link is invalid. Using default settings instead.',
          duration: 5000,
        })
        return null
      }

      // Re-wrap in the envelope Zustand expects (preserving `version`) so
      // hydration reads the validated config, not the raw unvalidated one.
      const output = { state: validated, version: parsed.version }

      // Return validated state as JSON string for Zustand
      return JSON.stringify(output)
    } catch (error) {
      console.error('Failed to parse URL hash state:', error)
      toast.error('Invalid configuration link', {
        description: 'Unable to load configuration from URL. Using default settings instead.',
        duration: 5000,
      })
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
