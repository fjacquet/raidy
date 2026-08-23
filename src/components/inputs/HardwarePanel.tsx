/**
 * Hardware configuration panel - drive selection and count.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Label,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
} from '@/components/common/FormControls'
import drivesData from '@/data/drives.json'
import {
  effectiveServerCount,
  getCapabilities,
  isRaidGroupMode,
  shouldShowControl,
} from '@/engines/capabilities'
import { calculatePowerScaleVolumetry, powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
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
    topology,
    powerscaleOptions,
    setDriveConnectivity,
    setDriveFormFactor,
    setDriveId,
    setDriveCount,
    setServerCount,
    setServerPower,
  } = useConfigStore()

  // RAID 50/60 use serverCount as number of RAID groups
  const isRaidGroups = isRaidGroupMode(topology)

  /**
   * PowerScale's populations and capacities are looked up in the vendor node catalog, so the
   * connectivity filter, form-factor filter and drive dropdown describe hardware that is not in
   * the cluster. They collapse to one line naming the selected medium.
   *
   * They collapse — they do not disappear. The catalog publishes no power, no reliability and no
   * price, so that medium is still read by sustainability, TCO, performance and resilience. A
   * hidden picker would freeze four live outputs on a value the user cannot see, which is the
   * defect this branch has already fixed twice. `getCapabilities(...).drivePopulationFromCatalog`
   * is probe-backed (tests/engines/capabilities.spec.ts) rather than a UI preference.
   */
  const mediaIsProxy = getCapabilities(topology.type).drivePopulationFromCatalog
  const [proxyPickerOpen, setProxyPickerOpen] = useState(false)
  const showDrivePicker = !mediaIsProxy || proxyPickerOpen

  // serverCount is structural: meaningful for multi-node platforms, plus the
  // standard-RAID RAID50/60 special case where it doubles as the RAID-group count
  // (see raidStrategy.calculateDataFraction). See src/engines/capabilities.ts.
  const showServerCount = shouldShowControl('serverCount', topology.type) || isRaidGroups

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

  // Calculate totals across the whole cluster, not one server. `driveCount` is per-server, so
  // both figures must scale by the same effective server count the drive-count hint below uses
  // (`drive.countHint`) — otherwise the panel says "120 drives" and then prices twelve.
  // `effectiveServerCount` rather than the raw store value, so platforms whose servers slider is
  // hidden do not pick up a stale count from a previously selected multi-node platform.
  const effServerCount = effectiveServerCount(serverCount, topology)

  // PowerScale populations come from the node-pool catalog, never from this panel: no engine
  // reads `driveCount * serverCount` for it (`hasServerCount: false`, and the drive-count slider
  // below is hidden for the same reason). Sizing the summary off those two stale defaults is how
  // the panel used to announce a raw capacity and a price for a cluster nobody had configured.
  const powerScale = useMemo(
    () =>
      topology.type === 'powerscale'
        ? {
            totals: powerScaleDriveTotals(powerscaleOptions),
            // Raw comes from the catalog's per-node geometry, so this row agrees with the
            // dashboard instead of re-deriving capacity from the selected generic drive.
            rawCapacity: calculatePowerScaleVolumetry(powerscaleOptions).rawCapacity,
          }
        : null,
    [topology.type, powerscaleOptions],
  )

  const totalDrives = powerScale ? powerScale.totals.clusterDrives : driveCount * effServerCount
  const totalRawCapacity = powerScale
    ? powerScale.rawCapacity
    : selectedDrive
      ? selectedDrive.capacity_raw * totalDrives
      : 0
  // No cost for PowerScale. `totalDrives` comes from the vendor catalog while `selectedDrive` is
  // whatever sits in the (inapplicable) Drive Model dropdown, so multiplying them prices an
  // all-flash cluster at the per-drive price of a generic HDD — 12 F210 drives billed as 24 TB
  // SATA. Dell publishes no node pricing, so the honest figure is no figure: the row is hidden
  // rather than shown wrong, and the Cost act carries the cluster's economics.
  const totalCost = powerScale || !selectedDrive ? null : selectedDrive.cost_usd * totalDrives

  return (
    <div className="space-y-5">
      {/* Media proxy line — see `mediaIsProxy` above for why the picker collapses rather than
          disappears. */}
      {mediaIsProxy && (
        <div className="space-y-2">
          {/* One matter-of-fact line, no stacked caveat: raidy is a quick sizing tool, and the
              caveat budget is spent once, in the exports that leave for a customer. */}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('mediaProxy.line', { model: selectedDrive?.model ?? '—' })}
          </p>
          <button
            type="button"
            onClick={() => setProxyPickerOpen((open) => !open)}
            aria-expanded={proxyPickerOpen}
            className="text-xs text-primary-500 hover:text-primary-400 underline underline-offset-2"
          >
            {proxyPickerOpen ? t('mediaProxy.hide') : t('mediaProxy.change')}
          </button>
        </div>
      )}

      {showDrivePicker && (
        <>
          {/* Drive Connectivity Filter */}
          <div className="space-y-2">
            <Label tooltip={th('hardware.connectivity')}>{t('connectivity.label')}</Label>
            {constraint === 'nvme_only' ? (
              <>
                <div className="px-3 py-2 bg-slate-100 dark:bg-surface-700 rounded-lg text-sm text-slate-600 dark:text-slate-300">
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
            <Select
              id="drive-select"
              value={driveId}
              options={driveOptions}
              onChange={setDriveId}
            />
            {selectedDrive && (
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
                <div>
                  {t('properties.type')}:{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    {selectedDrive.type}
                    {selectedDrive.formFactor ? ` (${selectedDrive.formFactor})` : ''}
                  </span>
                </div>
                <div>
                  {t('properties.cost')}:{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    {formatPrice(selectedDrive.cost_usd)}
                  </span>
                </div>
                <div>
                  {t('properties.readIops').replace(' IOPS', '')}:{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    {selectedDrive.performance.iops_read.toLocaleString()} IOPS
                  </span>
                </div>
                <div>
                  {t('properties.writeIops').replace(' IOPS', '')}:{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    {selectedDrive.performance.iops_write.toLocaleString()} IOPS
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Drive Count per Server — replaced by a readout on PowerScale, whose drives-per-node is
          a fixed property of each node model in Dell's catalog and cannot be chosen here. */}
      {powerScale ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('drive.powerscaleNote', {
            drives: powerScale.totals.clusterDrives,
            nodes: powerScale.totals.clusterNodes,
          })}
        </p>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="drive-count" hint={`${driveCount}`} tooltip={th('hardware.driveCount')}>
            {t('drive.count')}
          </Label>
          <Slider id="drive-count" value={driveCount} min={1} max={100} onChange={setDriveCount} />
        </div>
      )}

      {/* Server Count / RAID Groups */}
      {showServerCount && (
        <div className="space-y-2">
          <Label
            htmlFor="server-count"
            hint={t('drive.countHint', { total: driveCount * serverCount })}
            tooltip={th(isRaidGroups ? 'hardware.serverCountRaidGroups' : 'hardware.serverCount')}
          >
            {t(isRaidGroups ? 'server.labelRaidGroups' : 'server.label')}
          </Label>
          <Slider
            id="server-count"
            value={serverCount}
            min={1}
            max={16}
            onChange={setServerCount}
          />
        </div>
      )}

      {/* Server Power — live everywhere, including PowerScale, where sustainability multiplies it
          by the cluster's node count (11 nodes really is x11). Relabelled per node there so the
          field cannot be read as a whole-cluster figure. Full key paths on both branches: the
          orphan-key scan reads literals only. */}
      <div className="space-y-2">
        <Label
          htmlFor="server-power"
          hint={powerScale ? t('server.powerHintPerNode') : t('server.powerHint')}
          tooltip={th('hardware.serverPower')}
        >
          {powerScale ? t('server.powerPerNode') : t('server.power')}
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
      <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-500 dark:text-slate-400">{t('summary.rawCapacity')}:</div>
          <div className="text-right font-medium text-slate-900 dark:text-white">
            {formatBytes(totalRawCapacity)}
          </div>
          {totalCost !== null && (
            <>
              <div className="text-slate-500 dark:text-slate-400">{t('summary.hardwareCost')}:</div>
              <div className="text-right font-medium text-slate-900 dark:text-white">
                {formatPrice(totalCost)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
