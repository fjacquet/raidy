/**
 * Sustainability Engine Tests
 *
 * Validates calculateSustainability and calculateTCO against expected formulas:
 * - Power breakdown: drives + servers + cooling (PUE)
 * - Annual energy (kWh), CO2 emissions (kg), energy cost
 * - Flash endurance analysis (SSD vs HDD)
 * - TCO: hardware + energy + maintenance + replacement costs
 */

import {
  calculateSustainability,
  calculateTCO,
  type SustainabilityInput,
} from '@engines/sustainability'
import { describe, expect, it } from 'vitest'
import type { Drive } from '@/types/drive'

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const testSsdDrive: Drive = {
  id: 'test-ssd',
  model: 'Test SSD 1TB',
  type: 'SSD_NVMe',
  formFactor: '2.5"',
  interface: 'PCIe4',
  capacity_raw: 1_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 500000,
    iops_write: 400000,
    bandwidth_read_mb: 3500,
    bandwidth_write_mb: 3000,
  },
  reliability: { ure_rate: 17, afr: 0.5, dwpd: 3, mtbf_hours: 2000000 },
  power: { idle_watts: 3, load_watts: 8 },
  cost_usd: 200,
}

const testHddDrive: Drive = {
  id: 'test-hdd',
  model: 'Test HDD 4TB',
  type: 'HDD',
  formFactor: '3.5"',
  interface: 'SATA',
  capacity_raw: 4_000_000_000_000,
  sector_size: 512,
  performance: {
    iops_read: 200,
    iops_write: 180,
    bandwidth_read_mb: 250,
    bandwidth_write_mb: 220,
  },
  reliability: { ure_rate: 15, afr: 1.0, dwpd: 0, mtbf_hours: 1000000 },
  power: { idle_watts: 5, load_watts: 10 },
  cost_usd: 80,
}

const baseInput: SustainabilityInput = {
  drive: testSsdDrive,
  driveCount: 10,
  serverCount: 2,
  serverPowerWatts: 500,
  pue: 1.4,
  carbonRegion: 'switzerland',
  projectYears: 5,
  electricityCostPerKwh: 0.15,
  dailyWriteVolume: 100_000_000_000,
  usableCapacity: 8_000_000_000_000,
}

// ─── calculateSustainability ────────────────────────────────────────────────

describe('calculateSustainability', () => {
  describe('power breakdown', () => {
    it('calculates drive power as weighted average of idle and load', () => {
      const result = calculateSustainability(baseInput)
      // avgDrivePower = 3 * 0.3 + 8 * 0.7 = 0.9 + 5.6 = 6.5 W
      // drivePower = 6.5 * 10 = 65 W
      expect(result.powerBreakdown.drives).toBeCloseTo(65, 1)
    })

    it('calculates server power as serverPowerWatts * serverCount', () => {
      const result = calculateSustainability(baseInput)
      // servers = 500 * 2 = 1000 W
      expect(result.powerBreakdown.servers).toBeCloseTo(1000, 1)
    })

    it('calculates cooling from PUE overhead', () => {
      const result = calculateSustainability(baseInput)
      // itLoad = 65 + 1000 = 1065 W
      // cooling = 1065 * (1.4 - 1) = 1065 * 0.4 = 426 W
      expect(result.powerBreakdown.cooling).toBeCloseTo(426, 0)
    })

    it('calculates total power as itLoad * PUE', () => {
      const result = calculateSustainability(baseInput)
      // total = 1065 * 1.4 = 1491 W
      expect(result.powerBreakdown.total).toBeCloseTo(1491, 0)
    })

    it('satisfies total = drives + servers + cooling', () => {
      const result = calculateSustainability(baseInput)
      const sum =
        result.powerBreakdown.drives + result.powerBreakdown.servers + result.powerBreakdown.cooling
      expect(result.powerBreakdown.total).toBeCloseTo(sum, 1)
    })
  })

  describe('annual energy', () => {
    it('calculates annualEnergyKwh from total power and hours per year', () => {
      const result = calculateSustainability(baseInput)
      // annualEnergyKwh = 1491 * 8760 / 1000 = 13061.16 kWh
      expect(result.annualEnergyKwh).toBeCloseTo(13061.16, 0)
    })

    it('calculates annualEnergyCost as annualEnergyKwh * electricityCostPerKwh', () => {
      const result = calculateSustainability(baseInput)
      // annualEnergyCost = 13061.16 * 0.15 = 1959.174
      expect(result.annualEnergyCost).toBeCloseTo(result.annualEnergyKwh * 0.15, 2)
    })
  })

  describe('CO2 emissions', () => {
    it('calculates annualCO2Kg for switzerland (30 gCO2/kWh)', () => {
      const result = calculateSustainability(baseInput)
      // annualCO2Kg = 13061.16 * 30 / 1000 = 391.83 kg
      expect(result.annualCO2Kg).toBeCloseTo((result.annualEnergyKwh * 30) / 1000, 2)
    })

    it('produces higher CO2 for germany (385 gCO2/kWh) vs switzerland (30)', () => {
      const swissResult = calculateSustainability({ ...baseInput, carbonRegion: 'switzerland' })
      const germanResult = calculateSustainability({ ...baseInput, carbonRegion: 'germany' })

      expect(germanResult.annualCO2Kg).toBeGreaterThan(swissResult.annualCO2Kg)
      // Ratio should be roughly 385/30 = 12.83
      const ratio = germanResult.annualCO2Kg / swissResult.annualCO2Kg
      expect(ratio).toBeCloseTo(385 / 30, 1)
    })
  })

  describe('flash endurance', () => {
    it('returns flashEndurance object for SSD with dwpd > 0', () => {
      const result = calculateSustainability(baseInput)
      expect(result.flashEndurance).toBeDefined()
      expect(result.flashEndurance!.ratedDwpd).toBe(3)
      expect(result.flashEndurance!.requiredDwpd).toBeGreaterThan(0)
    })

    it('returns undefined flashEndurance for HDD drives', () => {
      const result = calculateSustainability({ ...baseInput, drive: testHddDrive })
      expect(result.flashEndurance).toBeUndefined()
    })

    it('returns undefined flashEndurance for SSD with dwpd === 0', () => {
      const zeroDwpdDrive: Drive = {
        ...testSsdDrive,
        reliability: { ...testSsdDrive.reliability, dwpd: 0 },
      }
      const result = calculateSustainability({ ...baseInput, drive: zeroDwpdDrive })
      expect(result.flashEndurance).toBeUndefined()
    })

    it('calculates utilizationPercent as (requiredDwpd / ratedDwpd) * 100', () => {
      const result = calculateSustainability(baseInput)
      const expected =
        (result.flashEndurance!.requiredDwpd / result.flashEndurance!.ratedDwpd) * 100
      expect(result.flashEndurance!.utilizationPercent).toBeCloseTo(expected, 2)
    })

    it('sets surviveProject true when expected life > project years', () => {
      // With low daily write volume and high DWPD, drive should survive
      const lowWriteInput: SustainabilityInput = {
        ...baseInput,
        dailyWriteVolume: 1_000_000_000, // 1 GB/day, very low
      }
      const result = calculateSustainability(lowWriteInput)
      expect(result.flashEndurance).toBeDefined()
      expect(result.flashEndurance!.surviveProject).toBe(true)
      expect(result.flashEndurance!.expectedLifeYears).toBeGreaterThan(5)
    })
  })

  it('returns annualEnergyKwh > 0 for valid input', () => {
    const result = calculateSustainability(baseInput)
    expect(result.annualEnergyKwh).toBeGreaterThan(0)
  })
})

// ─── calculateTCO ───────────────────────────────────────────────────────────

describe('calculateTCO', () => {
  // Pre-calculate sustainability for TCO tests
  const sustainability = calculateSustainability(baseInput)

  it('calculates hardwareCost as drive.cost_usd * driveCount', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    // 200 * 10 = 2000
    expect(tco.hardwareCost).toBe(2000)
  })

  it('calculates totalEnergyCost as annualEnergyCost * projectYears', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    expect(tco.totalEnergyCost).toBeCloseTo(sustainability.annualEnergyCost * 5, 2)
  })

  it('calculates maintenanceCost as hardwareCost * 0.1 * projectYears', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    // 2000 * 0.1 * 5 = 1000
    expect(tco.maintenanceCost).toBeCloseTo(1000, 2)
  })

  it('calculates replacementCost based on AFR and drive cost', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    // AFR = 0.5/100 = 0.005, expectedFailures = 10 * 0.005 * 5 = 0.25
    // replacementCost = 0.25 * 200 = 50
    expect(tco.replacementCost).toBeCloseTo(50, 2)
  })

  it('calculates totalCost as sum of all cost components', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    const sum = tco.hardwareCost + tco.totalEnergyCost + tco.maintenanceCost + tco.replacementCost
    expect(tco.totalCost).toBeCloseTo(sum, 2)
  })

  it('returns costPerTB > 0 when usableCapacity > 0', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    expect(tco.costPerTB).toBeGreaterThan(0)
  })

  it('returns costPerEffectiveTB > 0 when effectiveCapacity > 0', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    expect(tco.costPerEffectiveTB).toBeGreaterThan(0)
  })

  it('returns annualOpex > 0', () => {
    const tco = calculateTCO(testSsdDrive, 10, 5, sustainability, 8e12, 16e12)
    expect(tco.annualOpex).toBeGreaterThan(0)
  })
})
