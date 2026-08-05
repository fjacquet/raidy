/**
 * Right panel containing calculation results and visualizations.
 */

import { useState } from 'react'
import {
  CapacityAct,
  CostAct,
  HeadlineBand,
  PerformanceAct,
  ResilienceAct,
  TakeawayAct,
} from '@/components/outputs'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { useCalculations, useIsMobile, useResilience } from '@/hooks'
import { useTieringOptions } from '@/hooks/useTieringOptions'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { exportToPdf } from '@/utils'
import { exportToPptx } from '@/utils/exportPptx'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

export function OutputDashboard() {
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
    // 3-way mirrors (by level name)
    if (
      level === 'ceph_replicated_3' ||
      level === 'nutanix_rf3' ||
      level === 'objectscale_mirror_3' ||
      level === 'powerscale_mirror_3x' ||
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
      level === 'powerscale_mirror_2x' ||
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
  })

  // Export handlers
  const [exportError, setExportError] = useState(false)

  const handleExportPdf = () => {
    if (!selectedDrive) return
    setExportError(false)
    try {
      exportToPdf({
        drive: selectedDrive,
        driveCount,
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

  const handleExportPptx = () => {
    if (!selectedDrive) return
    setExportError(false)
    exportToPptx({
      drive: selectedDrive,
      driveCount,
      serverCount: effectiveServerCount(serverCount, topology),
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
