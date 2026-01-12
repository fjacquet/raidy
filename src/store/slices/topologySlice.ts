/**
 * Topology configuration slice for Zustand store.
 */

import type { StateCreator } from 'zustand'
import type {
  CephOptions,
  NetAppOptions,
  NutanixOptions,
  ObjectScaleOptions,
  PowerFlexOptions,
  PowerScaleOptions,
  PowerStoreOptions,
  RaidControllerOptions,
  S2DOptions,
  SynologyOptions,
  Topology,
  TopologyState,
  VsanOptions,
  ZfsOptions,
} from '@/types'
import {
  DEFAULT_CEPH_OPTIONS,
  DEFAULT_CONTROLLER_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_NUTANIX_OPTIONS,
  DEFAULT_OBJECTSCALE_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
  DEFAULT_POWERSCALE_OPTIONS,
  DEFAULT_POWERSTORE_OPTIONS,
  DEFAULT_S2D_OPTIONS,
  DEFAULT_SYNOLOGY_OPTIONS,
  DEFAULT_VSAN_OPTIONS,
  DEFAULT_ZFS_OPTIONS,
} from '@/types'

export interface TopologySlice extends TopologyState {
  setTopology: (topology: Topology) => void
  setHotSpares: (count: number) => void
  setZfsOptions: (options: Partial<ZfsOptions>) => void
  setS2DOptions: (options: Partial<S2DOptions>) => void
  setVsanOptions: (options: Partial<VsanOptions>) => void
  setObjectScaleOptions: (options: Partial<ObjectScaleOptions>) => void
  setPowerStoreOptions: (options: Partial<PowerStoreOptions>) => void
  setPowerScaleOptions: (options: Partial<PowerScaleOptions>) => void
  setCephOptions: (options: Partial<CephOptions>) => void
  setPowerFlexOptions: (options: Partial<PowerFlexOptions>) => void
  setNetAppOptions: (options: Partial<NetAppOptions>) => void
  setSynologyOptions: (options: Partial<SynologyOptions>) => void
  setNutanixOptions: (options: Partial<NutanixOptions>) => void
  setControllerOptions: (options: Partial<RaidControllerOptions>) => void
}

export const createTopologySlice: StateCreator<TopologySlice> = (set) => ({
  // Default state - RAID 6 is the most common enterprise configuration
  topology: { type: 'standard', level: 'RAID6' },
  hotSpares: 1,
  zfsOptions: { ...DEFAULT_ZFS_OPTIONS },
  s2dOptions: { ...DEFAULT_S2D_OPTIONS },
  vsanOptions: { ...DEFAULT_VSAN_OPTIONS },
  objectscaleOptions: { ...DEFAULT_OBJECTSCALE_OPTIONS },
  powerstoreOptions: { ...DEFAULT_POWERSTORE_OPTIONS },
  powerscaleOptions: { ...DEFAULT_POWERSCALE_OPTIONS },
  cephOptions: { ...DEFAULT_CEPH_OPTIONS },
  powerFlexOptions: { ...DEFAULT_POWERFLEX_OPTIONS },
  netAppOptions: { ...DEFAULT_NETAPP_OPTIONS },
  synologyOptions: { ...DEFAULT_SYNOLOGY_OPTIONS },
  nutanixOptions: { ...DEFAULT_NUTANIX_OPTIONS },
  controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS },

  // Actions
  setTopology: (topology) => set({ topology }),
  setHotSpares: (hotSpares) => set({ hotSpares: Math.max(0, hotSpares) }),
  setZfsOptions: (options) => set((state) => ({ zfsOptions: { ...state.zfsOptions, ...options } })),
  setS2DOptions: (options) => set((state) => ({ s2dOptions: { ...state.s2dOptions, ...options } })),
  setVsanOptions: (options) =>
    set((state) => ({ vsanOptions: { ...state.vsanOptions, ...options } })),
  setObjectScaleOptions: (options) =>
    set((state) => ({ objectscaleOptions: { ...state.objectscaleOptions, ...options } })),
  setPowerStoreOptions: (options) =>
    set((state) => ({ powerstoreOptions: { ...state.powerstoreOptions, ...options } })),
  setPowerScaleOptions: (options) =>
    set((state) => ({ powerscaleOptions: { ...state.powerscaleOptions, ...options } })),
  setCephOptions: (options) =>
    set((state) => ({ cephOptions: { ...state.cephOptions, ...options } })),
  setPowerFlexOptions: (options) =>
    set((state) => ({ powerFlexOptions: { ...state.powerFlexOptions, ...options } })),
  setNetAppOptions: (options) =>
    set((state) => ({ netAppOptions: { ...state.netAppOptions, ...options } })),
  setSynologyOptions: (options) =>
    set((state) => ({ synologyOptions: { ...state.synologyOptions, ...options } })),
  setNutanixOptions: (options) =>
    set((state) => ({ nutanixOptions: { ...state.nutanixOptions, ...options } })),
  setControllerOptions: (options) =>
    set((state) => ({ controllerOptions: { ...state.controllerOptions, ...options } })),
})
