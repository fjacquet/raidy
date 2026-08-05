/**
 * Under BeeGFS MDT tiering the worker must receive the CAPACITY TIER's media characteristics,
 * not the Hardware panel's drive.
 *
 * `useResilience` resolves `mediaDrive = beeGfsTiering?.capacityTierDrive ?? drive`. That line
 * was correct but unpinned: reverting it to `mediaDrive = drive` left the whole suite green,
 * while shipping a simulation that gives a 48-drive HDD capacity tier the NVMe metadata drive's
 * capacity, URE rate and AFR — wrong rebuild times and wrong failure probabilities.
 *
 * These tests drive the real hook through a stubbed Worker and assert on the payload it posts,
 * so the mutation fails here.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import drivesData from '@/data/drives.json'
import { useResilience } from '@/hooks/useResilience'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import type { Drive } from '@/types/drive'
import type { BeeGfsOptions } from '@/types/topology'
import type { SimulationInput } from '@/types/worker'
import { installMockWorker } from '../fixtures/mock-worker'

const drives = drivesData as Record<string, Drive>
const getDriveById = (id: string): Drive | undefined => drives[id]

/** Hardware panel drive: NVMe metadata media — 960 GB, AFR 0.5, URE 10^-17. */
const FAST_DRIVE_ID = 'ent-nvme-pcie4-960gb-m2-ri'
/** Capacity tier: 7.2k SATA HDD — 18 TB, AFR 0.44, URE 10^-15. Differs on all three. */
const CAPACITY_DRIVE_ID = 'ent-hdd-7k2-sata-18tb-cmr'

let posted: SimulationInput[] = []
let uninstall: () => void

function tieredOptions(): BeeGfsOptions {
  return {
    ...DEFAULT_BEEGFS_OPTIONS,
    drivesPerTarget: 12,
    storageBuddyMirror: false,
    metadataTargets: true,
    tiering: {
      enabled: false,
      fastTier: { driveId: FAST_DRIVE_ID, driveCount: 2 },
      capacityTier: { driveId: CAPACITY_DRIVE_ID, driveCount: 12 },
      workingSetPercent: 20,
    },
  }
}

function runWith(options: BeeGfsOptions | undefined): SimulationInput {
  const drive = getDriveById(FAST_DRIVE_ID)
  expect(drive).toBeDefined()
  const { result } = renderHook(() =>
    useResilience({
      drive: drive ?? null,
      driveCount: 28,
      serverCount: 4,
      hotSpares: 0,
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      simulationCount: 1000,
      tieringOptions: options ? { beeGfsOptions: options } : undefined,
    }),
  )
  act(() => {
    result.current.runSimulation()
  })
  expect(posted.length).toBe(1)
  const input = posted[0]
  if (!input) throw new Error('worker received no START payload')
  return input
}

describe('useResilience — BeeGFS media drive follows the capacity tier', () => {
  beforeEach(() => {
    ;({ posted, uninstall } = installMockWorker())
  })

  afterEach(() => {
    uninstall()
  })

  it('hands the worker the capacity tier capacity, URE rate and AFR under MDT tiering', () => {
    const capacityDrive = getDriveById(CAPACITY_DRIVE_ID)
    const hardwareDrive = getDriveById(FAST_DRIVE_ID)
    expect(capacityDrive).toBeDefined()
    expect(hardwareDrive).toBeDefined()
    // The premise: the two drives genuinely differ, so the assertions below are falsifiable.
    expect(capacityDrive?.capacity_raw).not.toBe(hardwareDrive?.capacity_raw)
    expect(capacityDrive?.reliability.afr).not.toBe(hardwareDrive?.reliability.afr)
    expect(capacityDrive?.reliability.ure_rate).not.toBe(hardwareDrive?.reliability.ure_rate)

    const input = runWith(tieredOptions())

    expect(input.driveCapacityBytes).toBe(capacityDrive?.capacity_raw)
    expect(input.afrPercent).toBe(capacityDrive?.reliability.afr)
    expect(input.ureRate).toBe(capacityDrive?.reliability.ure_rate)

    // Explicitly NOT the Hardware panel's drive — this is the assertion the mutation breaks.
    expect(input.driveCapacityBytes).not.toBe(hardwareDrive?.capacity_raw)
    expect(input.afrPercent).not.toBe(hardwareDrive?.reliability.afr)

    // And the population follows the capacity tier too: 12 drives x 4 servers = 4 targets.
    expect(input.serverCount).toBe(4)
    expect(input.driveCount).toBe(48)
  })

  it('falls back to the Hardware panel drive when MDT tiering is off', () => {
    const hardwareDrive = getDriveById(FAST_DRIVE_ID)
    const input = runWith({ ...DEFAULT_BEEGFS_OPTIONS, drivesPerTarget: 12 })

    expect(input.driveCapacityBytes).toBe(hardwareDrive?.capacity_raw)
    expect(input.afrPercent).toBe(hardwareDrive?.reliability.afr)
  })

  it('falls back to the Hardware panel drive for a non-BeeGFS topology', () => {
    const hardwareDrive = getDriveById(FAST_DRIVE_ID)
    const { result } = renderHook(() =>
      useResilience({
        drive: hardwareDrive ?? null,
        driveCount: 12,
        serverCount: 1,
        topology: { type: 'standard', level: 'RAID6' },
        simulationCount: 1000,
      }),
    )
    act(() => {
      result.current.runSimulation()
    })
    expect(posted[0]?.driveCapacityBytes).toBe(hardwareDrive?.capacity_raw)
  })
})
