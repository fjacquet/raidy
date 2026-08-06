/**
 * Workload configuration panel - I/O patterns and data volumes.
 */

import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { isHpcTopology, profilesForTopology, type WorkloadProfile } from '@/data/workloadProfiles'
import { useFormatBytes } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'
import { BLOCK_SIZES, type BlockSize } from '@/types'

/** Exhaustive over BlockSize — adding a value to BLOCK_SIZES fails to compile until a label is added here. */
const BLOCK_SIZE_LABELS: Record<BlockSize, string> = {
  '4K': '4K',
  '8K': '8K',
  '16K': '16K',
  '64K': '64K',
  '128K': '128K',
  '256K': '256K',
  '512K': '512K',
  '1M': '1M',
}

const BLOCK_SIZE_OPTIONS = BLOCK_SIZES.map((value) => ({ value, label: BLOCK_SIZE_LABELS[value] }))

// Convert slider position to daily write (logarithmic scale)
function sliderToDailyWrite(position: number): number {
  // Position 0-100 maps to 100MB - 100TB
  const minLog = Math.log10(100 * 1024 ** 2) // 100 MB
  const maxLog = Math.log10(100 * 1024 ** 4) // 100 TB
  const log = minLog + (position / 100) * (maxLog - minLog)
  return 10 ** log
}

function dailyWriteToSlider(bytes: number): number {
  const minLog = Math.log10(100 * 1024 ** 2)
  const maxLog = Math.log10(100 * 1024 ** 4)
  const log = Math.log10(bytes)
  const result = ((log - minLog) / (maxLog - minLog)) * 100
  return Math.min(Math.max(result, 0), 100)
}

export function WorkloadPanel() {
  const { t } = useTranslation('workload')
  const { t: th } = useTranslation('help')
  const formatBytes = useFormatBytes()
  const {
    topology,
    readPercent,
    blockSize,
    randomPercent,
    dailyWriteVolume,
    setReadPercent,
    setBlockSize,
    setRandomPercent,
    setDailyWriteVolume,
  } = useConfigStore()

  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent

  const profiles = profilesForTopology(topology.type)
  const isHpc = isHpcTopology(topology.type)

  const applyProfile = (profile: WorkloadProfile) => {
    setReadPercent(profile.readPercent)
    setRandomPercent(profile.randomPercent)
    setBlockSize(profile.blockSize)
  }

  return (
    <div className="space-y-5">
      {/* Read/Write Mix */}
      <div className="space-y-2">
        <Label htmlFor="read-percent" tooltip={th('workload.readWrite')}>
          {t('ioPattern.readWrite')}
        </Label>
        <Slider
          id="read-percent"
          value={readPercent}
          min={0}
          max={100}
          onChange={setReadPercent}
          formatValue={(v) => `${v}% R`}
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {t('ioPattern.readPercent')}: {readPercent}%
          </span>
          <span>
            {t('ioPattern.writePercent')}: {writePercent}%
          </span>
        </div>
      </div>

      {/* Random/Sequential Mix */}
      <div className="space-y-2">
        <Label htmlFor="random-percent" tooltip={th('workload.randomSequential')}>
          {t('ioPattern.randomSequential')}
        </Label>
        <Slider
          id="random-percent"
          value={randomPercent}
          min={0}
          max={100}
          onChange={setRandomPercent}
          formatValue={(v) => `${v}% Rnd`}
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {t('ioPattern.randomPercent')}: {randomPercent}%
          </span>
          <span>
            {t('ioPattern.sequentialPercent')}: {sequentialPercent}%
          </span>
        </div>
      </div>

      {/* Block Size */}
      <div className="space-y-2">
        <Label htmlFor="block-size" tooltip={th('workload.blockSize')}>
          {t('blockSize.label')}
        </Label>
        <Select
          id="block-size"
          value={blockSize}
          options={BLOCK_SIZE_OPTIONS}
          onChange={(v) => setBlockSize(v as BlockSize)}
        />
        <p className="text-xs text-slate-500">
          {blockSize === '4K' && t('blockSize.hint4k')}
          {blockSize === '8K' && t('blockSize.hint8k')}
          {blockSize === '16K' && t('blockSize.hint16k')}
          {blockSize === '64K' && t('blockSize.hint64k')}
          {blockSize === '128K' && t('blockSize.hint128k')}
          {blockSize === '256K' && t('blockSize.hint256k')}
          {blockSize === '512K' && t('blockSize.hint512k')}
          {blockSize === '1M' && t('blockSize.hint1m')}
        </p>
      </div>

      {/* Daily Write Volume */}
      <div className="space-y-2">
        <Label
          htmlFor="daily-write"
          hint={`${formatBytes(dailyWriteVolume)}/day`}
          tooltip={`${th('workload.dailyWriteVolume')} ${t('capacity.hint')}`}
        >
          {t('capacity.dailyWriteVolume')}
        </Label>
        <Slider
          id="daily-write"
          value={dailyWriteToSlider(dailyWriteVolume)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => setDailyWriteVolume(sliderToDailyWrite(v))}
          formatValue={() => formatBytes(dailyWriteVolume)}
        />
      </div>

      {/* Workload Profiles — data-driven, filtered by platform. See src/data/workloadProfiles.ts */}
      <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
        <Label>{isHpc ? t('presets.labelHpc') : t('presets.label')}</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => applyProfile(profile)}
              className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
            >
              {t(profile.labelKey)}
            </button>
          ))}
        </div>
        {isHpc && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {t('presets.hpcGuidance')}
          </p>
        )}
      </div>
    </div>
  )
}
