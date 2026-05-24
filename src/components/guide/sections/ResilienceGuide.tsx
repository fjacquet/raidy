/**
 * Sizing guide section: Resilience & Monte Carlo Simulation.
 * Explains how the simulation works and URE risk.
 */

import { useTranslation } from 'react-i18next'

export function ResilienceGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('resilience.intro')}</p>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t('resilience.process.title')}
        </h5>
        <ol className="space-y-1.5 text-sm text-slate-500 dark:text-slate-400">
          {(['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const).map((step) => (
            <li key={step} className="flex items-start gap-2">
              <span className="text-primary-400 font-mono text-xs mt-0.5">
                {step === 'step6' ? '~' : step.replace('step', '')}
              </span>
              <span>{t(`resilience.process.${step}`)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t('resilience.ure.title')}
        </h5>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t('resilience.ure.description')}
        </p>
      </div>

      <div className="p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
        <p className="text-xs text-yellow-300">{t('resilience.keyPoint')}</p>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-600 italic">{t('resilience.sources')}</p>
    </div>
  )
}
