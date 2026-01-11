/**
 * Application header with branding and export actions.
 */

import { copyShareableUrl } from '@/store'

export function Header() {
  const handleShare = async () => {
    const success = await copyShareableUrl()
    if (success) {
      // TODO: Show toast notification
      console.log('URL copied to clipboard')
    }
  }

  return (
    <header className="bg-surface-800 border-b border-surface-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Raidy</h1>
            <p className="text-xs text-slate-400">Storage Infrastructure Simulator</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleShare}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
          >
            Share
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition-colors"
          >
            Export PDF
          </button>
        </div>
      </div>
    </header>
  )
}
