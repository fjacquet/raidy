/**
 * Workload configuration slice for Zustand store.
 */

import type { StateCreator } from 'zustand'
import type { BlockSize, WorkloadState } from '@/types'

export interface WorkloadSlice extends WorkloadState {
  setReadPercent: (percent: number) => void
  setBlockSize: (size: BlockSize) => void
  setRandomPercent: (percent: number) => void
  setDatasetSize: (bytes: number) => void
  setDailyWriteVolume: (bytes: number) => void
}

// 1 TB in bytes
const TB = 1024 * 1024 * 1024 * 1024

export const createWorkloadSlice: StateCreator<WorkloadSlice> = (set) => ({
  // Default state
  readPercent: 70,
  blockSize: '64K',
  randomPercent: 50,
  datasetSize: 100 * TB,
  dailyWriteVolume: 1 * TB,

  // Actions
  setReadPercent: (readPercent) => set({ readPercent: Math.min(100, Math.max(0, readPercent)) }),
  setBlockSize: (blockSize) => set({ blockSize }),
  setRandomPercent: (randomPercent) =>
    set({ randomPercent: Math.min(100, Math.max(0, randomPercent)) }),
  setDatasetSize: (datasetSize) => set({ datasetSize: Math.max(0, datasetSize) }),
  setDailyWriteVolume: (dailyWriteVolume) =>
    set({ dailyWriteVolume: Math.max(0, dailyWriteVolume) }),
})
