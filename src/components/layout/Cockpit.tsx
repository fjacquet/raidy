/**
 * Main "Cockpit" layout - split screen with fixed inputs and reactive outputs.
 */

import { Header } from './Header'
import { InputSidebar } from './InputSidebar'
import { OutputDashboard } from './OutputDashboard'

export function Cockpit() {
  return (
    <div className="h-screen flex flex-col bg-surface-900">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <InputSidebar />
        <OutputDashboard />
      </div>
    </div>
  )
}
