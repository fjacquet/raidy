/**
 * Hardware configuration panel - drive selection and count.
 */

import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Label,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
} from '@/components/common/FormControls'
import drivesData from '@/data/drives.json'
import { useConnectivityConstraints, useFormatBytes } from '@/hooks'
import { useConfigStore } from '@/store'
import type { Drive, DriveConnectivity, FormFactorFilter } from '@/types'
import { CONNECTIVITY_TO_TYPES, FORM_FACTOR_TO_TYPES, getDefaultFormFactor } from '@/types'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

// Format price
function formatPrice(usd: number): string {
  return `$${usd.toLocaleString()}`
}

// Connectivity filter values
const CONNECTIVITY_VALUES: DriveConnectivity[] = ['all', 'nvme', 'sas', 'sata', 'hdd']

// Form factor filter values
const FORM_FACTOR_VALUES: FormFactorFilter[] = [
  'all',
  '2.5"',
  '3.5"',
  'u.2',
  'e3.s',
  'edsff',
  'm.2',
]

export function HardwarePanel() {
  const { t } = useTranslation('hardware')
  const { t: th } = useTranslation('help')

  // Translated connectivity options
  const connectivityOptions = useMemo(
    () =>
      CONNECTIVITY_VALUES.map((value) => ({
        value,
        label: t(`connectivity.${value}`),
      })),
    [t],
  )

  // Translated form factor options
  const formFactorOptions = useMemo(
    () =>
      FORM_FACTOR_VALUES.map((value) => ({
        value,
        label: t(`formFactor.${value.replace(/[."]/g, '')}`),
      })),
    [t],
  )

  const {
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

  // Get connectivity constraints based on topology and cluster options
  const { constraint, validOptions, reasonKey } = useConnectivityConstraints()

  // Filter connectivity options based on constraints
  const filteredConnectivityOptions = useMemo(
    () => connectivityOptions.filter((opt) => validOptions.includes(opt.value)),
    [connectivityOptions, validOptions],
  )

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
        <Label tooltip={th('hardware.connectivity')}>{t('connectivity.label')}</Label>
        {constraint === 'nvme_only' ? (
          <>
            <div className="px-3 py-2 bg-surface-700 rounded-lg text-sm text-slate-300">
              {t('connectivity.nvme')}
            </div>
            {reasonKey && <p className="text-xs text-amber-500">{t(reasonKey)}</p>}
          </>
        ) : (
          <>
            <SegmentedControl
              value={driveConnectivity}
              options={filteredConnectivityOptions}
              onChange={(value) => setDriveConnectivity(value as DriveConnectivity)}
            />
            {constraint === 'flash_only' && reasonKey && (
              <p className="text-xs text-blue-400">{t(reasonKey)}</p>
            )}
          </>
        )}
      </div>

      {/* Form Factor Filter */}
      <div className="space-y-2">
        <Label htmlFor="form-factor" tooltip={th('hardware.formFactor')}>
          {t('formFactor.label')}
        </Label>
        <Select
          id="form-factor"
          value={driveFormFactor}
          options={formFactorOptions}
          onChange={(value) => setDriveFormFactor(value as FormFactorFilter)}
        />
      </div>

      {/* Drive Selection */}
      <div className="space-y-2">
        <Label
          htmlFor="drive-select"
          hint={`${filteredDrives.length} ${t('properties.title').toLowerCase()}`}
          tooltip={th('hardware.driveModel')}
        >
          {t('drive.label')}
        </Label>
        <Select id="drive-select" value={driveId} options={driveOptions} onChange={setDriveId} />
        {selectedDrive && (
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-400">
            <div>
              {t('properties.type')}:{' '}
              <span className="text-slate-300">
                {selectedDrive.type}
                {selectedDrive.formFactor ? ` (${selectedDrive.formFactor})` : ''}
              </span>
            </div>
            <div>
              {t('properties.cost')}:{' '}
              <span className="text-slate-300">{formatPrice(selectedDrive.cost_usd)}</span>
            </div>
            <div>
              {t('properties.readIops').replace(' IOPS', '')}:{' '}
              <span className="text-slate-300">
                {selectedDrive.performance.iops_read.toLocaleString()} IOPS
              </span>
            </div>
            <div>
              {t('properties.writeIops').replace(' IOPS', '')}:{' '}
              <span className="text-slate-300">
                {selectedDrive.performance.iops_write.toLocaleString()} IOPS
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Drive Count per Server */}
      <div className="space-y-2">
        <Label htmlFor="drive-count" hint={`${driveCount}`} tooltip={th('hardware.driveCount')}>
          {t('drive.count')}
        </Label>
        <Slider id="drive-count" value={driveCount} min={1} max={100} onChange={setDriveCount} />
      </div>

      {/* Server Count */}
      <div className="space-y-2">
        <Label
          htmlFor="server-count"
          hint={t('drive.countHint', { total: driveCount * serverCount })}
          tooltip={th('hardware.serverCount')}
        >
          {t('server.label')}
        </Label>
        <Slider id="server-count" value={serverCount} min={1} max={16} onChange={setServerCount} />
      </div>

      {/* Server Power */}
      <div className="space-y-2">
        <Label
          htmlFor="server-power"
          hint={t('server.powerHint')}
          tooltip={th('hardware.serverPower')}
        >
          {t('server.power')}
        </Label>
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
          <div className="text-slate-400">{t('summary.rawCapacity')}:</div>
          <div className="text-right font-medium text-white">{formatBytes(totalRawCapacity)}</div>
          <div className="text-slate-400">{t('summary.hardwareCost')}:</div>
          <div className="text-right font-medium text-white">{formatPrice(totalCost)}</div>
        </div>
      </div>
    </div>
  )
}
