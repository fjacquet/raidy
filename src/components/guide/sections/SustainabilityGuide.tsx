/**
 * Sizing guide section: Sustainability & TCO.
 * Covers PUE, CO2, and SSD endurance.
 */

import { useTranslation } from 'react-i18next'

export function SustainabilityGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">{t('sustainability.intro')}</p>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-200">{t('sustainability.pue.title')}</h5>
        <p className="text-sm text-slate-400">{t('sustainability.pue.description')}</p>
        <div className="p-2 bg-surface-700 rounded font-mono text-xs text-green-400">
          {t('sustainability.pue.formula')}
        </div>
        <p className="text-xs text-slate-500">{t('sustainability.pue.examples')}</p>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-200">{t('sustainability.co2.title')}</h5>
        <p className="text-sm text-slate-400">{t('sustainability.co2.description')}</p>
        <div className="p-2 bg-surface-700 rounded text-xs text-slate-300">
          {t('sustainability.co2.comparison')}
        </div>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-200">
          {t('sustainability.endurance.title')}
        </h5>
        <p className="text-sm text-slate-400">{t('sustainability.endurance.description')}</p>
        <div className="p-2 bg-surface-700 rounded font-mono text-xs text-cyan-400">
          {t('sustainability.endurance.formula')}
        </div>
        <p className="text-xs text-slate-500 italic">{t('sustainability.endurance.example')}</p>
      </div>
    </div>
  )
}
