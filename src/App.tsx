/**
 * Main application component.
 */

import { AppErrorBoundary } from '@/components/ErrorBoundary'
import { Cockpit } from '@/components/layout'
import { Toaster } from 'sonner'

export function App() {
  return (
    <AppErrorBoundary>
      <Toaster position="top-right" />
      <Cockpit />
    </AppErrorBoundary>
  )
}
