/**
 * Performance narrative act: Performance Gauges + Bottleneck Analysis cards.
 */

import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/common'
import { Speedometer } from '@/components/outputs'
import { formatNumber, useIsMobile } from '@/hooks'
import type { PerformanceResult } from '@/types/results'

export interface PerformanceActProps {
  performance: PerformanceResult
}

export function PerformanceAct({ performance }: PerformanceActProps) {
  const { t } = useTranslation('output')
  const { t: th } = useTranslation('help')
  const isMobile = useIsMobile()

  return (
    <>
      {/* Performance Gauges Card */}
      <div className="panel">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
          {t('performance.title')} <InfoTooltip content={th('output.bottleneck')} />
        </h3>

        {/* Responsive speedometer grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <Speedometer
            id="gauge-read-mbps"
            value={performance.maxReadThroughputMBs}
            max={50000}
            label={t('performance.read')}
            unit="MB/s"
            size={isMobile ? 100 : 140}
          />
          <Speedometer
            id="gauge-write-mbps"
            value={performance.maxWriteThroughputMBs}
            max={50000}
            label={t('performance.write')}
            unit="MB/s"
            size={isMobile ? 100 : 140}
          />
          <Speedometer
            id="gauge-read-iops"
            value={performance.maxReadIOPS}
            max={2000000}
            label={t('performance.readIops')}
            unit="IOPS"
            size={isMobile ? 100 : 140}
            thresholds={[
              { value: 0.5, color: '#22c55e' },
              { value: 0.8, color: '#3b82f6' },
              { value: 1.0, color: '#a855f7' },
            ]}
          />
          <Speedometer
            id="gauge-write-iops"
            value={performance.maxWriteIOPS}
            max={2000000}
            label={t('performance.writeIops')}
            unit="IOPS"
            size={isMobile ? 100 : 140}
            thresholds={[
              { value: 0.5, color: '#22c55e' },
              { value: 0.8, color: '#3b82f6' },
              { value: 1.0, color: '#a855f7' },
            ]}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {performance.bottleneckDescription}
          </p>
        </div>
      </div>

      {/* Bottleneck Analysis Card */}
      <div className="panel">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
          {t('performance.bottleneck.title')} <InfoTooltip content={th('output.bottleneck')} />
        </h3>

        <div className="space-y-3">
          {performance.layers.map((layer) => (
            <div key={layer.name} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span
                  className={
                    layer.isBottleneck
                      ? 'text-orange-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {layer.name}
                  {layer.isBottleneck && ' ⚠'}
                </span>
                <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">
                  {formatNumber(Math.round(layer.throughputMBs))} MB/s
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-surface-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    layer.isBottleneck ? 'bg-orange-500' : 'bg-primary-500'
                  }`}
                  style={{ width: `${layer.utilization}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
