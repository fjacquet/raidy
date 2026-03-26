/**
 * Connectivity Constraints Tests
 *
 * Validates getConnectivityConstraint logic for all topology types:
 * NVMe-only (PowerStore, vSAN ESA), Flash-only (PowerFlex, Nutanix All-Flash,
 * vSAN OSA All-Flash), and unrestricted topologies.
 *
 * Reference: Phase 13 Plan 01 Task 2 — raise test coverage to >= 75%.
 */

import {
  type ConnectivityConstraintInput,
  getConnectivityConstraint,
} from '@utils/connectivityConstraints'
import { describe, expect, it } from 'vitest'

describe('connectivityConstraints', () => {
  describe('NVMe-only topologies', () => {
    it('returns nvme_only constraint for powerstore', () => {
      const input: ConnectivityConstraintInput = { topologyType: 'powerstore' }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('nvme_only')
      expect(result.validOptions).toEqual(['nvme'])
      expect(result.reasonKey).toContain('powerstore')
    })

    it('returns nvme_only constraint for vsan_esa', () => {
      const input: ConnectivityConstraintInput = { topologyType: 'vsan_esa' }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('nvme_only')
      expect(result.validOptions).toEqual(['nvme'])
      expect(result.reasonKey).toContain('vsan_esa')
    })

    it('includes topology type in reasonKey for nvme_only', () => {
      const ps = getConnectivityConstraint({ topologyType: 'powerstore' })
      expect(ps.reasonKey).toBe('connectivity.nvmeRequired.powerstore')

      const esa = getConnectivityConstraint({ topologyType: 'vsan_esa' })
      expect(esa.reasonKey).toBe('connectivity.nvmeRequired.vsan_esa')
    })
  })

  describe('Flash-only topologies', () => {
    it('returns flash_only constraint for powerflex', () => {
      const input: ConnectivityConstraintInput = { topologyType: 'powerflex' }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('flash_only')
      expect(result.validOptions).toEqual(['all', 'nvme', 'sas', 'sata'])
      expect(result.reasonKey).toContain('powerflex')
    })

    it('excludes hdd from powerflex valid options', () => {
      const result = getConnectivityConstraint({ topologyType: 'powerflex' })
      expect(result.validOptions).not.toContain('hdd')
    })

    it('returns flash_only for nutanix with all-flash cluster type', () => {
      const input: ConnectivityConstraintInput = {
        topologyType: 'nutanix',
        nutanixOptions: { clusterType: 'all-flash' } as any,
      }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('flash_only')
      expect(result.validOptions).toEqual(['all', 'nvme', 'sas', 'sata'])
      expect(result.reasonKey).toContain('nutanix')
    })

    it('returns flash_only for vsan_osa with all-flash disk group mode', () => {
      const input: ConnectivityConstraintInput = {
        topologyType: 'vsan_osa',
        vsanOptions: { diskGroupMode: 'all-flash' } as any,
      }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('flash_only')
      expect(result.validOptions).toEqual(['all', 'nvme', 'sas', 'sata'])
      expect(result.reasonKey).toContain('vsan_osa')
    })
  })

  describe('No restriction', () => {
    it('returns none constraint for standard topology', () => {
      const result = getConnectivityConstraint({ topologyType: 'standard' })
      expect(result.constraint).toBe('none')
      expect(result.validOptions).toEqual(['all', 'nvme', 'sas', 'sata', 'hdd'])
      expect(result.reasonKey).toBeNull()
    })

    it('returns none constraint for zfs topology', () => {
      const result = getConnectivityConstraint({ topologyType: 'zfs' })
      expect(result.constraint).toBe('none')
      expect(result.reasonKey).toBeNull()
    })

    it('returns none constraint for ceph topology', () => {
      const result = getConnectivityConstraint({ topologyType: 'ceph' })
      expect(result.constraint).toBe('none')
      expect(result.reasonKey).toBeNull()
    })

    it('returns none for nutanix with hybrid cluster type', () => {
      const input: ConnectivityConstraintInput = {
        topologyType: 'nutanix',
        nutanixOptions: { clusterType: 'hybrid' } as any,
      }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('none')
      expect(result.validOptions).toContain('hdd')
    })

    it('returns none for vsan_osa without all-flash disk group mode', () => {
      const input: ConnectivityConstraintInput = {
        topologyType: 'vsan_osa',
        vsanOptions: { diskGroupMode: 'hybrid' } as any,
      }
      const result = getConnectivityConstraint(input)
      expect(result.constraint).toBe('none')
    })

    it('returns none for nutanix without nutanixOptions', () => {
      const result = getConnectivityConstraint({ topologyType: 'nutanix' })
      expect(result.constraint).toBe('none')
    })

    it('returns none for vsan_osa without vsanOptions', () => {
      const result = getConnectivityConstraint({ topologyType: 'vsan_osa' })
      expect(result.constraint).toBe('none')
    })

    it('includes hdd in validOptions for unrestricted topologies', () => {
      const result = getConnectivityConstraint({ topologyType: 'standard' })
      expect(result.validOptions).toEqual(
        expect.arrayContaining(['all', 'nvme', 'sas', 'sata', 'hdd']),
      )
    })

    it('has null reasonKey for unrestricted topologies', () => {
      const topologies = ['standard', 'zfs', 'ceph'] as const
      for (const topo of topologies) {
        const result = getConnectivityConstraint({ topologyType: topo })
        expect(result.reasonKey).toBeNull()
      }
    })
  })
})
