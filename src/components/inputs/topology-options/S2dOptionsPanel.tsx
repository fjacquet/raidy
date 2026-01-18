/**
 * S2D (Storage Spaces Direct) topology options panel.
 *
 * Displays configuration controls for Microsoft S2D topologies:
 * - Fault domains
 * - Mirror copies (2-way/3-way)
 * - Rebuild reserve
 * - Storage tiers
 */

import { useTranslation } from 'react-i18next'
import { Label, NumberInput, SegmentedControl, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'
import type { Topology } from '@/types'

interface S2dOptionsPanelProps {
  topology: Topology & { type: 's2d' }
}

export function S2dOptionsPanel({ topology }: S2dOptionsPanelProps) {
  const { t } = useTranslation('topology')
  const { s2dOptions, serverCount, setS2DOptions } = useConfigStore()

  return (
    <div className="space-y-4 pt-3 border-t border-surface-700">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {t('s2d.title')}
      </h4>

      <div className="space-y-2">
        <Label htmlFor="fault-domains">{t('s2d.faultDomains')}</Label>
        <NumberInput
          id="fault-domains"
          value={s2dOptions.faultDomains}
          min={2}
          max={16}
          onChange={(v) => setS2DOptions({ faultDomains: v })}
        />
      </div>

      {(topology.level === 'mirror' || topology.level === 'map') && (
        <div className="space-y-2">
          <Label>{t('s2d.mirrorCopies')}</Label>
          <SegmentedControl
            value={String(s2dOptions.mirrorCopies)}
            options={[
              { value: '2', label: '2-way' },
              { value: '3', label: '3-way' },
            ]}
            onChange={(v) => setS2DOptions({ mirrorCopies: Number(v) as 2 | 3 })}
          />
        </div>
      )}

      <Toggle
        id="s2d-reserve"
        label={t('s2d.rebuildReserve')}
        checked={s2dOptions.rebuildReserve}
        onChange={(v) => setS2DOptions({ rebuildReserve: v })}
      />

      <Toggle
        id="s2d-tiers"
        label={t('s2d.storageTiers')}
        checked={s2dOptions.storageTiers}
        onChange={(v) => setS2DOptions({ storageTiers: v })}
      />

      {s2dOptions.storageTiers && (
        <TieringPanel
          config={s2dOptions.tieringConfig ?? DEFAULT_TIERING_CONFIG}
          onChange={(tieringConfig) =>
            setS2DOptions({
              tieringConfig: {
                ...DEFAULT_TIERING_CONFIG,
                ...s2dOptions.tieringConfig,
                ...tieringConfig,
              },
            })
          }
          serverCount={serverCount}
          platform="s2d"
        />
      )}
    </div>
  )
}
