/**
 * Backup Requirements Engine (Module E)
 *
 * Calculates incremental backup storage requirements based on
 * usable capacity, daily change rate, and retention period.
 */

import type { BackupResult } from '@/types/results'

export interface BackupInput {
  /** Usable capacity from volumetry in bytes */
  usableCapacity: number
  /** Daily change rate as percentage (0-100) */
  dailyChangeRate: number
  /** Number of backup retention days */
  backupRetention: number
}

/**
 * Calculate backup storage requirements.
 *
 * Formula:
 *   dailyChange = usableCapacity × (dailyChangeRate / 100)
 *   incrementalRaw = dailyChange × backupRetention
 *   totalRaw = incrementalRaw + fullRaw (fullRaw = 0 for v1)
 *
 * @param input - Backup calculation inputs
 * @returns BackupResult with calculated storage requirements
 */
export function calculateBackup(input: BackupInput): BackupResult {
  const { usableCapacity, dailyChangeRate, backupRetention } = input

  // Validate and clamp inputs
  const safeUsableCapacity = Math.max(0, usableCapacity)
  const safeChangeRate = Math.min(100, Math.max(0, dailyChangeRate))
  const safeRetention = Math.max(1, backupRetention)

  // Calculate daily change volume
  const dailyChange = safeUsableCapacity * (safeChangeRate / 100)

  // Calculate cumulative incremental backup storage
  const incrementalRaw = dailyChange * safeRetention

  // Full backup storage (v2 feature - for now, 0)
  const fullRaw = 0

  // Total backup storage required
  const totalRaw = incrementalRaw + fullRaw

  return {
    dailyChange,
    incrementalRaw,
    fullRaw,
    totalRaw,
    retentionDays: safeRetention,
    changeRatePercent: safeChangeRate,
  }
}
