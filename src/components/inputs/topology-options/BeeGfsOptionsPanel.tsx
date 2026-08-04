/**
 * BeeGFS topology options panel.
 *
 * Controls: storage-target width (drives per RAID6/RAID10/RAIDz2 target,
 * with derived target count / stranded drives), storage & metadata Buddy
 * Mirroring, per-file striping (chunk size + numTargets, performance only),
 * cluster interconnect (display only — see BeeGfsOptions.network in
 * src/types/topology.ts), and metadata target (MDT) sizing via TieringPanel.
 */

import { useTranslation } from 'react-i18next'
import { Label, SegmentedControl, Select, Slider, Toggle } from '@/components/common/FormControls'
import { TieringPanel } from '@/components/inputs/TieringPanel'
import { useConfigStore } from '@/store'
import { DEFAULT_TIERING_CONFIG } from '@/types'

const BEEGFS_NETWORK_OPTIONS = [
  { value: 'ib-hdr', label: 'InfiniBand HDR' },
  { value: 'ib-ndr', label: 'InfiniBand NDR' },
  { value: '100gbe', label: '100GbE' },
  { value: '25gbe', label: '25GbE' },
]

export function BeeGfsOptionsPanel() {
  const { t } = useTranslation('topology')
  const { beeGfsOptions, driveCount, serverCount, setBeeGfsOptions } = useConfigStore()

  const totalDrives = driveCount * serverCount
  const storageTargetCount =
    beeGfsOptions.drivesPerTarget > 0 ? Math.floor(totalDrives / beeGfsOptions.drivesPerTarget) : 0
  const strandedDrives = totalDrives - storageTargetCount * beeGfsOptions.drivesPerTarget

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
        <Label>{t('beegfs.chunkSize')}</Label>
        <SegmentedControl
          value={String(beeGfsOptions.chunkSizeKb)}
          options={[
            { value: '512', label: '512K' },
            { value: '1024', label: '1024K' },
            { value: '2048', label: '2048K' },
          ]}
          onChange={(v) => setBeeGfsOptions({ chunkSizeKb: Number(v) as 512 | 1024 | 2048 })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="beegfs-num-targets">{t('beegfs.numTargets')}</Label>
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

      <div className="space-y-2 pt-2">
        <h5 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('beegfs.metadataTargets')}
        </h5>
        <p className="text-xs text-slate-500">{t('beegfs.metadataTargetsHint')}</p>
        <TieringPanel
          config={beeGfsOptions.tiering ?? DEFAULT_TIERING_CONFIG}
          onChange={(tiering) =>
            setBeeGfsOptions({
              tiering: {
                ...DEFAULT_TIERING_CONFIG,
                ...beeGfsOptions.tiering,
                ...tiering,
              },
            })
          }
          serverCount={serverCount}
          platform="beegfs"
          showCacheMode={false}
          showWorkingSet={false}
        />
      </div>
    </div>
  )
}
