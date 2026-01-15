/**
 * Application header with branding, unit system toggle, carbon intensity selector, and language switcher.
 */

import { useTranslation } from 'react-i18next'
import { LanguageSwitcher, SegmentedControl, Select } from '@/components/common'
import { useConfigStore } from '@/store'
import type { CarbonRegion } from '@/types'

const CARBON_REGION_VALUES: CarbonRegion[] = [
  'switzerland',
  'norway',
  'france',
  'germany',
  'usa_average',
  'world_average',
  'china',
]

export function Header() {
  const { t } = useTranslation('common')
  const unitSystem = useConfigStore((state) => state.unitSystem)
  const setUnitSystem = useConfigStore((state) => state.setUnitSystem)
  const carbonRegion = useConfigStore((state) => state.carbonRegion)
  const setCarbonRegion = useConfigStore((state) => state.setCarbonRegion)

  const carbonRegions = CARBON_REGION_VALUES.map((region) => ({
    value: region,
    label: t(`carbon.regions.${region}`),
  }))

  return (
    <header className="bg-surface-800 border-b border-surface-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('app.title')}</h1>
            <p className="text-xs text-slate-400">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t('carbon.label')}:</span>
            <Select
              id="carbon-region"
              value={carbonRegion}
              options={carbonRegions}
              onChange={(v) => setCarbonRegion(v as CarbonRegion)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t('units.label')}:</span>
            <SegmentedControl
              value={unitSystem}
              options={[
                { value: 'binary', label: t('units.binary') },
                { value: 'decimal', label: t('units.decimal') },
              ]}
              onChange={(v) => setUnitSystem(v as 'binary' | 'decimal')}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{t('language.label')}:</span>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  )
}
