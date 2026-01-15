/**
 * Advanced configuration panel - network, power, sustainability settings.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { ControllerType, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types'
import { CONTROLLER_LIMITS, getControllerOptions, requiresHba } from '@/types'

const NETWORK_SPEEDS: { value: NetworkSpeed; label: string }[] = [
  { value: '1GbE', label: '1 GbE' },
  { value: '10GbE', label: '10 GbE' },
  { value: '25GbE', label: '25 GbE' },
  { value: '40GbE', label: '40 GbE' },
  { value: '100GbE', label: '100 GbE' },
  { value: '200GbE', label: '200 GbE' },
  { value: '400GbE', label: '400 GbE' },
]

const PCIE_GENS: { value: PCIeGen; label: string }[] = [
  { value: 'gen3', label: 'PCIe Gen 3' },
  { value: 'gen4', label: 'PCIe Gen 4' },
  { value: 'gen5', label: 'PCIe Gen 5' },
]

const PCIE_LANES: { value: PCIeLanes; label: string }[] = [
  { value: 'x4', label: 'x4' },
  { value: 'x8', label: 'x8' },
  { value: 'x16', label: 'x16' },
]

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
  } = useConfigStore()

  // Get available controller options based on topology type (HBA for ZFS/vSAN/S2D, RAID for others)
  const needsHba = requiresHba(topology.type)
  const availableControllers = useMemo(() => {
    return getControllerOptions(topology.type).map((controller) => ({
      value: controller,
      label: CONTROLLER_LIMITS[controller].name,
    }))
  }, [topology.type])

  const selectedController = CONTROLLER_LIMITS[controllerOptions.controller]

  return (
    <div className="space-y-6">
      {/* Data Efficiency Section - Only for topologies that don't have platform-specific controls */}
      {/* Excluded: standard RAID, S2D, PowerVault (no inline compression), and platforms with their own controls in TopologyPanel */}
      {topology.type !== 'standard' &&
        topology.type !== 's2d' &&
        topology.type !== 'powervault' &&
        topology.type !== 'powerstore' &&
        topology.type !== 'powerscale' &&
        topology.type !== 'objectscale' &&
        topology.type !== 'powerflex' &&
        topology.type !== 'nutanix' && (
          <div className="space-y-4 pt-4 border-t border-surface-700">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('dataEfficiency.title')}
            </h4>

            <div className="space-y-2">
              <Label htmlFor="compression-ratio" hint={`${compressionRatio.toFixed(1)}x`}>
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

            <div className="space-y-2">
              <Label htmlFor="dedup-ratio" hint={`${dedupRatio.toFixed(1)}x`}>
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
          </div>
        )}

      {/* Network & Bus Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t('network.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="network-speed">{t('network.speed')}</Label>
          <Select
            id="network-speed"
            value={networkSpeed}
            options={NETWORK_SPEEDS}
            onChange={(v) => setNetworkSpeed(v as NetworkSpeed)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pcie-gen">{t('pcie.generation')}</Label>
            <Select
              id="pcie-gen"
              value={pcieGen}
              options={PCIE_GENS}
              onChange={(v) => setPcieGen(v as PCIeGen)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pcie-lanes">{t('pcie.lanes')}</Label>
            <Select
              id="pcie-lanes"
              value={pcieLanes}
              options={PCIE_LANES}
              onChange={(v) => setPcieLanes(v as PCIeLanes)}
            />
          </div>
        </div>
      </div>

      {/* Controller / HBA Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {needsHba ? t('pcie.title') : t('controller.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="controller">
            {needsHba ? t('controller.hbaModel') : t('controller.model')}
          </Label>
          <Select
            id="controller"
            value={controllerOptions.controller}
            options={availableControllers}
            onChange={(v) => setControllerOptions({ controller: v as ControllerType })}
          />
          {selectedController && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-400">
              <div>
                {t('controller.maxIops')}:{' '}
                <span className="text-slate-300">{selectedController.iops.toLocaleString()}</span>
              </div>
              <div>
                {t('controller.maxThroughput')}:{' '}
                <span className="text-slate-300">
                  {selectedController.throughputMBs.toLocaleString()} MB/s
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            {needsHba ? t('controller.hbaHint') : t('controller.raidHint')}
          </p>
        </div>
      </div>

      {/* Power & Sustainability Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t('power.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="pue" hint={`${pue.toFixed(2)} PUE`}>
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

      {/* Filesystem & Backup Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t('filesystem.title')}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="fs-type">{t('filesystem.type')}</Label>
          <Select
            id="fs-type"
            value={fsType}
            options={FS_TYPES}
            onChange={(v) => setFsType(v as 'zfs' | 'xfs' | 'ext4' | 'btrfs' | 'refs' | 'ntfs')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="backup-retention">{t('filesystem.backupRetention')}</Label>
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
          <Label htmlFor="daily-change" hint={`${dailyChangeRate}%`}>
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
