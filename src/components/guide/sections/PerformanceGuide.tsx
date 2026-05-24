/**
 * Sizing guide section: Performance Bottlenecks.
 * Explains the 4-layer bottleneck chain.
 */

import { useTranslation } from 'react-i18next'

export function PerformanceGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('performance.intro')}</p>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t('performance.chain.title')}
        </h5>
        <div className="space-y-2">
          <div className="flex items-start gap-3 p-2 bg-slate-100 dark:bg-surface-700 rounded">
            <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 text-xs font-bold">1</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('performance.chain.media')}
            </p>
          </div>
          <div className="flex items-start gap-3 p-2 bg-slate-100 dark:bg-surface-700 rounded">
            <div className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-purple-400 text-xs font-bold">2</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('performance.chain.controller')}
            </p>
          </div>
          <div className="flex items-start gap-3 p-2 bg-slate-100 dark:bg-surface-700 rounded">
            <div className="w-6 h-6 bg-cyan-500/20 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-cyan-400 text-xs font-bold">3</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('performance.chain.pcie')}
            </p>
          </div>
          <div className="flex items-start gap-3 p-2 bg-slate-100 dark:bg-surface-700 rounded">
            <div className="w-6 h-6 bg-green-500/20 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-green-400 text-xs font-bold">4</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('performance.chain.network')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-3 bg-orange-900/20 border border-orange-700/30 rounded-lg">
        <p className="text-xs text-orange-300">{t('performance.keyPoint')}</p>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{t('performance.alignment')}</p>
    </div>
  )
}
