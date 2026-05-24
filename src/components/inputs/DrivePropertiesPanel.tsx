/**
 * Drive Properties Panel - displays detailed specifications of the selected drive.
 */

import { useTranslation } from 'react-i18next'
import drivesData from '@/data/drives.json'
import { formatCurrency, formatNumber, useFormatBytes } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { getDefaultFormFactor } from '@/types'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

// Property row component
function PropertyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-slate-500 dark:text-slate-400 text-sm">{label}</span>
      <span className="text-slate-900 dark:text-white text-sm font-medium">{value}</span>
    </div>
  )
}

// Section header component
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2 first:mt-0">
      {title}
    </div>
  )
}

// Format drive type for display
function formatDriveType(type: string): string {
  switch (type) {
    case 'HDD':
      return 'HDD'
    case 'SSD_SATA':
      return 'SSD SATA'
    case 'SSD_SAS':
      return 'SSD SAS'
    case 'SSD_NVMe':
      return 'SSD NVMe'
    default:
      return type
  }
}

// Superscript digits for exponent display
const SUPERSCRIPT_DIGITS = '\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079'

// Format URE rate
function formatURERate(exponent: number): string {
  return `10\u207B\u00B9${
    exponent >= 10
      ? String(exponent)
          .split('')
          .map((d) => SUPERSCRIPT_DIGITS[Number.parseInt(d, 10)])
          .join('')
      : exponent.toString()
  }`
}

// Format MTBF
function formatMTBF(hours: number): string {
  if (hours >= 1000000) {
    return `${(hours / 1000000).toFixed(1)}M hours`
  }
  return `${formatNumber(hours)} hours`
}

export function DrivePropertiesPanel() {
  const { t } = useTranslation('hardware')
  const formatBytes = useFormatBytes()
  const { driveId } = useConfigStore()
  const drive = drives[driveId]

  if (!drive) {
    return <div className="text-sm text-slate-500 italic">{t('properties.noDrive')}</div>
  }

  const formFactor = drive.formFactor ?? getDefaultFormFactor(drive.type)
  const isHDD = drive.type === 'HDD'
  const isSSD = drive.type.startsWith('SSD')

  return (
    <div className="space-y-1">
      {/* Basic Info */}
      <SectionHeader title={t('properties.basicInfo')} />
      <PropertyRow label={t('properties.model')} value={drive.model} />
      <PropertyRow label={t('properties.type')} value={formatDriveType(drive.type)} />
      <PropertyRow label={t('properties.formFactor')} value={formFactor} />
      {drive.interface && <PropertyRow label={t('properties.interface')} value={drive.interface} />}
      <PropertyRow label={t('properties.capacity')} value={formatBytes(drive.capacity_raw)} />
      <PropertyRow
        label={t('properties.sectorSize')}
        value={drive.sector_size === 4096 ? '4KN (4096B)' : '512B'}
      />
      <PropertyRow label={t('properties.cost')} value={formatCurrency(drive.cost_usd)} />

      {/* Performance */}
      <SectionHeader title={t('properties.performance')} />
      <PropertyRow
        label={t('properties.readIops')}
        value={formatNumber(drive.performance.iops_read)}
      />
      <PropertyRow
        label={t('properties.writeIops')}
        value={formatNumber(drive.performance.iops_write)}
      />
      <PropertyRow
        label={t('properties.readBandwidth')}
        value={`${formatNumber(drive.performance.bandwidth_read_mb)} MB/s`}
      />
      <PropertyRow
        label={t('properties.writeBandwidth')}
        value={`${formatNumber(drive.performance.bandwidth_write_mb)} MB/s`}
      />
      {drive.latency_us && (
        <>
          <PropertyRow
            label={t('properties.readLatency')}
            value={`${drive.latency_us.read} \u00B5s`}
          />
          <PropertyRow
            label={t('properties.writeLatency')}
            value={`${drive.latency_us.write} \u00B5s`}
          />
        </>
      )}

      {/* Reliability */}
      <SectionHeader title={t('properties.reliability')} />
      <PropertyRow
        label={t('properties.ureRate')}
        value={formatURERate(drive.reliability.ure_rate)}
      />
      <PropertyRow label={t('properties.afr')} value={`${drive.reliability.afr}%`} />
      {isSSD && drive.reliability.dwpd > 0 && (
        <PropertyRow label={t('properties.dwpd')} value={drive.reliability.dwpd.toString()} />
      )}
      {drive.reliability.mtbf_hours && (
        <PropertyRow
          label={t('properties.mtbf')}
          value={formatMTBF(drive.reliability.mtbf_hours)}
        />
      )}

      {/* Power */}
      <SectionHeader title={t('properties.power')} />
      <PropertyRow label={t('properties.idle')} value={`${drive.power.idle_watts} W`} />
      <PropertyRow label={t('properties.load')} value={`${drive.power.load_watts} W`} />

      {/* Technology (conditional) */}
      {(isHDD || isSSD) &&
        (drive.rpm || drive.recording || drive.dualActuator || drive.nandType) && (
          <>
            <SectionHeader title={t('properties.technology')} />
            {isHDD && drive.rpm && (
              <PropertyRow label={t('properties.rpm')} value={formatNumber(drive.rpm)} />
            )}
            {isHDD && drive.recording && (
              <PropertyRow label={t('properties.recording')} value={drive.recording} />
            )}
            {drive.dualActuator && (
              <PropertyRow label={t('properties.dualActuator')} value="Yes (Mach.2)" />
            )}
            {isSSD && drive.nandType && (
              <PropertyRow
                label={t('properties.nandType')}
                value={drive.nandType === '3DXPoint' ? '3D XPoint (SCM)' : drive.nandType}
              />
            )}
          </>
        )}
    </div>
  )
}
