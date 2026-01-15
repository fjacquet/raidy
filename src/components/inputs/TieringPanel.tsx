/**
 * Tiering configuration panel for platforms supporting cache + capacity tiers.
 * Used by S2D, vSAN OSA, and Ceph.
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  /** vSAN mode: hybrid (HDD capacity) or all-flash (SSD capacity) */
  vsanMode?: 'hybrid' | 'all-flash'
  /** Callback when vSAN mode changes */
  onVsanModeChange?: (mode: 'hybrid' | 'all-flash') => void
}

/** Drive type filter options for fast/cache tier (SSD/NVMe only) */
const FAST_TIER_TYPES: Drive['type'][] = ['SSD_NVMe', 'SSD_SAS', 'SSD_SATA']

/** HDD types for vSAN Hybrid capacity tier */
const HDD_TYPES: Drive['type'][] = ['HDD']

/** SSD types for vSAN All-Flash capacity tier */
const SSD_TYPES: Drive['type'][] = ['SSD_NVMe', 'SSD_SAS', 'SSD_SATA']

/** Get platform-specific labels using translations */
function usePlatformLabels(platform: TieringPanelProps['platform']) {
  const { t } = useTranslation('topology')
  return {
    fastTier: t(`tiering.${platform}.fastTier`),
    capacityTier: t(`tiering.${platform}.capacityTier`),
    fastTierHint: t(`tiering.${platform}.fastTierHint`),
    capacityTierHint: t(`tiering.${platform}.capacityTierHint`),
  }
}

export function TieringPanel({
  config,
  onChange,
  serverCount,
  platform,
  showCacheMode = true,
  showWorkingSet = true,
  vsanMode = 'hybrid',
  onVsanModeChange,
}: TieringPanelProps) {
  const { t } = useTranslation('topology')
  const formatBytes = useFormatBytes()
  const labels = usePlatformLabels(platform)

  // Get all drives as array
  const driveList = useMemo(() => Object.values(drives), [])

  // Filter drives for fast tier (NVMe/SSD only - same for all platforms)
  const fastTierDrives = useMemo(() => {
    return driveList.filter((drive) => FAST_TIER_TYPES.includes(drive.type))
  }, [driveList])

  // Filter drives for capacity tier based on platform and mode
  const capacityTierDrives = useMemo(() => {
    if (platform === 'vsan') {
      // vSAN OSA: Hybrid = HDD only, All-Flash = SSD only
      if (vsanMode === 'hybrid') {
        return driveList.filter((drive) => HDD_TYPES.includes(drive.type))
      }
      return driveList.filter((drive) => SSD_TYPES.includes(drive.type))
    }
    // S2D and Ceph: all drive types allowed for capacity
    return driveList
  }, [driveList, platform, vsanMode])

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
      {/* vSAN Mode Selector */}
      {platform === 'vsan' && onVsanModeChange && (
        <div className="space-y-2">
          <Label>{t('tiering.vsanConfig')}</Label>
          <SegmentedControl
            value={vsanMode}
            options={[
              { value: 'hybrid', label: t('tiering.hybrid') },
              { value: 'all-flash', label: t('tiering.allFlash') },
            ]}
            onChange={(mode) => onVsanModeChange(mode as 'hybrid' | 'all-flash')}
          />
          <p className="text-xs text-slate-500">
            {vsanMode === 'hybrid' ? t('tiering.hybridDesc') : t('tiering.allFlashDesc')}
          </p>
        </div>
      )}

      {/* Fast Tier Section */}
      <div className="space-y-3 p-3 bg-surface-800 rounded-lg">
        <h5 className="text-sm font-medium text-blue-400">{labels.fastTier}</h5>
        <p className="text-xs text-slate-500">{labels.fastTierHint}</p>

        <div className="space-y-2">
          <Label htmlFor="fast-tier-drive">{t('tiering.driveModel')}</Label>
          <Select
            id="fast-tier-drive"
            value={config.fastTier.driveId}
            options={fastTierOptions}
            onChange={(driveId) => onChange({ fastTier: { ...config.fastTier, driveId } })}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="fast-tier-count"
            hint={t('tiering.totalDrives', { count: totalFastDrives })}
          >
            {t('tiering.drivesPerServer')}
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
            {t('tiering.fastTierCapacity')}:{' '}
            <span className="text-white font-medium">{formatBytes(totalFastCapacity)}</span>
          </div>
        )}
      </div>

      {/* Capacity Tier Section */}
      <div className="space-y-3 p-3 bg-surface-800 rounded-lg">
        <h5 className="text-sm font-medium text-emerald-400">{labels.capacityTier}</h5>
        <p className="text-xs text-slate-500">{labels.capacityTierHint}</p>

        <div className="space-y-2">
          <Label htmlFor="capacity-tier-drive">{t('tiering.driveModel')}</Label>
          <Select
            id="capacity-tier-drive"
            value={config.capacityTier.driveId}
            options={capacityTierOptions}
            onChange={(driveId) => onChange({ capacityTier: { ...config.capacityTier, driveId } })}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="capacity-tier-count"
            hint={t('tiering.totalDrives', { count: totalCapacityDrives })}
          >
            {t('tiering.drivesPerServer')}
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
            {t('tiering.capacityTier')}:{' '}
            <span className="text-white font-medium">{formatBytes(totalCapacityCapacity)}</span>
          </div>
        )}
      </div>

      {/* Cache Mode */}
      {showCacheMode && (
        <div className="space-y-2">
          <Label>{t('tiering.cacheMode')}</Label>
          <SegmentedControl
            value={config.cacheMode}
            options={[
              { value: 'write-back', label: t('tiering.writeBack') },
              { value: 'write-through', label: t('tiering.writeThrough') },
              { value: 'read-only', label: t('tiering.readOnly') },
            ]}
            onChange={(cacheMode) =>
              onChange({ cacheMode: cacheMode as TieringConfig['cacheMode'] })
            }
          />
          <p className="text-xs text-slate-500">
            {t(`tiering.cacheModeDesc.${config.cacheMode.replace('-', '')}`)}
          </p>
        </div>
      )}

      {/* Working Set */}
      {showWorkingSet && (
        <div className="space-y-2">
          <Label hint={`${config.workingSetPercent}%`}>{t('tiering.workingSetSize')}</Label>
          <Slider
            id="working-set"
            value={config.workingSetPercent}
            min={5}
            max={50}
            onChange={(workingSetPercent) => onChange({ workingSetPercent })}
          />
          <p className="text-xs text-slate-500">{t('tiering.workingSetDesc')}</p>
        </div>
      )}

      {/* Summary */}
      <div className="pt-3 border-t border-surface-700">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-slate-400">{t('tiering.totalDrivesLabel')}:</div>
          <div className="text-right font-medium text-white">
            {totalFastDrives + totalCapacityDrives}
          </div>
          <div className="text-slate-400">{t('tiering.cacheRatio')}:</div>
          <div className={`text-right font-medium ${ratioColor}`}>
            {cacheRatio.toFixed(1)}%
            <span className="text-xs ml-1">
              ({ratioStatus === 'optimal' ? '✓' : ratioStatus === 'low' ? '↓' : '↑'})
            </span>
          </div>
          <div className="text-slate-400">{t('tiering.recommended')}:</div>
          <div className="text-right text-xs text-slate-500">10-20%</div>
        </div>
      </div>
    </div>
  )
}
