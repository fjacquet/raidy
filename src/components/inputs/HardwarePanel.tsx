/**
 * Hardware configuration panel - drive selection and count.
 */

import { useEffect, useMemo } from 'react'
import {
  Label,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
} from '@/components/common/FormControls'
import drivesData from '@/data/drives.json'
import { useFormatBytes } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'
import type { Drive, DriveConnectivity, FormFactorFilter } from '@/types'
import { CONNECTIVITY_TO_TYPES, FORM_FACTOR_TO_TYPES, getDefaultFormFactor } from '@/types'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

// Format price
function formatPrice(usd: number): string {
  return `$${usd.toLocaleString()}`
}

// Connectivity filter options
const CONNECTIVITY_OPTIONS: { value: DriveConnectivity; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'nvme', label: 'NVMe' },
  { value: 'sas', label: 'SAS' },
  { value: 'sata', label: 'SATA' },
  { value: 'hdd', label: 'HDD' },
]

// Form factor filter options
const FORM_FACTOR_OPTIONS: { value: FormFactorFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '2.5"', label: '2.5"' },
  { value: '3.5"', label: '3.5"' },
  { value: 'u.2', label: 'U.2' },
  { value: 'e3.s', label: 'E3.S' },
  { value: 'edsff', label: 'EDSFF' },
  { value: 'm.2', label: 'M.2' },
]

/** Topologies that only support NVMe drives */
const NVME_ONLY_TOPOLOGIES = ['powerstore', 'vsan_esa'] as const

export function HardwarePanel() {
  const {
    topology,
    driveConnectivity,
    driveFormFactor,
    driveId,
    driveCount,
    serverCount,
    serverPowerWatts,
    setDriveConnectivity,
    setDriveFormFactor,
    setDriveId,
    setDriveCount,
    setServerCount,
    setServerPower,
  } = useConfigStore()

  // Check if topology requires NVMe-only drives
  const requiresNvme = NVME_ONLY_TOPOLOGIES.includes(topology.type as (typeof NVME_ONLY_TOPOLOGIES)[number])

  // Use centralized byte formatting with user's preferred unit system
  const formatBytes = useFormatBytes()

  const driveList = useMemo(() => Object.values(drives), [])

  // Filter drives based on connectivity and form factor selection
  const filteredDrives = useMemo(() => {
    const allowedTypes = CONNECTIVITY_TO_TYPES[driveConnectivity]
    const allowedFormFactors = FORM_FACTOR_TO_TYPES[driveFormFactor]

    return driveList.filter((drive) => {
      // Filter by connectivity
      if (!allowedTypes.includes(drive.type)) return false

      // Filter by form factor (use default if not specified)
      const driveFormFactorValue = drive.formFactor ?? getDefaultFormFactor(drive.type)
      return allowedFormFactors.includes(driveFormFactorValue)
    })
  }, [driveList, driveConnectivity, driveFormFactor])

  const selectedDrive = drives[driveId]

  // Auto-set NVMe connectivity for topologies that require it
  useEffect(() => {
    if (requiresNvme && driveConnectivity !== 'nvme') {
      setDriveConnectivity('nvme')
    }
  }, [requiresNvme, driveConnectivity, setDriveConnectivity])

  // Auto-select first drive when filter changes and current drive is not in filtered list
  useEffect(() => {
    const firstDrive = filteredDrives[0]
    if (firstDrive && !filteredDrives.some((d) => d.id === driveId)) {
      setDriveId(firstDrive.id)
    }
  }, [filteredDrives, driveId, setDriveId])

  const driveOptions = useMemo(() => {
    return filteredDrives.map((drive) => ({
      value: drive.id,
      label: `${drive.model} (${formatBytes(drive.capacity_raw)})`,
    }))
  }, [filteredDrives, formatBytes])

  // Calculate totals
  const totalRawCapacity = selectedDrive ? selectedDrive.capacity_raw * driveCount : 0
  const totalCost = selectedDrive ? selectedDrive.cost_usd * driveCount : 0

  return (
    <div className="space-y-5">
      {/* Drive Connectivity Filter */}
      <div className="space-y-2">
        <Label>Drive Connectivity</Label>
        {requiresNvme ? (
          <>
            <div className="px-3 py-2 bg-surface-700 rounded-lg text-sm text-slate-300">
              NVMe Only
            </div>
            <p className="text-xs text-amber-500">
              {topology.type === 'powerstore' && 'Dell PowerStore requires NVMe drives'}
              {topology.type === 'vsan_esa' && 'VMware vSAN ESA requires NVMe drives'}
            </p>
          </>
        ) : (
          <SegmentedControl
            value={driveConnectivity}
            options={CONNECTIVITY_OPTIONS}
            onChange={(value) => setDriveConnectivity(value as DriveConnectivity)}
          />
        )}
      </div>

      {/* Form Factor Filter */}
      <div className="space-y-2">
        <Label htmlFor="form-factor">Form Factor</Label>
        <Select
          id="form-factor"
          value={driveFormFactor}
          options={FORM_FACTOR_OPTIONS}
          onChange={(value) => setDriveFormFactor(value as FormFactorFilter)}
        />
      </div>

      {/* Drive Selection */}
      <div className="space-y-2">
        <Label htmlFor="drive-select" hint={`${filteredDrives.length} drives`}>
          Drive Model
        </Label>
        <Select id="drive-select" value={driveId} options={driveOptions} onChange={setDriveId} />
        {selectedDrive && (
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-400">
            <div>
              Type:{' '}
              <span className="text-slate-300">
                {selectedDrive.type}
                {selectedDrive.formFactor ? ` (${selectedDrive.formFactor})` : ''}
              </span>
            </div>
            <div>
              Price: <span className="text-slate-300">{formatPrice(selectedDrive.cost_usd)}</span>
            </div>
            <div>
              Read:{' '}
              <span className="text-slate-300">
                {selectedDrive.performance.iops_read.toLocaleString()} IOPS
              </span>
            </div>
            <div>
              Write:{' '}
              <span className="text-slate-300">
                {selectedDrive.performance.iops_write.toLocaleString()} IOPS
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Drive Count per Server */}
      <div className="space-y-2">
        <Label htmlFor="drive-count" hint={`${driveCount} per server`}>
          Drives per Server
        </Label>
        <Slider id="drive-count" value={driveCount} min={1} max={100} onChange={setDriveCount} />
      </div>

      {/* Server Count */}
      <div className="space-y-2">
        <Label htmlFor="server-count" hint={`Total: ${driveCount * serverCount} drives`}>
          Servers / Nodes
        </Label>
        <Slider id="server-count" value={serverCount} min={1} max={16} onChange={setServerCount} />
      </div>

      {/* Server Power */}
      <div className="space-y-2">
        <Label htmlFor="server-power">Server Power (excl. drives)</Label>
        <NumberInput
          id="server-power"
          value={serverPowerWatts}
          min={100}
          max={2000}
          step={50}
          onChange={setServerPower}
          suffix="W"
        />
      </div>

      {/* Summary */}
      <div className="pt-3 border-t border-surface-700">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-400">Raw Capacity:</div>
          <div className="text-right font-medium text-white">{formatBytes(totalRawCapacity)}</div>
          <div className="text-slate-400">Hardware Cost:</div>
          <div className="text-right font-medium text-white">{formatPrice(totalCost)}</div>
        </div>
      </div>
    </div>
  )
}
