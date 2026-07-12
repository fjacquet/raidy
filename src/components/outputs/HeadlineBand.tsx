import { useTranslation } from 'react-i18next'
import { type RelevanceContext, shouldShowKpi } from '@/engines/outputRelevance'
import { formatNumber } from '@/hooks'
import type {
  PerformanceResult,
  ResilienceResult,
  SustainabilityResult,
  VolumetryResult,
} from '@/types/results'
import type { Topology } from '@/types/topology'
import { AnimatedBytes, AnimatedPercent } from './AnimatedCounter'

interface HeadlineBandProps {
  volumetry: VolumetryResult
  performance: PerformanceResult
  resilience: ResilienceResult | null
  sustainability: SustainabilityResult
  topology: Topology
  onRunSurvival: () => void
}

export function HeadlineBand({
  volumetry,
  performance,
  resilience,
  sustainability,
  topology,
  onRunSurvival,
}: HeadlineBandProps) {
  const { t } = useTranslation('output')
  const ctx: RelevanceContext = {
    topology,
    volumetry,
    sustainability,
    hasResilienceResult: resilience != null,
    hasBackup: false,
  }
  const peakIops = Math.max(performance.maxReadIOPS, performance.maxWriteIOPS)

  return (
    <div className="panel">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {shouldShowKpi('usable', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-400">
              <AnimatedBytes value={volumetry.usableCapacity} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.usable')}</p>
          </div>
        )}
        {shouldShowKpi('effective', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              <AnimatedBytes value={volumetry.effectiveCapacity} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.effective')}</p>
          </div>
        )}
        {shouldShowKpi('efficiency', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              <AnimatedPercent value={volumetry.efficiency} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.efficiency')}</p>
          </div>
        )}
        {shouldShowKpi('peakIops', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {formatNumber(Math.round(peakIops))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.peakIops')}</p>
          </div>
        )}
        <div className="text-center">
          {shouldShowKpi('survival', ctx) && resilience ? (
            <>
              <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
                {resilience.survivalPercent}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('headline.survival')}</p>
            </>
          ) : (
            <button
              type="button"
              onClick={onRunSurvival}
              className="px-3 py-2 text-xs font-medium rounded bg-primary-600 hover:bg-primary-500 transition-colors"
            >
              {t('headline.runSurvival')}
            </button>
          )}
        </div>
        {shouldShowKpi('annualEnergy', ctx) && (
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {formatNumber(Math.round(sustainability.annualEnergyKwh))}
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">kWh</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('headline.annualEnergy')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
