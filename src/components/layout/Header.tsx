/**
 * Application header with branding, unit system toggle, and carbon intensity selector.
 */

import { SegmentedControl, Select } from '@/components/common'
import { useConfigStore } from '@/store'
import type { CarbonRegion } from '@/types'

const CARBON_REGIONS: { value: CarbonRegion; label: string }[] = [
  { value: 'switzerland', label: 'Switzerland (30)' },
  { value: 'norway', label: 'Norway (26)' },
  { value: 'france', label: 'France (56)' },
  { value: 'germany', label: 'Germany (385)' },
  { value: 'usa_average', label: 'USA (386)' },
  { value: 'world_average', label: 'World (475)' },
  { value: 'china', label: 'China (555)' },
]

export function Header() {
  const unitSystem = useConfigStore((state) => state.unitSystem)
  const setUnitSystem = useConfigStore((state) => state.setUnitSystem)
  const carbonRegion = useConfigStore((state) => state.carbonRegion)
  const setCarbonRegion = useConfigStore((state) => state.setCarbonRegion)

  return (
    <header className="bg-surface-800 border-b border-surface-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Raidy</h1>
            <p className="text-xs text-slate-400">Storage Infrastructure Simulator</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">CO₂:</span>
            <Select
              id="carbon-region"
              value={carbonRegion}
              options={CARBON_REGIONS}
              onChange={(v) => setCarbonRegion(v as CarbonRegion)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Units:</span>
            <SegmentedControl
              value={unitSystem}
              options={[
                { value: 'binary', label: 'TiB' },
                { value: 'decimal', label: 'TB' },
              ]}
              onChange={(v) => setUnitSystem(v as 'binary' | 'decimal')}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
