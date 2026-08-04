/**
 * Advanced configuration panel - network, power, sustainability settings.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { shouldShowControl } from '@/engines/capabilities'
import { useConfigStore } from '@/store'
import type { ControllerType, FsType, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types'
import {
  CONTROLLER_LIMITS,
  getControllerOptions,
  getControllerRequirement,
  NETWORK_SPEEDS,
  PCIE_GENS,
  PCIE_LANES,
} from '@/types'

/** Exhaustive over NetworkSpeed — adding a value to NETWORK_SPEEDS fails to compile until a label is added here. */
const NETWORK_SPEED_LABELS: Record<NetworkSpeed, string> = {
  '1GbE': '1 GbE',
  '10GbE': '10 GbE',
  '25GbE': '25 GbE',
  '40GbE': '40 GbE',
  '100GbE': '100 GbE',
  '200GbE': '200 GbE',
  '400GbE': '400 GbE',
}
const NETWORK_SPEED_OPTIONS = NETWORK_SPEEDS.map((value) => ({
  value,
  label: NETWORK_SPEED_LABELS[value],
}))

/** Exhaustive over PCIeGen — adding a value to PCIE_GENS fails to compile until a label is added here. */
const PCIE_GEN_LABELS: Record<PCIeGen, string> = {
  gen3: 'PCIe Gen 3',
  gen4: 'PCIe Gen 4',
  gen5: 'PCIe Gen 5',
}
const PCIE_GEN_OPTIONS = PCIE_GENS.map((value) => ({ value, label: PCIE_GEN_LABELS[value] }))

/** Exhaustive over PCIeLanes — adding a value to PCIE_LANES fails to compile until a label is added here. */
const PCIE_LANES_LABELS: Record<PCIeLanes, string> = {
  x4: 'x4',
  x8: 'x8',
  x16: 'x16',
}
const PCIE_LANES_OPTIONS = PCIE_LANES.map((value) => ({ value, label: PCIE_LANES_LABELS[value] }))

// NOTE: intentionally NOT consolidated onto the canonical FS_TYPES (src/types/config.ts) as part
// of issue #87 — this list's order ('zfs' first) differs from the canonical array's order
// ('xfs' first), and canonicalizing it would silently change the default option order users see
// in this <select>. That is a behavior change, not a refactor, so it needs its own decision
// rather than being folded in here. See issue #87 discussion.
const FS_TYPES = [
  { value: 'zfs', label: 'ZFS' },
  { value: 'xfs', label: 'XFS' },
  { value: 'ext4', label: 'ext4' },
  { value: 'btrfs', label: 'Btrfs' },
  { value: 'refs', label: 'ReFS' },
  { value: 'ntfs', label: 'NTFS' },
]

export function AdvancedPanel() {
  const { t } = useTranslation('advanced')
  const { t: th } = useTranslation('help')
  const {
    topology,
    controllerOptions,
    compressionRatio,
    dedupRatio,
    networkSpeed,
    pcieGen,
    pcieLanes,
    pue,
    fsType,
    backupRetention,
    dailyChangeRate,
    setControllerOptions,
    setCompressionRatio,
    setDedupRatio,
    setNetworkSpeed,
    setPcieGen,
    setPcieLanes,
    setPue,
    setFsType,
    setBackupRetention,
    setDailyChangeRate,
    performanceThreshold,
    setPerformanceThreshold,
  } = useConfigStore()

  // Get available controller options based on topology type (HBA for ZFS/vSAN/S2D, RAID for
  // others, either for a BeeGFS level that tolerates both). BeeGFS resolves per level, so the
  // level participates in the list and the HBA/RAID/either labelling alike.
  const controllerRequirement = getControllerRequirement(topology.type, topology.level)
  const availableControllers = useMemo(() => {
    return getControllerOptions(topology.type, topology.level).map((controller) => ({
      value: controller,
      label: CONTROLLER_LIMITS[controller].name,
    }))
  }, [topology.type, topology.level])

  const selectedController = CONTROLLER_LIMITS[controllerOptions.controller]

  // The global compression/dedup ratio inputs only move effectiveCapacity for ZFS —
  // every other platform ignores them (its own strategy either has no data-reduction
  // step, or reduces via platform-specific options in TopologyPanel). See
  // src/engines/capabilities.ts for the probe-enforced source of truth.
  const showCompression = shouldShowControl('compression', topology.type)
  const showDedup = shouldShowControl('dedup', topology.type)

  return (
    <div className="space-y-6">
      {/* Data Efficiency Section - only shown when the global sliders actually affect capacity */}
      {(showCompression || showDedup) && (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t('dataEfficiency.title')}
          </h4>

          {showCompression && (
            <div className="space-y-2">
              <Label
                htmlFor="compression-ratio"
                hint={`${compressionRatio.toFixed(1)}x`}
                tooltip={th('advanced.compression')}
              >
                {t('dataEfficiency.compression')}
              </Label>
              <Slider
                id="compression-ratio"
                value={compressionRatio}
                min={1}
                max={5}
                step={0.1}
                onChange={setCompressionRatio}
                formatValue={(v) => `${v.toFixed(1)}x`}
              />
              <p className="text-xs text-slate-500">{t('dataEfficiency.compressionHint')}</p>
            </div>
          )}

          {showDedup && (
            <div className="space-y-2">
              <Label
                htmlFor="dedup-ratio"
                hint={`${dedupRatio.toFixed(1)}x`}
                tooltip={th('advanced.dedup')}
              >
                {t('dataEfficiency.dedup')}
              </Label>
              <Slider
                id="dedup-ratio"
                value={dedupRatio}
                min={1}
                max={10}
                step={0.1}
                onChange={setDedupRatio}
                formatValue={(v) => `${v.toFixed(1)}x`}
              />
            </div>
          )}
        </div>
      )}

      {/* Network & Bus Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('network.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="network-speed" tooltip={th('advanced.networkSpeed')}>
            {t('network.speed')}
          </Label>
          <Select
            id="network-speed"
            value={networkSpeed}
            options={NETWORK_SPEED_OPTIONS}
            onChange={(v) => setNetworkSpeed(v as NetworkSpeed)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pcie-gen" tooltip={th('advanced.pcieGen')}>
              {t('pcie.generation')}
            </Label>
            <Select
              id="pcie-gen"
              value={pcieGen}
              options={PCIE_GEN_OPTIONS}
              onChange={(v) => setPcieGen(v as PCIeGen)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pcie-lanes" tooltip={th('advanced.pcieLanes')}>
              {t('pcie.lanes')}
            </Label>
            <Select
              id="pcie-lanes"
              value={pcieLanes}
              options={PCIE_LANES_OPTIONS}
              onChange={(v) => setPcieLanes(v as PCIeLanes)}
            />
          </div>
        </div>
      </div>

      {/* Controller / HBA Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {controllerRequirement === 'hba'
            ? t('pcie.title')
            : controllerRequirement === 'either'
              ? t('controller.eitherTitle')
              : t('controller.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="controller" tooltip={th('advanced.controller')}>
            {controllerRequirement === 'hba'
              ? t('controller.hbaModel')
              : controllerRequirement === 'either'
                ? t('controller.eitherModel')
                : t('controller.model')}
          </Label>
          <Select
            id="controller"
            value={controllerOptions.controller}
            options={availableControllers}
            onChange={(v) => setControllerOptions({ controller: v as ControllerType })}
          />
          {selectedController && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <div>
                {t('controller.maxIops')}:{' '}
                <span className="text-slate-600 dark:text-slate-300">
                  {selectedController.iops.toLocaleString()}
                </span>
              </div>
              <div>
                {t('controller.maxThroughput')}:{' '}
                <span className="text-slate-600 dark:text-slate-300">
                  {selectedController.throughputMBs.toLocaleString()} MB/s
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            {controllerRequirement === 'hba'
              ? t('controller.hbaHint')
              : controllerRequirement === 'either'
                ? t('controller.eitherHint')
                : t('controller.raidHint')}
          </p>
        </div>
      </div>

      {/* Power & Sustainability Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('power.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="pue" hint={`${pue.toFixed(2)} PUE`} tooltip={th('advanced.pue')}>
            {t('power.pue')}
          </Label>
          <Slider
            id="pue"
            value={pue}
            min={1}
            max={2.5}
            step={0.05}
            onChange={setPue}
            formatValue={(v) => v.toFixed(2)}
          />
          <p className="text-xs text-slate-500">{t('power.pueHint')}</p>
        </div>
      </div>

      {/* Capacity Management Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('capacityManagement.title')}
        </h4>

        <div className="space-y-2">
          <Label
            htmlFor="performance-threshold"
            hint={`${Math.round(performanceThreshold * 100)}%`}
            tooltip={th('advanced.performanceThreshold')}
          >
            {t('capacityManagement.performanceThreshold')}
          </Label>
          <Slider
            id="performance-threshold"
            value={performanceThreshold * 100}
            min={50}
            max={100}
            step={5}
            onChange={(v) => setPerformanceThreshold(v / 100)}
            formatValue={(v) => `${v}%`}
          />
          <p className="text-xs text-slate-500">
            {t('capacityManagement.performanceThresholdHint')}
          </p>
        </div>
      </div>

      {/* Filesystem & Backup Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('filesystem.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="fs-type" tooltip={th('advanced.fsType')}>
            {t('filesystem.type')}
          </Label>
          <Select
            id="fs-type"
            value={fsType}
            options={FS_TYPES}
            onChange={(v) => setFsType(v as FsType)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="backup-retention" tooltip={th('advanced.backupRetention')}>
            {t('filesystem.backupRetention')}
          </Label>
          <Slider
            id="backup-retention"
            value={backupRetention}
            min={1}
            max={365}
            onChange={setBackupRetention}
            formatValue={(v) => `${v} days`}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="daily-change"
            hint={`${dailyChangeRate}%`}
            tooltip={th('advanced.dailyChangeRate')}
          >
            {t('filesystem.dailyChangeRate')}
          </Label>
          <Slider
            id="daily-change"
            value={dailyChangeRate}
            min={0}
            max={50}
            onChange={setDailyChangeRate}
            formatValue={(v) => `${v}%`}
          />
        </div>
      </div>
    </div>
  )
}
