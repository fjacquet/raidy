/**
 * Vitest Global Test Setup
 *
 * Provides:
 * - jest-dom custom matchers (toBeInTheDocument, toHaveClass, etc.)
 * - Automatic cleanup after each test
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Automatic cleanup after each test to prevent memory leaks and state pollution
afterEach(() => {
  cleanup()
})
