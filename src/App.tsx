/**
 * Main application component.
 */

import { AppErrorBoundary } from '@/components/ErrorBoundary'
import { Cockpit } from '@/components/layout'

export function App() {
  return (
    <AppErrorBoundary>
      <Cockpit />
    </AppErrorBoundary>
  )
}
