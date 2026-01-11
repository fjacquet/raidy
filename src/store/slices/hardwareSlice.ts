/**
 * Hardware configuration slice for Zustand store.
 */

import type { StateCreator } from 'zustand'
import type { HardwareState } from '@/types'
import type { DriveConnectivity, FormFactorFilter } from '@/types/drive'

export interface HardwareSlice extends HardwareState {
  setDriveConnectivity: (connectivity: DriveConnectivity) => void
  setDriveFormFactor: (formFactor: FormFactorFilter) => void
  setDriveId: (id: string) => void
  setDriveCount: (count: number) => void
  setServerCount: (count: number) => void
  setServerPower: (watts: number) => void
}

export const createHardwareSlice: StateCreator<HardwareSlice> = (set) => ({
  // Default state
  driveConnectivity: 'all',
  driveFormFactor: 'all',
  driveId: 'wd-gold-24tb',
  driveCount: 12,
  serverCount: 1,
  serverPowerWatts: 400,

  // Actions
  setDriveConnectivity: (driveConnectivity) => set({ driveConnectivity }),
  setDriveFormFactor: (driveFormFactor) => set({ driveFormFactor }),
  setDriveId: (driveId) => set({ driveId }),
  setDriveCount: (driveCount) => set({ driveCount: Math.max(1, driveCount) }),
  setServerCount: (serverCount) => set({ serverCount: Math.max(1, serverCount) }),
  setServerPower: (serverPowerWatts) => set({ serverPowerWatts: Math.max(0, serverPowerWatts) }),
})
