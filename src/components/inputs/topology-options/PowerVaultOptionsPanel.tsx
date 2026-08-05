/**
 * Dell PowerVault ME5 options — mid-range block storage.
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 *
 * There are no configurable options: all five this once rendered (model, controllers, tiering,
 * SSD read cache, thin provisioning) changed no computed figure, and each said so in its own
 * hint text. The whole `PowerVaultOptions` object went with them in the 2026-08-05 relevance
 * sweep. What remains is a description of the selected level and one capability note.
 */

import { useTranslation } from 'react-i18next'
import type { Topology } from '@/types'
import { OptionsSection } from './dellShared'

type PowerVaultLevel = Extract<Topology, { type: 'powervault' }>['level']

/** Level descriptions, keyed exhaustively so a new level cannot silently render an empty box. */
const LEVEL_DESCRIPTIONS: Record<PowerVaultLevel, { title: string; body: string }> = {
  powervault_raid1: {
    title: 'RAID 1:',
    body: '2-way mirror with 50% storage efficiency. Simple, fast rebuilds. Best for boot volumes and small deployments.',
  },
  powervault_raid5: {
    title: 'RAID 5:',
    body: 'Single distributed parity with (n-1)/n efficiency. 4x write penalty. Not recommended for write-intensive workloads.',
  },
  powervault_raid6: {
    title: 'RAID 6:',
    body: 'Dual distributed parity with (n-2)/n efficiency. 6x write penalty. Better data protection for large capacity drives.',
  },
  powervault_raid10: {
    title: 'RAID 10:',
    body: 'Mirrored stripes with 50% efficiency. Best random IOPS performance. Ideal for databases.',
  },
  powervault_adapt: {
    title: 'ADAPT:',
    body: 'Distributed RAID with ~87% efficiency. Spare capacity distributed across all drives. Fastest rebuilds (8-10x faster). Requires 12-128 drives.',
  },
}

export function PowerVaultOptionsPanel({
  topology,
}: {
  topology: Extract<Topology, { type: 'powervault' }>
}) {
  const { t } = useTranslation('topology')
  const description = LEVEL_DESCRIPTIONS[topology.level]

  return (
    <OptionsSection title={t('powervault.title')}>
      <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
        <p>
          <strong className="text-slate-600 dark:text-slate-300">{description.title}</strong>{' '}
          {description.body}
        </p>
      </div>

      <div className="p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg text-xs text-amber-300">
        <strong>Note:</strong> PowerVault ME5 does not support inline compression or deduplication.
        For data reduction features, consider PowerStore or PowerScale.
      </div>
    </OptionsSection>
  )
}
