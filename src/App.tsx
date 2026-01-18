/**
 * Main application component.
 */

import { Toaster } from 'sonner'
import { AppErrorBoundary } from '@/components/ErrorBoundary'
import { Cockpit } from '@/components/layout'

export function App() {
  return (
    <AppErrorBoundary>
      <Toaster position="top-right" />
      <Cockpit />
    </AppErrorBoundary>
  )
}
