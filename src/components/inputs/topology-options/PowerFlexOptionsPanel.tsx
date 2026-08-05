/**
 * Dell PowerFlex options — software-defined block storage (SSD/NVMe only).
 *
 * Split out of the five-platform DellOptionsPanel in #126.
 */

import { useTranslation } from 'react-i18next'
import { Label, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'
import type { Topology } from '@/types'
import { DataReductionControl, OptionsSection } from './dellShared'

export function PowerFlexOptionsPanel({
  topology,
}: {
  topology: Extract<Topology, { type: 'powerflex' }>
}) {
  const { t } = useTranslation('topology')
  const { t: th } = useTranslation('help')
  const { powerFlexOptions, setPowerFlexOptions } = useConfigStore()

  const isFineGranularity = topology.level.includes('fine')

  return (
    <OptionsSection title={t('powerflex.title')}>
      {/* Mode description for the selected topology level */}
      <div className="p-3 bg-white dark:bg-surface-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
        {topology.level.includes('medium') && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">
              Medium Granularity (1MB):
            </strong>{' '}
            Standard mode with lower metadata overhead. Supports 2-way and 3-way mirroring.
          </p>
        )}
        {isFineGranularity && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">Fine Granularity (8KB):</strong>{' '}
            Better for small random I/O. Only supports 2-way mirroring. 12-15% metadata overhead.
          </p>
        )}
        {topology.level.includes('ec_') && (
          <p>
            <strong className="text-slate-600 dark:text-slate-300">Erasure Coding:</strong> Higher
            capacity efficiency but ~30% lower IOPS due to CPU overhead. Requires PowerFlex 4.5+.
          </p>
        )}
      </div>

      {/* PowerFlex compression runs 1-4 in 0.5 steps, unlike the 1-3 / 0.1 of its siblings. */}
      <DataReductionControl
        idPrefix="powerflex"
        kind="compression"
        enabled={powerFlexOptions.compression}
        ratio={powerFlexOptions.compressionRatio}
        onToggle={(v) => setPowerFlexOptions({ compression: v })}
        onRatio={(v) => setPowerFlexOptions({ compressionRatio: v })}
        max={4}
        step={0.5}
      />

      {/* Fine-granularity metadata overhead — meaningless in the other modes, so not rendered */}
      {isFineGranularity && (
        <div className="space-y-2">
          <Label htmlFor="powerflex-fg-overhead" tooltip={th('dell.powerFlex')}>
            {t('powerflex.fgOverhead')}
          </Label>
          <Slider
            id="powerflex-fg-overhead"
            value={powerFlexOptions.fgOverhead * 100}
            min={10}
            max={18}
            onChange={(v) => setPowerFlexOptions({ fgOverhead: v / 100 })}
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      )}
    </OptionsSection>
  )
}
