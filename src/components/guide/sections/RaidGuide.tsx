/**
 * Sizing guide section: RAID & Redundancy Explained.
 * Covers efficiency formulas and write penalty.
 */

import { useTranslation } from 'react-i18next'

export function RaidGuide() {
  const { t } = useTranslation('guide')

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-300">{t('raid.intro')}</p>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-200">{t('raid.efficiency.title')}</h5>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-20 text-xs font-mono text-red-400">RAID 0</span>
            <span>{t('raid.efficiency.raid0')}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-20 text-xs font-mono text-yellow-400">RAID 1/10</span>
            <span>{t('raid.efficiency.raid1')}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-20 text-xs font-mono text-blue-400">RAID 5</span>
            <span>{t('raid.efficiency.raid5')}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-20 text-xs font-mono text-purple-400">RAID 6</span>
            <span>{t('raid.efficiency.raid6')}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 italic">{t('raid.efficiency.example')}</p>
      </div>

      <div className="space-y-2">
        <h5 className="text-sm font-semibold text-slate-200">{t('raid.writePenalty.title')}</h5>
        <p className="text-sm text-slate-400">{t('raid.writePenalty.intro')}</p>
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div className="p-2 bg-surface-700 rounded">
            <span className="text-orange-400 font-mono text-xs">4x</span>
            <span className="text-slate-400 ml-2">{t('raid.writePenalty.raid5')}</span>
          </div>
          <div className="p-2 bg-surface-700 rounded">
            <span className="text-red-400 font-mono text-xs">6x</span>
            <span className="text-slate-400 ml-2">{t('raid.writePenalty.raid6')}</span>
          </div>
          <div className="p-2 bg-surface-700 rounded">
            <span className="text-yellow-400 font-mono text-xs">2x</span>
            <span className="text-slate-400 ml-2">{t('raid.writePenalty.mirror')}</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">{t('raid.writePenalty.sequential')}</p>
        <p className="text-xs text-slate-600 italic">{t('raid.writePenalty.sources')}</p>
      </div>
    </div>
  )
}
