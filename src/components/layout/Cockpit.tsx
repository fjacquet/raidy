/**
 * Main "Cockpit" layout - split screen with fixed inputs and reactive outputs.
 * Mobile responsive: stacked layout with sticky bottom navigation.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GuideView } from '@/components/guide'
import { Header } from './Header'
import { InputSidebar } from './InputSidebar'
import { OutputDashboard } from './OutputDashboard'

type CockpitView = 'config' | 'report' | 'guide'

export function Cockpit() {
  const { t } = useTranslation('common')
  const [activeView, setActiveView] = useState<CockpitView>('config')
  const isGuideOpen = activeView === 'guide'

  const toggleGuide = () => {
    setActiveView((prev) => (prev === 'guide' ? 'report' : 'guide'))
  }

  return (
    <div className="h-screen flex flex-col bg-surface-900">
      <Header onToggleGuide={toggleGuide} isGuideOpen={isGuideOpen} />

      {/* Main content - responsive layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-14 lg:pb-0">
        {/* Input Sidebar - hidden when guide is open */}
        {!isGuideOpen && (
          <div
            className={`${
              activeView === 'config' ? 'block' : 'hidden'
            } lg:block lg:flex-shrink-0 overflow-y-auto`}
          >
            <InputSidebar />
          </div>
        )}

        {/* Output Dashboard - hidden when guide is open */}
        {!isGuideOpen && (
          <div
            className={`${
              activeView === 'report' ? 'block' : 'hidden'
            } lg:block flex-1 overflow-y-auto`}
          >
            <OutputDashboard />
          </div>
        )}

        {/* Guide View - full width when active */}
        {isGuideOpen && (
          <div className="flex-1 overflow-y-auto">
            <GuideView />
          </div>
        )}
      </div>

      {/* Mobile bottom navigation - only visible on mobile */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface-800 border-t border-surface-700 z-50">
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveView('config')}
            className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
              activeView === 'config'
                ? 'text-accent-400 bg-surface-700'
                : 'text-surface-300 hover:text-surface-100'
            }`}
          >
            {t('nav.configuration')}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('report')}
            className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
              activeView === 'report'
                ? 'text-accent-400 bg-surface-700'
                : 'text-surface-300 hover:text-surface-100'
            }`}
          >
            {t('nav.report')}
          </button>
          <button
            type="button"
            onClick={() => setActiveView('guide')}
            className={`flex-1 py-3 min-h-[44px] text-sm font-medium transition-colors ${
              activeView === 'guide'
                ? 'text-accent-400 bg-surface-700'
                : 'text-surface-300 hover:text-surface-100'
            }`}
          >
            {t('nav.guide')}
          </button>
        </div>
      </nav>
    </div>
  )
}
