/**
 * Independent backup calculation hook with focused dependencies.
 * Only re-runs when backup-related config changes.
 */

import { useMemo } from 'react'
import { calculateBackup } from '@/engines/backup'
import { useConfigStore } from '@/store'
import type { BackupResult } from '@/types/results'

/**
 * Hook that calculates backup storage requirements.
 * Memoized with only backup-related dependencies.
 * Accepts usableCapacity from volumetry as a parameter.
 */
export function useBackupCalc(usableCapacity: number): BackupResult {
  const { backupRetention, dailyChangeRate } = useConfigStore()

  return useMemo(() => {
    try {
      return calculateBackup({
        usableCapacity,
        dailyChangeRate,
        backupRetention,
      })
    } catch (error) {
      console.error('[Backup Engine Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        context: {
          usableCapacity,
          dailyChangeRate,
          backupRetention,
        },
        timestamp: new Date().toISOString(),
      })

      // Return safe fallback state
      return {
        dailyChange: 0,
        incrementalRaw: 0,
        fullRaw: 0,
        totalRaw: 0,
        retentionDays: backupRetention,
        changeRatePercent: dailyChangeRate,
      }
    }
  }, [usableCapacity, dailyChangeRate, backupRetention])
}
