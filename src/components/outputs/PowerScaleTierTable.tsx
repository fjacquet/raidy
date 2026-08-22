/**
 * Per-node-pool capacity table for a PowerScale cluster.
 *
 * A heterogeneous cluster's headline number hides where the capacity actually sits — an archive
 * pool and an all-flash pool answer very different questions — so the pools are shown
 * individually with a cluster total, the same layout the source workbook uses.
 *
 * Only pools the vendor catalog can size appear here: `sizeTier` drops the rest, and a dropped
 * pool is flagged on its own row in the input panel rather than being shown as 0 TB.
 */

import { useTranslation } from 'react-i18next'
import { useFormatBytes } from '@/hooks'
import type { Language } from '@/i18n/config'
import { formatNumber } from '@/i18n/formatters'
import type { PowerScaleCapacityDetails } from '@/types/results'

interface PowerScaleTierTableProps {
  details: PowerScaleCapacityDetails
}

export function PowerScaleTierTable({ details }: PowerScaleTierTableProps) {
  const { t, i18n } = useTranslation('output')
  const formatBytes = useFormatBytes()
  const language = i18n.language as Language

  const percent = (fraction: number) =>
    formatNumber(fraction * 100, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('powerscale.tableCaption')}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <th scope="col" className="py-2 pr-3">
              {t('powerscale.column.nodeModel')}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t('powerscale.column.driveSize')}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t('powerscale.column.nodes')}
            </th>
            <th scope="col" className="py-2 pr-3">
              {t('powerscale.column.protection')}
            </th>
            <th scope="col" className="py-2 pr-3 text-right">
              {t('powerscale.column.raw')}
            </th>
            <th scope="col" className="py-2 pr-3 text-right">
              {t('powerscale.column.usable')}
            </th>
            <th scope="col" className="py-2 pr-3 text-right">
              {t('powerscale.column.effective')}
            </th>
            <th scope="col" className="py-2 text-right">
              {t('powerscale.column.efficiency')}
            </th>
          </tr>
        </thead>
        <tbody>
          {details.tiers.map((tier, index) => (
            <tr
              // Two pools may be configured identically, so content alone is not a unique key;
              // these rows are pure output and hold no local state.
              // biome-ignore lint/suspicious/noArrayIndexKey: identical pools are legal
              key={`${tier.nodeModel}-${tier.driveSizeTb}-${index}`}
              className="border-t border-slate-200 dark:border-surface-700"
            >
              <th
                scope="row"
                className="py-2 pr-3 text-left font-medium text-slate-900 dark:text-white"
              >
                {tier.nodeModel}
                {tier.endOfLife ? (
                  <span className="ml-2 rounded bg-amber-100 dark:bg-amber-900 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                    {t('powerscale.eol', { date: tier.endOfLife })}
                  </span>
                ) : null}
              </th>
              <td className="py-2 pr-3">{formatNumber(tier.driveSizeTb, language)}</td>
              <td className="py-2 pr-3">{formatNumber(tier.nodeCount, language)}</td>
              <td className="py-2 pr-3 font-mono">{tier.protection}</td>
              <td className="py-2 pr-3 text-right">{formatBytes(tier.rawCapacity)}</td>
              <td className="py-2 pr-3 text-right text-primary-400">
                {formatBytes(tier.usableLessVhs)}
              </td>
              <td className="py-2 pr-3 text-right text-green-400">
                {formatBytes(tier.effectiveCapacity)}
              </td>
              <td className="py-2 text-right">{percent(tier.efficiency)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 dark:border-surface-600 font-medium text-slate-900 dark:text-white">
            <th scope="row" colSpan={4} className="py-2 pr-3 text-left">
              {t('powerscale.total')}
            </th>
            <td className="py-2 pr-3 text-right">{formatBytes(details.clusterRaw)}</td>
            <td className="py-2 pr-3 text-right">{formatBytes(details.clusterUsable)}</td>
            <td className="py-2 pr-3 text-right">{formatBytes(details.clusterEffective)}</td>
            <td className="py-2 text-right">{percent(details.clusterEfficiency)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
