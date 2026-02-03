/**
 * Backup requirements display card.
 * Shows estimated backup storage based on daily change rate and retention.
 */

import { useTranslation } from 'react-i18next'
import { InfoTooltip } from '@/components/common'
import { AnimatedBytes } from '@/components/outputs'
import type { BackupResult } from '@/types/results'

interface BackupCardProps {
  backup: BackupResult
}

export function BackupCard({ backup }: BackupCardProps) {
  const { t } = useTranslation('output')
  const { t: th } = useTranslation('help')

  return (
    <>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-1.5">
        {t('backup.title')}
        <InfoTooltip content={th('output.backupRequirements')} />
      </h3>

      {/* Main metric: Total backup storage */}
      <div className="text-center py-4 bg-surface-900 rounded-lg mb-4">
        <div className="text-3xl font-bold text-cyan-400">
          <AnimatedBytes value={backup.totalRaw} />
        </div>
        <p className="text-xs text-slate-400 mt-1">{t('backup.totalStorage')}</p>
      </div>

      {/* Breakdown grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-xl font-bold text-white">
            <AnimatedBytes value={backup.dailyChange} />
          </div>
          <p className="text-xs text-slate-400">{t('backup.dailyChange')}</p>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-white">
            <AnimatedBytes value={backup.incrementalRaw} />
          </div>
          <p className="text-xs text-slate-400">{t('backup.incremental')}</p>
        </div>
      </div>

      {/* Parameters summary */}
      <div className="mt-4 pt-4 border-t border-surface-700 flex justify-between text-sm text-slate-400">
        <span>{t('backup.retention', { days: backup.retentionDays })}</span>
        <span>{t('backup.changeRate', { rate: backup.changeRatePercent })}</span>
      </div>
    </>
  )
}
