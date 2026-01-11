/**
 * Advanced configuration panel - network, power, TCO settings.
 */

import { useMemo } from 'react'
import { Label, NumberInput, Select, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { CarbonRegion, ControllerType, NetworkSpeed, PCIeGen, PCIeLanes } from '@/types'
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

const CARBON_REGIONS: { value: CarbonRegion; label: string; intensity: number }[] = [
  { value: 'switzerland', label: 'Switzerland', intensity: 30 },
  { value: 'france', label: 'France', intensity: 56 },
  { value: 'norway', label: 'Norway', intensity: 26 },
  { value: 'germany', label: 'Germany', intensity: 385 },
  { value: 'usa_average', label: 'USA (Average)', intensity: 386 },
  { value: 'china', label: 'China', intensity: 555 },
  { value: 'world_average', label: 'World Average', intensity: 475 },
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
  const {
    topology,
    controllerOptions,
    compressionRatio,
    dedupRatio,
    networkSpeed,
    pcieGen,
    pcieLanes,
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
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
    setCarbonRegion,
    setProjectYears,
    setElectricityCost,
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
      {/* Data Efficiency Section */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Data Efficiency
        </h4>

        <div className="space-y-2">
          <Label htmlFor="compression-ratio" hint={`${compressionRatio.toFixed(1)}x`}>
            Compression Ratio
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
          <p className="text-xs text-slate-500">1.0 = no compression, 2.0 = 50% reduction</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dedup-ratio" hint={`${dedupRatio.toFixed(1)}x`}>
            Deduplication Ratio
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

      {/* Network & Bus Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Network & Bus
        </h4>

        <div className="space-y-2">
          <Label htmlFor="network-speed">Frontend Network</Label>
          <Select
            id="network-speed"
            value={networkSpeed}
            options={NETWORK_SPEEDS}
            onChange={(v) => setNetworkSpeed(v as NetworkSpeed)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="pcie-gen">PCIe Gen</Label>
            <Select
              id="pcie-gen"
              value={pcieGen}
              options={PCIE_GENS}
              onChange={(v) => setPcieGen(v as PCIeGen)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pcie-lanes">Lanes</Label>
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
          {needsHba ? 'Host Bus Adapter (HBA)' : 'RAID Controller'}
        </h4>

        <div className="space-y-2">
          <Label htmlFor="controller">{needsHba ? 'HBA Model' : 'Controller Model'}</Label>
          <Select
            id="controller"
            value={controllerOptions.controller}
            options={availableControllers}
            onChange={(v) => setControllerOptions({ controller: v as ControllerType })}
          />
          {selectedController && (
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-400">
              <div>
                Max IOPS:{' '}
                <span className="text-slate-300">{selectedController.iops.toLocaleString()}</span>
              </div>
              <div>
                Max Throughput:{' '}
                <span className="text-slate-300">
                  {selectedController.throughputMBs.toLocaleString()} MB/s
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            {needsHba
              ? 'ZFS, vSAN, and S2D require direct disk access via HBA (IT mode)'
              : 'Hardware RAID controllers manage disk redundancy'}
          </p>
        </div>
      </div>

      {/* Power & Sustainability Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Power & Sustainability
        </h4>

        <div className="space-y-2">
          <Label htmlFor="pue" hint={`${pue.toFixed(2)} PUE`}>
            Datacenter PUE
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
          <p className="text-xs text-slate-500">
            1.0 = perfect, 1.2 = excellent, 1.6 = average, 2.0 = poor
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="carbon-region">Grid Carbon Intensity</Label>
          <Select
            id="carbon-region"
            value={carbonRegion}
            options={CARBON_REGIONS.map((r) => ({
              value: r.value,
              label: `${r.label} (${r.intensity} gCO₂/kWh)`,
            }))}
            onChange={(v) => setCarbonRegion(v as CarbonRegion)}
          />
        </div>
      </div>

      {/* TCO Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Total Cost of Ownership
        </h4>

        <div className="space-y-2">
          <Label htmlFor="project-years">Project Lifespan</Label>
          <Slider
            id="project-years"
            value={projectYears}
            min={1}
            max={10}
            onChange={setProjectYears}
            formatValue={(v) => `${v} years`}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="electricity-cost">Electricity Cost</Label>
          <NumberInput
            id="electricity-cost"
            value={electricityCostPerKwh}
            min={0}
            max={1}
            step={0.01}
            onChange={setElectricityCost}
            suffix="$/kWh"
          />
        </div>
      </div>

      {/* Filesystem & Backup Section */}
      <div className="space-y-4 pt-4 border-t border-surface-700">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Filesystem & Backup
        </h4>

        <div className="space-y-2">
          <Label htmlFor="fs-type">Filesystem Type</Label>
          <Select
            id="fs-type"
            value={fsType}
            options={FS_TYPES}
            onChange={(v) => setFsType(v as 'zfs' | 'xfs' | 'ext4' | 'btrfs' | 'refs' | 'ntfs')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="backup-retention">Backup Retention</Label>
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
            Daily Change Rate
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
