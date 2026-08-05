/**
 * The resilience panel and the capacity card must describe the same cluster.
 *
 * `resolveBeeGfsSimulationScope` is the resilience hook's half of that contract: it derives the
 * simulated drive population and fault-group count from `resolveBeeGfsUsableDrives` +
 * `calculateStorageTargets`, the same single source of truth `calculateVolumetry` and
 * `BeeGfsOptionsPanel` use. These tests pin the two against the *real* engine output rather
 * than restating the formula, so a future divergence fails here instead of shipping as two
 * on-screen numbers that disagree.
 */

import { describe, expect, it } from 'vitest'
import { calculateVolumetry } from '@/engines/volumetry'
import { resolveBeeGfsSimulationScope } from '@/hooks/useResilience'
import { DEFAULT_BEEGFS_OPTIONS } from '@/types'
import type { BeeGfsOptions, Topology } from '@/types/topology'
import { createVolumetryInput } from '../fixtures/vector-harness'

const raid6: Topology = { type: 'beegfs', level: 'beegfs_raid6' }

function beegfs(overrides: Partial<BeeGfsOptions> = {}): BeeGfsOptions {
  return { ...DEFAULT_BEEGFS_OPTIONS, ...overrides }
}

/** Storage-target count the capacity card prints for the same store values. */
function engineTargetCount(
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  options: BeeGfsOptions,
): number {
  const result = calculateVolumetry(
    createVolumetryInput(driveCount * serverCount, raid6, {
      serverCount,
      hotSpares: hotSpares * serverCount,
      beeGfsOptions: options,
    }),
  )
  return result.beeGfsDetails?.storageTargetCount ?? -1
}

describe('resolveBeeGfsSimulationScope', () => {
  it('applies hot spares — the case that made resilience and volumetry disagree', () => {
    // The finding's own example: 100 drives (5 nodes x 20), 10 hot spares per node is not what
    // it meant; it meant 10 cluster-wide. Expressed per-server: 20 drives x 5 nodes, 2 spares
    // per node = 10 spares -> 90 usable -> floor(90/12) = 7 targets.
    // The pre-fix hook computed floor(100/12) = 8 groups from 100 drives.
    const options = beegfs({ drivesPerTarget: 12, storageBuddyMirror: false })
    const scope = resolveBeeGfsSimulationScope(20, 5, 2, options)
    expect(scope.groupCount).toBe(7)
    expect(scope.driveCount).toBe(84)
    expect(scope.groupCount).toBe(engineTargetCount(20, 5, 2, options))
  })

  it('excludes stranded drives so every simulated group is a whole target', () => {
    const options = beegfs({ drivesPerTarget: 12, storageBuddyMirror: false })
    const scope = resolveBeeGfsSimulationScope(20, 5, 0, options)
    // 100 drives -> 8 whole targets (96 drives), 4 stranded.
    expect(scope.groupCount).toBe(8)
    expect(scope.driveCount).toBe(96)
    expect(scope.driveCount % options.drivesPerTarget).toBe(0)
    expect(scope.groupCount).toBe(engineTargetCount(20, 5, 0, options))
  })

  it('follows MDT tiering onto the capacity tier instead of the Hardware panel count', () => {
    // Hardware panel still says 28 drives/server, but with metadataTargets on the storage
    // targets are built from the capacity tier: 12 drives/server x 4 servers = 48 -> 4 targets.
    // The pre-fix hook produced 9 groups over 112 drives for exactly this configuration.
    const options = beegfs({
      drivesPerTarget: 12,
      storageBuddyMirror: false,
      metadataTargets: true,
      tiering: {
        enabled: false,
        fastTier: { driveId: 'ent-nvme-pcie4-960gb-m2-ri', driveCount: 2 },
        capacityTier: { driveId: 'ent-hdd-7k2-sata-18tb-cmr', driveCount: 12 },
        workingSetPercent: 20,
      },
    })
    const scope = resolveBeeGfsSimulationScope(28, 4, 0, options)
    expect(scope.groupCount).toBe(4)
    expect(scope.driveCount).toBe(48)
  })

  it('never reports zero simulated drives when no whole target forms', () => {
    // 8 drives at drivesPerTarget 12 forms no target. Simulating 0 drives would report 100%
    // survival — an overstatement. One over-wide group is the conservative fallback.
    const scope = resolveBeeGfsSimulationScope(8, 1, 0, beegfs({ drivesPerTarget: 12 }))
    expect(scope.groupCount).toBe(1)
    expect(scope.driveCount).toBe(8)
  })

  it('reports the vacuous zero-drive case when hot spares consume every drive', () => {
    // Pins the ONE case the "never zero drives" claim did not cover, now that the doc-comment
    // and docs/ARCHITECTURE.md say so plainly. 4 drives, 4 hot spares -> no usable drive at all.
    // This is not clamped on purpose: a cluster with no data-bearing drive holds no data to
    // lose, so 100% survival is vacuously true rather than optimistic, and volumetry
    // zero-states the same input so the two panels agree. Fabricating a drive to force a
    // non-zero risk would report risk for data that does not exist.
    const scope = resolveBeeGfsSimulationScope(4, 1, 4, beegfs({ drivesPerTarget: 12 }))
    expect(scope.driveCount).toBe(0)
    expect(scope.groupCount).toBe(1)
    expect(engineTargetCount(4, 1, 4, beegfs({ drivesPerTarget: 12 }))).toBe(-1)
  })

  it('agrees with the engine across a sweep of drive/spare/width combinations', () => {
    for (const driveCount of [10, 12, 20, 24, 28]) {
      for (const serverCount of [1, 2, 5]) {
        for (const hotSpares of [0, 1, 3]) {
          for (const drivesPerTarget of [4, 10, 12]) {
            const options = beegfs({ drivesPerTarget, storageBuddyMirror: false })
            const scope = resolveBeeGfsSimulationScope(driveCount, serverCount, hotSpares, options)
            const engine = engineTargetCount(driveCount, serverCount, hotSpares, options)
            // The engine zero-states (targets undefined -> -1) below one whole target; the
            // hook's conservative fallback is only allowed to fire in exactly that case.
            if (engine > 0) {
              expect(
                scope.groupCount,
                `${driveCount}x${serverCount} spares=${hotSpares} dPT=${drivesPerTarget}`,
              ).toBe(engine)
              expect(scope.driveCount).toBe(engine * drivesPerTarget)
            } else {
              expect(scope.groupCount).toBe(1)
            }
          }
        }
      }
    }
  })
})
