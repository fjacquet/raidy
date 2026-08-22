/**
 * Independent performance calculation hook with focused dependencies.
 * Only re-runs when performance-related config changes.
 */

import { useMemo } from 'react'
import drivesData from '@/data/drives.json'
import { effectiveServerCount } from '@/engines/capabilities'
import { calculatePerformance } from '@/engines/performance'
import { resolveTiering } from '@/engines/shared/tiering'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
import { useTieringOptions } from '@/hooks/useTieringOptions'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types'
import { usesDistributedSpares } from '@/types'
import type { PerformanceResult } from '@/types/results'

// Type assertion for the imported JSON
const drives = drivesData as Record<string, Drive>

/**
 * Hook that calculates performance results based on current configuration.
 * Memoized with only performance-related dependencies.
 */
export function usePerformanceCalc(): PerformanceResult {
  const {
    // Hardware
    driveId,
    driveCount,
    serverCount,
    hotSpares,
    // Topology
    topology,
    controllerOptions,
    powerFlexOptions,
    cephOptions,
    nutanixOptions,
    vsanOptions,
    s2dOptions,
    beeGfsOptions,
    powerscaleOptions,
    // Workload
    readPercent,
    randomPercent,
    blockSize,
    // Advanced (performance-related only)
    networkSpeed,
    pcieGen,
    pcieLanes,
  } = useConfigStore()

  const tieringOptions = useTieringOptions()

  // Get selected drive
  const drive = drives[driveId]

  return useMemo(() => {
    // Return zero-state if drive not found (orchestrator handles validation)
    if (!drive) {
      return {
        maxReadThroughputMBs: 0,
        maxWriteThroughputMBs: 0,
        sustainedWriteThroughputMBs: 0,
        maxReadIOPS: 0,
        maxWriteIOPS: 0,
        sustainedWriteIOPS: 0,
        mediaCeilingMBs: 0,
        mediaCeilingIOPS: 0,
        layers: [],
        bottleneck: { kind: 'noDrive' },
      }
    }

    // Clamp a stale serverCount to 1 for platforms whose servers/nodes slider
    // is hidden, so switching topology can't silently scale results by a
    // leftover serverCount from a previously selected multi-node platform.
    const effServerCount = effectiveServerCount(serverCount, topology)

    // PowerScale sizes from the FIRST node pool's catalog geometry: the shared Hardware panel
    // is hidden for this platform (hasServerCount: false), so driveCount/serverCount are stale
    // defaults, not real inputs. Performance for a heterogeneous cluster is not modelled — a
    // client's IOPS is a property of the pool serving it, not an average across pools — so only
    // tiers[0] is read here. `powerScaleDriveTotals` returns all zeroes for an empty/unsized
    // tier list, which degrades every figure below to 0 rather than throwing.
    const psTotals =
      topology.type === 'powerscale' && powerscaleOptions
        ? powerScaleDriveTotals(powerscaleOptions)
        : null

    // Calculate total drives across all servers.
    // vSAN rebuilds from distributed slack space, not dedicated hot-spare drives,
    // so force 0 spares even if persisted URL state hydrated a non-zero count.
    const totalDriveCount = psTotals ? psTotals.firstTierDrives : driveCount * effServerCount
    const totalHotSpares = psTotals
      ? psTotals.firstTierSpareDrives
      : usesDistributedSpares(topology.type)
        ? 0
        : hotSpares * effServerCount
    const nodeCount = psTotals ? psTotals.firstTierNodes : effServerCount

    // Resolve tiering for the five platforms that support it: S2D storage tiers, vSAN OSA disk
    // groups, Ceph WAL/DB offload, Nutanix hybrid clusters, BeeGFS metadata targets. PowerScale
    // is not one of them — `resolveTiering` has no powerscale branch and always returns null for
    // it, so passing `nodeCount` here (rather than the stale `effServerCount`) is harmless but
    // kept consistent with every other server-count use below.
    // `useTieringOptions` supplies the complete option bag so no platform can be left out.
    const tiering = resolveTiering(topology, nodeCount, tieringOptions)

    try {
      return calculatePerformance({
        drive,
        driveCount: totalDriveCount,
        hotSpares: totalHotSpares,
        serverCount: nodeCount,
        topology,
        controllerOptions,
        readPercent,
        randomPercent,
        blockSize,
        networkSpeed,
        pcieGen,
        pcieLanes,
        powerFlexOptions,
        cephOptions,
        nutanixOptions,
        vsanOptions,
        s2dOptions,
        beeGfsOptions,
        // The SAME tier `psTotals` was derived from — never `powerscaleOptions.tiers[0]`
        // re-indexed independently, which can point at a different tier than the one the
        // population above came from when an earlier tier is unsizeable.
        powerscaleTier: psTotals?.firstTier,
        tiering,
        workingSetPercent: s2dOptions?.tieringConfig?.workingSetPercent ?? 20,
      })
    } catch (error) {
      console.error('[Performance Engine Error]', {
        message: error instanceof Error ? error.message : 'Unknown error',
        context: {
          driveId: drive.id,
          driveCount: totalDriveCount,
          serverCount,
          topology: topology.type,
          level: topology.level,
          readPercent,
          randomPercent,
        },
        timestamp: new Date().toISOString(),
      })

      // Return safe fallback state
      return {
        maxReadThroughputMBs: 0,
        maxWriteThroughputMBs: 0,
        sustainedWriteThroughputMBs: 0,
        maxReadIOPS: 0,
        maxWriteIOPS: 0,
        sustainedWriteIOPS: 0,
        mediaCeilingMBs: 0,
        mediaCeilingIOPS: 0,
        layers: [],
        bottleneck: { kind: 'error' },
      }
    }
  }, [
    // Only performance-related dependencies
    drive,
    driveCount,
    serverCount,
    hotSpares,
    topology,
    controllerOptions,
    readPercent,
    randomPercent,
    blockSize,
    networkSpeed,
    pcieGen,
    pcieLanes,
    powerFlexOptions,
    cephOptions,
    nutanixOptions,
    vsanOptions,
    s2dOptions,
    beeGfsOptions,
    powerscaleOptions,
    tieringOptions,
  ])
}
