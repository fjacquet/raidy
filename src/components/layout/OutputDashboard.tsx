/**
 * Right panel containing calculation results and visualizations.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CapacityAct,
  CostAct,
  HeadlineBand,
  PerformanceAct,
  PowerScaleTierTable,
  ResilienceAct,
  TakeawayAct,
} from '@/components/outputs'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
import { useCalculations, useIsMobile, useResilience } from '@/hooks'
import { useTieringOptions } from '@/hooks/useTieringOptions'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { exportToPdf } from '@/utils'
import { exportToPptx } from '@/utils/exportPptx'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

export function OutputDashboard() {
  const { t } = useTranslation('output')
  const {
    topology,
    zfsOptions,
    driveId,
    driveCount,
    serverCount,
    hotSpares,
    unitSystem,
    performanceThreshold,
    s2dOptions,
    powerFlexOptions,
    beeGfsOptions,
    powerscaleOptions,
  } = useConfigStore()
  const tieringOptions = useTieringOptions()
  const results = useCalculations()
  const selectedDrive = drives[driveId] || null

  // Responsive hooks
  const isMobile = useIsMobile()

  const { volumetry, performance, sustainability, backup } = results

  // Calculate operational limit when performance threshold is active
  const operationalLimit =
    performanceThreshold < 1.0 ? volumetry.usableCapacity * performanceThreshold : null

  // Determine mirror copies for mirror-based topologies
  const mirrorCopies = (() => {
    const level = topology.level.toLowerCase()
    // S2D mirror/MAP: use explicit mirrorCopies setting
    if (topology.type === 's2d' && (level === 'mirror' || level === 'map')) {
      return s2dOptions.mirrorCopies
    }
    // PowerFlex mirror: use explicit mirrorCopies setting
    if (topology.type === 'powerflex' && powerFlexOptions.protectionMode === 'mirror') {
      return powerFlexOptions.mirrorCopies
    }
    // BeeGFS buddy mirroring: always pairs (BeeGFS has no 3-way buddy mirror mode)
    if (topology.type === 'beegfs' && beeGfsOptions.storageBuddyMirror) {
      return 2
    }
    // 3-way mirrors (by level name). No PowerScale entry: OneFS mirror protection is per node
    // pool, and the resilience worker models it through `powerScaleProtection` on
    // `SimulationInput` rather than this cluster-wide copy count. The `powerscale_mirror_2x/3x`
    // comparisons that used to sit here matched a level `PowerScaleTopology` no longer has.
    if (
      level === 'ceph_replicated_3' ||
      level === 'nutanix_rf3' ||
      level === 'objectscale_mirror_3' ||
      level === 'vsan_osa_raid1_ftt2' ||
      level.includes('3way')
    ) {
      return 3
    }
    // 2-way mirrors (by level name)
    if (
      level === 'raid1' ||
      level === 'raid10' ||
      level === 'raid1e' ||
      level === 'ceph_replicated_2' ||
      level === 'nutanix_rf2' ||
      level === 'vsan_osa_raid1' ||
      level === 'vsan_esa_raid1' ||
      level === 'powervault_raid1' ||
      level === 'powervault_raid10' ||
      level === 'powerstore_raid10' ||
      level.includes('2way')
    ) {
      return 2
    }
    return 0 // Not a mirror topology
  })()

  // Resilience simulation - reduce iterations on mobile for battery/performance
  const {
    result: resilienceResult,
    progress: resilienceProgress,
    isRunning: resilienceRunning,
    runSimulation,
  } = useResilience({
    drive: selectedDrive,
    driveCount,
    serverCount: effectiveServerCount(serverCount, topology),
    hotSpares,
    topology,
    rebuildSpeedMBs: 150,
    simulationCount: isMobile ? 1000 : 10000, // 1K on mobile, 10K on desktop
    autoRun: false,
    mirrorCopies,
    tieringOptions,
    powerscaleOptions,
  })

  // Export handlers
  const [exportError, setExportError] = useState(false)

  const handleExportPdf = () => {
    if (!selectedDrive) return
    setExportError(false)
    try {
      exportToPdf({
        drive: selectedDrive,
        driveCount: powerScaleExport?.driveCount ?? driveCount,
        hardwareLabel: powerScaleExport?.hardwareLabel,
        topology,
        zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
        results: {
          ...results,
          resilience: resilienceResult,
        },
        projectName: 'Storage Configuration',
        unitSystem,
      })
    } catch {
      setExportError(true)
    }
  }

  /**
   * PowerScale exports describe node pools, not the Hardware panel's drive. That panel is hidden
   * for this platform, so `driveCount`, `serverCount` and the selected drive model are stale
   * values the user never set — an F210 cluster would otherwise export as "24 TB SATA HDD,
   * 12 drives, 1 server".
   */
  const powerScaleExport = useMemo(() => {
    if (topology.type !== 'powerscale') return null
    const totals = powerScaleDriveTotals(powerscaleOptions)
    const pools = powerscaleOptions.tiers
      .map((tier) => `${tier.nodeModel} x${tier.nodeCount} ${tier.protection}`)
      .join(' + ')
    return { driveCount: totals.clusterDrives, hardwareLabel: pools }
  }, [topology.type, powerscaleOptions])

  const handleExportPptx = () => {
    if (!selectedDrive) return
    setExportError(false)
    exportToPptx({
      drive: selectedDrive,
      driveCount: powerScaleExport?.driveCount ?? driveCount,
      hardwareLabel: powerScaleExport?.hardwareLabel,
      serverCount: powerScaleExport ? undefined : effectiveServerCount(serverCount, topology),
      topology,
      zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
      results: {
        ...results,
        resilience: resilienceResult,
      },
      projectName: 'Storage Configuration',
      unitSystem,
    }).catch(() => setExportError(true))
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 space-y-6">
      <HeadlineBand
        volumetry={volumetry}
        performance={performance}
        resilience={resilienceResult}
        sustainability={sustainability}
        topology={topology}
        onRunSurvival={runSimulation}
      />

      <CapacityAct
        volumetry={volumetry}
        backup={backup}
        topology={topology}
        operationalLimit={operationalLimit}
        performanceThreshold={performanceThreshold}
      />

      {/* PowerScale per-node-pool capacity. Rendered next to the cluster-wide Capacity act
          because the headline number is a sum over heterogeneous pools and is unreadable
          without the split. */}
      {topology.type === 'powerscale' && volumetry.powerScaleDetails ? (
        <div className="panel">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t('powerscale.tableCaption')}
          </h3>
          <PowerScaleTierTable details={volumetry.powerScaleDetails} />
        </div>
      ) : null}

      {/* PowerScale performance/resilience model the FIRST node pool only (a client's IOPS and
          a rebuild's exposure window are properties of the pool serving the data, not an
          average across heterogeneous pools) — unlike capacity, power and cost, which sum
          every tier. Only worth saying when there is more than one tier to be misread as. */}
      {topology.type === 'powerscale' && powerscaleOptions.tiers.length > 1 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <span aria-hidden="true">⚠</span>
          <span>{t('powerscale.firstTierOnly')}</span>
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <PerformanceAct performance={performance} />
        <ResilienceAct
          result={resilienceResult}
          progress={resilienceProgress}
          isRunning={resilienceRunning}
          runSimulation={runSimulation}
          isMobile={isMobile}
        />
      </div>

      <CostAct sustainability={sustainability} />

      <TakeawayAct
        topology={topology}
        zfsOptions={topology.type === 'zfs' ? zfsOptions : undefined}
        performance={performance}
        selectedDrive={selectedDrive}
        exportError={exportError}
        onExportPdf={handleExportPdf}
        onExportPptx={handleExportPptx}
      />
    </main>
  )
}
