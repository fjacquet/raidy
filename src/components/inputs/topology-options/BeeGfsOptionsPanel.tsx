/**
 * BeeGFS topology options panel.
 *
 * Controls: storage-target width (drives per RAID6/RAID10/RAIDz2 target,
 * with derived target count / stranded drives), storage & metadata Buddy
 * Mirroring, and an explicit `metadataTargets` opt-in gating
 * metadata target (MDT) sizing via TieringPanel — mirrors Ceph's
 * `walDbOffload` toggle so filling in the MDT drive pickers can never
 * silently switch the storage-target drive selection away from the
 * Hardware panel (see resolveTiering in src/engines/shared/tiering.ts).
 *
 * This panel once carried three further controls — `chunkSizeKb`, `numTargets`
 * and `network` — each labelled "informational" because it computed nothing.
 * They were deleted: a control followed by a sentence explaining it does not
 * work is worse than no control. All three are real BeeGFS tunables with real
 * performance effects on hardware, and the reasons this engine does not model
 * them are recorded where they help the person maintaining the model rather
 * than the person configuring one — #69 researched a single-stream output and
 * rejected it, because it needs a client link speed this app does not collect,
 * and ThinkParQ's own benchmarks show single-stream throughput does not scale
 * linearly with target count in any case.
 *
 * `fsOverheadPercent` is wired into `getFilesystemOverheadPercent`
 * (src/engines/volumetry/overhead/filesystem-overhead.ts) and changes usable
 * capacity — every control still on this panel does.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, Slider, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { deriveBeeGfsStorageTargets } from '@/components/inputs/topology-options/beegfsPanelHelpers'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'

export function BeeGfsOptionsPanel() {
  const { t } = useTranslation('topology')
  const { beeGfsOptions, driveCount, serverCount, hotSpares, setBeeGfsOptions } = useConfigStore()

  // deriveBeeGfsStorageTargets shares the exact engine formula (calculateStorageTargets in
  // src/engines/volumetry/strategies/beegfs.ts) and the hotSpares*serverCount / tiering
  // branching useVolumetryCalc.ts applies, so this can never disagree with the beeGfsDetails
  // output card. See tests/components/beegfsPanelHelpers.spec.ts, which pins the two together.
  const { storageTargetCount, strandedDrives } = useMemo(
    () => deriveBeeGfsStorageTargets(driveCount, serverCount, hotSpares, beeGfsOptions),
    [driveCount, serverCount, hotSpares, beeGfsOptions],
  )

  return (
    <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-surface-700">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {t('beegfs.title')}
      </h4>

      <div className="space-y-2">
        <Label htmlFor="beegfs-drives-per-target">{t('beegfs.drivesPerTarget')}</Label>
        <Slider
          id="beegfs-drives-per-target"
          value={beeGfsOptions.drivesPerTarget}
          min={1}
          max={24}
          onChange={(v) => setBeeGfsOptions({ drivesPerTarget: v })}
        />
        <p className="text-xs text-slate-500">
          {t('beegfs.drivesPerTargetDerived', {
            targets: storageTargetCount,
            stranded: strandedDrives,
          })}
        </p>
        <p className="text-xs text-slate-500">{t('beegfs.drivesPerTargetHint')}</p>
      </div>

      <Toggle
        id="beegfs-storage-buddy-mirror"
        label={t('beegfs.storageBuddyMirror')}
        checked={beeGfsOptions.storageBuddyMirror}
        onChange={(v) => setBeeGfsOptions({ storageBuddyMirror: v })}
      />
      <p className="text-xs text-slate-500 -mt-2">{t('beegfs.storageBuddyMirrorHint')}</p>

      <Toggle
        id="beegfs-metadata-buddy-mirror"
        label={t('beegfs.metadataBuddyMirror')}
        checked={beeGfsOptions.metadataBuddyMirror}
        onChange={(v) => setBeeGfsOptions({ metadataBuddyMirror: v })}
      />
      <p className="text-xs text-slate-500 -mt-2">{t('beegfs.metadataBuddyMirrorHint')}</p>

      <div className="space-y-2">
        <Label htmlFor="beegfs-fs-overhead" tooltip={t('beegfs.fsOverheadTooltip')}>
          {t('beegfs.fsOverhead')}
        </Label>
        {/*
          The slider carries the number and its unit, so the hint below no longer repeats
          either — it says only what the value alone cannot.
        */}
        <Slider
          id="beegfs-fs-overhead"
          value={beeGfsOptions.fsOverheadPercent}
          min={0.5}
          max={5}
          step={0.1}
          onChange={(v) => setBeeGfsOptions({ fsOverheadPercent: v })}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
        <p className="text-xs text-slate-500">{t('beegfs.fsOverheadHint')}</p>
      </div>

      <Toggle
        id="beegfs-metadata-targets"
        label={t('beegfs.metadataTargetsToggle')}
        checked={beeGfsOptions.metadataTargets}
        onChange={(v) => setBeeGfsOptions({ metadataTargets: v })}
      />
      <p className="text-xs text-slate-500 -mt-2">{t('beegfs.metadataTargetsToggleHint')}</p>

      {beeGfsOptions.metadataTargets && (
        <div className="space-y-2 pt-2">
          <h5 className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('beegfs.metadataTargets')}
          </h5>
          <p className="text-xs text-slate-500">{t('beegfs.metadataTargetsHint')}</p>
          <TieringPanel
            config={beeGfsOptions.tiering ?? DEFAULT_TIERING_CONFIG}
            onChange={(next) =>
              setBeeGfsOptions({
                tiering: {
                  ...DEFAULT_TIERING_CONFIG,
                  ...beeGfsOptions.tiering,
                  ...next,
                },
              })
            }
            serverCount={serverCount}
            platform="beegfs"
            showWorkingSet={false}
          />
        </div>
      )}
    </div>
  )
}
