import { describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import { FORM_FACTOR_TO_TYPES } from '@/types/drive'
import type { Drive } from '@/types/drive'

const drives = drivesData as Record<string, Drive>
const all = Object.values(drives)

const VALID_TYPES = new Set(['HDD', 'SSD_SATA', 'SSD_SAS', 'SSD_NVMe'])
const VALID_FF = new Set(['2.5"', '3.5"', 'M.2', 'U.2', 'U.3', 'E1.S', 'E1.L', 'E3.S', 'E3.L'])
const VALID_IFACE = new Set(['SATA', 'SAS', 'PCIe3', 'PCIe4', 'PCIe5'])
const VALID_URE = new Set([14, 15, 16, 17])

describe('drive database invariants', () => {
  it('every drive has a valid type, form factor, interface and sane numbers', () => {
    for (const d of all) {
      expect(VALID_TYPES.has(d.type), `${d.id} type`).toBe(true)
      if (d.formFactor) expect(VALID_FF.has(d.formFactor), `${d.id} ff`).toBe(true)
      if (d.interface) expect(VALID_IFACE.has(d.interface), `${d.id} iface`).toBe(true)
      expect(VALID_URE.has(d.reliability.ure_rate), `${d.id} ure`).toBe(true)
      expect(d.capacity_raw, `${d.id} cap`).toBeGreaterThan(0)
      expect(d.sector_size === 512 || d.sector_size === 4096, `${d.id} sector`).toBe(true)
      expect(d.performance.iops_read, `${d.id} iops_read`).toBeGreaterThan(0)
      expect(d.performance.bandwidth_read_mb, `${d.id} bw`).toBeGreaterThan(0)
      expect(d.cost_usd, `${d.id} cost`).toBeGreaterThan(0)
    }
  })

  it('id matches the map key', () => {
    for (const [key, d] of Object.entries(drives)) expect(d.id).toBe(key)
  })

  it('AIC form factor is pruned (not in any filter)', () => {
    expect(FORM_FACTOR_TO_TYPES.all).not.toContain('AIC')
    for (const ffs of Object.values(FORM_FACTOR_TO_TYPES)) {
      expect(ffs).not.toContain('AIC')
    }
  })
})

describe('new HDD entries', () => {
  it('adds 20/22/26/28/30 TB drives with correct recording', () => {
    const cases: Array<[string, number, string]> = [
      ['ent-hdd-7k2-sata-20tb-cmr', 20_000_000_000_000, 'CMR'],
      ['ent-hdd-7k2-sas-22tb-cmr', 22_000_000_000_000, 'CMR'],
      ['ent-hdd-7k2-sata-26tb-smr', 26_000_000_000_000, 'SMR'],
      ['ent-hdd-7k2-sata-28tb-hamr', 28_000_000_000_000, 'HAMR'],
      ['ent-hdd-7k2-sata-30tb-hamr', 30_000_000_000_000, 'HAMR'],
    ]
    for (const [id, cap, rec] of cases) {
      const d = drives[id]
      expect(d, id).toBeDefined()
      expect(d.type).toBe('HDD')
      expect(d.capacity_raw).toBe(cap)
      expect(d.recording).toBe(rec)
      expect(d.rpm).toBe(7200)
    }
  })

  it('represents SMR and HAMR by at least two drives each', () => {
    const rec = (r: string) => Object.values(drives).filter((d) => d.recording === r).length
    expect(rec('SMR')).toBeGreaterThanOrEqual(2)
    expect(rec('HAMR')).toBeGreaterThanOrEqual(2)
  })
})
