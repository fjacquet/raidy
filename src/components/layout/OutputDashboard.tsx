/**
 * Right panel containing calculation results and visualizations.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CapacityAct, CostAct, PerformanceAct, ResilienceAct } from '@/components/outputs'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { useCalculations, useIsMobile, useResilience } from '@/hooks'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { downloadAnsible, downloadTerraform, downloadYaml, exportToPdf } from '@/utils'
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
    controllerOptions,
    unitSystem,
    performanceThreshold,
    s2dOptions,
    powerFlexOptions,
  } = useConfigStore()
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
    topology,
    rebuildSpeedMBs: 150,
    simulationCount: isMobile ? 1000 : 10000, // 1K on mobile, 10K on desktop
    autoRun: false,
    mirrorCopies,
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

  const handleExportAnsible = () => {
    if (!selectedDrive) return
    downloadAnsible({
      drive: selectedDrive,
      driveCount,
      hotSpares,
      topology,
      zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
      controllerOptions,
      results: {
        ...results,
        resilience: resilienceResult,
      },
      unitSystem,
    })
  }

  const handleExportTerraform = () => {
    if (!selectedDrive) return
    downloadTerraform({
      drive: selectedDrive,
      driveCount,
      hotSpares,
      topology,
      zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
      controllerOptions,
      results: {
        ...results,
        resilience: resilienceResult,
      },
      unitSystem,
    })
  }

  const handleExportYaml = () => {
    if (!selectedDrive) return
    downloadYaml({
      drive: selectedDrive,
      driveCount,
      hotSpares,
      topology,
      zfsOptions: topology.type === 'zfs' ? zfsOptions : undefined,
      controllerOptions,
      results: {
        ...results,
        resilience: resilienceResult,
      },
      unitSystem,
    })
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <CapacityAct
          volumetry={volumetry}
          backup={backup}
          topology={topology}
          operationalLimit={operationalLimit}
          performanceThreshold={performanceThreshold}
        />

        <PerformanceAct performance={performance} />

        <CostAct sustainability={sustainability} />

        <ResilienceAct
          result={resilienceResult}
          progress={resilienceProgress}
          isRunning={resilienceRunning}
          runSimulation={runSimulation}
          isMobile={isMobile}
        />

        {/* Commands Card */}
        <div className="panel xl:col-span-3 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            {t('commands.title')}
          </h3>

          <div className="bg-slate-50 dark:bg-surface-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            {topology.type === 'zfs' && (
              <div className="space-y-4">
                <div>
                  <p className="text-slate-500 dark:text-slate-500">
                    # {t('commands.zfs.createPool', { level: topology.level })}
                  </p>
                  <p className="text-green-400">
                    zpool create -o ashift={zfsOptions.ashift} tank {topology.level} /dev/sd[a-z]
                  </p>
                </div>
                {zfsOptions.compression && (
                  <div>
                    <p className="text-slate-500 dark:text-slate-500">
                      # {t('commands.zfs.enableCompression', { type: zfsOptions.compressionType })}
                    </p>
                    <p className="text-green-400">
                      zfs set compression={zfsOptions.compressionType} tank
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500 dark:text-slate-500">
                    # {t('commands.zfs.setRecordsize', { size: zfsOptions.recordsize / 1024 })}
                  </p>
                  <p className="text-green-400">
                    zfs set recordsize={zfsOptions.recordsize / 1024}K tank
                  </p>
                </div>
                {zfsOptions.dedup && (
                  <div>
                    <p className="text-slate-500 dark:text-slate-500">
                      # {t('commands.zfs.enableDedup')}
                    </p>
                    <p className="text-yellow-400">zfs set dedup=on tank</p>
                  </div>
                )}
              </div>
            )}

            {topology.type === 'standard' && (
              <div className="space-y-4">
                <div>
                  <p className="text-slate-500 dark:text-slate-500">
                    # {t('commands.mdadm.createArray', { level: topology.level })}
                  </p>
                  <p className="text-green-400">
                    mdadm --create /dev/md0 --level=
                    {topology.level.toLowerCase().replace('raid', '')} --raid-devices=N /dev/sd[a-z]
                  </p>
                </div>
                {performance.xfsAlignment && (
                  <div>
                    <p className="text-slate-500 dark:text-slate-500">
                      # {t('commands.mdadm.formatXfs')}
                    </p>
                    <p className="text-green-400">
                      mkfs.xfs -d su={performance.xfsAlignment.suValue},sw=
                      {Math.floor(performance.xfsAlignment.swidth / performance.xfsAlignment.sunit)}{' '}
                      /dev/md0
                    </p>
                  </div>
                )}
              </div>
            )}

            {topology.type === 's2d' && (
              <div className="space-y-4">
                <div>
                  <p className="text-slate-500 dark:text-slate-500">
                    # {t('commands.s2d.createPool')}
                  </p>
                  <p className="text-green-400">
                    New-StoragePool -StorageSubSystemFriendlyName "Clustered*" `
                  </p>
                  <p className="text-green-400 pl-4">-FriendlyName "S2D Pool" `</p>
                  <p className="text-green-400 pl-4">
                    -PhysicalDisks (Get-PhysicalDisk -CanPool $true)
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-500">
                    # {t('commands.s2d.createVdisk', { level: topology.level })}
                  </p>
                  <p className="text-green-400">
                    New-VirtualDisk -FriendlyName "Volume1" -ResiliencySettingName "
                    {topology.level === 'mirror' ? 'Mirror' : 'Parity'}"
                  </p>
                </div>
              </div>
            )}

            {topology.type === 'proprietary' && (
              <div>
                <p className="text-slate-500 dark:text-slate-500">
                  # {t('commands.proprietary.config', { level: topology.level })}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  {t('commands.proprietary.referVendor', { level: topology.level })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Export Card */}
        <div className="panel xl:col-span-3 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
            {t('export.title')}
          </h3>
          {exportError && (
            <p className="text-sm text-red-500 dark:text-red-400 mb-3" role="alert">
              {t('export.error')}
            </p>
          )}

          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${exportError ? '' : 'mt-4'}`}>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {t('export.pdf')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('export.pdfDesc')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportPptx}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-8 h-8 text-orange-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {t('export.pptx')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('export.pptxDesc')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportYaml}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-8 h-8 text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {t('export.yaml')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('export.yamlDesc')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportAnsible}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-8 h-8 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {t('export.ansible')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('export.ansibleDesc')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportTerraform}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-8 h-8 text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {t('export.terraform')}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('export.terraformDesc')}
              </span>
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-500 mt-4 text-center">
            {t('export.footer')}
          </p>
        </div>
      </div>
    </main>
  )
}
