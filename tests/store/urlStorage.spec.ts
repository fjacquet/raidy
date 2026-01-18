/**
 * Tests for URL storage with toast notifications.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { urlHashStorage } from '@/store/urlStorage'

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

// Import after mocking
import { toast } from 'sonner'

describe('urlHashStorage', () => {
  let originalWindow: typeof window

  beforeEach(() => {
    // Save original window
    originalWindow = global.window

    // Setup window mock
    global.window = {
      location: {
        hash: '',
        href: 'http://localhost:3000',
        pathname: '/',
        search: '',
      },
      history: {
        replaceState: vi.fn(),
      },
    } as unknown as Window & typeof globalThis

    // Clear mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original window
    global.window = originalWindow
  })

  describe('getItem', () => {
    it('should return null when hash is empty', () => {
      window.location.hash = ''
      const result = urlHashStorage.getItem('config')
      expect(result).toBeNull()
    })

    it('should show toast error when decompression fails', () => {
      // Set invalid compressed data
      window.location.hash = '#config=INVALID_DATA'

      const result = urlHashStorage.getItem('config')

      // Verify null returned
      expect(result).toBeNull()

      // Verify toast.error was called
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Invalid configuration link',
        expect.objectContaining({
          description: expect.stringContaining('Unable to load configuration'),
          duration: 5000,
        }),
      )
    })

    it('should log errors to console for developer debugging', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      window.location.hash = '#config=INVALID'

      urlHashStorage.getItem('config')

      // Verify console.error was called (developer debugging)
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('setItem', () => {
    it('should update URL hash with compressed state', () => {
      const state = JSON.stringify({ driveId: 'test', driveCount: 8 })

      urlHashStorage.setItem('config', state)

      // Verify replaceState was called
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        expect.stringContaining('#config='),
      )
    })

    it('should not crash when compression fails', () => {
      // Should not throw even with problematic data
      expect(() => {
        urlHashStorage.setItem('config', 'test-data')
      }).not.toThrow()
    })
  })

  describe('removeItem', () => {
    it('should remove hash parameter', () => {
      window.location.hash = '#config=abc123'

      urlHashStorage.removeItem('config')

      // Verify replaceState was called to remove hash
      // Note: implementation uses pathname + search, not full href
      expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/')
    })
  })
})
