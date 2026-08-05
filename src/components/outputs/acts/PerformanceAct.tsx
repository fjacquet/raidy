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

  // A distinct sustained-write figure only exists where a fast tier's burst absorption diverges
  // from what the capacity tier can drain (#112) — tiered S2D, tiered vSAN OSA, tiered Nutanix
  // with a cache drive selected. Everywhere else (untiered, Ceph, BeeGFS, no cache selected) the
  // two figures are computed to be exactly equal, so showing both would imply a distinction that
  // doesn't exist for that platform. Comparing the engine's own outputs — rather than adding a
  // platform allowlist here — keeps this correct automatically if the engine's model changes.
  const hasDistinctSustainedWrite =
    performance.sustainedWriteThroughputMBs !== performance.maxWriteThroughputMBs ||
    performance.sustainedWriteIOPS !== performance.maxWriteIOPS

  const writeMbpsLabel = hasDistinctSustainedWrite
    ? t('performance.writeBurst')
    : t('performance.write')
  const writeIopsLabel = hasDistinctSustainedWrite
    ? t('performance.writeIopsBurst')
    : t('performance.writeIops')

  /*
    Gauge ceilings are the DRIVES' own capability, not a fixed scale.
    A fixed scale saturated: 50,000 MB/s and 2,000,000 IOPS were set before the PERC13
    recalibration (#84) raised controller limits 3.4-4.7x, so a modern NVMe cluster pinned all
    four needles and the arcs told the user nothing.
    Scaling to the bottleneck would be worse: maxRead/WriteThroughputMBs IS the bottleneck by
    construction (`Math.min(effective…, minThroughput)`), so those gauges would read 100% forever.
    Against the media ceiling the reading means something in both directions — below 100%, the
    controller/PCIe/network chain is throttling drives you have paid for; at 100%, the drives
    themselves are the limit, which is the outcome you want.
    Guard against a zero ceiling: the no-drive-selected state reports 0.
  */
  const mbpsCeiling = performance.mediaCeilingMBs || 1
  const iopsCeiling = performance.mediaCeilingIOPS || 1

  // Full means "nothing wasted", so the scale runs red (throttled) to green (media-bound) —
  // the inverse of the component's default, where full reads as alarming.
  const HEADROOM_THRESHOLDS = [
    { value: 0.5, color: '#ef4444' },
    { value: 0.85, color: '#eab308' },
    { value: 1.0, color: '#22c55e' },
  ]

  return (
    <div className="space-y-6">
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
            max={mbpsCeiling}
            thresholds={HEADROOM_THRESHOLDS}
            label={t('performance.read')}
            unit="MB/s"
            size={isMobile ? 100 : 140}
          />
          <Speedometer
            id="gauge-write-mbps"
            value={performance.maxWriteThroughputMBs}
            max={mbpsCeiling}
            thresholds={HEADROOM_THRESHOLDS}
            label={writeMbpsLabel}
            unit="MB/s"
            size={isMobile ? 100 : 140}
          />
          <Speedometer
            id="gauge-read-iops"
            value={performance.maxReadIOPS}
            max={iopsCeiling}
            label={t('performance.readIops')}
            unit="IOPS"
            size={isMobile ? 100 : 140}
            thresholds={HEADROOM_THRESHOLDS}
          />
          <Speedometer
            id="gauge-write-iops"
            value={performance.maxWriteIOPS}
            max={iopsCeiling}
            label={writeIopsLabel}
            unit="IOPS"
            size={isMobile ? 100 : 140}
            thresholds={HEADROOM_THRESHOLDS}
          />
          {hasDistinctSustainedWrite && (
            <>
              <Speedometer
                id="gauge-write-mbps-sustained"
                value={performance.sustainedWriteThroughputMBs}
                max={mbpsCeiling}
                thresholds={HEADROOM_THRESHOLDS}
                label={t('performance.writeSustained')}
                unit="MB/s"
                size={isMobile ? 100 : 140}
              />
              <Speedometer
                id="gauge-write-iops-sustained"
                value={performance.sustainedWriteIOPS}
                max={iopsCeiling}
                label={t('performance.writeIopsSustained')}
                unit="IOPS"
                size={isMobile ? 100 : 140}
                thresholds={HEADROOM_THRESHOLDS}
              />
            </>
          )}
        </div>

        {hasDistinctSustainedWrite && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <InfoTooltip content={th('output.sustainedWrite')} /> {t('performance.sustainedHint')}
          </p>
        )}

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
    </div>
  )
}
