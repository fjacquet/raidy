/**
 * Cost narrative act: Power & Sustainability card.
 */

import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/common'
import { MetricCard, ProgressBar } from '@/components/outputs'
import { formatNumber } from '@/hooks'
import type { SustainabilityResult } from '@/types/results'

export interface CostActProps {
  sustainability: SustainabilityResult
}

export function CostAct({ sustainability }: CostActProps) {
  const { t } = useTranslation('output')
  const { t: th } = useTranslation('help')

  return (
    <div className="panel">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
        {t('power.title')} <InfoTooltip content={th('output.totalPower')} />
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <MetricCard label={t('power.totalPower')}>
          <span className="font-mono">
            {formatNumber(Math.round(sustainability.powerBreakdown.total))}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">W</span>
        </MetricCard>
        <MetricCard label={t('power.annualEnergy')}>
          <span className="font-mono">
            {formatNumber(Math.round(sustainability.annualEnergyKwh))}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">kWh</span>
        </MetricCard>
      </div>

      <div className="space-y-2">
        <ProgressBar
          label={t('power.drives')}
          value={sustainability.powerBreakdown.drives}
          max={sustainability.powerBreakdown.total}
          color="bg-blue-500"
        />
        <ProgressBar
          label={t('power.servers')}
          value={sustainability.powerBreakdown.servers}
          max={sustainability.powerBreakdown.total}
          color="bg-purple-500"
        />
        <ProgressBar
          label={t('power.cooling')}
          value={sustainability.powerBreakdown.cooling}
          max={sustainability.powerBreakdown.total}
          color="bg-cyan-500"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700 flex justify-between items-center">
        <span className="text-slate-500 dark:text-slate-400">{t('power.annualCo2')}</span>
        <span className="text-lg font-bold text-slate-900 dark:text-white">
          {formatNumber(Math.round(sustainability.annualCO2Kg))} kg
        </span>
      </div>

      {sustainability.flashEndurance && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {t('ssd.title')}
            </span>
            <span
              className={`text-sm font-medium ${
                sustainability.flashEndurance.surviveProject ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {sustainability.flashEndurance.surviveProject
                ? `✓ ${t('ssd.ok')}`
                : `⚠ ${t('ssd.atRisk')}`}
            </span>
          </div>
          <ProgressBar
            label={t('ssd.dwpdUsage', {
              required: sustainability.flashEndurance.requiredDwpd.toFixed(2),
              rated: sustainability.flashEndurance.ratedDwpd.toFixed(1),
            })}
            value={sustainability.flashEndurance.utilizationPercent}
            max={100}
            color={sustainability.flashEndurance.surviveProject ? 'bg-green-500' : 'bg-red-500'}
            showValue={false}
          />
        </div>
      )}
    </div>
  )
}
