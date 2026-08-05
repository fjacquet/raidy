/**
 * Longhorn topology options panel.
 *
 * Controls: disk mode (presets guardrails), minimal-available %, snapshot &
 * growth headroom, and over-provisioning % (advisory).
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Slider } from '@/components/common/FormControls'
import { useConfigStore } from '@/store'

export function LonghornOptionsPanel() {
  const { t } = useTranslation('topology')
  const { longhornOptions, setLonghornOptions } = useConfigStore()

  const setDiskMode = (mode: 'dedicated' | 'root') => {
    // Presets follow Longhorn best practice: dedicated → 10% + 200%, root → 25% + 100%.
    setLonghornOptions(
      mode === 'dedicated'
        ? { diskMode: mode, minimalAvailablePercent: 10 }
        : { diskMode: mode, minimalAvailablePercent: 25 },
    )
  }

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('longhorn.title')}
      </h4>

      <div className="space-y-2">
        <Label>{t('longhorn.diskMode')}</Label>
        <SegmentedControl
          value={longhornOptions.diskMode}
          options={[
            { value: 'dedicated', label: t('longhorn.dedicated') },
            { value: 'root', label: t('longhorn.root') },
          ]}
          onChange={(v) => setDiskMode(v as 'dedicated' | 'root')}
        />
        <p className="text-xs text-slate-500">
          {longhornOptions.diskMode === 'dedicated'
            ? t('longhorn.dedicatedHint')
            : t('longhorn.rootHint')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-min-avail">{t('longhorn.minimalAvailable')}</Label>
        <Slider
          id="longhorn-min-avail"
          value={longhornOptions.minimalAvailablePercent}
          min={0}
          max={30}
          onChange={(v) => setLonghornOptions({ minimalAvailablePercent: v })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.minimalAvailableValue', { pct: longhornOptions.minimalAvailablePercent })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-snapshot">{t('longhorn.snapshotHeadroom')}</Label>
        <Slider
          id="longhorn-snapshot"
          value={Math.round(longhornOptions.snapshotHeadroom * 100)}
          min={100}
          max={200}
          onChange={(v) => setLonghornOptions({ snapshotHeadroom: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.snapshotHeadroomValue', {
            pct: Math.round((longhornOptions.snapshotHeadroom - 1) * 100),
          })}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="longhorn-growth">{t('longhorn.growthHeadroom')}</Label>
        <Slider
          id="longhorn-growth"
          value={Math.round(longhornOptions.growthHeadroom * 100)}
          min={100}
          max={200}
          onChange={(v) => setLonghornOptions({ growthHeadroom: v / 100 })}
        />
        <p className="text-xs text-slate-500">
          {t('longhorn.growthHeadroomValue', {
            pct: Math.round((longhornOptions.growthHeadroom - 1) * 100),
          })}
        </p>
      </div>
    </div>
  )
}
