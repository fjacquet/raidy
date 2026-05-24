/**
 * Application header with branding, unit system toggle, carbon intensity selector, and language switcher.
 */

import { useTranslation } from 'react-i18next'
import { LanguageSwitcher, SegmentedControl, Select } from '@/components/common'
import { ThemeToggle } from '@/components/common/ThemeToggle'
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

interface HeaderProps {
  onToggleGuide: () => void
  isGuideOpen: boolean
}

export function Header({ onToggleGuide, isGuideOpen }: HeaderProps) {
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
    <header className="bg-white border-b border-slate-200 px-6 py-4 dark:bg-surface-800 dark:border-surface-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-96x96.png`}
            alt="Raidy"
            className="w-8 h-8 rounded-lg"
          />
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('app.title')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('carbon.label')}:</span>
            <Select
              id="carbon-region"
              value={carbonRegion}
              options={carbonRegions}
              onChange={(v) => setCarbonRegion(v as CarbonRegion)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('units.label')}:</span>
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
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('language.label')}:
            </span>
            <LanguageSwitcher />
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={onToggleGuide}
            className={`hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
              isGuideOpen
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:bg-surface-700 dark:text-slate-400 dark:hover:text-white dark:hover:bg-surface-600'
            }`}
            title={t('nav.guide')}
          >
            ?
          </button>
        </div>
      </div>
    </header>
  )
}
