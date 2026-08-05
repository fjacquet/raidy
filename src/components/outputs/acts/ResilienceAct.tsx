/**
 * Resilience narrative act: Monte Carlo simulation card (survival rate, risk metrics, recommendations).
 */

import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/common'
import { formatNumber } from '@/hooks'
import type { ResilienceResult, SimulationProgress } from '@/types/results'

export interface ResilienceActProps {
  result: ResilienceResult | null
  progress: SimulationProgress
  isRunning: boolean
  runSimulation: () => void
  isMobile: boolean
}

export function ResilienceAct({
  result,
  progress,
  isRunning,
  runSimulation,
  isMobile,
}: ResilienceActProps) {
  const { t } = useTranslation('output')
  const { t: th } = useTranslation('help')

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
          {t('resilience.title')} <InfoTooltip content={th('output.survivalRate')} />
        </h3>
        <button
          type="button"
          onClick={runSimulation}
          disabled={isRunning}
          className="px-3 py-1 text-xs font-medium rounded bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? t('resilience.simulating') : t('resilience.runSimulation')}
        </button>
      </div>

      {isRunning && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>{t('resilience.monteCarloSimulation')}</span>
            <span>{progress.percent.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-surface-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-200"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {result ? (
        <div className="space-y-4">
          {/* Survival Rate */}
          <div className="text-center py-4 bg-slate-50 dark:bg-surface-900 rounded-lg">
            <p
              className={`text-4xl font-bold font-mono ${
                result.riskLevel === 'low'
                  ? 'text-green-400'
                  : result.riskLevel === 'medium'
                    ? 'text-yellow-400'
                    : result.riskLevel === 'high'
                      ? 'text-orange-400'
                      : 'text-red-400'
              }`}
            >
              {result.survivalPercent}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('resilience.annualSurvivalRate', { nines: result.nines })}
            </p>
          </div>

          {/* Risk Metrics */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('resilience.rebuildTime')}</p>
              <p className="text-slate-900 dark:text-white font-mono">
                {result.avgRebuildTimeHours.toFixed(1)}h
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('resilience.ureRisk')}</p>
              <p className="text-slate-900 dark:text-white font-mono">
                {(result.ureProbability * 100).toFixed(3)}%
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('resilience.dualFailure')}</p>
              <p className="text-slate-900 dark:text-white font-mono">
                {(result.dualFailureProbability * 100).toFixed(3)}%
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">{t('resilience.riskLevel')}</p>
              <p
                className={`font-medium capitalize ${
                  result.riskLevel === 'low'
                    ? 'text-green-400'
                    : result.riskLevel === 'medium'
                      ? 'text-yellow-400'
                      : result.riskLevel === 'high'
                        ? 'text-orange-400'
                        : 'text-red-400'
                }`}
              >
                {result.riskLevel}
              </p>
            </div>
          </div>

          {/* Odd BeeGFS storage-target count: buddy credit withheld (issue #68) */}
          {result.oddTargetCountNoBuddyCredit && (
            <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                <span aria-hidden="true">⚠</span>
                <span>{t('resilience.oddTargetNote')}</span>
              </p>
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
                {t('resilience.recommendations')}
              </p>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {/* `rec` is an i18n key suffix, not a display string — see #125. Translating
                    here rather than where the array is built keeps it reactive to a language
                    switch made after the simulation has already run. */}
                {result.recommendations.map((rec) => (
                  <li key={rec} className="flex items-start gap-2">
                    <span className="text-primary-400">•</span>
                    <span>{t(`resilience.recommendation.${rec}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500 dark:text-slate-500">
          <p>{t('resilience.clickToRun')}</p>
          <p className="text-xs mt-1">
            {formatNumber(isMobile ? 1000 : 10000)} {t('resilience.iterations')}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {t('resilience.includesCorrelated')}
          </p>
        </div>
      )}
    </div>
  )
}
