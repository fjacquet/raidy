/**
 * Pure content builder for the PPTX export.
 *
 * Produces every label/value pair rendered on the executive summary slide,
 * fully i18n'd (the translation function is injected — no i18n singleton
 * usage) and unit-system-aware (bytes are formatted via `formatBytes` using
 * `config.unitSystem`, defaulting to 'binary'). Contains no rendering logic
 * and no `new Date()` — the caller supplies an optional pre-formatted date
 * label to keep this module a pure function of its inputs.
 */

import { DEFAULT_LANGUAGE } from '@/i18n/config'
import { catalogEstimateNote } from './exportNotes'
import type { ExportConfig } from './exportPptx'
import { powerScaleClusterSummary } from './powerscaleExportContent'
import { formatBytes } from './units'

export interface PptxStat {
  label: string
  value: string
  role: 'plain' | 'accent' | 'capacity' | 'overhead' | 'parity' | 'muted'
}

export interface PptxContent {
  title: string
  subtitle: string
  volumetryLines: PptxStat[][] // 2 rows under the Sankey
  performanceLines: PptxStat[][] // 2 rows under the gauges
  energyLine: PptxStat[]
  bottleneckLine: PptxStat[]
  resilienceLine: PptxStat[] | null
  /**
   * One-line disclaimer for platforms whose capacity is looked up in a vendor catalog: the
   * vendor's own sizer stays the reference for a firm quote, and power/reliability/price are
   * estimates from a reference medium. `null` when the platform has nothing to disclaim.
   */
  estimateNote: string | null
}

/**
 * Format IOPS with K/M suffix for compact display.
 * Matches the on-screen gauge convention (Speedometer.tsx / AnimatedCounter.tsx),
 * which uses one decimal place for the K suffix — using .toFixed(0) here would
 * silently drop precision the dashboard shows (e.g. "1.3K" -> "1K").
 */
function formatIops(iops: number): string {
  if (iops >= 1_000_000) return `${(iops / 1_000_000).toFixed(1)}M`
  if (iops >= 1_000) return `${(iops / 1_000).toFixed(1)}K`
  return iops.toFixed(0)
}

export function buildPptxContent(
  config: ExportConfig,
  t: (key: string, options?: Record<string, string | number>) => string,
  dateLabel?: string,
): PptxContent {
  const unitSystem = config.unitSystem ?? 'binary'
  const { volumetry: vol, performance: perf, resilience, sustainability: sus } = config.results
  const label = (key: string) => t(`output:pptx.labels.${key}`)

  // PowerScale's level is an internal identifier with exactly one possible value, so the raw
  // discriminant read "POWERSCALE powerscale_onefs" across the top of a customer deck. Every other
  // platform's level carries real information and is kept. Mirrors `topologyLabel` in exportPdf.ts.
  const isPowerScale = config.topology.type === 'powerscale'
  const topologyLabel = isPowerScale ? 'PowerScale' : config.topology.type.toUpperCase()
  const levelLabel = isPowerScale
    ? ' OneFS'
    : 'level' in config.topology
      ? ` ${config.topology.level}`
      : ''
  const title = `${topologyLabel}${levelLabel}`

  // PowerScale's populations come from the node catalog, not the Hardware panel — that panel is
  // hidden for it — so the drive model, drive count and server count here describe hardware the
  // user never chose, and an F210 cluster would otherwise read "24 TB SATA HDD · 12 drives".
  // Keyed off the topology rather than the presence of `powerScaleDetails`, so a cluster with no
  // sizeable pool at all says "Node pools 0" instead of falling back to that stale line.
  const subtitle = [
    ...(config.topology.type === 'powerscale'
      ? [
          powerScaleClusterSummary(
            config.results.volumetry.powerScaleDetails,
            t,
            config.language ?? DEFAULT_LANGUAGE,
          ),
        ]
      : [
          config.drive.model,
          `${config.driveCount} ${label('drives')}`,
          config.serverCount && config.serverCount > 1
            ? `${config.serverCount} ${label('servers')}`
            : null,
        ]),
    dateLabel,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const volumetryLines: PptxStat[][] = [
    [
      { label: label('raw'), value: formatBytes(vol.rawCapacity, unitSystem), role: 'plain' },
      {
        label: label('usable'),
        value: formatBytes(vol.usableCapacity, unitSystem),
        role: 'capacity',
      },
      {
        label: label('effective'),
        value: formatBytes(vol.effectiveCapacity, unitSystem),
        role: 'accent',
      },
      {
        label: label('efficiency'),
        value: `${vol.efficiency.toFixed(1)}%`,
        role: 'overhead',
      },
    ],
    [
      {
        label: label('parity'),
        value: formatBytes(vol.parityOverhead, unitSystem),
        role: 'parity',
      },
      {
        label: label('spares'),
        value: formatBytes(vol.hotSpareOverhead, unitSystem),
        role: 'overhead',
      },
      {
        label: label('fs'),
        value: formatBytes(vol.filesystemOverhead, unitSystem),
        role: 'muted',
      },
    ],
  ]

  const performanceLines: PptxStat[][] = [
    [
      {
        label: label('maxRead'),
        value: `${formatIops(perf.maxReadIOPS)} IOPS`,
        role: 'accent',
      },
      { label: '/', value: `${perf.maxReadThroughputMBs.toFixed(0)} MB/s`, role: 'plain' },
    ],
    [
      {
        label: label('maxWrite'),
        value: `${formatIops(perf.maxWriteIOPS)} IOPS`,
        role: 'accent',
      },
      { label: '/', value: `${perf.maxWriteThroughputMBs.toFixed(0)} MB/s`, role: 'plain' },
    ],
  ]

  const energyLine: PptxStat[] = [
    { label: label('total'), value: `${sus.powerBreakdown.total.toFixed(0)} W`, role: 'accent' },
    {
      label: label('powerDrives'),
      value: `${sus.powerBreakdown.drives.toFixed(0)} W`,
      role: 'muted',
    },
    {
      label: label('powerServers'),
      value: `${sus.powerBreakdown.servers.toFixed(0)} W`,
      role: 'muted',
    },
    {
      label: label('cooling'),
      value: `${sus.powerBreakdown.cooling.toFixed(0)} W`,
      role: 'muted',
    },
    {
      label: label('energy'),
      value: `${sus.annualEnergyKwh.toFixed(0)} kWh/yr`,
      role: 'plain',
    },
    { label: label('co2'), value: `${sus.annualCO2Kg.toFixed(0)} kg/yr`, role: 'plain' },
  ]
  if (sus.flashEndurance) {
    energyLine.push({
      label: label('endurance'),
      value: `${sus.flashEndurance.expectedLifeYears.toFixed(1)} yr`,
      role: 'capacity',
    })
  }

  const bottleneckLine: PptxStat[] = perf.layers.slice(0, 6).map((layer) => ({
    label: layer.name.replace(/\s*\(.*\)\s*$/, ''),
    value: `${layer.throughputMBs.toFixed(0)} MB/s`,
    role: layer.isBottleneck ? 'parity' : 'plain',
  }))

  const resilienceLine: PptxStat[] | null = resilience
    ? [
        { label: label('survival'), value: resilience.survivalPercent, role: 'capacity' },
        { label: label('durability'), value: `${resilience.nines} nines`, role: 'capacity' },
        {
          label: label('rebuild'),
          value: `${resilience.avgRebuildTimeHours.toFixed(1)} h`,
          role: 'muted',
        },
        { label: label('risk'), value: resilience.riskLevel.toUpperCase(), role: 'overhead' },
      ]
    : null

  return {
    title,
    subtitle,
    volumetryLines,
    performanceLines,
    energyLine,
    bottleneckLine,
    resilienceLine,
    estimateNote: catalogEstimateNote(config.topology, t),
  }
}
