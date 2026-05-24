/**
 * Workload configuration panel - I/O patterns and data volumes.
 */

import { useTranslation } from 'react-i18next'
import { Label, Select, Slider } from '@/components/common/FormControls'
import { useFormatBytes } from '@/hooks/useCalculations'
import { useConfigStore } from '@/store'
import type { BlockSize } from '@/types'

const BLOCK_SIZES: { value: BlockSize; label: string }[] = [
  { value: '4K', label: '4K' },
  { value: '8K', label: '8K' },
  { value: '16K', label: '16K' },
  { value: '64K', label: '64K' },
  { value: '128K', label: '128K' },
  { value: '256K', label: '256K' },
  { value: '1M', label: '1M' },
]

// Convert slider position to bytes (logarithmic scale)
function sliderToBytes(position: number): number {
  // Position 0-100 maps to 1GB - 10PB (logarithmic)
  const minLog = Math.log10(1024 ** 3) // 1 GB
  const maxLog = Math.log10(10 * 1024 ** 5) // 10 PB
  const log = minLog + (position / 100) * (maxLog - minLog)
  return 10 ** log
}

// Convert bytes to slider position
function bytesToSlider(bytes: number): number {
  const minLog = Math.log10(1024 ** 3)
  const maxLog = Math.log10(10 * 1024 ** 5)
  const log = Math.log10(bytes)
  return ((log - minLog) / (maxLog - minLog)) * 100
}

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
    readPercent,
    blockSize,
    randomPercent,
    datasetSize,
    dailyWriteVolume,
    setReadPercent,
    setBlockSize,
    setRandomPercent,
    setDatasetSize,
    setDailyWriteVolume,
  } = useConfigStore()

  const writePercent = 100 - readPercent
  const sequentialPercent = 100 - randomPercent

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
          options={BLOCK_SIZES}
          onChange={(v) => setBlockSize(v as BlockSize)}
        />
        <p className="text-xs text-slate-500">
          {blockSize === '4K' && t('blockSize.hint4k')}
          {blockSize === '8K' && t('blockSize.hint8k')}
          {blockSize === '16K' && t('blockSize.hint16k')}
          {blockSize === '64K' && t('blockSize.hint64k')}
          {blockSize === '128K' && t('blockSize.hint128k')}
          {blockSize === '256K' && t('blockSize.hint256k')}
          {blockSize === '1M' && t('blockSize.hint1m')}
        </p>
      </div>

      {/* Dataset Size */}
      <div className="space-y-2">
        <Label
          htmlFor="dataset-size"
          hint={formatBytes(datasetSize)}
          tooltip={th('workload.datasetSize')}
        >
          {t('capacity.datasetSize')}
        </Label>
        <Slider
          id="dataset-size"
          value={bytesToSlider(datasetSize)}
          min={0}
          max={100}
          step={1}
          onChange={(v) => setDatasetSize(sliderToBytes(v))}
          formatValue={() => formatBytes(datasetSize)}
        />
      </div>

      {/* Daily Write Volume */}
      <div className="space-y-2">
        <Label
          htmlFor="daily-write"
          hint={`${formatBytes(dailyWriteVolume)}/day`}
          tooltip={th('workload.dailyWriteVolume')}
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
        <p className="text-xs text-slate-500">{t('capacity.hint')}</p>
      </div>

      {/* Workload Presets */}
      <div className="pt-3 border-t border-slate-200 dark:border-surface-700">
        <Label>{t('presets.label')}</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={() => {
              setReadPercent(70)
              setRandomPercent(80)
              setBlockSize('8K')
            }}
            className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
          >
            {t('presets.database')}
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(90)
              setRandomPercent(20)
              setBlockSize('128K')
            }}
            className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
          >
            {t('presets.fileServer')}
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(95)
              setRandomPercent(10)
              setBlockSize('1M')
            }}
            className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
          >
            {t('presets.videoStreaming')}
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(20)
              setRandomPercent(5)
              setBlockSize('1M')
            }}
            className="px-3 py-2 text-xs bg-slate-100 dark:bg-surface-700 hover:bg-slate-200 dark:hover:bg-surface-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
          >
            {t('presets.backup')}
          </button>
        </div>
      </div>
    </div>
  )
}
