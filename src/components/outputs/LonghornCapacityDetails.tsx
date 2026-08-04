/**
 * Longhorn-specific capacity sizing display component.
 *
 * Surfaces the advisory readouts from issue #51's "Design Output Format":
 * physical usable capacity, growth-adjusted recommended committed data,
 * per-node allocation, and the configuration guardrails. Mirrors the layout
 * of the ZFS capacity details card.
 */

import type { LonghornCapacityDetails as LonghornCapacityDetailsType } from '@/types/results'
import { CapacityRow } from './CapacityRow'

interface LonghornCapacityDetailsProps {
  details: LonghornCapacityDetailsType
}

export function LonghornCapacityDetails({ details }: LonghornCapacityDetailsProps) {
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
        label="Physical Usable"
        bytes={physicalUsable}
        description="Safe app-data ceiling, including snapshot reserve"
        highlight
      />

      <CapacityRow
        label="Recommended Committed Data"
        bytes={recommendedCommittedData}
        description="Commit this much today; leaves growth headroom"
        highlight
        color="text-primary-400"
      />

      <CapacityRow
        label="Per-Node Allocation"
        bytes={perNodeUsable}
        description="Usable capacity per storage node"
      />

      {/* Longhorn Configuration Summary */}
      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-surface-700">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          Longhorn Configuration
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-500">Replicas:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">{replicaCount}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">Disk mode:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2 capitalize">{diskMode}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">Min-available:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {minimalAvailablePercent}%
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-500">Over-provisioning:</span>
            <span className="text-slate-800 dark:text-slate-200 ml-2">
              {overProvisioningPercent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
