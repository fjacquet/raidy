/**
 * Sustainability & TCO Engine (Module D)
 * Calculates power consumption, CO2 emissions, and total cost of ownership.
 */

import type { TieredCapacityResult } from '@/engines/shared/tiering'
import type { CarbonRegion } from '@/types/config'
import type { Drive } from '@/types/drive'
import type { SustainabilityResult, TCOResult } from '@/types/results'

export interface SustainabilityInput {
  drive: Drive
  driveCount: number
  serverCount: number
  serverPowerWatts: number
  pue: number
  carbonRegion: CarbonRegion
  projectYears: number
  electricityCostPerKwh: number
  dailyWriteVolume: number
  usableCapacity: number
  tiering?: TieredCapacityResult | null
}

/** Carbon intensity by region (gCO2/kWh) */
const CARBON_INTENSITY: Record<CarbonRegion, number> = {
  switzerland: 30,
  france: 56,
  norway: 26,
  germany: 385,
  usa_average: 386,
  china: 555,
  world_average: 475,
}

/** Hours per year */
const HOURS_PER_YEAR = 8760

/**
 * Calculate power consumption breakdown.
 */
function calculatePower(
  drive: Drive,
  driveCount: number,
  serverCount: number,
  serverPowerWatts: number,
  pue: number,
  tiering?: TieredCapacityResult | null,
): { drives: number; servers: number; cooling: number; total: number } {
  // Assume 70% average utilization for power calculation
  const avg = (d: Drive) => d.power.idle_watts * 0.3 + d.power.load_watts * 0.7

  let drivePower: number
  if (tiering?.cacheTierDrive && tiering?.capacityTierDrive) {
    // Tiered configuration: sum power from both cache and capacity tiers
    drivePower =
      avg(tiering.cacheTierDrive) * tiering.cacheTierDriveCount +
      avg(tiering.capacityTierDrive) * tiering.capacityTierDriveCount
  } else {
    // Single-tier (non-tiered) configuration: original behavior
    drivePower = avg(drive) * driveCount
  }

  // Server power (excluding drives)
  const serverPower = serverPowerWatts * serverCount

  // IT load (drives + servers)
  const itLoad = drivePower + serverPower

  // Cooling overhead from PUE
  // PUE = Total Facility Power / IT Equipment Power
  // So cooling = Total - IT = IT * (PUE - 1)
  const coolingPower = itLoad * (pue - 1)

  // Total facility power
  const totalPower = itLoad + coolingPower

  return {
    drives: drivePower,
    servers: serverPower,
    cooling: coolingPower,
    total: totalPower,
  }
}

/**
 * Calculate SSD endurance analysis.
 */
function calculateFlashEndurance(
  drive: Drive,
  dailyWriteVolume: number,
  _usableCapacity: number,
  projectYears: number,
  tiering?: TieredCapacityResult | null,
): SustainabilityResult['flashEndurance'] | undefined {
  // When tiering is present and the cache tier is an SSD with a DWPD rating,
  // compute endurance on the cache drive (write-back cache absorbs all writes).
  if (
    tiering?.cacheTierDrive?.type.startsWith('SSD') &&
    tiering.cacheTierDrive.reliability.dwpd > 0
  ) {
    const enduranceDrive = tiering.cacheTierDrive
    const enduranceCount = tiering.cacheTierDriveCount

    // Spread workload evenly across cache drives
    const perDriveDailyWrites = dailyWriteVolume / enduranceCount
    const requiredDwpd = perDriveDailyWrites / enduranceDrive.capacity_raw
    const ratedDwpd = enduranceDrive.reliability.dwpd

    const warrantyYears = 5
    const tbw = (enduranceDrive.capacity_raw * ratedDwpd * 365 * warrantyYears) / 1024 ** 4
    const annualWritesTB = (perDriveDailyWrites * 365) / 1024 ** 4
    const expectedLifeYears = annualWritesTB > 0 ? tbw / annualWritesTB : 100

    const surviveProject = expectedLifeYears >= projectYears
    const utilizationPercent = (requiredDwpd / ratedDwpd) * 100

    return {
      requiredDwpd,
      ratedDwpd,
      expectedLifeYears,
      surviveProject,
      utilizationPercent,
    }
  }

  // Non-tiered path — original behavior, byte-for-byte identical.

  // Only applicable to SSDs
  if (!drive.type.startsWith('SSD')) {
    return undefined
  }

  // If drive has no DWPD rating, skip
  if (!drive.reliability.dwpd || drive.reliability.dwpd === 0) {
    return undefined
  }

  // Calculate required DWPD based on workload
  // DWPD = (Daily Write Volume) / (Drive Capacity)
  const requiredDwpd = dailyWriteVolume / drive.capacity_raw

  const ratedDwpd = drive.reliability.dwpd

  // Calculate expected lifespan
  // TBW = Capacity * DWPD * 365 * Warranty Years (typically 5)
  // Actual lifespan = TBW / (Daily Write Volume * 365)
  const warrantyYears = 5
  const tbw = (drive.capacity_raw * ratedDwpd * 365 * warrantyYears) / 1024 ** 4
  const annualWritesTB = (dailyWriteVolume * 365) / 1024 ** 4
  const expectedLifeYears = annualWritesTB > 0 ? tbw / annualWritesTB : 100

  const surviveProject = expectedLifeYears >= projectYears
  const utilizationPercent = (requiredDwpd / ratedDwpd) * 100

  return {
    requiredDwpd,
    ratedDwpd,
    expectedLifeYears,
    surviveProject,
    utilizationPercent,
  }
}

/**
 * Calculate sustainability metrics.
 */
export function calculateSustainability(input: SustainabilityInput): SustainabilityResult {
  const {
    drive,
    driveCount,
    serverCount,
    serverPowerWatts,
    pue,
    carbonRegion,
    projectYears,
    electricityCostPerKwh,
    dailyWriteVolume,
    usableCapacity,
    tiering,
  } = input

  // Power breakdown
  const powerBreakdown = calculatePower(
    drive,
    driveCount,
    serverCount,
    serverPowerWatts,
    pue,
    tiering,
  )

  // Annual energy consumption (kWh)
  const annualEnergyKwh = (powerBreakdown.total * HOURS_PER_YEAR) / 1000

  // Annual energy cost
  const annualEnergyCost = annualEnergyKwh * electricityCostPerKwh

  // Annual CO2 emissions (kg)
  const carbonIntensity = CARBON_INTENSITY[carbonRegion]
  const annualCO2Kg = (annualEnergyKwh * carbonIntensity) / 1000

  // Flash endurance analysis
  const flashEndurance = calculateFlashEndurance(
    drive,
    dailyWriteVolume,
    usableCapacity,
    projectYears,
    tiering,
  )

  return {
    annualEnergyKwh,
    annualEnergyCost,
    annualCO2Kg,
    powerBreakdown,
    flashEndurance,
  }
}

/**
 * Calculate Total Cost of Ownership.
 */
export function calculateTCO(
  drive: Drive,
  driveCount: number,
  projectYears: number,
  sustainability: SustainabilityResult,
  usableCapacity: number,
  effectiveCapacity: number,
): TCOResult {
  // Hardware cost
  const hardwareCost = drive.cost_usd * driveCount

  // Energy cost over project lifetime
  const totalEnergyCost = sustainability.annualEnergyCost * projectYears

  // Maintenance cost (estimate 10% of hardware cost per year)
  const annualMaintenanceRate = 0.1
  const maintenanceCost = hardwareCost * annualMaintenanceRate * projectYears

  // Drive replacement cost based on AFR (Annual Failure Rate)
  const afr = drive.reliability.afr / 100 // Convert from percentage
  const expectedFailures = driveCount * afr * projectYears
  const replacementCost = expectedFailures * drive.cost_usd

  // Total cost of ownership
  const totalCost = hardwareCost + totalEnergyCost + maintenanceCost + replacementCost

  // Cost per usable TB
  const usableTB = usableCapacity / 1024 ** 4
  const costPerTB = usableTB > 0 ? totalCost / usableTB : 0

  // Cost per effective TB (after compression/dedup)
  const effectiveTB = effectiveCapacity / 1024 ** 4
  const costPerEffectiveTB = effectiveTB > 0 ? totalCost / effectiveTB : 0

  // Annual operating cost
  const annualOpex =
    sustainability.annualEnergyCost +
    hardwareCost * annualMaintenanceRate +
    replacementCost / projectYears

  return {
    hardwareCost,
    totalEnergyCost,
    maintenanceCost,
    replacementCost,
    totalCost,
    costPerTB,
    costPerEffectiveTB,
    annualOpex,
  }
}
