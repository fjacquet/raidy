/**
 * Advanced configuration slice for Zustand store.
 */

import type { StateCreator } from 'zustand'
import type {
  AdvancedState,
  CarbonRegion,
  FilesystemState,
  NetworkSpeed,
  PCIeGen,
  PCIeLanes,
} from '@/types'

export interface AdvancedSlice extends AdvancedState, FilesystemState {
  // Advanced actions
  setCompressionRatio: (ratio: number) => void
  setDedupRatio: (ratio: number) => void
  setNetworkSpeed: (speed: NetworkSpeed) => void
  setPcieGen: (gen: PCIeGen) => void
  setPcieLanes: (lanes: PCIeLanes) => void
  setPue: (pue: number) => void
  setCarbonRegion: (region: CarbonRegion) => void
  setProjectYears: (years: number) => void
  setElectricityCost: (cost: number) => void
  setUnitSystem: (system: 'binary' | 'decimal') => void

  // Filesystem actions
  setFsType: (type: FilesystemState['fsType']) => void
  setSupportsReflink: (supports: boolean) => void
  setBackupRetention: (count: number) => void
  setDailyChangeRate: (rate: number) => void
}

export const createAdvancedSlice: StateCreator<AdvancedSlice> = (set) => ({
  // Default advanced state
  compressionRatio: 1.5,
  dedupRatio: 1.0,
  networkSpeed: '25GbE',
  pcieGen: 'gen4',
  pcieLanes: 'x8',
  pue: 1.4,
  carbonRegion: 'switzerland',
  projectYears: 5,
  electricityCostPerKwh: 0.12,
  unitSystem: 'binary', // Default to binary (TiB/GiB) - more accurate for storage

  // Default filesystem state
  fsType: 'zfs',
  supportsReflink: true,
  backupRetention: 14,
  dailyChangeRate: 5,

  // Advanced actions
  setCompressionRatio: (compressionRatio) =>
    set({ compressionRatio: Math.max(1.0, compressionRatio) }),
  setDedupRatio: (dedupRatio) => set({ dedupRatio: Math.max(1.0, dedupRatio) }),
  setNetworkSpeed: (networkSpeed) => set({ networkSpeed }),
  setPcieGen: (pcieGen) => set({ pcieGen }),
  setPcieLanes: (pcieLanes) => set({ pcieLanes }),
  setPue: (pue) => set({ pue: Math.max(1.0, pue) }),
  setCarbonRegion: (carbonRegion) => set({ carbonRegion }),
  setProjectYears: (projectYears) => set({ projectYears: Math.max(1, projectYears) }),
  setElectricityCost: (electricityCostPerKwh) =>
    set({ electricityCostPerKwh: Math.max(0, electricityCostPerKwh) }),
  setUnitSystem: (unitSystem) => set({ unitSystem }),

  // Filesystem actions
  setFsType: (fsType) => set({ fsType }),
  setSupportsReflink: (supportsReflink) => set({ supportsReflink }),
  setBackupRetention: (backupRetention) => set({ backupRetention: Math.max(1, backupRetention) }),
  setDailyChangeRate: (dailyChangeRate) =>
    set({ dailyChangeRate: Math.min(100, Math.max(0, dailyChangeRate)) }),
})
