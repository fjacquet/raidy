/**
 * Tiering configuration panel for platforms supporting cache + capacity tiers.
 * Used by S2D, vSAN OSA, and Ceph.
 */

import { useMemo } from 'react'
import { Label, SegmentedControl, Select, Slider } from '@/components/common/FormControls'
import drivesData from '@/data/drives.json'
import { useFormatBytes } from '@/hooks/useCalculations'
import type { Drive } from '@/types/drive'
import type { TieringConfig } from '@/types/topology'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

export interface TieringPanelProps {
  /** Current tiering configuration */
  config: TieringConfig
  /** Callback when configuration changes */
  onChange: (config: Partial<TieringConfig>) => void
  /** Number of servers/nodes (for per-server display) */
  serverCount: number
  /** Platform name for contextual labels */
  platform: 's2d' | 'vsan' | 'ceph'
  /** Whether to show cache mode selector */
  showCacheMode?: boolean
  /** Whether to show working set slider */
  showWorkingSet?: boolean
}

/** Drive type filter options for fast tier */
const FAST_TIER_TYPES: Drive['type'][] = ['SSD_NVMe', 'SSD_SAS', 'SSD_SATA']

/** Get platform-specific labels */
function getPlatformLabels(platform: TieringPanelProps['platform']) {
  switch (platform) {
    case 's2d':
      return {
        fastTier: 'Cache Tier (NVMe/SSD)',
        capacityTier: 'Capacity Tier',
        fastTierHint: 'High-speed drives for write cache and hot data',
        capacityTierHint: 'Bulk storage for cold data',
      }
    case 'vsan':
      return {
        fastTier: 'Cache Tier',
        capacityTier: 'Capacity Tier',
        fastTierHint: 'NVMe/SSD for read/write cache (per disk group)',
        capacityTierHint: 'HDD or SSD for capacity (per disk group)',
      }
    case 'ceph':
      return {
        fastTier: 'WAL/DB Devices (NVMe)',
        capacityTier: 'OSD Devices',
        fastTierHint: 'NVMe for BlueStore WAL and RocksDB',
        capacityTierHint: 'Primary OSD storage (HDD or SSD)',
      }
  }
}

export function TieringPanel({
  config,
  onChange,
  serverCount,
  platform,
  showCacheMode = true,
  showWorkingSet = true,
}: TieringPanelProps) {
  const formatBytes = useFormatBytes()
  const labels = getPlatformLabels(platform)

  // Get all drives as array
  const driveList = useMemo(() => Object.values(drives), [])

  // Filter drives for fast tier (NVMe/SSD only)
  const fastTierDrives = useMemo(() => {
    return driveList.filter((drive) => FAST_TIER_TYPES.includes(drive.type))
  }, [driveList])

  // All drives available for capacity tier
  const capacityTierDrives = useMemo(() => {
    return driveList
  }, [driveList])

  // Build options for selects
  const fastTierOptions = useMemo(() => {
    return fastTierDrives.map((drive) => ({
      value: drive.id,
      label: `${drive.model} (${formatBytes(drive.capacity_raw)}) - ${drive.type}`,
    }))
  }, [fastTierDrives, formatBytes])

  const capacityTierOptions = useMemo(() => {
    return capacityTierDrives.map((drive) => ({
      value: drive.id,
      label: `${drive.model} (${formatBytes(drive.capacity_raw)}) - ${drive.type}`,
    }))
  }, [capacityTierDrives, formatBytes])

  // Get selected drives
  const selectedFastDrive = drives[config.fastTier.driveId]
  const selectedCapacityDrive = drives[config.capacityTier.driveId]

  // Calculate totals
  const totalFastDrives = config.fastTier.driveCount * serverCount
  const totalCapacityDrives = config.capacityTier.driveCount * serverCount
  const totalFastCapacity = selectedFastDrive ? selectedFastDrive.capacity_raw * totalFastDrives : 0
  const totalCapacityCapacity = selectedCapacityDrive
    ? selectedCapacityDrive.capacity_raw * totalCapacityDrives
    : 0

  // Calculate cache ratio
  const cacheRatio =
    totalCapacityCapacity > 0 ? (totalFastCapacity / totalCapacityCapacity) * 100 : 0

  // Determine if ratio is healthy (10-20% is ideal for S2D/vSAN)
  const ratioStatus = cacheRatio < 5 ? 'low' : cacheRatio > 30 ? 'high' : 'optimal'
  const ratioColor =
    ratioStatus === 'optimal'
      ? 'text-green-400'
      : ratioStatus === 'low'
        ? 'text-orange-400'
        : 'text-yellow-400'

  return (
    <div className="space-y-4">
      {/* Fast Tier Section */}
      <div className="space-y-3 p-3 bg-surface-800 rounded-lg">
        <h5 className="text-sm font-medium text-blue-400">{labels.fastTier}</h5>
        <p className="text-xs text-slate-500">{labels.fastTierHint}</p>

        <div className="space-y-2">
          <Label htmlFor="fast-tier-drive">Drive Model</Label>
          <Select
            id="fast-tier-drive"
            value={config.fastTier.driveId}
            options={fastTierOptions}
            onChange={(driveId) => onChange({ fastTier: { ...config.fastTier, driveId } })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fast-tier-count" hint={`Total: ${totalFastDrives} drives`}>
            Drives per Server
          </Label>
          <Slider
            id="fast-tier-count"
            value={config.fastTier.driveCount}
            min={1}
            max={8}
            onChange={(driveCount) => onChange({ fastTier: { ...config.fastTier, driveCount } })}
          />
        </div>

        {selectedFastDrive && (
          <div className="text-xs text-slate-400">
            Fast Tier Capacity:{' '}
            <span className="text-white font-medium">{formatBytes(totalFastCapacity)}</span>
          </div>
        )}
      </div>

      {/* Capacity Tier Section */}
      <div className="space-y-3 p-3 bg-surface-800 rounded-lg">
        <h5 className="text-sm font-medium text-emerald-400">{labels.capacityTier}</h5>
        <p className="text-xs text-slate-500">{labels.capacityTierHint}</p>

        <div className="space-y-2">
          <Label htmlFor="capacity-tier-drive">Drive Model</Label>
          <Select
            id="capacity-tier-drive"
            value={config.capacityTier.driveId}
            options={capacityTierOptions}
            onChange={(driveId) => onChange({ capacityTier: { ...config.capacityTier, driveId } })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="capacity-tier-count" hint={`Total: ${totalCapacityDrives} drives`}>
            Drives per Server
          </Label>
          <Slider
            id="capacity-tier-count"
            value={config.capacityTier.driveCount}
            min={1}
            max={24}
            onChange={(driveCount) =>
              onChange({ capacityTier: { ...config.capacityTier, driveCount } })
            }
          />
        </div>

        {selectedCapacityDrive && (
          <div className="text-xs text-slate-400">
            Capacity Tier:{' '}
            <span className="text-white font-medium">{formatBytes(totalCapacityCapacity)}</span>
          </div>
        )}
      </div>

      {/* Cache Mode */}
      {showCacheMode && (
        <div className="space-y-2">
          <Label>Cache Mode</Label>
          <SegmentedControl
            value={config.cacheMode}
            options={[
              { value: 'write-back', label: 'Write-Back' },
              { value: 'write-through', label: 'Write-Through' },
              { value: 'read-only', label: 'Read-Only' },
            ]}
            onChange={(cacheMode) =>
              onChange({ cacheMode: cacheMode as TieringConfig['cacheMode'] })
            }
          />
          <p className="text-xs text-slate-500">
            {config.cacheMode === 'write-back'
              ? 'Best performance, requires battery backup or power protection'
              : config.cacheMode === 'write-through'
                ? 'Safer writes, lower write performance'
                : 'Cache reads only, writes go directly to capacity tier'}
          </p>
        </div>
      )}

      {/* Working Set */}
      {showWorkingSet && (
        <div className="space-y-2">
          <Label hint={`${config.workingSetPercent}%`}>Working Set Size</Label>
          <Slider
            id="working-set"
            value={config.workingSetPercent}
            min={5}
            max={50}
            onChange={(workingSetPercent) => onChange({ workingSetPercent })}
          />
          <p className="text-xs text-slate-500">
            Percentage of data that is frequently accessed (hot data)
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="pt-3 border-t border-surface-700">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-400">Total Drives:</div>
          <div className="text-right font-medium text-white">
            {totalFastDrives + totalCapacityDrives}
          </div>
          <div className="text-slate-400">Cache Ratio:</div>
          <div className={`text-right font-medium ${ratioColor}`}>
            {cacheRatio.toFixed(1)}%
            <span className="text-xs ml-1">
              ({ratioStatus === 'optimal' ? '✓' : ratioStatus === 'low' ? '↓' : '↑'})
            </span>
          </div>
          <div className="text-slate-400">Recommended:</div>
          <div className="text-right text-xs text-slate-500">10-20%</div>
        </div>
      </div>
    </div>
  )
}
