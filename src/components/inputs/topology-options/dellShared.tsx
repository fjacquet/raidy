/**
 * Controls shared by the Dell platform panels.
 *
 * These exist because #126's split had a trap in it. Four of the five Dell panels render the
 * same compression control (a toggle, plus a ratio slider that appears only when it is on) and
 * two render the same dedup control and the same snapshot-reserve slider. Splitting a
 * five-platform file into five files that each re-type those blocks would trade one oversized
 * file for five copies of the same markup — the issue said as much, and it is the more expensive
 * problem: the #110 sweep found four *false* hint texts in the old Dell file, and duplicated
 * markup is exactly how a claim gets fixed in one copy and left standing in three.
 */

import { useTranslation } from 'react-i18next'
import { Label, Slider, Toggle } from '@/components/common/FormControls'

/** The section wrapper every platform options panel uses: a top rule and an uppercase heading. */
export function OptionsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  )
}

interface DataReductionControlProps {
  /** Control id prefix, e.g. `powerstore` — ids stay `<prefix>-compression`, unchanged by #126. */
  idPrefix: string
  kind: 'compression' | 'dedup'
  enabled: boolean
  ratio: number
  onToggle: (enabled: boolean) => void
  onRatio: (ratio: number) => void
  /** PowerFlex's compression slider runs 1–4 in 0.5 steps; every other one runs 1–3 in 0.1. */
  min?: number
  max?: number
  step?: number
}

/**
 * A data-reduction toggle with the ratio slider it reveals.
 *
 * The ratio is meaningless while the feature is off, which is why the slider is conditional
 * rather than disabled — the same treatment the platform panels outside Dell already use.
 */
export function DataReductionControl({
  idPrefix,
  kind,
  enabled,
  ratio,
  onToggle,
  onRatio,
  min = 1,
  max = 3,
  step = 0.1,
}: DataReductionControlProps) {
  const { t } = useTranslation('topology')
  const toggleLabel = kind === 'compression' ? 'common.enableCompression' : 'common.enableDedup'
  const ratioLabel = kind === 'compression' ? 'common.compressionRatio' : 'common.dedupRatio'

  return (
    <>
      <Toggle
        id={`${idPrefix}-${kind}`}
        label={t(toggleLabel)}
        checked={enabled}
        onChange={onToggle}
      />
      {enabled && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-${kind}-ratio`}>{t(ratioLabel)}</Label>
          <Slider
            id={`${idPrefix}-${kind}-ratio`}
            value={ratio}
            min={min}
            max={max}
            step={step}
            onChange={onRatio}
            formatValue={(v) => `${v.toFixed(1)}:1`}
          />
        </div>
      )}
    </>
  )
}

/** Snapshot reserve, as a percentage of usable capacity. Identical on PowerStore and PowerScale. */
export function SnapshotReserveSlider({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: number
  onChange: (v: number) => void
}) {
  const { t } = useTranslation('topology')
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-snapshot`}>{t('common.snapshotReserve')}</Label>
      <Slider
        id={`${idPrefix}-snapshot`}
        value={value}
        min={0}
        max={30}
        onChange={onChange}
        formatValue={(v) => `${v}%`}
      />
    </div>
  )
}
