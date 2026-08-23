/**
 * PDF Export utility using jsPDF and jspdf-autotable.
 * Generates a professional storage configuration report.
 */

import DOMPurify from 'dompurify'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import i18n from '@/i18n'
import type { Drive } from '@/types/drive'
import type { CalculationResults } from '@/types/results'
import type { Topology, ZfsOptions } from '@/types/topology'
import { catalogEstimateNote } from './exportNotes'
import { formatBottleneck } from './formatBottleneck'
import { formatBytes as formatBytesUtil, type UnitSystem } from './units'

// Swiss locale mapping for number formatting
const LOCALE_MAP: Record<string, string> = {
  en: 'en-CH',
  fr: 'fr-CH',
  de: 'de-CH',
  it: 'it-CH',
}

interface ExportConfig {
  drive: Drive
  driveCount: number
  /**
   * Overrides the generic "<drive model> · <n> drives · <n> servers" hardware line.
   *
   * PowerScale populations come from the node catalog, not the Hardware panel — that panel is
   * hidden for it (`hasServerCount: false`) — so `drive`, `driveCount` and `serverCount` describe
   * hardware the user never chose. Without this, an F210 cluster exported as "24 TB SATA HDD,
   * 12 drives, 1 server".
   */
  hardwareLabel?: string
  topology: Topology
  zfsOptions?: ZfsOptions
  results: CalculationResults
  projectName?: string
  unitSystem?: UnitSystem
}

/**
 * Format number with locale-appropriate separators.
 */
function formatNumber(value: number): string {
  const locale = LOCALE_MAP[i18n.language] || 'en-CH'
  return new Intl.NumberFormat(locale).format(Math.round(value))
}

/**
 * Get translated string from pdf namespace.
 */
function t(key: string, options?: Record<string, string | number>): string {
  return i18n.t(`pdf:${key}`, options) as string
}

/**
 * The bottleneck sentence lives in the `output` namespace, shared with the dashboard, rather than
 * being duplicated into `pdf:` — see `formatBottleneck` (#139).
 */
function tOutput(key: string, options?: Record<string, string | number>): string {
  return i18n.t(`output:${key}`, options) as string
}

/**
 * Sanitize user input for PDF rendering.
 * Strips all HTML tags, keeps text content only.
 *
 * @param input - Potentially unsafe user input
 * @returns Plain text safe for PDF rendering
 */
export function sanitizeForPdf(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [], // Strip all HTML
    KEEP_CONTENT: true, // Keep text content
  })
}

/**
 * Generate and download a PDF report.
 *
 * Security: All user-controlled fields (projectName) are sanitized with DOMPurify
 * before rendering to prevent XSS injection. jsPDF 4.0.0 includes CVE-2025-68428 fix.
 */
export function exportToPdf(config: ExportConfig): void {
  const {
    drive,
    driveCount,
    topology,
    zfsOptions,
    results,
    projectName = 'Storage Configuration',
    unitSystem = 'binary',
  } = config

  // Sanitize user-controlled inputs
  const safeProjectName = sanitizeForPdf(projectName)

  // Create a local formatBytes function using the specified unit system
  const formatBytes = (bytes: number) => formatBytesUtil(bytes, unitSystem)
  const { volumetry, performance, sustainability, resilience } = results

  // Create PDF document
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Title
  doc.setFontSize(20)
  doc.setTextColor(30, 64, 175) // Blue
  doc.text(safeProjectName, pageWidth / 2, y, { align: 'center' })
  y += 10

  // Subtitle
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  const locale = LOCALE_MAP[i18n.language] || 'en-CH'
  doc.text(t('subtitle', { date: new Date().toLocaleDateString(locale) }), pageWidth / 2, y, {
    align: 'center',
  })
  y += 15

  // Hardware Configuration Section
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(t('sections.hardware'), 14, y)
  y += 8

  autoTable(doc, {
    startY: y,
    head: [[t('columns.parameter'), t('columns.value')]],
    // When `hardwareLabel` is set the media rows are dropped, not relabelled: for PowerScale the
    // selected drive is not in the cluster at all, so its model, type and per-drive capacity would
    // each be a wrong answer to a question the reader did not ask.
    body: [
      ...(config.hardwareLabel
        ? [[t('hardware.model'), config.hardwareLabel]]
        : [
            [t('hardware.model'), drive.model],
            [t('hardware.type'), drive.type + (drive.formFactor ? ` (${drive.formFactor})` : '')],
            [t('hardware.capacity'), formatBytes(drive.capacity_raw)],
          ]),
      [t('hardware.count'), driveCount.toString()],
      [t('hardware.topology'), `${topology.type.toUpperCase()} - ${topology.level}`],
      [t('hardware.rawCapacity'), formatBytes(volumetry.rawCapacity)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [30, 64, 175] },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // Capacity Analysis Section
  doc.setFontSize(14)
  doc.text(t('sections.capacity'), 14, y)
  y += 8

  autoTable(doc, {
    startY: y,
    head: [[t('columns.metric'), t('columns.value'), t('columns.percentage')]],
    body: [
      [t('capacity.rawCapacity'), formatBytes(volumetry.rawCapacity), '100%'],
      [
        t('capacity.parityOverhead'),
        formatBytes(volumetry.parityOverhead),
        `${((volumetry.parityOverhead / volumetry.rawCapacity) * 100).toFixed(1)}%`,
      ],
      [
        t('capacity.hotSpareOverhead'),
        formatBytes(volumetry.hotSpareOverhead),
        `${((volumetry.hotSpareOverhead / volumetry.rawCapacity) * 100).toFixed(1)}%`,
      ],
      [
        t('capacity.filesystemOverhead'),
        formatBytes(volumetry.filesystemOverhead),
        `${((volumetry.filesystemOverhead / volumetry.rawCapacity) * 100).toFixed(1)}%`,
      ],
      [
        t('capacity.zfsSlop'),
        formatBytes(volumetry.slopOverhead),
        `${((volumetry.slopOverhead / volumetry.rawCapacity) * 100).toFixed(1)}%`,
      ],
      [
        t('capacity.usableCapacity'),
        formatBytes(volumetry.usableCapacity),
        `${volumetry.efficiency.toFixed(1)}%`,
      ],
      [t('capacity.effectiveCapacity'), formatBytes(volumetry.effectiveCapacity), '-'],
    ],
    theme: 'striped',
    headStyles: { fillColor: [30, 64, 175] },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // Performance Section
  doc.setFontSize(14)
  doc.text(t('sections.performance'), 14, y)
  y += 8

  autoTable(doc, {
    startY: y,
    head: [[t('columns.metric'), t('columns.value')]],
    body: [
      [
        t('performance.maxReadThroughput'),
        `${formatNumber(performance.maxReadThroughputMBs)} MB/s`,
      ],
      [
        t('performance.maxWriteThroughput'),
        `${formatNumber(performance.maxWriteThroughputMBs)} MB/s`,
      ],
      [t('performance.maxReadIops'), formatNumber(performance.maxReadIOPS)],
      [t('performance.maxWriteIops'), formatNumber(performance.maxWriteIOPS)],
      [t('performance.bottleneck'), formatBottleneck(performance.bottleneck, tOutput)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [30, 64, 175] },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // Check if we need a new page
  if (y > 240) {
    doc.addPage()
    y = 20
  }

  // Sustainability Section
  doc.setFontSize(14)
  doc.text(t('sections.power'), 14, y)
  y += 8

  autoTable(doc, {
    startY: y,
    head: [[t('columns.metric'), t('columns.value')]],
    body: [
      [t('power.totalPower'), `${formatNumber(sustainability.powerBreakdown.total)} W`],
      [t('power.drivePower'), `${formatNumber(sustainability.powerBreakdown.drives)} W`],
      [t('power.serverPower'), `${formatNumber(sustainability.powerBreakdown.servers)} W`],
      [t('power.cooling'), `${formatNumber(sustainability.powerBreakdown.cooling)} W`],
      [t('power.annualEnergy'), `${formatNumber(sustainability.annualEnergyKwh)} kWh`],
      [t('power.annualCo2'), `${formatNumber(sustainability.annualCO2Kg)} kg`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94] }, // Green
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

  // Resilience Section (if available)
  if (resilience) {
    if (y > 200) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(14)
    doc.text(t('sections.resilience'), 14, y)
    y += 8

    autoTable(doc, {
      startY: y,
      head: [[t('columns.metric'), t('columns.value')]],
      body: [
        [t('resilience.survivalRate'), resilience.survivalPercent],
        [t('resilience.nines'), resilience.nines.toString()],
        [t('resilience.riskLevel'), resilience.riskLevel.toUpperCase()],
        [t('resilience.rebuildTime'), `${resilience.avgRebuildTimeHours.toFixed(1)} h`],
        [t('resilience.ureProbability'), `${(resilience.ureProbability * 100).toFixed(4)}%`],
        [t('resilience.dualFailure'), `${(resilience.dualFailureProbability * 100).toFixed(4)}%`],
      ],
      theme: 'striped',
      headStyles: {
        fillColor:
          resilience.riskLevel === 'low'
            ? [34, 197, 94]
            : resilience.riskLevel === 'medium'
              ? [234, 179, 8]
              : resilience.riskLevel === 'high'
                ? [249, 115, 22]
                : [239, 68, 68],
      },
    })

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10

    // Recommendations
    if (resilience.recommendations.length > 0) {
      doc.setFontSize(12)
      doc.text(`${t('sections.recommendations')}:`, 14, y)
      y += 6
      doc.setFontSize(10)
      for (const rec of resilience.recommendations) {
        doc.text(`• ${rec}`, 18, y)
        y += 5
      }
    }
  }

  // ZFS Commands (if applicable)
  if (topology.type === 'zfs' && zfsOptions) {
    if (y > 220) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(14)
    doc.text(t('sections.zfs'), 14, y)
    y += 8

    doc.setFontSize(9)
    doc.setTextColor(50, 50, 50)

    const commands = [
      `# ${t('zfs.createPool', { level: topology.level })}`,
      `zpool create -o ashift=${zfsOptions.ashift} tank ${topology.level} /dev/sd[a-z]`,
      '',
      `# ${t('zfs.setRecordsize')}`,
      `zfs set recordsize=${zfsOptions.recordsize / 1024}K tank`,
    ]

    if (zfsOptions.compression) {
      commands.push(
        '',
        `# ${t('zfs.enableCompression')}`,
        `zfs set compression=${zfsOptions.compressionType} tank`,
      )
    }

    if (zfsOptions.dedup) {
      commands.push('', `# ${t('zfs.enableDedup')}`, `zfs set dedup=on tank`)
    }

    for (const cmd of commands) {
      doc.text(cmd, 14, y)
      y += 5
    }
  }

  // One caveat, once — the report's entire caveat budget, at the end of the last page. Capacity
  // and efficiency are the vendor's published figures; power, reliability, price and data
  // reduction are estimates; PowerSizer is where a firm quote comes from. Repeating it per page
  // or per section would turn a quick sizing tool into a compliance artifact.
  const estimateNote = catalogEstimateNote(topology, (key) => i18n.t(key) as string)
  const pageHeight = doc.internal.pageSize.getHeight()
  if (estimateNote) {
    const noteLines = doc.splitTextToSize(estimateNote, pageWidth - 28) as string[]
    // Below the last section if there is room, otherwise pinned just above the footer.
    const noteY = Math.min(y + 6, pageHeight - 16 - (noteLines.length - 1) * 3.5)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(noteLines, pageWidth / 2, noteY, { align: 'center' })
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(t('footer', { current: i, total: pageCount }), pageWidth / 2, pageHeight - 10, {
      align: 'center',
    })
  }

  // Download
  doc.save(`${safeProjectName.replace(/\s+/g, '_')}_Report.pdf`)
}
