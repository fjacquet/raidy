/**
 * Capacity narrative act: Capacity Overview + ZFS details + Longhorn details + Backup cards.
 */

import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/common'
import {
  AnimatedBytes,
  AnimatedPercent,
  BackupCard,
  BeeGfsCapacityDetails,
  CapacityBreakdownList,
  DonutChart,
  DonutLegend,
  LonghornCapacityDetails,
  MetricCard,
  SankeyDiagram,
  ZfsCapacityDetails,
} from '@/components/outputs'
import { shouldShowSection } from '@/engines/outputRelevance'
import { useFormatBytes, useIsDesktop, useIsMobile } from '@/hooks'
import type { BackupResult, VolumetryResult } from '@/types/results'
import type { Topology } from '@/types/topology'

export interface CapacityActProps {
  volumetry: VolumetryResult
  backup: BackupResult | undefined
  topology: Topology
  operationalLimit: number | null
  performanceThreshold: number
}

export function CapacityAct({
  volumetry,
  backup,
  topology,
  operationalLimit,
  performanceThreshold,
}: CapacityActProps) {
  const { t } = useTranslation('output')
  const { t: th } = useTranslation('help')
  const formatBytes = useFormatBytes()
  const isMobile = useIsMobile()
  const isDesktop = useIsDesktop()

  // Prepare donut chart data
  const capacitySegments = [
    { label: t('capacity.segments.usable'), value: volumetry.usableCapacity, color: '#3b82f6' },
    { label: t('capacity.segments.parity'), value: volumetry.parityOverhead, color: '#f97316' },
    {
      label: t('capacity.segments.hotSpares'),
      value: volumetry.hotSpareOverhead,
      color: '#eab308',
    },
    { label: t('capacity.segments.zfsSlop'), value: volumetry.slopOverhead, color: '#a855f7' },
    {
      label: t('capacity.segments.fsOverhead'),
      value: volumetry.filesystemOverhead,
      color: '#ec4899',
    },
  ].filter((s) => s.value > 0)

  return (
    <>
      {/* Capacity Overview Card */}
      <div className="panel">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            {t('capacity.title')} <InfoTooltip content={th('output.sankeyDiagram')} />
          </h3>
          <span className="text-sm font-medium">
            <AnimatedPercent value={volumetry.efficiency} className="text-primary-400" />{' '}
            {t('capacity.efficiency')}
          </span>
        </div>

        {/* Desktop: Sankey + Metrics | Mobile: List view */}
        {isDesktop ? (
          <div className="space-y-4">
            {/* Sankey Diagram - Desktop only; fills the card width (h-scroll below min) */}
            <div className="overflow-x-auto">
              <SankeyDiagram volumetry={volumetry} height={280} />
            </div>

            {/* Metrics */}
            <div
              className={`grid gap-4 pt-4 border-t border-slate-200 dark:border-surface-700 ${operationalLimit !== null ? 'grid-cols-4' : 'grid-cols-3'}`}
            >
              <MetricCard label={t('capacity.raw')}>
                <AnimatedBytes value={volumetry.rawCapacity} />
              </MetricCard>
              <MetricCard label={t('capacity.usable')} color="text-primary-400">
                <AnimatedBytes value={volumetry.usableCapacity} />
              </MetricCard>
              {operationalLimit !== null && (
                <MetricCard
                  label={t('capacity.operationalLimit')}
                  color="text-cyan-400"
                  subvalue={`@ ${Math.round(performanceThreshold * 100)}%`}
                >
                  <AnimatedBytes value={operationalLimit} />
                </MetricCard>
              )}
              <MetricCard
                label={t('capacity.effective')}
                color="text-green-400"
                subvalue={t('capacity.afterCompression')}
              >
                <AnimatedBytes value={volumetry.effectiveCapacity} />
              </MetricCard>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Donut Chart - Compact for tablet/mobile */}
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              <div className="flex-shrink-0">
                <DonutChart
                  segments={capacitySegments}
                  size={isMobile ? 140 : 160}
                  thickness={isMobile ? 18 : 22}
                  centerValue={formatBytes(volumetry.usableCapacity)}
                  centerLabel={t('capacity.segments.usable')}
                />
              </div>
              <div className="flex-1 w-full">
                <DonutLegend segments={capacitySegments} />
              </div>
            </div>

            {/* Capacity Breakdown List - Mobile */}
            <div className="pt-4 border-t border-slate-200 dark:border-surface-700">
              <CapacityBreakdownList volumetry={volumetry} />
            </div>
          </div>
        )}
      </div>

      {/* ZFS Capacity Details Card - Only shown for ZFS topology */}
      {shouldShowSection('zfsDetails', { topology, volumetry }) && volumetry.zfsDetails && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('capacity.zfsBreakdown')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {t('capacity.dualUnitHint')}
            </span>
          </div>
          <ZfsCapacityDetails details={volumetry.zfsDetails} />
        </div>
      )}

      {/* Longhorn Capacity Sizing Card - Only shown for Longhorn topology */}
      {shouldShowSection('longhornDetails', { topology, volumetry }) &&
        volumetry.longhornDetails && (
          <div className="panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t('capacity.longhornBreakdown')}
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-500">
                {t('capacity.dualUnitHint')}
              </span>
            </div>
            <LonghornCapacityDetails details={volumetry.longhornDetails} />
          </div>
        )}

      {/* BeeGFS Metadata-Target Sizing Card - Only shown for BeeGFS topology */}
      {shouldShowSection('beegfsDetails', { topology, volumetry }) && volumetry.beeGfsDetails && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {t('capacity.beegfsBreakdown')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {t('capacity.dualUnitHint')}
            </span>
          </div>
          <BeeGfsCapacityDetails details={volumetry.beeGfsDetails} />
        </div>
      )}

      {/* Backup Requirements Card — `topology` participates because PowerScale hides the two
          inputs that feed it (AdvancedPanel), and a card fed by invisible inputs is the defect
          `backupApplies` exists to prevent. */}
      {shouldShowSection('backup', { topology, hasBackup: backup != null }) && backup && (
        <div className="panel">
          <BackupCard backup={backup} />
        </div>
      )}
    </>
  )
}
