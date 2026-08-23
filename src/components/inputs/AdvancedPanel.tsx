/**
 * Advanced configuration panel - network, power, sustainability settings.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { shouldShowControl } from '@/engines/capabilities'
import { backupApplies } from '@/engines/outputRelevance'
import { useConfigStore } from '@/store'
import type { ControllerType, FsType, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types'
import {
  CONTROLLER_LIMITS,
  FS_TYPES,
  getControllerOptions,
  getControllerRequirement,
  NETWORK_SPEEDS,
  PCIE_GENS,
  PCIE_LANES,
} from '@/types'

/**
 * Exhaustive over NetworkSpeed — adding a value to NETWORK_SPEEDS fails to compile until a key
 * is added here. The values are i18n key suffixes, not text: this table held hardcoded English
 * until 2026-08-05, shadowing the `network.speeds.*` entries that already existed in all four
 * locale files.
 */
const NETWORK_SPEED_KEYS: Record<NetworkSpeed, string> = {
  '1GbE': 'network.speeds.1gbe',
  '10GbE': 'network.speeds.10gbe',
  '25GbE': 'network.speeds.25gbe',
  '40GbE': 'network.speeds.40gbe',
  '100GbE': 'network.speeds.100gbe',
  '200GbE': 'network.speeds.200gbe',
  '400GbE': 'network.speeds.400gbe',
}

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

/** Exhaustive over FsType — adding a value to FS_TYPES fails to compile until a label is added here. */
const FS_TYPE_LABELS: Record<FsType, string> = {
  zfs: 'ZFS',
  xfs: 'XFS',
  ext4: 'ext4',
  btrfs: 'Btrfs',
  refs: 'ReFS',
  ntfs: 'NTFS',
}
const FS_TYPE_OPTIONS = FS_TYPES.map((value) => ({ value, label: FS_TYPE_LABELS[value] }))

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
  const networkSpeedOptions = useMemo(
    () => NETWORK_SPEEDS.map((value) => ({ value, label: t(NETWORK_SPEED_KEYS[value]) })),
    [t],
  )

  const showCompression = shouldShowControl('compression', topology.type)
  const showDedup = shouldShowControl('dedup', topology.type)

  // getFilesystemOverheadPercent returns a platform constant for thirteen of the fifteen
  // types; only `standard` and `longhorn` read the user's choice. Longhorn gets there via
  // the switch's `default` branch rather than a case of its own, which is exactly the kind
  // of thing a reader misses — the probe in tests/engines/capabilities.spec.ts is what
  // holds this flag to the engine.
  const showFsType = shouldShowControl('fsType', topology.type)

  // vSAN ESA is NVMe-direct — no Controller layer in the bottleneck chain, so the selector
  // cannot change a result. Probed in tests/engines/performance/controllerRelevance.spec.ts.
  const showController = shouldShowControl('controller', topology.type)

  // The generic backup estimator is not offered for PowerScale. `backupApplies` is the SAME
  // predicate the dashboard's backup card consults (src/engines/outputRelevance.ts), so these
  // two inputs and that card can never disagree — hiding one without the other is precisely the
  // orphaned-dependency defect this branch has had to fix twice. Not a capability flag: the
  // backup engine reads both fields for every platform, so no probe could establish it.
  const showBackup = backupApplies(topology)

  // With both gone the "Filesystem & Backup" block would render as a heading with nothing
  // under it — PowerScale hides the filesystem selector too (`honoursFsType: false`).
  const showFilesystemSection = showFsType || showBackup

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
                tooltip={`${th('advanced.compression')} ${t('dataEfficiency.compressionHint')}`}
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
            options={networkSpeedOptions}
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

      {/*
        Controller / HBA Section — hidden for vSAN ESA, which is NVMe-direct: the engine drops
        the Controller layer from the bottleneck chain entirely and bounds IOPS by PCIe and
        network alone, so the selector cannot move a result there. The PCIe controls that DO
        bind on ESA live in the section above and are unaffected.
      */}
      {showController && (
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
      )}

      {/* Power & Sustainability Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t('power.title')}
        </h4>

        <div className="space-y-2">
          <Label
            htmlFor="pue"
            hint={`${pue.toFixed(2)} PUE`}
            tooltip={`${th('advanced.pue')} ${t('power.pueHint')}`}
          >
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
            tooltip={`${th('advanced.performanceThreshold')} ${t('capacityManagement.performanceThresholdHint')}`}
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
        </div>
      </div>

      {/* Filesystem & Backup Section */}
      {showFilesystemSection && (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-surface-700">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t('filesystem.title')}
          </h4>

          {showFsType && (
            <div className="space-y-2">
              <Label htmlFor="fs-type" tooltip={th('advanced.fsType')}>
                {t('filesystem.type')}
              </Label>
              <Select
                id="fs-type"
                value={fsType}
                options={FS_TYPE_OPTIONS}
                onChange={(v) => setFsType(v as FsType)}
              />
            </div>
          )}

          {showBackup && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
