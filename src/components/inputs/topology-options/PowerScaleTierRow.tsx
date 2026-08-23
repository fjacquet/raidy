/**
 * One PowerScale node pool.
 *
 * The controls form a dependency chain — model, then drive size, then node count, then
 * protection — mirroring the source workbook's own left-to-right selection rule. Each step
 * narrows the next, so an unsizeable combination is never offered rather than being silently
 * mis-computed: `sizeTier` answers `null` for a tuple Dell's PowerSizer export does not publish,
 * and a `null` tier contributes nothing to capacity, power or cost.
 *
 * Changing the model re-derives every downstream field in ONE dispatch. Three separate
 * `updatePowerScaleTier` calls would let the store pass through an intermediate state (new model,
 * old drive size) that the catalog does not publish, which the URL hash would happily persist.
 */

import { useTranslation } from 'react-i18next'
import { Label, NumberInput, Select } from '@/components/common/FormControls'
import {
  availableProtections,
  getModel,
  listDriveSizes,
  listModels,
  suggestedProtection,
} from '@/data/powerscaleCatalog'
import { sizeTier } from '@/engines/volumetry/powerscale/tier'
import type { Language } from '@/i18n/config'
import { formatNumber } from '@/i18n/formatters'
import { useConfigStore } from '@/store'
import type { PowerScaleProtection, PowerScaleTier } from '@/types'

interface PowerScaleTierRowProps {
  tier: PowerScaleTier
  index: number
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}

/** Catalog tier names, in the order the model picker should present them. */
const MODEL_TIER_ORDER = ['All Flash', 'Hybrid', 'Archive']

/**
 * Clamp to the model's bounds and snap to its node increment.
 *
 * `fallback` is returned when the model is not in the catalog, which only happens for a
 * hand-edited or legacy URL naming a model we do not publish. `sizeTier` rejects such a tier
 * anyway and the row shows the "cannot be sized" warning, so nothing is fabricated either way —
 * but returning the request would write an unvalidated number into the store and the URL hash,
 * so the previous value stands instead.
 */
function clampNodes(modelId: string, requested: number, fallback: number): number {
  const model = getModel(modelId)
  if (!model) return fallback
  const stepped =
    model.minNodes +
    Math.round((requested - model.minNodes) / model.nodeIncrement) * model.nodeIncrement
  return Math.min(model.maxNodes, Math.max(model.minNodes, stepped))
}

/**
 * Keep the protection the user chose when the catalog still publishes it, otherwise fall back to
 * the vendor's own suggestion for the new combination. Never leaves an unpublished level
 * selected — that is the state `sizeTier` rejects outright.
 */
function resolveProtection(
  nodeModel: string,
  driveSizeTb: number,
  nodeCount: number,
  current: PowerScaleProtection,
): PowerScaleProtection {
  const allowed = availableProtections(nodeModel, driveSizeTb, nodeCount)
  if (allowed.includes(current)) return current
  return suggestedProtection(nodeModel, driveSizeTb, nodeCount) ?? allowed[0] ?? current
}

export function PowerScaleTierRow({
  tier,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
}: PowerScaleTierRowProps) {
  const { t, i18n } = useTranslation('topology')
  const language = i18n.language as Language
  const tiers = useConfigStore((state) => state.powerscaleOptions.tiers)
  const updatePowerScaleTier = useConfigStore((state) => state.updatePowerScaleTier)
  const removePowerScaleTier = useConfigStore((state) => state.removePowerScaleTier)

  const model = getModel(tier.nodeModel)
  const protections = availableProtections(tier.nodeModel, tier.driveSizeTb, tier.nodeCount)
  const sized = sizeTier(tier)

  const idPrefix = `powerscale-tier-${index}`

  // `Select` renders group headings in first-appearance order, so the ordering is this call
  // site's job. `listModels()` is sorted by id, which would open the dropdown on Archive (A200
  // sorts before F200) — backwards for a picker whose most-used entries are all-flash.
  const modelOptions = [...listModels()]
    .sort((a, b) => {
      const rank = (tierName: string) => {
        const i = MODEL_TIER_ORDER.indexOf(tierName)
        return i === -1 ? MODEL_TIER_ORDER.length : i
      }
      return rank(a.tier) - rank(b.tier) || a.id.localeCompare(b.id)
    })
    .map((m) => ({
      value: m.id,
      label: `${m.id} (${m.generation})`,
      group: m.tier,
    }))

  // `value` stays the raw string so the change handler can parse it; only the LABEL is localised,
  // so an fr/de user does not read `1.92` here and `1,92` for the same number in the output table.
  const driveSizeOptions = listDriveSizes(tier.nodeModel).map((size) => ({
    value: String(size),
    label: formatNumber(size, language),
  }))

  // An unpublished protection can only arrive from a hand-edited or legacy URL. Listing it keeps
  // the select showing what the store actually holds instead of silently displaying the first
  // valid level while the store holds another.
  const protectionOptions = (protections.length > 0 ? protections : [tier.protection]).map((p) => ({
    value: p,
    label: p,
  }))

  const selectModel = (nodeModel: string) => {
    const sizes = listDriveSizes(nodeModel)
    const driveSizeTb = sizes.includes(tier.driveSizeTb) ? tier.driveSizeTb : (sizes[0] ?? 0)
    const nodeCount = clampNodes(nodeModel, tier.nodeCount, tier.nodeCount)
    updatePowerScaleTier(index, {
      nodeModel,
      driveSizeTb,
      nodeCount,
      protection: resolveProtection(nodeModel, driveSizeTb, nodeCount, tier.protection),
    })
  }

  const selectDriveSize = (raw: string) => {
    const driveSizeTb = Number(raw)
    if (!Number.isFinite(driveSizeTb) || driveSizeTb <= 0) return
    updatePowerScaleTier(index, {
      driveSizeTb,
      protection: resolveProtection(tier.nodeModel, driveSizeTb, tier.nodeCount, tier.protection),
    })
  }

  const selectNodeCount = (requested: number) => {
    // Clearing the field yields 0 (and a non-numeric entry NaN); storing either would cascade
    // through sizeTier into every dashboard number.
    if (!Number.isFinite(requested) || requested <= 0) return
    const nodeCount = clampNodes(tier.nodeModel, requested, tier.nodeCount)
    updatePowerScaleTier(index, {
      nodeCount,
      protection: resolveProtection(tier.nodeModel, tier.driveSizeTb, nodeCount, tier.protection),
    })
  }

  /**
   * Swap this pool with its neighbour.
   *
   * Order is load-bearing: performance and resilience model the FIRST sizeable pool, so moving a
   * pool up changes which one the dashboard describes. The swap is two patches of whole tiers
   * rather than a dedicated store action — each patch is applied against fresh state, and the
   * displaced tier is captured by value first.
   */
  const move = (delta: number) => {
    const target = index + delta
    const self = tiers[index]
    const other = tiers[target]
    if (!self || !other) return
    updatePowerScaleTier(index, { ...other })
    updatePowerScaleTier(target, { ...self })
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 dark:border-surface-700 p-3">
      <legend className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span>{t('powerscale.tier.heading', { index: index + 1 })}</span>
        {model?.endOfLife ? (
          <span className="rounded bg-amber-100 dark:bg-amber-900 px-1.5 py-0.5 text-[10px] font-medium normal-case text-amber-700 dark:text-amber-200">
            {t('powerscale.tier.eol', { date: model.endOfLife })}
          </span>
        ) : null}
      </legend>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-model`}>{t('powerscale.tier.nodeModel')}</Label>
        <Select
          id={`${idPrefix}-model`}
          value={tier.nodeModel}
          options={modelOptions}
          onChange={selectModel}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-drive`}>{t('powerscale.tier.driveSize')}</Label>
        <Select
          id={`${idPrefix}-drive`}
          value={String(tier.driveSizeTb)}
          options={driveSizeOptions}
          onChange={selectDriveSize}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor={`${idPrefix}-nodes`}
          hint={
            model
              ? t('powerscale.tier.driveTotal', { count: tier.nodeCount * model.drivesPerNode })
              : undefined
          }
        >
          {t('powerscale.tier.nodeCount')}
        </Label>
        <NumberInput
          id={`${idPrefix}-nodes`}
          value={tier.nodeCount}
          min={model?.minNodes}
          max={model?.maxNodes}
          step={model?.nodeIncrement ?? 1}
          onChange={selectNodeCount}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-protection`}>{t('powerscale.tier.protection')}</Label>
        <Select
          id={`${idPrefix}-protection`}
          value={tier.protection}
          options={protectionOptions}
          onChange={(value) =>
            updatePowerScaleTier(index, { protection: value as PowerScaleProtection })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-vhs-drives`}>{t('powerscale.tier.vhsDriveCount')}</Label>
        <NumberInput
          id={`${idPrefix}-vhs-drives`}
          value={tier.vhsDriveCount}
          min={0}
          max={64}
          onChange={(value) =>
            updatePowerScaleTier(index, {
              vhsDriveCount: Number.isFinite(value) ? Math.min(64, Math.max(0, value)) : 0,
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-vhs-percent`}>{t('powerscale.tier.vhsPercent')}</Label>
        <NumberInput
          id={`${idPrefix}-vhs-percent`}
          value={tier.vhsPercent}
          min={0}
          max={50}
          onChange={(value) =>
            updatePowerScaleTier(index, {
              vhsPercent: Number.isFinite(value) ? Math.min(50, Math.max(0, value)) : 0,
            })
          }
        />
      </div>

      {sized === null && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <span aria-hidden="true">⚠</span>
          <span>{t('powerscale.tier.notSizeable')}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={!canMoveUp}
          aria-label={t('powerscale.tier.moveUp')}
          className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-surface-600 text-slate-600 dark:text-slate-300 disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={!canMoveDown}
          aria-label={t('powerscale.tier.moveDown')}
          className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-surface-600 text-slate-600 dark:text-slate-300 disabled:opacity-40"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => removePowerScaleTier(index)}
          disabled={!canRemove}
          aria-label={t('powerscale.tier.remove')}
          className="ml-auto px-2 py-1 text-xs rounded border border-slate-200 dark:border-surface-600 text-slate-600 dark:text-slate-300 disabled:opacity-40"
        >
          {t('powerscale.tier.remove')}
        </button>
      </div>
    </fieldset>
  )
}
