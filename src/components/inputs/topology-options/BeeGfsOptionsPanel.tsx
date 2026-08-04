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
 * Three controls here are INFORMATIONAL — each is labelled as such in the UI
 * (tooltip + hint) so the user is never misled into thinking a slider they
 * can move is changing a number on the right-hand side:
 *   - `network`   — see BeeGfsOptions.network in src/types/topology.ts.
 *   - `chunkSizeKb` and `numTargets` — see the same file. Both are real BeeGFS
 *     tunables with real performance effects on hardware, but this engine
 *     reports cluster aggregates only, and neither has an honest aggregate
 *     model (see the type doc-comments for the full reasoning). They are
 *     surfaced so a sizing sheet can record the intended configuration, and
 *     they persist through "Copy URL to Share", but they compute nothing.
 *
 * `fsOverheadPercent` is the opposite of those three: it IS wired into
 * `getFilesystemOverheadPercent` (src/engines/volumetry/overhead/filesystem-overhead.ts) and
 * changes usable capacity, so its control carries no "informational" label.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Select, Slider, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { deriveBeeGfsStorageTargets } from '@/components/inputs/topology-options/beegfsPanelHelpers'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'

// InfiniBand fabric names and Ethernet speed labels are technical proper nouns, the same
// convention as Ceph's BlueStore/FileStore and Synology's Btrfs/EXT4 labels elsewhere in this
// panel family — left untranslated deliberately, not an oversight.
const BEEGFS_NETWORK_OPTIONS = [
  { value: 'ib-hdr', label: 'InfiniBand HDR' },
  { value: 'ib-ndr', label: 'InfiniBand NDR' },
  { value: '100gbe', label: '100GbE' },
  { value: '25gbe', label: '25GbE' },
]

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
        <Label tooltip={t('beegfs.chunkSizeTooltip')}>{t('beegfs.chunkSize')}</Label>
        <SegmentedControl
          value={String(beeGfsOptions.chunkSizeKb)}
          options={[
            { value: '512', label: '512K' },
            { value: '1024', label: '1024K' },
            { value: '2048', label: '2048K' },
          ]}
          onChange={(v) => setBeeGfsOptions({ chunkSizeKb: Number(v) as 512 | 1024 | 2048 })}
        />
        <p className="text-xs text-slate-500">{t('beegfs.chunkSizeHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="beegfs-num-targets" tooltip={t('beegfs.numTargetsTooltip')}>
          {t('beegfs.numTargets')}
        </Label>
        <Slider
          id="beegfs-num-targets"
          value={beeGfsOptions.numTargets}
          min={1}
          max={16}
          onChange={(v) => setBeeGfsOptions({ numTargets: v })}
        />
        <p className="text-xs text-slate-500">{t('beegfs.numTargetsHint')}</p>
      </div>

      <div className="space-y-2">
        <Label tooltip={t('beegfs.networkTooltip')}>{t('beegfs.network')}</Label>
        <Select
          id="beegfs-network"
          value={beeGfsOptions.network}
          options={BEEGFS_NETWORK_OPTIONS}
          onChange={(v) =>
            setBeeGfsOptions({ network: v as 'ib-hdr' | 'ib-ndr' | '100gbe' | '25gbe' })
          }
        />
        <p className="text-xs text-slate-500">{t('beegfs.networkHint')}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="beegfs-fs-overhead" tooltip={t('beegfs.fsOverheadTooltip')}>
          {t('beegfs.fsOverhead')}
        </Label>
        <Slider
          id="beegfs-fs-overhead"
          value={beeGfsOptions.fsOverheadPercent}
          min={0.5}
          max={5}
          step={0.1}
          onChange={(v) => setBeeGfsOptions({ fsOverheadPercent: v })}
        />
        <p className="text-xs text-slate-500">
          {t('beegfs.fsOverheadHint', { percent: beeGfsOptions.fsOverheadPercent.toFixed(1) })}
        </p>
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
            showCacheMode={false}
            showWorkingSet={false}
          />
        </div>
      )}
    </div>
  )
}
