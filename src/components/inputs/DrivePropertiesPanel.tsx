/**
 * Drive Properties Panel - displays detailed specifications of the selected drive.
 */

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
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{value}</span>
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
  const formatBytes = useFormatBytes()
  const { driveId } = useConfigStore()
  const drive = drives[driveId]

  if (!drive) {
    return <div className="text-sm text-slate-500 italic">No drive selected</div>
  }

  const formFactor = drive.formFactor ?? getDefaultFormFactor(drive.type)
  const isHDD = drive.type === 'HDD'
  const isSSD = drive.type.startsWith('SSD')

  return (
    <div className="space-y-1">
      {/* Basic Info */}
      <SectionHeader title="Basic Info" />
      <PropertyRow label="Model" value={drive.model} />
      <PropertyRow label="Type" value={formatDriveType(drive.type)} />
      <PropertyRow label="Form Factor" value={formFactor} />
      {drive.interface && <PropertyRow label="Interface" value={drive.interface} />}
      <PropertyRow label="Capacity" value={formatBytes(drive.capacity_raw)} />
      <PropertyRow
        label="Sector Size"
        value={drive.sector_size === 4096 ? '4KN (4096B)' : '512B'}
      />
      <PropertyRow label="Price" value={formatCurrency(drive.cost_usd)} />

      {/* Performance */}
      <SectionHeader title="Performance" />
      <PropertyRow label="Read IOPS" value={formatNumber(drive.performance.iops_read)} />
      <PropertyRow label="Write IOPS" value={formatNumber(drive.performance.iops_write)} />
      <PropertyRow
        label="Read BW"
        value={`${formatNumber(drive.performance.bandwidth_read_mb)} MB/s`}
      />
      <PropertyRow
        label="Write BW"
        value={`${formatNumber(drive.performance.bandwidth_write_mb)} MB/s`}
      />
      {drive.latency_us && (
        <>
          <PropertyRow label="Read Latency" value={`${drive.latency_us.read} \u00B5s`} />
          <PropertyRow label="Write Latency" value={`${drive.latency_us.write} \u00B5s`} />
        </>
      )}

      {/* Reliability */}
      <SectionHeader title="Reliability" />
      <PropertyRow label="URE Rate" value={formatURERate(drive.reliability.ure_rate)} />
      <PropertyRow label="AFR" value={`${drive.reliability.afr}%`} />
      {isSSD && drive.reliability.dwpd > 0 && (
        <PropertyRow label="DWPD" value={drive.reliability.dwpd.toString()} />
      )}
      {drive.reliability.mtbf_hours && (
        <PropertyRow label="MTBF" value={formatMTBF(drive.reliability.mtbf_hours)} />
      )}

      {/* Power */}
      <SectionHeader title="Power" />
      <PropertyRow label="Idle" value={`${drive.power.idle_watts} W`} />
      <PropertyRow label="Load" value={`${drive.power.load_watts} W`} />

      {/* Technology (conditional) */}
      {(isHDD || isSSD) &&
        (drive.rpm || drive.recording || drive.dualActuator || drive.nandType) && (
          <>
            <SectionHeader title="Technology" />
            {isHDD && drive.rpm && <PropertyRow label="RPM" value={formatNumber(drive.rpm)} />}
            {isHDD && drive.recording && <PropertyRow label="Recording" value={drive.recording} />}
            {drive.dualActuator && <PropertyRow label="Dual Actuator" value="Yes (Mach.2)" />}
            {isSSD && drive.nandType && (
              <PropertyRow
                label="NAND Type"
                value={drive.nandType === '3DXPoint' ? '3D XPoint (SCM)' : drive.nandType}
              />
            )}
          </>
        )}
    </div>
  )
}
