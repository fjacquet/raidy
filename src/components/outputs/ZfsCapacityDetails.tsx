/**
 * ZFS-specific capacity breakdown display component.
 * Shows detailed ZFS capacity metrics with dual-unit display (TiB/TB).
 * Implements Issue #3: Improve ZFS display.
 */

import type { ZfsCapacityDetails as ZfsCapacityDetailsType } from '@/types/results'
import { formatBytesBoth } from '@/utils/units'

interface ZfsCapacityDetailsProps {
  details: ZfsCapacityDetailsType
}

/**
 * Single capacity row with dual-unit display.
 */
function CapacityRow({
  label,
  bytes,
  description,
  isSubtraction = false,
  highlight = false,
  color = 'text-slate-300',
}: {
  label: string
  bytes: number
  description?: string
  isSubtraction?: boolean
  highlight?: boolean
  color?: string
}) {
  const formatted = formatBytesBoth(bytes)
  const sign = isSubtraction ? '−' : ''

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 ${highlight ? 'bg-surface-800 -mx-3 px-3 rounded' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${highlight ? 'text-white' : color}`}>{label}</span>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="font-mono text-sm mt-1 sm:mt-0 sm:text-right flex-shrink-0">
        <span
          className={
            isSubtraction ? 'text-orange-400' : highlight ? 'text-green-400' : 'text-slate-200'
          }
        >
          {sign}
          {formatted.binary}
        </span>
        <span className="text-slate-500 ml-2">
          ({sign}
          {formatted.decimal})
        </span>
      </div>
    </div>
  )
}

/**
 * Section divider with arrow and label.
 */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-2">
      <div className="h-px flex-1 bg-surface-600" />
      <span className="text-xs text-slate-500 px-2">{label}</span>
      <svg
        className="w-4 h-4 text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
      <div className="h-px flex-1 bg-surface-600" />
    </div>
  )
}

export function ZfsCapacityDetails({ details }: ZfsCapacityDetailsProps) {
  const {
    totalRawCapacity,
    zpoolCapacity,
    parityOverhead,
    ashiftPaddingOverhead,
    zpoolUsableCapacity,
    slopSpaceReservation,
    zfsUsableCapacity,
    recommendedMinFreeSpace,
    practicalUsableCapacity,
    effectiveCapacity,
    compressionRatio,
    dedupRatio,
    ashift,
    recordSize,
  } = details

  const hasDataReduction = compressionRatio > 1 || dedupRatio > 1
  const totalDataReduction = compressionRatio * dedupRatio

  return (
    <div className="space-y-1">
      {/* Section 1: Raw to Zpool */}
      <CapacityRow
        label="Total Raw Storage"
        bytes={totalRawCapacity}
        description="Sum of all physical drive capacities"
      />

      <CapacityRow
        label="Zpool Capacity"
        bytes={zpoolCapacity}
        description="After hot spare reservation"
      />

      <SectionDivider label="RAID-Z Protection" />

      {/* Section 2: Parity Deductions */}
      <CapacityRow
        label="Parity Overhead"
        bytes={parityOverhead}
        description="RAID-Z redundancy blocks"
        isSubtraction
      />

      {ashiftPaddingOverhead > 0 && (
        <CapacityRow
          label="Ashift Padding"
          bytes={ashiftPaddingOverhead}
          description={`Sector alignment (ashift=${ashift})`}
          isSubtraction
        />
      )}

      <CapacityRow
        label="Zpool Usable"
        bytes={zpoolUsableCapacity}
        description="Available for ZFS datasets"
        highlight
      />

      <SectionDivider label="ZFS Overhead" />

      {/* Section 3: ZFS Deductions */}
      <CapacityRow
        label="Slop Space (1/32)"
        bytes={slopSpaceReservation}
        description="Reserved for metadata and deletions"
        isSubtraction
      />

      <CapacityRow
        label="ZFS Usable Capacity"
        bytes={zfsUsableCapacity}
        description="Maximum dataset size possible"
        highlight
      />

      <SectionDivider label="Best Practices" />

      {/* Section 4: Practical Recommendations */}
      <CapacityRow
        label="Recommended Free (20%)"
        bytes={recommendedMinFreeSpace}
        description="Keep 20% free for optimal performance"
        isSubtraction
      />

      <CapacityRow
        label="Practical Usable"
        bytes={practicalUsableCapacity}
        description="Safe usable capacity (80% threshold)"
        highlight
        color="text-primary-400"
      />

      {/* Section 5: Data Reduction */}
      {hasDataReduction && (
        <>
          <SectionDivider label="Data Reduction" />

          <CapacityRow
            label="Effective Capacity"
            bytes={effectiveCapacity}
            description={`After ${totalDataReduction.toFixed(2)}× reduction (comp: ${compressionRatio}×, dedup: ${dedupRatio}×)`}
            highlight
            color="text-green-400"
          />
        </>
      )}

      {/* ZFS Configuration Summary */}
      <div className="mt-4 pt-4 border-t border-surface-700">
        <h4 className="text-sm font-semibold text-white mb-2">ZFS Configuration</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-slate-500">Ashift:</span>
            <span className="text-slate-200 ml-2">{ashift}</span>
            <span className="text-slate-500 ml-1">({2 ** ashift} bytes)</span>
          </div>
          <div>
            <span className="text-slate-500">Recordsize:</span>
            <span className="text-slate-200 ml-2">{recordSize / 1024}K</span>
          </div>
          {compressionRatio > 1 && (
            <div>
              <span className="text-slate-500">Compression:</span>
              <span className="text-slate-200 ml-2">{compressionRatio}×</span>
            </div>
          )}
          {dedupRatio > 1 && (
            <div>
              <span className="text-slate-500">Deduplication:</span>
              <span className="text-slate-200 ml-2">{dedupRatio}×</span>
            </div>
          )}
        </div>
      </div>

      {/* Efficiency Summary */}
      <div className="mt-4 p-3 bg-surface-800 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Overall Efficiency</span>
          <span className="text-lg font-bold text-primary-400">
            {((practicalUsableCapacity / totalRawCapacity) * 100).toFixed(1)}%
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Practical usable capacity as percentage of raw
        </p>
      </div>
    </div>
  )
}
