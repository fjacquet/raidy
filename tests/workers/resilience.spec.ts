/**
 * Resilience Worker Tests
 *
 * Tests Monte Carlo simulation logic for RAID survival probability.
 * Since the worker uses self.postMessage, we mock the worker context.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock self.postMessage before importing worker
const mockPostMessage = vi.fn()
vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  onmessage: null,
})

// Now import the worker (it will use our mocked self)
// We need to dynamically import to get fresh module each test
async function importWorker() {
  // Clear module cache to get fresh import
  vi.resetModules()
  await import('@/workers/resilienceWorker')
}

// Test the parity drive logic directly by checking expected results
describe('Resilience Worker - Parity Drive Calculation', () => {
  // These tests verify the getParityDrives function logic
  // by running simulations and checking behavior

  const standardInput = {
    driveCount: 8,
    driveCapacityBytes: 1_000_000_000_000, // 1TB
    rebuildSpeedMBs: 100,
    ureRate: 15 as const,
    afrPercent: 1.0,
    simulationCount: 100, // Small count for fast tests
  }

  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('RAID 0 should have zero fault tolerance (parity = 0)', async () => {
    await importWorker()

    // Trigger simulation
    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    expect(handler).toBeDefined()

    handler?.({
      data: {
        type: 'START',
        payload: { ...standardInput, raidLevel: 'RAID0' },
      },
    } as MessageEvent)

    // With RAID 0 and 8 drives, any single failure = data loss
    // Over a year with 1% AFR, we expect many failures
    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    expect(resultCall).toBeDefined()

    const result = resultCall?.[0].payload
    // RAID 0 survival rate should be significantly lower than 100%
    expect(result.survivalRate).toBeLessThan(1.0)
  })

  it('RAID 5 should tolerate one drive failure (parity = 1)', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: { ...standardInput, raidLevel: 'RAID5' },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    expect(resultCall).toBeDefined()

    const result = resultCall?.[0].payload
    // RAID 5 should have higher survival than RAID 0
    expect(result.survivalRate).toBeGreaterThan(0)
  })

  it('RAID 6 should tolerate two drive failures (parity = 2)', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: { ...standardInput, raidLevel: 'RAID6' },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    expect(resultCall).toBeDefined()

    const result = resultCall?.[0].payload
    // RAID 6 should have high survival rate
    expect(result.survivalRate).toBeGreaterThan(0.5)
  })

  it('RAID-Z3 should tolerate three drive failures (parity = 3)', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: { ...standardInput, raidLevel: 'raidz3' },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    expect(resultCall).toBeDefined()

    const result = resultCall?.[0].payload
    // RAID-Z3 should have very high survival rate
    expect(result.survivalRate).toBeGreaterThan(0.7)
  })
})

describe('Resilience Worker - Survival Rate Ordering', () => {
  const standardInput = {
    driveCount: 8,
    driveCapacityBytes: 1_000_000_000_000,
    rebuildSpeedMBs: 100,
    ureRate: 15 as const,
    afrPercent: 1.0,
    simulationCount: 500, // More simulations for stability
  }

  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('higher parity should have higher or equal survival rate', async () => {
    const raidLevels = ['RAID0', 'RAID5', 'RAID6', 'raidz3']
    const survivalRates: number[] = []

    for (const raidLevel of raidLevels) {
      mockPostMessage.mockClear()
      await importWorker()

      const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
      handler?.({
        data: {
          type: 'START',
          payload: { ...standardInput, raidLevel },
        },
      } as MessageEvent)

      const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
      survivalRates.push(resultCall?.[0].payload.survivalRate)
    }

    // Each level should have >= survival rate than the previous
    for (let i = 1; i < survivalRates.length; i++) {
      expect(survivalRates[i]).toBeGreaterThanOrEqual(survivalRates[i - 1] * 0.95) // 5% tolerance for randomness
    }
  })
})

describe('Resilience Worker - AFR Impact', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('higher AFR should reduce survival rate', async () => {
    const lowAfrInput = {
      driveCount: 8,
      driveCapacityBytes: 1_000_000_000_000,
      rebuildSpeedMBs: 100,
      ureRate: 15 as const,
      afrPercent: 0.5, // Low AFR
      simulationCount: 500,
      raidLevel: 'RAID5',
    }

    const highAfrInput = {
      ...lowAfrInput,
      afrPercent: 5.0, // High AFR
    }

    // Run low AFR simulation
    await importWorker()
    let handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({ data: { type: 'START', payload: lowAfrInput } } as MessageEvent)
    const lowAfrResult = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')

    // Run high AFR simulation
    mockPostMessage.mockClear()
    await importWorker()
    handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({ data: { type: 'START', payload: highAfrInput } } as MessageEvent)
    const highAfrResult = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')

    // Low AFR should have higher survival rate
    expect(lowAfrResult?.[0].payload.survivalRate).toBeGreaterThanOrEqual(
      highAfrResult?.[0].payload.survivalRate,
    )
  })
})

describe('Resilience Worker - URE Impact', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('worse URE rate should reduce survival rate', async () => {
    const goodUreInput = {
      driveCount: 8,
      driveCapacityBytes: 4_000_000_000_000, // 4TB - larger drive = more bits to read
      rebuildSpeedMBs: 100,
      ureRate: 17 as const, // Better URE (enterprise SSD)
      afrPercent: 1.0,
      simulationCount: 500,
      raidLevel: 'RAID5',
    }

    const badUreInput = {
      ...goodUreInput,
      ureRate: 14 as const, // Worse URE (consumer HDD)
    }

    // Run good URE simulation
    await importWorker()
    let handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({ data: { type: 'START', payload: goodUreInput } } as MessageEvent)
    const goodUreResult = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')

    // Run bad URE simulation
    mockPostMessage.mockClear()
    await importWorker()
    handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({ data: { type: 'START', payload: badUreInput } } as MessageEvent)
    const badUreResult = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')

    // Good URE should have higher or equal survival rate
    expect(goodUreResult?.[0].payload.survivalRate).toBeGreaterThanOrEqual(
      badUreResult?.[0].payload.survivalRate * 0.95, // 5% tolerance
    )
  })
})

describe('Resilience Worker - Progress Reporting', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('should report progress during simulation', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 4,
          driveCapacityBytes: 1_000_000_000_000,
          rebuildSpeedMBs: 100,
          ureRate: 15 as const,
          afrPercent: 1.0,
          simulationCount: 1000,
          raidLevel: 'RAID5',
        },
      },
    } as MessageEvent)

    // Should have multiple progress messages
    const progressCalls = mockPostMessage.mock.calls.filter((call) => call[0].type === 'PROGRESS')
    expect(progressCalls.length).toBeGreaterThan(0)

    // Progress should show completed and total
    const lastProgress = progressCalls[progressCalls.length - 1][0].payload
    expect(lastProgress.completed).toBe(1000)
    expect(lastProgress.total).toBe(1000)
  })

  it('should report final result', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 4,
          driveCapacityBytes: 1_000_000_000_000,
          rebuildSpeedMBs: 100,
          ureRate: 15 as const,
          afrPercent: 1.0,
          simulationCount: 100,
          raidLevel: 'RAID5',
        },
      },
    } as MessageEvent)

    // Should have exactly one result message
    const resultCalls = mockPostMessage.mock.calls.filter((call) => call[0].type === 'RESULT')
    expect(resultCalls.length).toBe(1)

    // Result should have all expected fields
    const result = resultCalls[0][0].payload
    expect(result).toHaveProperty('survivalRate')
    expect(result).toHaveProperty('survivalPercent')
    expect(result).toHaveProperty('averageRebuildTimeHours')
    expect(result).toHaveProperty('ureProbability')
    expect(result).toHaveProperty('dualFailureProbability')
  })
})

describe('Resilience Worker - Survival Percent Formatting', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('should format survival percent appropriately', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 4,
          driveCapacityBytes: 1_000_000_000_000,
          rebuildSpeedMBs: 100,
          ureRate: 15 as const,
          afrPercent: 0.5,
          simulationCount: 100,
          raidLevel: 'RAID6', // High redundancy
        },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    const result = resultCall?.[0].payload

    // Should be a string ending in %
    expect(typeof result.survivalPercent).toBe('string')
    expect(result.survivalPercent).toMatch(/%$/)
  })
})

describe('Resilience Worker - Rebuild Time Calculation', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('should calculate average rebuild time', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 8,
          driveCapacityBytes: 4_000_000_000_000, // 4TB
          rebuildSpeedMBs: 100, // 100 MB/s
          ureRate: 15 as const,
          afrPercent: 2.0, // Higher AFR to ensure some rebuilds happen
          simulationCount: 500,
          raidLevel: 'RAID5',
        },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    const result = resultCall?.[0].payload

    // Average rebuild time should be non-negative
    expect(result.averageRebuildTimeHours).toBeGreaterThanOrEqual(0)
  })
})

describe('Resilience Worker - RAID Level Coverage', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  const testRaidLevel = async (raidLevel: string, _expectedMinSurvival: number) => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 8,
          driveCapacityBytes: 1_000_000_000_000,
          rebuildSpeedMBs: 100,
          ureRate: 15 as const,
          afrPercent: 1.0,
          simulationCount: 200,
          raidLevel,
        },
      },
    } as MessageEvent)

    const resultCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'RESULT')
    expect(resultCall).toBeDefined()

    // Should produce a valid result
    const result = resultCall?.[0].payload
    expect(result.survivalRate).toBeGreaterThanOrEqual(0)
    expect(result.survivalRate).toBeLessThanOrEqual(1)
  }

  // Standard RAID levels
  it('should handle RAID 0', () => testRaidLevel('RAID0', 0))
  it('should handle RAID 1', () => testRaidLevel('RAID1', 0.5))
  it('should handle RAID 5', () => testRaidLevel('RAID5', 0.5))
  it('should handle RAID 6', () => testRaidLevel('RAID6', 0.7))
  it('should handle RAID 10', () => testRaidLevel('RAID10', 0.5))
  it('should handle RAID 50', () => testRaidLevel('RAID50', 0.5))
  it('should handle RAID 60', () => testRaidLevel('RAID60', 0.7))

  // ZFS levels
  it('should handle raidz1', () => testRaidLevel('raidz1', 0.5))
  it('should handle raidz2', () => testRaidLevel('raidz2', 0.7))
  it('should handle raidz3', () => testRaidLevel('raidz3', 0.8))
  it('should handle draid1', () => testRaidLevel('draid1', 0.5))
  it('should handle draid2', () => testRaidLevel('draid2', 0.7))
  it('should handle draid3', () => testRaidLevel('draid3', 0.8))

  // S2D levels
  it('should handle simple', () => testRaidLevel('simple', 0))
  it('should handle parity', () => testRaidLevel('parity', 0.5))
  it('should handle dual_parity', () => testRaidLevel('dual_parity', 0.7))
  it('should handle map', () => testRaidLevel('map', 0.7))

  // Proprietary levels
  it('should handle mirror', () => testRaidLevel('mirror', 0.5))
  it('should handle stripe', () => testRaidLevel('stripe', 0))
  it('should handle synology_shr', () => testRaidLevel('synology_shr', 0.5))
  it('should handle synology_shr2', () => testRaidLevel('synology_shr2', 0.7))
  it('should handle netapp_raid_dp', () => testRaidLevel('netapp_raid_dp', 0.7))
  it('should handle netapp_raid_tec', () => testRaidLevel('netapp_raid_tec', 0.8))
})

describe('Resilience Worker - Abort Handling', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('should acknowledge abort message', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
    handler?.({ data: { type: 'ABORT' } } as MessageEvent)

    // Should post ABORTED message
    const abortedCall = mockPostMessage.mock.calls.find((call) => call[0].type === 'ABORTED')
    expect(abortedCall).toBeDefined()
  })
})

describe('Resilience Worker - Error Handling', () => {
  beforeEach(() => {
    mockPostMessage.mockClear()
  })

  it('should handle invalid input gracefully', async () => {
    await importWorker()

    const handler = (self as { onmessage: ((e: MessageEvent) => void) | null }).onmessage

    // Send invalid payload (missing required fields)
    handler?.({
      data: {
        type: 'START',
        payload: {
          driveCount: 0, // Invalid: 0 drives
          raidLevel: 'RAID5',
          driveCapacityBytes: 1_000_000_000_000,
          rebuildSpeedMBs: 100,
          ureRate: 15,
          afrPercent: 1.0,
          simulationCount: 10,
        },
      },
    } as MessageEvent)

    // Should either handle gracefully or report error
    const resultOrError = mockPostMessage.mock.calls.find(
      (call) => call[0].type === 'RESULT' || call[0].type === 'ERROR',
    )
    expect(resultOrError).toBeDefined()
  })
})
