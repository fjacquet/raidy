/**
 * Closing "take it away" act: Export CTA + collapsible provisioning commands.
 */

import { useTranslation } from 'react-i18next'
import type { Drive } from '@/types'
import type { PerformanceResult } from '@/types/results'
import type { Topology, ZfsOptions } from '@/types/topology'

export interface TakeawayActProps {
  topology: Topology
  zfsOptions: ZfsOptions | undefined
  performance: PerformanceResult
  selectedDrive: Drive | null
  exportError: boolean
  onExportPdf: () => void
  onExportPptx: () => void
  onExportYaml: () => void
  onExportAnsible: () => void
  onExportTerraform: () => void
}

export function TakeawayAct({
  topology,
  zfsOptions,
  performance,
  selectedDrive,
  exportError,
  onExportPdf,
  onExportPptx,
  onExportYaml,
  onExportAnsible,
  onExportTerraform,
}: TakeawayActProps) {
  const { t } = useTranslation('output')

  return (
    <>
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
            onClick={onExportPdf}
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
            onClick={onExportPptx}
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
            onClick={onExportYaml}
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
            onClick={onExportAnsible}
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
            onClick={onExportTerraform}
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

      {/* Commands Card */}
      <div className="panel xl:col-span-3 lg:col-span-2">
        <details>
          {/* TODO(task-8): summary label -> acts.forEngineers */}
          <summary className="text-lg font-semibold text-slate-900 dark:text-white mb-4 cursor-pointer">
            {t('commands.title')}
          </summary>

          <div className="bg-slate-50 dark:bg-surface-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            {topology.type === 'zfs' && zfsOptions && (
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
        </details>
      </div>
    </>
  )
}
