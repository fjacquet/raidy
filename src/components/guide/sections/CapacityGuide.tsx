/**
 * Sizing guide section: How Capacity Works.
 * Explains the capacity waterfall from raw to effective.
 */

import { useTranslation } from 'react-i18next'

export function CapacityGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('capacity.intro')}</p>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t('capacity.waterfall.title')}
        </h5>
        <ol className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-primary-400 font-mono text-xs mt-0.5">1</span>
            <span>{t('capacity.waterfall.step1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 font-mono text-xs mt-0.5">2</span>
            <span>{t('capacity.waterfall.step2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 font-mono text-xs mt-0.5">3</span>
            <span>{t('capacity.waterfall.step3')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 font-mono text-xs mt-0.5">4</span>
            <span>{t('capacity.waterfall.step4')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 font-mono text-xs mt-0.5">5</span>
            <span>{t('capacity.waterfall.step5')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-mono text-xs mt-0.5">=</span>
            <span className="text-slate-800 dark:text-slate-200 font-medium">
              {t('capacity.waterfall.step6')}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 font-mono text-xs mt-0.5">×</span>
            <span>{t('capacity.waterfall.step7')}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-mono text-xs mt-0.5">=</span>
            <span className="text-green-400 font-medium">{t('capacity.waterfall.step8')}</span>
          </li>
        </ol>
      </div>

      <div className="p-3 bg-primary-900/20 border border-primary-700/30 rounded-lg">
        <p className="text-xs text-primary-300">{t('capacity.keyPoint')}</p>
      </div>
    </div>
  )
}
