/**
 * Topology configuration slice for Zustand store.
 */

import type { StateCreator } from 'zustand'
import type {
  CephOptions,
  DellOptions,
  NetAppOptions,
  PowerFlexOptions,
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
  DEFAULT_DELL_OPTIONS,
  DEFAULT_NETAPP_OPTIONS,
  DEFAULT_POWERFLEX_OPTIONS,
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
  setDellOptions: (options: Partial<DellOptions>) => void
  setCephOptions: (options: Partial<CephOptions>) => void
  setPowerFlexOptions: (options: Partial<PowerFlexOptions>) => void
  setNetAppOptions: (options: Partial<NetAppOptions>) => void
  setSynologyOptions: (options: Partial<SynologyOptions>) => void
  setControllerOptions: (options: Partial<RaidControllerOptions>) => void
}

export const createTopologySlice: StateCreator<TopologySlice> = (set) => ({
  // Default state
  topology: { type: 'zfs', level: 'raidz2' },
  hotSpares: 1,
  zfsOptions: { ...DEFAULT_ZFS_OPTIONS },
  s2dOptions: { ...DEFAULT_S2D_OPTIONS },
  vsanOptions: { ...DEFAULT_VSAN_OPTIONS },
  dellOptions: { ...DEFAULT_DELL_OPTIONS },
  cephOptions: { ...DEFAULT_CEPH_OPTIONS },
  powerFlexOptions: { ...DEFAULT_POWERFLEX_OPTIONS },
  netAppOptions: { ...DEFAULT_NETAPP_OPTIONS },
  synologyOptions: { ...DEFAULT_SYNOLOGY_OPTIONS },
  controllerOptions: { ...DEFAULT_CONTROLLER_OPTIONS },

  // Actions
  setTopology: (topology) => set({ topology }),
  setHotSpares: (hotSpares) => set({ hotSpares: Math.max(0, hotSpares) }),
  setZfsOptions: (options) => set((state) => ({ zfsOptions: { ...state.zfsOptions, ...options } })),
  setS2DOptions: (options) => set((state) => ({ s2dOptions: { ...state.s2dOptions, ...options } })),
  setVsanOptions: (options) =>
    set((state) => ({ vsanOptions: { ...state.vsanOptions, ...options } })),
  setDellOptions: (options) =>
    set((state) => ({ dellOptions: { ...state.dellOptions, ...options } })),
  setCephOptions: (options) =>
    set((state) => ({ cephOptions: { ...state.cephOptions, ...options } })),
  setPowerFlexOptions: (options) =>
    set((state) => ({ powerFlexOptions: { ...state.powerFlexOptions, ...options } })),
  setNetAppOptions: (options) =>
    set((state) => ({ netAppOptions: { ...state.netAppOptions, ...options } })),
  setSynologyOptions: (options) =>
    set((state) => ({ synologyOptions: { ...state.synologyOptions, ...options } })),
  setControllerOptions: (options) =>
    set((state) => ({ controllerOptions: { ...state.controllerOptions, ...options } })),
})
