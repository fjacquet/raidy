/**
 * Application error boundary for calculation engine failures.
 * Provides user-friendly fallback UI without exposing stack traces.
 */

import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import { useTranslation } from 'react-i18next'

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const { t } = useTranslation('common')

  return (
    <div role="alert" className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
          {t('errors.calculationError.title')}
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          {t('errors.calculationError.message')}
        </p>
        {/* NEVER show error.stack or error.message in production */}
        {/* Only log to console for developer tools */}
        <button
          onClick={resetErrorBoundary}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
        >
          {t('errors.calculationError.resetButton')}
        </button>
      </div>
    </div>
  )
}

export interface AppErrorBoundaryProps {
  children: React.ReactNode
}

export function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        // Log to console for debugging (dev tools only, not visible to users)
        console.error('Calculation engine error:', error, info.componentStack)
        // In production, could send to monitoring service (Sentry, etc.)
      }}
      onReset={() => {
        // Clear URL hash state to reset configuration
        window.location.hash = ''
        window.location.reload()
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}
