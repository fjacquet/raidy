/**
 * Longhorn-specific capacity sizing display component.
 *
 * Surfaces the advisory readouts from issue #51's "Design Output Format":
 * physical usable capacity, growth-adjusted recommended committed data,
 * per-node allocation, and the configuration guardrails. Mirrors the layout
 * of the ZFS capacity details card.
 */

import { useTranslation } from 'react-i18next'
import type { LonghornCapacityDetails as LonghornCapacityDetailsType } from '@/types/results'
import { CapacityRow } from './CapacityRow'

interface LonghornCapacityDetailsProps {
  details: LonghornCapacityDetailsType
}

export function LonghornCapacityDetails({ details }: LonghornCapacityDetailsProps) {
  const { t } = useTranslation('validation')
  const {
    physicalUsable,
    recommendedCommittedData,
    perNodeUsable,
    replicaCount,
    minimalAvailablePercent,
    overProvisioningPercent,
    diskMode,
  } = details

  return (
    <div className="space-y-1">
      <CapacityRow
        label={t('longhorn.physicalUsable')}
        bytes={physicalUsable}
        description={t('longhorn.physicalUsableDesc')}
        highlight
      />

      <CapacityRow
        label={t('longhorn.recommendedCommittedData')}
        bytes={recommendedCommittedData}
        description={t('longhorn.recommendedCommittedDataDesc')}
        highlight
        color="text-primary-400"
      />

      <CapacityRow
        label={t('longhorn.perNodeAllocation')}
        bytes={perNodeUsable}
        description={t('longhorn.perNodeAllocationDesc')}
      />

      {/* Longhorn Configuration Summary */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          {t('longhorn.configTitle')}
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-500">{t('longhorn.replicas')}:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">{replicaCount}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">{t('longhorn.diskMode')}:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2 capitalize">{diskMode}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('longhorn.minAvailable')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {minimalAvailablePercent}%
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">
              {t('longhorn.overProvisioning')}:
            </span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {overProvisioningPercent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
