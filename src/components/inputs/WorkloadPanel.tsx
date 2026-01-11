/**
 * Workload configuration panel - I/O patterns and data volumes.
 */

import { Label, SegmentedControl, Slider } from '@/components/common/FormControls'
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

// Format bytes to human-readable
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) {
    const tb = bytes / 1024 ** 4
    return `${tb >= 100 ? tb.toFixed(0) : tb.toFixed(1)} TB`
  }
  if (bytes >= 1024 ** 3) {
    const gb = bytes / 1024 ** 3
    return `${gb >= 100 ? gb.toFixed(0) : gb.toFixed(1)} GB`
  }
  const mb = bytes / 1024 ** 2
  return `${mb.toFixed(0)} MB`
}

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
        <Label htmlFor="read-percent">Read / Write Mix</Label>
        <Slider
          id="read-percent"
          value={readPercent}
          min={0}
          max={100}
          onChange={setReadPercent}
          formatValue={(v) => `${v}% R`}
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>Read: {readPercent}%</span>
          <span>Write: {writePercent}%</span>
        </div>
      </div>

      {/* Random/Sequential Mix */}
      <div className="space-y-2">
        <Label htmlFor="random-percent">Random / Sequential</Label>
        <Slider
          id="random-percent"
          value={randomPercent}
          min={0}
          max={100}
          onChange={setRandomPercent}
          formatValue={(v) => `${v}% Rnd`}
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>Random: {randomPercent}%</span>
          <span>Sequential: {sequentialPercent}%</span>
        </div>
      </div>

      {/* Block Size */}
      <div className="space-y-2">
        <Label>Block Size</Label>
        <SegmentedControl
          value={blockSize}
          options={BLOCK_SIZES}
          onChange={(v) => setBlockSize(v as BlockSize)}
        />
        <p className="text-xs text-slate-500">
          {blockSize === '4K' && 'Database workloads, random I/O'}
          {blockSize === '8K' && 'Oracle, SQL Server default'}
          {blockSize === '16K' && 'MySQL InnoDB default'}
          {blockSize === '64K' && 'General file server'}
          {blockSize === '128K' && 'Video streaming, large files'}
          {blockSize === '256K' && 'Video editing, large file transfers'}
          {blockSize === '1M' && 'Backup, sequential I/O'}
        </p>
      </div>

      {/* Dataset Size */}
      <div className="space-y-2">
        <Label htmlFor="dataset-size" hint={formatBytes(datasetSize)}>
          Total Dataset Size
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
        <Label htmlFor="daily-write" hint={`${formatBytes(dailyWriteVolume)}/day`}>
          Daily Write Volume
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
        <p className="text-xs text-slate-500">Used for SSD endurance calculations (DWPD)</p>
      </div>

      {/* Workload Presets */}
      <div className="pt-3 border-t border-surface-700">
        <Label>Quick Presets</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={() => {
              setReadPercent(70)
              setRandomPercent(80)
              setBlockSize('8K')
            }}
            className="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 rounded-lg text-slate-300 transition-colors"
          >
            Database (OLTP)
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(90)
              setRandomPercent(20)
              setBlockSize('128K')
            }}
            className="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 rounded-lg text-slate-300 transition-colors"
          >
            File Server
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(95)
              setRandomPercent(10)
              setBlockSize('1M')
            }}
            className="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 rounded-lg text-slate-300 transition-colors"
          >
            Video Streaming
          </button>
          <button
            type="button"
            onClick={() => {
              setReadPercent(20)
              setRandomPercent(5)
              setBlockSize('1M')
            }}
            className="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 rounded-lg text-slate-300 transition-colors"
          >
            Backup Target
          </button>
        </div>
      </div>
    </div>
  )
}
