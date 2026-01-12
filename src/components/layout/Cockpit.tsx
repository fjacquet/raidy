/**
 * Main "Cockpit" layout - split screen with fixed inputs and reactive outputs.
 * Mobile responsive: stacked layout with sticky bottom navigation.
 */

import { useState } from 'react'
import { Header } from './Header'
import { InputSidebar } from './InputSidebar'
import { OutputDashboard } from './OutputDashboard'

type MobileView = 'config' | 'report'

export function Cockpit() {
  const [mobileView, setMobileView] = useState<MobileView>('config')

  return (
    <div className="h-screen flex flex-col bg-surface-900">
      <Header />

      {/* Main content - responsive layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-14 lg:pb-0">
        {/* Input Sidebar - visible on desktop, conditionally on mobile */}
        <div
          className={`${
            mobileView === 'config' ? 'block' : 'hidden'
          } lg:block lg:flex-shrink-0 overflow-y-auto`}
        >
          <InputSidebar />
        </div>

        {/* Output Dashboard - visible on desktop, conditionally on mobile */}
        <div
          className={`${
            mobileView === 'report' ? 'block' : 'hidden'
          } lg:block flex-1 overflow-y-auto`}
        >
          <OutputDashboard />
        </div>
      </div>

      {/* Mobile bottom navigation - only visible on mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-800 border-t border-surface-700 z-50">
        <div className="flex">
          <button
            type="button"
            onClick={() => setMobileView('config')}
            className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
              mobileView === 'config'
                ? 'text-accent-400 bg-surface-700'
                : 'text-surface-300 hover:text-surface-100'
            }`}
          >
            Configuration
          </button>
          <button
            type="button"
            onClick={() => setMobileView('report')}
            className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
              mobileView === 'report'
                ? 'text-accent-400 bg-surface-700'
                : 'text-surface-300 hover:text-surface-100'
            }`}
          >
            Report
          </button>
        </div>
      </nav>
    </div>
  )
}
