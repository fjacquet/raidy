/**
 * Right panel containing calculation results and visualizations.
 */

import {
  AnimatedBytes,
  AnimatedCurrency,
  AnimatedPercent,
  DonutChart,
  DonutLegend,
  Speedometer,
} from '@/components/outputs'
import drivesData from '@/data/drives.json'
import {
  formatCurrency,
  formatNumber,
  useCalculations,
  useFormatBytes,
  useResilience,
} from '@/hooks'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { downloadAnsible, downloadTerraform, downloadYaml, exportToPdf } from '@/utils'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Metric card component with animated values.
 */
function MetricCard({
  label,
  children,
  subvalue,
  color = 'text-white',
}: {
  label: string
  children: React.ReactNode
  subvalue?: string
  color?: string
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{children}</div>
      <p className="text-xs text-slate-400">{label}</p>
      {subvalue && <p className="text-xs text-slate-500 mt-1">{subvalue}</p>}
    </div>
  )
}

/**
 * Progress bar with label.
 */
function ProgressBar({
  label,
  value,
  max,
  color = 'bg-primary-500',
  showValue = true,
}: {
  label: string
  value: number
  max: number
  color?: string
  showValue?: boolean
}) {
  const percent = Math.min((value / max) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        {showValue && (
          <span className="font-mono text-slate-300">{formatNumber(Math.round(value))}</span>
        )}
      </div>
      <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export function OutputDashboard() {
  const { topology, zfsOptions, driveId, driveCount, hotSpares, controllerOptions, unitSystem } =
    useConfigStore()
  const formatBytes = useFormatBytes()
  const results = useCalculations()
  const selectedDrive = drives[driveId] || null

  const { volumetry, performance, sustainability, tco } = results

  // Resilience simulation
  const {
    result: resilienceResult,
    progress: resilienceProgress,
    isRunning: resilienceRunning,
    runSimulation,
  } = useResilience({
    drive: selectedDrive,
    driveCount,
    topology,
    rebuildSpeedMBs: 150,
    simulationCount: 10000,
    autoRun: false,
  })

  // Export handlers
  const handleExportPdf = () => {
    if (!selectedDrive) return
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

  // Prepare donut chart data
  const capacitySegments = [
    { label: 'Usable', value: volumetry.usableCapacity, color: '#3b82f6' },
    { label: 'Parity', value: volumetry.parityOverhead, color: '#f97316' },
    { label: 'Hot Spares', value: volumetry.hotSpareOverhead, color: '#eab308' },
    { label: 'ZFS Slop', value: volumetry.slopOverhead, color: '#a855f7' },
    { label: 'FS Overhead', value: volumetry.filesystemOverhead, color: '#ec4899' },
  ].filter((s) => s.value > 0)

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Capacity Overview Card */}
        <div className="panel xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Capacity Overview</h3>
            <span className="text-sm font-medium">
              <AnimatedPercent value={volumetry.efficiency} className="text-primary-400" />{' '}
              Efficiency
            </span>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Donut Chart */}
            <div className="flex flex-col items-center">
              <DonutChart
                segments={capacitySegments}
                size={180}
                thickness={24}
                centerValue={formatBytes(volumetry.usableCapacity)}
                centerLabel="Usable"
              />
            </div>

            {/* Metrics and Legend */}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <MetricCard label="Raw Capacity">
                  <AnimatedBytes value={volumetry.rawCapacity} />
                </MetricCard>
                <MetricCard label="Usable Capacity" color="text-primary-400">
                  <AnimatedBytes value={volumetry.usableCapacity} />
                </MetricCard>
                <MetricCard
                  label="Effective Capacity"
                  color="text-green-400"
                  subvalue="After compression"
                >
                  <AnimatedBytes value={volumetry.effectiveCapacity} />
                </MetricCard>
              </div>

              <DonutLegend segments={capacitySegments} />
            </div>
          </div>
        </div>

        {/* Performance Gauges Card */}
        <div className="panel row-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>

          <div className="grid grid-cols-2 gap-4">
            <Speedometer
              value={performance.maxReadThroughputMBs}
              max={50000}
              label="Read"
              unit="MB/s"
              size={140}
            />
            <Speedometer
              value={performance.maxWriteThroughputMBs}
              max={50000}
              label="Write"
              unit="MB/s"
              size={140}
            />
            <Speedometer
              value={performance.maxReadIOPS}
              max={2000000}
              label="Read IOPS"
              unit="IOPS"
              size={140}
              thresholds={[
                { value: 0.5, color: '#22c55e' },
                { value: 0.8, color: '#3b82f6' },
                { value: 1.0, color: '#a855f7' },
              ]}
            />
            <Speedometer
              value={performance.maxWriteIOPS}
              max={2000000}
              label="Write IOPS"
              unit="IOPS"
              size={140}
              thresholds={[
                { value: 0.5, color: '#22c55e' },
                { value: 0.8, color: '#3b82f6' },
                { value: 1.0, color: '#a855f7' },
              ]}
            />
          </div>

          <div className="mt-4 pt-4 border-t border-surface-700">
            <p className="text-sm text-slate-400">{performance.bottleneckDescription}</p>
          </div>
        </div>

        {/* Bottleneck Analysis Card */}
        <div className="panel">
          <h3 className="text-lg font-semibold text-white mb-4">Bottleneck Analysis</h3>

          <div className="space-y-3">
            {performance.layers.map((layer) => (
              <div key={layer.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span
                    className={
                      layer.isBottleneck ? 'text-orange-400 font-medium' : 'text-slate-400'
                    }
                  >
                    {layer.name}
                    {layer.isBottleneck && ' ⚠'}
                  </span>
                  <span className="text-slate-300 font-mono text-xs">
                    {formatNumber(Math.round(layer.throughputMBs))} MB/s
                  </span>
                </div>
                <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
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

        {/* Resilience Simulation Card */}
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Data Resilience</h3>
            <button
              type="button"
              onClick={runSimulation}
              disabled={resilienceRunning}
              className="px-3 py-1 text-xs font-medium rounded bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resilienceRunning ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>

          {resilienceRunning && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Monte Carlo Simulation</span>
                <span>{resilienceProgress.percent.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-200"
                  style={{ width: `${resilienceProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {resilienceResult ? (
            <div className="space-y-4">
              {/* Survival Rate */}
              <div className="text-center py-4 bg-surface-900 rounded-lg">
                <p
                  className={`text-4xl font-bold font-mono ${
                    resilienceResult.riskLevel === 'low'
                      ? 'text-green-400'
                      : resilienceResult.riskLevel === 'medium'
                        ? 'text-yellow-400'
                        : resilienceResult.riskLevel === 'high'
                          ? 'text-orange-400'
                          : 'text-red-400'
                  }`}
                >
                  {resilienceResult.survivalPercent}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Annual Survival Rate ({resilienceResult.nines} nines)
                </p>
              </div>

              {/* Risk Metrics */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400">Rebuild Time</p>
                  <p className="text-white font-mono">
                    {resilienceResult.avgRebuildTimeHours.toFixed(1)}h
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">URE Risk</p>
                  <p className="text-white font-mono">
                    {(resilienceResult.ureProbability * 100).toFixed(3)}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Dual Failure</p>
                  <p className="text-white font-mono">
                    {(resilienceResult.dualFailureProbability * 100).toFixed(3)}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Risk Level</p>
                  <p
                    className={`font-medium capitalize ${
                      resilienceResult.riskLevel === 'low'
                        ? 'text-green-400'
                        : resilienceResult.riskLevel === 'medium'
                          ? 'text-yellow-400'
                          : resilienceResult.riskLevel === 'high'
                            ? 'text-orange-400'
                            : 'text-red-400'
                    }`}
                  >
                    {resilienceResult.riskLevel}
                  </p>
                </div>
              </div>

              {/* Recommendations */}
              {resilienceResult.recommendations.length > 0 && (
                <div className="pt-3 border-t border-surface-700">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">
                    Recommendations
                  </p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {resilienceResult.recommendations.map((rec) => (
                      <li
                        key={`rec-${rec.slice(0, 30).replace(/\s+/g, '-')}`}
                        className="flex items-start gap-2"
                      >
                        <span className="text-primary-400">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <p>Click "Run Simulation" to calculate</p>
              <p className="text-xs mt-1">100,000 Monte Carlo iterations</p>
              <p className="text-xs text-slate-600">Includes correlated failures & rebuild stress</p>
            </div>
          )}
        </div>

        {/* Power & Sustainability Card */}
        <div className="panel">
          <h3 className="text-lg font-semibold text-white mb-4">Power & Sustainability</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricCard label="Total Power">
              <span className="font-mono">
                {formatNumber(Math.round(sustainability.powerBreakdown.total))}
              </span>
              <span className="text-sm text-slate-400 ml-1">W</span>
            </MetricCard>
            <MetricCard label="Annual Energy">
              <span className="font-mono">
                {formatNumber(Math.round(sustainability.annualEnergyKwh))}
              </span>
              <span className="text-sm text-slate-400 ml-1">kWh</span>
            </MetricCard>
          </div>

          <div className="space-y-2">
            <ProgressBar
              label="Drives"
              value={sustainability.powerBreakdown.drives}
              max={sustainability.powerBreakdown.total}
              color="bg-blue-500"
            />
            <ProgressBar
              label="Servers"
              value={sustainability.powerBreakdown.servers}
              max={sustainability.powerBreakdown.total}
              color="bg-purple-500"
            />
            <ProgressBar
              label="Cooling (PUE)"
              value={sustainability.powerBreakdown.cooling}
              max={sustainability.powerBreakdown.total}
              color="bg-cyan-500"
            />
          </div>

          <div className="mt-4 pt-4 border-t border-surface-700 flex justify-between items-center">
            <span className="text-slate-400">Annual CO₂:</span>
            <span className="text-lg font-bold text-white">
              {formatNumber(Math.round(sustainability.annualCO2Kg))} kg
            </span>
          </div>

          {sustainability.flashEndurance && (
            <div className="mt-4 pt-4 border-t border-surface-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">SSD Endurance</span>
                <span
                  className={`text-sm font-medium ${
                    sustainability.flashEndurance.surviveProject ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {sustainability.flashEndurance.surviveProject ? '✓ OK' : '⚠ At Risk'}
                </span>
              </div>
              <ProgressBar
                label={`DWPD Usage (${sustainability.flashEndurance.requiredDwpd.toFixed(2)} / ${sustainability.flashEndurance.ratedDwpd.toFixed(1)})`}
                value={sustainability.flashEndurance.utilizationPercent}
                max={100}
                color={sustainability.flashEndurance.surviveProject ? 'bg-green-500' : 'bg-red-500'}
                showValue={false}
              />
            </div>
          )}
        </div>

        {/* TCO Card */}
        <div className="panel">
          <h3 className="text-lg font-semibold text-white mb-4">Total Cost of Ownership</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <MetricCard label="Hardware">
              <AnimatedCurrency value={tco.hardwareCost} />
            </MetricCard>
            <MetricCard label="5-Year TCO" color="text-primary-400">
              <AnimatedCurrency value={tco.totalCost} />
            </MetricCard>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Energy Cost:</span>
              <span className="text-slate-200">{formatCurrency(tco.totalEnergyCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Maintenance:</span>
              <span className="text-slate-200">{formatCurrency(tco.maintenanceCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Replacements:</span>
              <span className="text-slate-200">{formatCurrency(tco.replacementCost)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-surface-700 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400">$/Usable TB</p>
              <p className="text-lg font-bold text-white">{formatCurrency(tco.costPerTB)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">$/Effective TB</p>
              <p className="text-lg font-bold text-green-400">
                {formatCurrency(tco.costPerEffectiveTB)}
              </p>
            </div>
          </div>
        </div>

        {/* Commands Card */}
        <div className="panel xl:col-span-3 lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Configuration Commands</h3>

          <div className="bg-surface-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            {topology.type === 'zfs' && (
              <div className="space-y-4">
                <div>
                  <p className="text-slate-500"># Create ZFS pool with {topology.level}</p>
                  <p className="text-green-400">
                    zpool create -o ashift={zfsOptions.ashift} tank {topology.level} /dev/sd[a-z]
                  </p>
                </div>
                {zfsOptions.compression && (
                  <div>
                    <p className="text-slate-500">
                      # Enable {zfsOptions.compressionType} compression
                    </p>
                    <p className="text-green-400">
                      zfs set compression={zfsOptions.compressionType} tank
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500">
                    # Set recordsize to {zfsOptions.recordsize / 1024}K
                  </p>
                  <p className="text-green-400">
                    zfs set recordsize={zfsOptions.recordsize / 1024}K tank
                  </p>
                </div>
                {zfsOptions.dedup && (
                  <div>
                    <p className="text-slate-500"># Enable deduplication (RAM-intensive!)</p>
                    <p className="text-yellow-400">zfs set dedup=on tank</p>
                  </div>
                )}
              </div>
            )}

            {topology.type === 'standard' && (
              <div className="space-y-4">
                <div>
                  <p className="text-slate-500"># Create mdadm {topology.level} array</p>
                  <p className="text-green-400">
                    mdadm --create /dev/md0 --level=
                    {topology.level.toLowerCase().replace('raid', '')} --raid-devices=N /dev/sd[a-z]
                  </p>
                </div>
                {performance.xfsAlignment && (
                  <div>
                    <p className="text-slate-500"># Format with XFS (stripe-aligned)</p>
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
                  <p className="text-slate-500"># Create Storage Spaces Direct pool</p>
                  <p className="text-green-400">
                    New-StoragePool -StorageSubSystemFriendlyName "Clustered*" `
                  </p>
                  <p className="text-green-400 pl-4">-FriendlyName "S2D Pool" `</p>
                  <p className="text-green-400 pl-4">
                    -PhysicalDisks (Get-PhysicalDisk -CanPool $true)
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">
                    # Create virtual disk with {topology.level} resiliency
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
                <p className="text-slate-500"># {topology.level} configuration</p>
                <p className="text-slate-400">
                  Refer to vendor documentation for {topology.level} setup commands.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Export Card */}
        <div className="panel xl:col-span-3 lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">Export Configuration</h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <span className="text-sm font-medium text-white">PDF Report</span>
              <span className="text-xs text-slate-400">Full report</span>
            </button>

            <button
              type="button"
              onClick={handleExportYaml}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <span className="text-sm font-medium text-white">YAML</span>
              <span className="text-xs text-slate-400">Configuration</span>
            </button>

            <button
              type="button"
              onClick={handleExportAnsible}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <span className="text-sm font-medium text-white">Ansible</span>
              <span className="text-xs text-slate-400">Playbook</span>
            </button>

            <button
              type="button"
              onClick={handleExportTerraform}
              disabled={!selectedDrive}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              <span className="text-sm font-medium text-white">Terraform</span>
              <span className="text-xs text-slate-400">GCP Config</span>
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-4 text-center">
            Export your storage configuration for documentation or infrastructure automation.
          </p>
        </div>
      </div>
    </main>
  )
}
