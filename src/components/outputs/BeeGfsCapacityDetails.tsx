/**
 * BeeGFS-specific metadata-target (MDT) sizing advisory.
 *
 * Surfaces the ThinkParQ metadata-sizing rule of thumb (0.3-0.5% of usable
 * data capacity) alongside the storage-target derivation (target count,
 * stranded drives). Mirrors the layout of the Longhorn/ZFS capacity details
 * cards.
 */

import { useTranslation } from 'react-i18next'
import type { Language } from '@/i18n/config'
import { formatNumber } from '@/i18n/formatters'
import type { BeeGfsCapacityDetails as BeeGfsCapacityDetailsType } from '@/types/results'
import { formatBytesBoth } from '@/utils/units'

interface BeeGfsCapacityDetailsProps {
  details: BeeGfsCapacityDetailsType
}

/**
 * Single capacity row with dual-unit (binary/decimal) display.
 */
function CapacityRow({
  label,
  bytes,
  description,
  highlight = false,
  color = 'text-slate-600 dark:text-slate-300',
}: {
  label: string
  bytes: number
  description?: string
  highlight?: boolean
  color?: string
}) {
  const formatted = formatBytesBoth(bytes)

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 ${highlight ? 'bg-white dark:bg-surface-800 -mx-3 px-3 rounded' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${highlight ? 'text-slate-900 dark:text-white' : color}`}>
          {label}
        </span>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="font-mono text-sm mt-1 sm:mt-0 sm:text-right flex-shrink-0">
        <span className={highlight ? 'text-green-400' : 'text-slate-800 dark:text-slate-200'}>
          {formatted.binary}
        </span>
        <span className="text-slate-500 dark:text-slate-500 ml-2">({formatted.decimal})</span>
      </div>
    </div>
  )
}

const STATUS_COLOR: Record<BeeGfsCapacityDetailsType['status'], string> = {
  ok: 'text-green-400',
  under: 'text-orange-400',
  none: 'text-slate-500 dark:text-slate-400',
}

export function BeeGfsCapacityDetails({ details }: BeeGfsCapacityDetailsProps) {
  const { t, i18n } = useTranslation('output')
  const {
    mdtRawCapacity,
    mdtUsableCapacity,
    mdtRecommendedMin,
    mdtRecommendedTypical,
    estimatedFileCount,
    status,
    storageTargetCount,
    strandedDrives,
    storageBuddyMirror,
    metadataBuddyMirror,
  } = details

  return (
    <div className="space-y-1">
      <CapacityRow
        label={t('capacity.beegfs.mdtRaw')}
        bytes={mdtRawCapacity}
        description={t('capacity.beegfs.mdtRawDesc')}
      />

      <CapacityRow
        label={t('capacity.beegfs.mdtUsable')}
        bytes={mdtUsableCapacity}
        description={t('capacity.beegfs.mdtUsableDesc')}
        highlight
        color="text-primary-400"
      />

      <CapacityRow
        label={t('capacity.beegfs.mdtRecommendedMin')}
        bytes={mdtRecommendedMin}
        description={t('capacity.beegfs.mdtRecommendedMinDesc')}
      />

      <CapacityRow
        label={t('capacity.beegfs.mdtRecommendedTypical')}
        bytes={mdtRecommendedTypical}
        description={t('capacity.beegfs.mdtRecommendedTypicalDesc')}
      />

      {/* BeeGFS Configuration Summary */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          {t('capacity.beegfs.configTitle')}
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.status')}:
            </span>
            <span className={`ml-2 font-medium ${STATUS_COLOR[status]}`}>
              {t(`capacity.beegfs.statusValue.${status}`)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.estimatedFileCount')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {formatNumber(estimatedFileCount, i18n.language as Language, {
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.storageTargetCount')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">{storageTargetCount}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.strandedDrives')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">{strandedDrives}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.storageBuddyMirror')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {storageBuddyMirror ? t('capacity.beegfs.on') : t('capacity.beegfs.off')}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('capacity.beegfs.metadataBuddyMirror')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {metadataBuddyMirror ? t('capacity.beegfs.on') : t('capacity.beegfs.off')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
