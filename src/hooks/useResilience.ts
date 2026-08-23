/**
 * Hook for running Monte Carlo resilience simulation.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { effectiveServerCount } from '@/engines/capabilities'
import { resolveTiering, type TieringResolverOptions } from '@/engines/shared/tiering'
import { powerScaleDriveTotals } from '@/engines/volumetry/powerscale'
import {
  calculateStorageTargets,
  resolveBeeGfsUsableDrives,
} from '@/engines/volumetry/strategies/beegfs'
import { usesDistributedSpares } from '@/types'
import type { Drive } from '@/types/drive'
import type { ResilienceResult, SimulationProgress } from '@/types/results'
import type {
  BeeGfsOptions,
  PowerScaleOptions,
  PowerScaleProtection,
  Topology,
} from '@/types/topology'
import type { SimulationInput, SimulationOutput, WorkerOutputMessage } from '@/types/worker'

interface UseResilienceOptions {
  drive: Drive | null
  driveCount: number
  serverCount?: number
  /**
   * Per-server hot spares (the store's raw value, as the other engines take it). Spare drives
   * are not data-bearing, so they are excluded from the simulated population on every path —
   * zeroed for platforms with distributed spares (`usesDistributedSpares`), applied in
   * `runSimulation` for the naive path, in `tieredPlatformScope` for the tiered platforms, and
   * inside `resolveBeeGfsSimulationScope` for BeeGFS.
   */
  hotSpares?: number
  topology: Topology
  rebuildSpeedMBs?: number
  simulationCount?: number
  autoRun?: boolean
  /** Mirror copies per group (2 or 3). 0 = not a mirror topology. */
  mirrorCopies?: number
  /**
   * The complete per-platform tiering option bag, sourced from `useTieringOptions()` at the call
   * site — the same bag `useVolumetryCalc`, `usePerformanceCalc` and `useSustainabilityCalc`
   * already consume, so no platform can be hand-listed here and dropped (issues #59, #60).
   * `tieringOptions.beeGfsOptions` doubles as this hook's BeeGFS-only input (`drivesPerTarget`
   * for the storage-target fault group) — see `SIMULATION_SCOPE_BY_TOPOLOGY`.
   */
  tieringOptions?: TieringResolverOptions
  /**
   * PowerScale's tier bag — kept separate from `tieringOptions` (which is the S2D/vSAN/Ceph/
   * Nutanix/BeeGFS tiering-resolver bag and has no PowerScale field) because PowerScale's
   * "tiers" are independent node pools, not a cache/capacity split. See the `powerscale`
   * resolver in `SIMULATION_SCOPE_BY_TOPOLOGY`.
   */
  powerscaleOptions?: PowerScaleOptions
}

interface UseResilienceResult {
  result: ResilienceResult | null
  progress: SimulationProgress
  isRunning: boolean
  error: string | null
  runSimulation: () => void
  abort: () => void
}

/** Simulated drive population and fault-group count handed to the worker. */
export interface SimulationScope {
  driveCount: number
  groupCount: number
}

/**
 * Derive the BeeGFS simulated population from the SAME resolved values volumetry uses
 * (`resolveBeeGfsUsableDrives` + `calculateStorageTargets`, the single source of truth in
 * `src/engines/volumetry/strategies/beegfs.ts`) rather than from `driveCount * serverCount`,
 * which applied neither hot spares nor MDT tiering. Pre-fix, 100 drives with 10 hot spares at
 * `drivesPerTarget` 12 gave volumetry 7 targets and resilience 8 groups; under MDT tiering it
 * simulated the stale Hardware-panel drive count against a completely different capacity tier.
 * The capacity card and the resilience panel now describe one cluster.
 *
 * Superset invariant (the simulated failure set must never be smaller than the physically real
 * one, so this tool may understate resilience but never overstate it):
 * - Hot spares are excluded. A spare holds no data, so its failure is not a data-loss event in
 *   the real system either — the previous model counted spares as data-bearing, which was
 *   conservative; the new model is exact, and exact ⊇ real.
 * - Stranded drives are excluded for the same reason: after the whole-targets-only capacity
 *   fix they belong to no storage target and hold no data.
 * - The fault group is the whole storage target at its real width, so `drivesPerTarget` still
 *   reaches the simulation — the property the group model exists to preserve.
 * - Degenerate case: if not even one whole target forms, every remaining USABLE drive goes into
 *   ONE group. That group is wider, and therefore more failure-prone, than any real target, so
 *   the fallback stays on the conservative side of the invariant.
 * - Fully degenerate case: when hot spares consume the whole population there are no usable
 *   drives left, so this returns `{ driveCount: 0, groupCount: 1 }` and the worker reports 100%
 *   survival. That is vacuously true rather than optimistic — a cluster with no data-bearing
 *   drive holds no data to lose — and volumetry zero-states the same input, so the two panels
 *   agree. It is NOT clamped: fabricating a drive would report a non-zero risk for data that
 *   does not exist. See `resolveBeeGfsSimulationScope` tests for the pinned behaviour.
 *
 * MDT drives are not simulated: they are a separate protection domain with their own buddy
 * mirroring, and this panel reports on the storage-target data path. That matches how Ceph's
 * WAL/DB offload tier is treated (also not simulated) and is the pre-existing scope of the
 * panel, not something this derivation introduced.
 *
 * @param driveCount - Hardware panel's per-server drive count
 * @param serverCount - Already clamped by `effectiveServerCount`
 * @param hotSpares - Store's per-server hot spares
 */
export function resolveBeeGfsSimulationScope(
  driveCount: number,
  serverCount: number,
  hotSpares: number,
  beeGfsOptions: BeeGfsOptions,
): SimulationScope {
  const usableDrives = resolveBeeGfsUsableDrives(driveCount, serverCount, hotSpares, beeGfsOptions)
  const { storageTargetCount } = calculateStorageTargets(
    usableDrives,
    beeGfsOptions.drivesPerTarget,
  )
  if (storageTargetCount > 0) {
    return {
      driveCount: storageTargetCount * beeGfsOptions.drivesPerTarget,
      groupCount: storageTargetCount,
    }
  }
  return { driveCount: usableDrives, groupCount: 1 }
}

/** Inputs a per-platform scope resolver may draw on. */
interface SimulationScopeContext {
  /** Hardware panel's per-server drive count */
  driveCount: number
  /** Already clamped by `effectiveServerCount` */
  serverCount: number
  /** Store's per-server hot spares */
  hotSpares: number
  topology: Topology
  /** Complete per-platform tiering option bag — see `UseResilienceOptions.tieringOptions`. */
  tieringOptions?: TieringResolverOptions
  /** PowerScale's tier bag — see `UseResilienceOptions.powerscaleOptions`. */
  powerscaleOptions?: PowerScaleOptions
}

/** How a platform overrides the naive `driveCount * serverCount` population, if at all. */
interface PlatformSimulationScope extends SimulationScope {
  /** Media whose capacity/AFR the simulation uses; null keeps the Hardware panel's drive. */
  mediaDrive: Drive | null
  /**
   * The shared fast-tier failure domain (#88), or null when the platform has none. Non-null only
   * for the two platforms with a vendor statement that losing the fast device takes capacity
   * devices with it — see `SHARED_FAST_TIER_TOPOLOGIES`.
   */
  sharedFastTier?: { afrPercent: number; deviceCount: number } | null
  /**
   * Whether rebuild can start immediately for this platform's population (issue #93 signal),
   * when that answer is NOT simply "the generic Hardware-panel hot-spares slider is non-zero".
   * `undefined` (every resolver except PowerScale's) falls through to the generic
   * `totalHotSpares > 0` computed at the call site. PowerScale sets this explicitly from the
   * tier's own Virtual Hot Spare count — the generic slider is meaningless for it (the Hardware
   * panel is hidden), so leaving this unset would either strand a configured VHS with no
   * immediate-rebuild credit or silently grant credit from a leftover value a previously
   * selected platform left in the store.
   */
  hasHotSpare?: boolean
  /**
   * The PowerScale tier's OneFS protection, threaded to the worker so it can realize the
   * "`+Nn` tolerates whole-node loss" claim (see the `powerscale` resolver below). `undefined`
   * for every non-PowerScale resolver, and for PowerScale when no tier could be sized.
   */
  powerScaleProtection?: PowerScaleProtection
}

/**
 * Platforms where a fast-tier device failure cascades to the capacity devices it serves (#88).
 *
 * Both entries are sourced, and the two absentees are the point of the list:
 *
 * - `vsan_osa` — Broadcom: "vSAN interprets the failure of a single flash caching device as a
 *   failure of the entire disk group", cache and capacity devices alike marked degraded.
 * - `ceph` — Red Hat: "a corrupt block.db file will impact all OSDs which are included in that
 *   block.db file".
 *
 * `s2d` and `nutanix` tier through the very same `tieredPlatformScope` and were named alongside
 * these two in #82, but their fast tiers are write-back cache and no vendor documents the loss
 * taking the capacity tier down. Adding them for symmetry would be inventing a failure mode, so
 * the list is explicit rather than derived from "is this platform tiered".
 */
const SHARED_FAST_TIER_TOPOLOGIES: readonly Topology['type'][] = ['vsan_osa', 'ceph']

type SimulationScopeResolver = (ctx: SimulationScopeContext) => PlatformSimulationScope | null

/**
 * Population and media for the platforms that tier through `resolveTiering`: S2D storage tiers,
 * vSAN OSA disk groups, Ceph WAL/DB offload, Nutanix hybrid clusters.
 *
 * One resolver for all four rather than one each: `resolveTiering` already dispatches internally
 * by `topology.type`, and once it has resolved, turning a `TieredCapacityResult` into a scope is
 * identical everywhere. BeeGFS keeps its own resolver because it needs the storage-target concept
 * only it has.
 *
 * Returns null when the platform's tiering toggle is off, which leaves the naive
 * `driveCount * serverCount` path untouched for every currently-correct configuration.
 *
 * The fast tier as a shared failure domain IS now modelled, for the two platforms with a vendor
 * statement behind the cascade — see `SHARED_FAST_TIER_TOPOLOGIES` and issue #88. S2D and Nutanix
 * resolve through here too but get no cascade: their fast tiers are write-back cache and no vendor
 * documents the loss taking the capacity tier with it.
 *
 * Hot spares come off the capacity tier, clamped at zero, mirroring
 * `src/engines/volumetry/index.ts:178`, which clamps the identical quantity the identical way.
 * vSAN rebuilds from distributed slack rather than dedicated spare drives, so
 * `usesDistributedSpares` zeroes the subtraction for it.
 */
function tieredPlatformScope({
  topology,
  serverCount,
  hotSpares,
  tieringOptions,
}: SimulationScopeContext): PlatformSimulationScope | null {
  const tiering = resolveTiering(topology, serverCount, tieringOptions ?? {})
  if (!tiering) return null
  const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * serverCount
  const cacheDrive = tiering.cacheTierDrive
  return {
    driveCount: Math.max(0, tiering.capacityTierDriveCount - totalHotSpares),
    groupCount: serverCount,
    mediaDrive: tiering.capacityTierDrive,
    // The fast tier stops being merely "excluded from the population" for the two platforms that
    // document the cascade (#88). `cacheTierDriveCount` is already a cluster-wide device count —
    // `TieringConfig.fastTier.driveCount` is per-server and `calculateTieredCapacity` multiplies
    // it by `serverCount` — so it needs no further scaling to mean "how many devices back this
    // population".
    sharedFastTier:
      SHARED_FAST_TIER_TOPOLOGIES.includes(topology.type) &&
      cacheDrive &&
      tiering.cacheTierDriveCount > 0
        ? { afrPercent: cacheDrive.reliability.afr, deviceCount: tiering.cacheTierDriveCount }
        : null,
  }
}

/**
 * Per-platform simulation-scope overrides, keyed by topology type.
 *
 * A table rather than a branch at the call site, mirroring `NETWORK_MODEL_BY_TOPOLOGY` in
 * `src/engines/performance/utils/bottleneck-chain.ts`, which solved the structurally identical
 * problem for the network model. Platforms absent from this table fall back to the naive
 * `driveCount * serverCount` population with `serverCount` fault groups.
 *
 * BeeGFS resolves its own storage-target population itself; the four tiered platforms share
 * `tieredPlatformScope`, which reads the capacity tier through `resolveTiering`.
 */
const SIMULATION_SCOPE_BY_TOPOLOGY: Partial<Record<Topology['type'], SimulationScopeResolver>> = {
  beegfs: ({ driveCount, serverCount, hotSpares, topology, tieringOptions }) => {
    const beeGfsOptions = tieringOptions?.beeGfsOptions
    if (!beeGfsOptions) return null
    const scope = resolveBeeGfsSimulationScope(driveCount, serverCount, hotSpares, beeGfsOptions)
    // When MDT tiering is active the storage targets are built from the capacity-tier drive, not
    // the Hardware panel's. Simulating NVMe metadata media with the capacity tier's HDD
    // capacity/AFR (or vice versa) is the same class of error as a stale drive count, so the
    // media characteristics resolve alongside the population rather than in a second pass.
    const tiering = resolveTiering(topology, serverCount, { beeGfsOptions })
    return { ...scope, mediaDrive: tiering?.capacityTierDrive ?? null }
  },
  s2d: tieredPlatformScope,
  vsan_osa: tieredPlatformScope,
  ceph: tieredPlatformScope,
  nutanix: tieredPlatformScope,
  /**
   * PowerScale: the population comes from the FIRST node pool's catalog geometry,
   * never from the Hardware panel — that panel is hidden for PowerScale, so its
   * driveCount/serverCount are stale defaults.
   *
   * `mediaDrive: null` keeps the Hardware panel's drive for reliability: the
   * vendor catalog gives capacities, not AFR/URE/MTBF, and inventing those
   * would fabricate the very numbers the simulation reports.
   *
   * Nodes are the failure-isolation groups: OneFS protection spends a single stripe-unit
   * budget (`M`) across the pool — a drive failure debits 1 unit, a whole-node failure debits
   * `u` units, loss when consumed units exceed `M` — realized by `powerScaleProtection` below,
   * which the worker (`computeTopologyModel`'s PowerScale block, `applyPowerScaleNodeFailure`)
   * turns into the actual node-failure-tolerance model. `nf` (node-failure count) is a
   * vendor-published cross-check derivable from the same table (`nf == floor(M / u)`), not a
   * second, independent tolerance the loss decision reads directly. That model is NOT
   * vendor-attested (see `SimulationInput.powerScaleProtection`'s doc comment) — Dell's
   * PowerSizer export has no AFR/URE/MTBF to validate a reliability model against, unlike every
   * capacity number on this branch.
   *
   * `firstTier` — not `powerscaleOptions.tiers[0]` re-indexed independently — is read from the
   * SAME `powerScaleDriveTotals` call the population comes from, so the protection driving the
   * simulation can never describe a DIFFERENT tier than the one whose drives/nodes it's
   * simulating (an earlier tier `sizeTier` rejects is skipped by `powerScaleDriveTotals`, and a
   * second, independent `tiers[0]` lookup would not know that).
   *
   * `hasHotSpare` comes from the tier's own Virtual Hot Spare count, not the generic
   * Hardware-panel hot-spares slider read at the call site — that slider is meaningless for
   * PowerScale (the panel is hidden), so using it would either strand a configured VHS with no
   * immediate-rebuild credit or grant credit from a leftover value a previously selected
   * platform left in the store.
   */
  powerscale: ({ powerscaleOptions }) => {
    if (!powerscaleOptions) return null
    const { firstTierDrives, firstTierNodes, firstTierSpareDrives, firstTier } =
      powerScaleDriveTotals(powerscaleOptions)
    if (firstTierDrives === 0) {
      return { driveCount: 0, groupCount: 1, mediaDrive: null, hasHotSpare: false }
    }
    return {
      driveCount: Math.max(0, firstTierDrives - firstTierSpareDrives),
      groupCount: firstTierNodes,
      mediaDrive: null,
      // `sizeTier` reserves `max(vhsByDriveCount, vhsByPercent)`, so a pool with
      // `vhsDriveCount: 0, vhsPercent: 20` has a real reserve and pays for it in usable capacity.
      // Reading only the drive count charged that pool the replacement delay anyway, while an
      // equivalent pool expressed as `vhsDriveCount: 1` got immediate-rebuild credit. The two
      // controls agree here the same way they already agree in capacity.
      hasHotSpare: firstTierSpareDrives > 0 || (firstTier?.vhsPercent ?? 0) > 0,
      powerScaleProtection: firstTier?.protection,
    }
  },
}

/**
 * Get the RAID level string from topology.
 */
function getRaidLevel(topology: Topology): string {
  return topology.level
}

/**
 * BeeGFS levels that route through the worker's group-topology model
 * (`isGroupTopology` in `resilienceWorker.ts`) — the only levels whose
 * `serverCount` is a storage-target count that buddy mirroring can pair up.
 * `beegfs_single` has no local per-target redundancy, so a buddy-mirroring
 * request for it takes the plain drive-pair mirror path instead and has no
 * odd/even target-count cliff to warn about.
 */
function isBeeGfsGroupLevel(level: string): boolean {
  const l = level.toLowerCase()
  return l === 'beegfs_raid6' || l === 'beegfs_raidz2' || l === 'beegfs_raid10'
}

/**
 * True when buddy mirroring was requested for a BeeGFS group topology but the
 * storage-target count is odd, so the worker withholds buddy credit entirely
 * (issue #68 — see `isBuddyMirroredGroup` in `resilienceWorker.ts`). Mirrors
 * that same predicate rather than re-deriving it independently, so this stays
 * correct if the worker's buddy-pairing rule ever changes.
 */
export function isOddTargetCountNoBuddyCredit(
  topology: Topology,
  mirrorCopies: number,
  groupCount: number,
): boolean {
  return (
    topology.type === 'beegfs' &&
    isBeeGfsGroupLevel(topology.level) &&
    mirrorCopies === 2 &&
    groupCount % 2 !== 0
  )
}

/**
 * Calculate number of "nines" from survival rate.
 * e.g., 0.99999 = 5 nines
 */
function calculateNines(survivalRate: number): number {
  if (survivalRate >= 1) return 9 // Perfect
  if (survivalRate <= 0) return 0

  // Count nines after decimal
  const nines = -Math.log10(1 - survivalRate)
  return Math.min(9, Math.max(0, Math.floor(nines)))
}

/**
 * Determine risk level based on survival rate.
 */
function getRiskLevel(survivalRate: number): 'low' | 'medium' | 'high' | 'critical' {
  if (survivalRate >= 0.9999) return 'low' // 4+ nines
  if (survivalRate >= 0.999) return 'medium' // 3 nines
  if (survivalRate >= 0.99) return 'high' // 2 nines
  return 'critical' // Less than 2 nines
}

/**
 * Generate recommendations based on simulation results.
 *
 * Returns i18n key suffixes within `output:resilience.recommendation.*`, not display strings —
 * `ResilienceAct` translates them at render. See the note on `ResilienceResult.recommendations`
 * for why translating here would be wrong (#125).
 */
function getRecommendations(
  result: SimulationOutput,
  topology: Topology,
  _driveCount: number,
): string[] {
  const recommendations: string[] = []

  // URE risk
  if (result.ureProbability > 0.01) {
    recommendations.push('enterpriseDrives')
  }

  // Dual failure risk
  if (result.dualFailureProbability > 0.001) {
    if (topology.type === 'standard' && topology.level === 'RAID5') {
      recommendations.push('upgradeRaid6')
    }
    if (topology.type === 'zfs' && topology.level === 'raidz1') {
      recommendations.push('upgradeRaidz2')
    }
  }

  // Rebuild time
  if (result.averageRebuildTimeHours > 24) {
    recommendations.push('longRebuild')
  }

  // Add hot spare if not present
  if (result.dualFailureProbability > 0.0001) {
    recommendations.push('addHotSpare')
  }

  // If survival is very high, acknowledge it
  if (result.survivalRate >= 0.9999 && recommendations.length === 0) {
    recommendations.push('excellentProtection')
  }

  return recommendations
}

/**
 * Hook to run Monte Carlo resilience simulation in a Web Worker.
 */
export function useResilience(options: UseResilienceOptions): UseResilienceResult {
  const {
    drive,
    driveCount,
    serverCount = 1,
    hotSpares = 0,
    topology,
    rebuildSpeedMBs = 200, // Default 200 MB/s rebuild speed (modern RAID controllers)
    simulationCount = 100000, // 100K iterations for better precision on rare events
    autoRun = false,
    mirrorCopies = 0,
    tieringOptions,
    powerscaleOptions,
  } = options

  const [result, setResult] = useState<ResilienceResult | null>(null)
  const [progress, setProgress] = useState<SimulationProgress>({
    completed: 0,
    total: simulationCount,
    percent: 0,
    isRunning: false,
  })
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  // Run simulation
  const runSimulation = useCallback(() => {
    if (!drive) {
      setError('No drive selected')
      return
    }

    // Terminate existing worker
    if (workerRef.current) {
      workerRef.current.terminate()
    }

    setIsRunning(true)
    setError(null)
    setProgress({
      completed: 0,
      total: simulationCount,
      percent: 0,
      isRunning: true,
    })

    // Create new worker
    const worker = new Worker(new URL('../workers/resilienceWorker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    // Handle messages from worker
    worker.onmessage = (event: MessageEvent<WorkerOutputMessage>) => {
      const message = event.data

      switch (message.type) {
        case 'PROGRESS':
          setProgress({
            completed: message.payload.completed,
            total: message.payload.total,
            percent: (message.payload.completed / message.payload.total) * 100,
            isRunning: true,
          })
          break

        case 'RESULT': {
          const simResult = message.payload
          const resilienceResult: ResilienceResult = {
            survivalRate: simResult.survivalRate,
            survivalPercent: simResult.survivalPercent,
            nines: calculateNines(simResult.survivalRate),
            avgRebuildTimeHours: simResult.averageRebuildTimeHours,
            ureProbability: simResult.ureProbability,
            dualFailureProbability: simResult.dualFailureProbability,
            riskLevel: getRiskLevel(simResult.survivalRate),
            recommendations: getRecommendations(simResult, topology, driveCount),
            // groupCount is declared further down in this same synchronous function body
            // (`const groupCount = ...` below); safe to reference here because this
            // handler only runs later, asynchronously, once the worker replies.
            oddTargetCountNoBuddyCredit: isOddTargetCountNoBuddyCredit(
              topology,
              mirrorCopies,
              groupCount,
            ),
          }
          setResult(resilienceResult)
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break
        }

        case 'ERROR':
          setError(message.payload)
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break

        case 'ABORTED':
          setIsRunning(false)
          setProgress((prev) => ({ ...prev, isRunning: false }))
          break
      }
    }

    worker.onerror = (event) => {
      setError(event.message || 'Worker error')
      setIsRunning(false)
      setProgress((prev) => ({ ...prev, isRunning: false }))
    }

    // Start simulation
    // driveCount from store is per-server; worker needs total drives (matching other engines).
    // Clamp a stale serverCount to 1 for platforms whose servers/nodes slider is hidden
    // (defense in depth — the OutputDashboard call site passes a pre-clamped value; see
    // effectiveServerCount in src/engines/capabilities.ts, audit finding #14).
    const effServerCount = effectiveServerCount(serverCount, topology)

    // A hot spare holds no data, so its failure is not a data-loss event. Volumetry
    // (useVolumetryCalc.ts:80) and performance (usePerformanceCalc.ts:77) already remove spares
    // from their populations on this exact rule; resilience did not, which inflated the failure
    // population and understated survival for every configuration with a spare (#80).
    // vSAN rebuilds from distributed slack space rather than dedicated spare drives, so
    // usesDistributedSpares zeroes the subtraction there.
    const totalHotSpares = usesDistributedSpares(topology.type) ? 0 : hotSpares * effServerCount

    // Platforms whose simulated population is not simply `driveCount * serverCount` resolve it
    // through the table above — for BeeGFS the fault group is the storage target, and both the
    // population and the media come from the same resolved values volumetry uses. See
    // resolveBeeGfsSimulationScope for the derivation and the superset proof.
    const scope = SIMULATION_SCOPE_BY_TOPOLOGY[topology.type]?.({
      driveCount,
      serverCount: effServerCount,
      hotSpares,
      topology,
      tieringOptions,
      powerscaleOptions,
    })

    const mediaDrive = scope?.mediaDrive ?? drive
    const totalDriveCount = scope
      ? scope.driveCount
      : Math.max(0, driveCount * effServerCount - totalHotSpares)
    const groupCount = scope ? scope.groupCount : effServerCount

    const input: SimulationInput = {
      driveCount: totalDriveCount,
      raidLevel: getRaidLevel(topology),
      driveCapacityBytes: mediaDrive.capacity_raw,
      rebuildSpeedMBs,
      ureRate: mediaDrive.reliability.ure_rate,
      afrPercent: mediaDrive.reliability.afr,
      simulationCount,
      serverCount: groupCount,
      mirrorCopies,
      // Whether rebuild can start immediately or must first wait out a replacement-sourcing
      // delay (#93) — see SimulationInput.hasHotSpare. `scope?.hasHotSpare` lets a resolver
      // override the generic answer with a platform-specific spare signal — PowerScale's does,
      // from the tier's own VHS count, since the generic Hardware-panel hot-spares slider is
      // meaningless for it. Every other resolver leaves it `undefined` and falls through to
      // `totalHotSpares` (already zeroed for `usesDistributedSpares` platforms above), so vSAN
      // — which has no dedicated spare drive to credit — still gets no credit here either,
      // without a platform-specific branch.
      hasHotSpare: scope?.hasHotSpare ?? totalHotSpares > 0,
      // Shared fast-tier failure domain (#88). Absent for every platform outside
      // SHARED_FAST_TIER_TOPOLOGIES, and for those two when tiering is off — the worker's
      // defaults then reproduce the pre-#88 model exactly.
      sharedFastTierAfrPercent: scope?.sharedFastTier?.afrPercent,
      fastTierDeviceCount: scope?.sharedFastTier?.deviceCount,
      // PowerScale's tier protection (#1, fix round 1) — see the `powerscale` resolver above
      // and `SimulationInput.powerScaleProtection`'s doc comment for why this cannot be
      // vendor-validated the way every capacity number on this branch is.
      powerScaleProtection: scope?.powerScaleProtection,
    }

    worker.postMessage({ type: 'START', payload: input })
  }, [
    drive,
    driveCount,
    serverCount,
    hotSpares,
    topology,
    rebuildSpeedMBs,
    simulationCount,
    mirrorCopies,
    tieringOptions,
    powerscaleOptions,
  ])

  // Abort simulation
  const abort = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'ABORT' })
    }
  }, [])

  // Auto-run on config change (debounced)
  useEffect(() => {
    if (!autoRun || !drive) return

    const timeout = setTimeout(() => {
      runSimulation()
    }, 500)

    return () => clearTimeout(timeout)
  }, [autoRun, drive, runSimulation])

  return {
    result,
    progress,
    isRunning,
    error,
    runSimulation,
    abort,
  }
}
