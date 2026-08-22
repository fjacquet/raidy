/**
 * Web Worker for Monte Carlo resilience simulation.
 * Runs 10,000+ simulations to calculate array survival probability.
 */

import {
  isPowerScaleMirrorRegion,
  powerScaleMirrorCopies,
  STRIPE_SHAPES,
} from '@/engines/volumetry/powerscale/stripeShape'
import type { SimulationInput, WorkerInputMessage, WorkerOutputMessage } from '@/types/worker'

// Post typed message to main thread
function postMessage(message: WorkerOutputMessage) {
  self.postMessage(message)
}

// Random number generator with better distribution
function random(): number {
  return Math.random()
}

/**
 * Check if a RAID level uses mirror-based redundancy (pairs of drives).
 * Mirror topologies have a different failure model: data loss only occurs
 * when both drives in the same mirror pair fail, not just any N+1 failures.
 */
function isMirrorTopology(raidLevel: string): boolean {
  const level = raidLevel.toLowerCase()
  return level === 'raid10' || level === 'raid1' || level === 'mirror' || level === 'raid1e'
}

/**
 * Split `total` drives across `groups` fault groups as evenly as possible.
 * `Math.floor(total / groups)` alone can leave up to `groups - 1` drives
 * unassigned to any simulated group (issue #70), and failures beyond total
 * group capacity all landed on group 0 by array-index fallbacks. Distributing
 * the remainder — the first `total % groups` groups get one extra drive —
 * means every drive is modelled, at the cost of making groups heterogeneous
 * in width.
 */
export function distributeAcrossGroups(total: number, groups: number): number[] {
  if (groups <= 0) return []
  const base = Math.floor(total / groups)
  const remainder = total % groups
  return Array.from({ length: groups }, (_, g) => base + (g < remainder ? 1 : 0))
}

export interface GroupPairState {
  /** Capacity (surviving-copy count) of each pair slot, flattened across all groups: 2 for a real mirror pair, 1 for an unpaired/unprotected drive left over by an odd group width. */
  pairCapacity: number[]
  /** Owning group index of each flattened pair slot. */
  pairGroupIndex: number[]
  /** Index into the flattened arrays where each group's pairs start. */
  groupPairStart: number[]
  /** Number of pair slots (real pairs + at most one solo slot) in each group. */
  groupPairCount: number[]
  /**
   * Node (physical host/server) holding the first copy of each flattened pair
   * slot (issue #113). For solo slots this is the slot's only copy.
   */
  pairNodeA: number[]
  /**
   * Node holding the second copy of each flattened pair slot. Equal to
   * `pairNodeA` at the same index for solo slots (capacity 1, no partner) —
   * see `buildGroupPairState`'s doc comment for why real pairs are also
   * same-node here.
   */
  pairNodeB: number[]
}

/**
 * Build the flattened per-pair state for mirrored group layouts (unmerged
 * beegfs_raid10, issue #66): each group of width W is floor(W / 2) real mirror
 * pairs (capacity 2) plus one unpaired/unprotected drive (capacity 1) if W is
 * odd. Flattened rather than an array-of-arrays so this — run once per Monte
 * Carlo iteration, up to 100K times — stays a handful of O(driveCount)
 * allocations instead of one allocation per group.
 *
 * Node identity (issue #113): `groupNodeIndex[g]` is the physical node the
 * whole group lives on (defaults to `g`, i.e. "one group == one node", which
 * holds for every caller today — the only caller is unmerged beegfs_raid10,
 * whose groups are individual, unbuddied storage targets). Both copies of a
 * mirror pair built here get the SAME node, deliberately: a BeeGFS storage
 * target's internal RAID10 mirroring is a LOCAL disk-level RAID array on one
 * server, not cross-server replication — buddy mirroring (a different layer,
 * modelled separately via `mirrorCopies`) is what BeeGFS does across nodes.
 * Placing a local pair's two copies on two different simulated nodes would
 * be modelling a topology BeeGFS does not have.
 */
export function buildGroupPairState(
  groupWidths: number[],
  groupNodeIndex: number[] = [],
): GroupPairState {
  const numGroups = groupWidths.length
  const groupPairStart: number[] = new Array(numGroups)
  const groupPairCount: number[] = new Array(numGroups)
  let offset = 0
  for (let g = 0; g < numGroups; g++) {
    const width = groupWidths[g] ?? 0
    const pairs = Math.ceil(width / 2)
    groupPairStart[g] = offset
    groupPairCount[g] = pairs
    offset += pairs
  }
  const pairCapacity: number[] = new Array(offset)
  const pairGroupIndex: number[] = new Array(offset)
  const pairNodeA: number[] = new Array(offset)
  const pairNodeB: number[] = new Array(offset)
  for (let g = 0; g < numGroups; g++) {
    const width = groupWidths[g] ?? 0
    const fullPairs = Math.floor(width / 2)
    const hasSolo = width % 2 === 1
    const start = groupPairStart[g] ?? 0
    const node = groupNodeIndex[g] ?? g
    for (let p = 0; p < fullPairs; p++) {
      pairCapacity[start + p] = 2
      pairGroupIndex[start + p] = g
      pairNodeA[start + p] = node
      pairNodeB[start + p] = node
    }
    if (hasSolo) {
      pairCapacity[start + fullPairs] = 1 // unpaired drive: no mirror partner, tolerance 0
      pairGroupIndex[start + fullPairs] = g
      pairNodeA[start + fullPairs] = node
      pairNodeB[start + fullPairs] = node
    }
  }
  return { pairCapacity, pairGroupIndex, groupPairStart, groupPairCount, pairNodeA, pairNodeB }
}

/**
 * Assign a physical node (host/server/chassis) to each of `copiesPerGroup`
 * replica slots in each of `numGroups` fault groups (issue #113). Computed
 * once in the setup phase (`computeTopologyModel`), not per Monte Carlo
 * iteration — node identity does not depend on any random draw.
 *
 * This is pure bookkeeping for now: nothing in `runSingleSimulation` reads
 * the result yet, so it cannot move any survival figure (the #113 regression
 * gate). It exists so a future correlated-failure model (#88 — e.g. a vSAN
 * disk-group kill) can ask "which node does this replica live on" and, by
 * construction, never build an arrangement a real system would not: two
 * replicas of the same pair on the same node.
 *
 * Placement rule: deterministic round-robin, offset by `group *
 * copiesPerGroup` so consecutive groups don't all start on node 0. When
 * `nodeCount >= copiesPerGroup` — true by construction for every platform in
 * scope (vSAN: default fault domain is the host; Ceph: default CRUSH failure
 * domain is the host; S2D/Nutanix: resiliency is at least server-level, one
 * copy per server) — this guarantees every replica slot within one group
 * lands on a DISTINCT node. When `nodeCount < copiesPerGroup` (more mirror
 * copies than nodes — a configuration these platforms' own placement rules
 * would not allow) the formula wraps rather than throwing: it is the
 * conservative choice of "degrade gracefully" over "assert a guarantee the
 * input cannot support".
 */
export function assignNodesRoundRobin(
  numGroups: number,
  copiesPerGroup: number,
  nodeCount: number,
): number[][] {
  const safeNodeCount = Math.max(1, nodeCount)
  const assignments: number[][] = new Array(numGroups)
  for (let g = 0; g < numGroups; g++) {
    const nodes: number[] = new Array(copiesPerGroup)
    for (let c = 0; c < copiesPerGroup; c++) {
      nodes[c] = (g * copiesPerGroup + c) % safeNodeCount
    }
    assignments[g] = nodes
  }
  return assignments
}

/**
 * Check if a RAID level uses group-based redundancy (RAID 50/60).
 * Group topologies stripe across independent RAID groups. Data loss only occurs
 * when a single group exceeds its parity tolerance, not from failures across groups.
 */
function isGroupTopology(raidLevel: string): boolean {
  const level = raidLevel.toLowerCase()
  return (
    level === 'raid50' ||
    level === 'raid60' ||
    // BeeGFS storage targets are independent local-RAID fault groups — the
    // storage-target count is passed in as `serverCount` (see the caller), so
    // this reuses the RAID 50/60 group model.
    //
    // `beegfs_raid10` routes here, not through the drive-pair mirror model. A
    // real RAID10 target holding `drivesPerTarget` drives is
    // `drivesPerTarget / 2` striped mirror pairs and is lost when ANY one of
    // those pairs loses both drives, so its failure probability scales with
    // `drivesPerTarget`. The mirror model cannot see that: it only receives
    // `driveCount` and `mirrorCopies`, never the target width, so it silently
    // assumed one pair per target and understated failure probability by a
    // factor of ~`drivesPerTarget / 2`. The group model is the only path where
    // the target width reaches the simulation (`drivesPerGroup` is derived
    // from `serverCount`). See the group-topology branch below for the
    // superset proof.
    level === 'beegfs_raid6' ||
    level === 'beegfs_raidz2' ||
    level === 'beegfs_raid10'
  )
}

/**
 * Calculate number of parity drives (fault tolerance) for a RAID level.
 */
export function getParityDrives(raidLevel: string): number {
  const level = raidLevel.toLowerCase()

  // BeeGFS levels (storage-target-local redundancy; buddy mirroring is a
  // separate layer expressed via mirrorCopies, not here)
  if (level === 'beegfs_raid6') return 2
  if (level === 'beegfs_raidz2') return 2
  if (level === 'beegfs_raid10') return 1
  if (level === 'beegfs_single') return 0

  // RAID levels
  if (level === 'raid0' || level === 'stripe') return 0
  if (level === 'raid1' || level === 'mirror') return 1 // Can lose 1 drive in a pair
  if (level === 'raid5' || level === 'raidz1' || level === 'draid1') return 1
  if (level === 'raid6' || level === 'raidz2' || level === 'draid2') return 2
  if (level === 'raidz3' || level === 'draid3') return 3
  if (level === 'raid10') return 1 // Per mirror pair
  if (level === 'raid50') return 1 // Per RAID5 group
  if (level === 'raid60') return 2 // Per RAID6 group

  // S2D levels
  if (level === 'simple') return 0
  if (level === 'parity' || level === 'single') return 1
  if (level === 'dual_parity' || level === 'dual') return 2
  if (level === 'map') return 2 // Mirror-accelerated parity

  // Proprietary
  if (level === 'synology_shr') return 1
  if (level === 'synology_shr2') return 2
  if (level === 'netapp_raid_dp') return 2
  if (level === 'netapp_raid_tec') return 3

  // Longhorn (replicated block storage): tolerates R-1 replica failures
  if (level === 'longhorn_r2') return 1
  if (level === 'longhorn_r3') return 2

  return 1 // Default to single parity
}

export interface TopologyModel {
  parityDrives: number
  isGroup: boolean
  isMirror: boolean
  effectiveMirrorCopies: number
  numMirrorGroups: number
  mirrorParityPerGroup: number
  numGroups: number
  groupWidths: number[]
  parityPerGroup: number
  usesPerPairGroupModel: boolean
  pairCapacity: number[]
  pairGroupIndex: number[]
  groupPairStart: number[]
  groupPairCount: number[]
  /** Node holding each pair slot's first copy (issue #113). See `GroupPairState.pairNodeA`. */
  pairNodeA: number[]
  /** Node holding each pair slot's second copy (issue #113). See `GroupPairState.pairNodeB`. */
  pairNodeB: number[]
  rebuildTimeHours: number
  ureRatePerBit: number
  bitsRead: number
  ureProbability: number
  groupUreProbability: number[]
  /**
   * Node(s) each group lives on (issue #113). Length 1 for every ordinary
   * group ("one group == one node"); length 2 for a buddy-mirrored BeeGFS
   * group, which really is two storage targets on two different servers
   * merged into one simulated group. Empty when `isGroup` is false.
   */
  groupNodeIndices: number[][]
  /**
   * Node assigned to each replica slot of each flat mirror group (issue
   * #113) — the drive-pair model used by plain RAID1/10, and by every
   * tiered platform's mirror level (vSAN OSA RAID1, Ceph replicated,
   * Nutanix RF2/RF3, S2D mirror, PowerVault RAID1/10, PowerFlex mirror).
   * `powerscale_mirror_2x`/`_3x` are no longer valid levels, but PowerScale
   * DOES join this family conditionally: when a pool has too few nodes for
   * its protection's node-failure tolerance (`nodeCount < 2*nf`), OneFS
   * mirrors instead of striping FEC — see `isPowerScaleMirrorRegion` and the
   * PowerScale block in `computeTopologyModel` below. Outside that region
   * PowerScale uses the dedicated node-erasure-coding model instead
   * (`isPowerScaleFec`), not this one. `mirrorGroupNodes[g][c]` is the node
   * for copy `c` of mirror group `g`. Empty when `isMirror` is false. See
   * `assignNodesRoundRobin` for the placement rule and its degenerate case.
   */
  mirrorGroupNodes: number[][]
  /**
   * PowerScale node-erasure-coding region (`nodeCount >= 2*nf` for the tier's protection) — a
   * single flat domain spanning the WHOLE pool, unlike `isGroup` (independent parallel groups,
   * any one lost = total loss) and unlike the plain parity model (node-blind drive counting).
   * False for every non-PowerScale level, and false for PowerScale when no protection was
   * supplied or the pool is small enough to fall into the mirror region instead (`isMirror`
   * handles that case). See the dedicated branch in `runSingleSimulation`.
   *
   * NOT vendor-attested — see `SimulationInput.powerScaleProtection`'s doc comment.
   */
  isPowerScaleFec: boolean
  /** `nf` from `STRIPE_SHAPES` — whole NODE failures the pool tolerates. 0 when `isPowerScaleFec` is false. */
  powerScaleNodeTolerance: number
  /** `M` from `STRIPE_SHAPES` — drive failures tolerated WITHIN one node before that node's own budget is exceeded. 0 when `isPowerScaleFec` is false. */
  powerScaleDriveWithinNodeTolerance: number
  /** Per-node drive counts (`distributeAcrossGroups(driveCount, nodeCount)`). Empty when `isPowerScaleFec` is false. */
  powerScaleNodeWidths: number[]
}

/**
 * Precompute everything derived from `input` that does NOT depend on the
 * random failure draws — topology classification, group widths, per-pair
 * state, rebuild-read volumes. All of it is identical across every one of the
 * up to 100K Monte Carlo iterations for a given input, so `runSimulation`
 * computes it once and passes it to every `runSingleSimulation` call instead
 * of each iteration reallocating group/pair arrays from scratch (issues #66,
 * #67, #70 added several new arrays here — keeping this out of the hot loop
 * keeps per-pair state from turning into allocation-heavy-per-iteration work).
 */
export function computeTopologyModel(input: SimulationInput): TopologyModel {
  const {
    driveCount,
    raidLevel,
    driveCapacityBytes,
    rebuildSpeedMBs,
    ureRate,
    serverCount = 1,
    mirrorCopies = 0,
    powerScaleProtection,
  } = input

  const parityDrives = getParityDrives(raidLevel)

  // PowerScale (#1, fix round 1): OneFS protection is per NODE, not per drive, and
  // `getParityDrives` above has no case for `'powerscale_onefs'` — it falls to the generic
  // single-parity default, which is the correct fallback ONLY when no protection is known
  // (empty tier list). When a protection IS known, `STRIPE_SHAPES` decides everything below.
  //
  // NOT vendor-attested — see `SimulationInput.powerScaleProtection`'s doc comment. Dell's
  // PowerSizer export carries no AFR/URE/MTBF; this model is derived from published OneFS
  // protection semantics, not sourced from the workbook the rest of this branch validates
  // capacity against.
  const powerScaleShape =
    raidLevel === 'powerscale_onefs' && powerScaleProtection
      ? STRIPE_SHAPES[powerScaleProtection]
      : undefined
  // Too few nodes for the protection's node-failure tolerance to be worth striping: OneFS
  // mirrors instead (same boundary the capacity closed form uses — see `isPowerScaleMirrorRegion`).
  const powerScaleMirrorRegionFlag = powerScaleShape
    ? isPowerScaleMirrorRegion(powerScaleShape.nf, serverCount)
    : false

  // Topology classification. A caller can pass mirrorCopies (e.g. BeeGFS buddy
  // mirroring) even for a level whose local redundancy is zero (beegfs_single),
  // and that mirror layer must still apply.
  //
  // A level's own group-vs-mirror shape (RAID 50/60, BeeGFS RAID6/RAIDZ2/RAID10
  // storage targets) always wins over a generic mirrorCopies input —
  // mirrorCopies then layers an *additional* mirror on top of the group
  // (buddy mirroring pairs storage targets, it does not replace their local
  // redundancy — see the buddy-pair handling below). Only when the level has
  // no native group shape does mirrorCopies switch on the drive-pair mirror
  // model directly (e.g. plain 'mirror' / 'raid1', or beegfs_single which has
  // no local redundancy of its own). PowerScale joins the mirror family only
  // inside its own mirror region (`powerScaleMirrorRegionFlag`) — see above.
  const isGroup = isGroupTopology(raidLevel)
  const isMirror =
    !isGroup &&
    (mirrorCopies >= 2 ||
      isMirrorTopology(raidLevel) ||
      (powerScaleShape !== undefined && powerScaleMirrorRegionFlag))
  const effectiveMirrorCopies =
    powerScaleShape !== undefined && powerScaleMirrorRegionFlag
      ? powerScaleMirrorCopies(powerScaleShape.nf, serverCount)
      : mirrorCopies >= 2
        ? mirrorCopies
        : 2

  // Calculate rebuild time in hours
  const driveCapacityMB = driveCapacityBytes / (1024 * 1024)
  const rebuildTimeHours = driveCapacityMB / rebuildSpeedMBs / 3600

  // Mirror topology: N-way mirror groups (e.g., 2-way pairs, 3-way triplets)
  const numMirrorGroups = isMirror ? Math.floor(driveCount / effectiveMirrorCopies) : 0
  const mirrorParityPerGroup = effectiveMirrorCopies - 1 // Can lose N-1 copies per group

  // Node identity for the flat mirror model (issue #113). This path is used
  // both by single-node standard RAID1/RAID10 (`serverCount` defaults to 1,
  // so every copy lands on node 0 — today's behaviour, unchanged) and by
  // every tiered platform's mirror level (vSAN OSA RAID1, Ceph replicated,
  // Nutanix RF2/RF3, S2D mirror/MAP, PowerVault RAID1/10, PowerFlex mirror),
  // where `serverCount` is the real host count and real placement puts each
  // copy on a different host. PowerScale reuses this exact machinery inside
  // its mirror region — see the note on `mirrorGroupNodes` above. See
  // `assignNodesRoundRobin` for the rule.
  const mirrorGroupNodes: number[][] = isMirror
    ? assignNodesRoundRobin(numMirrorGroups, effectiveMirrorCopies, serverCount)
    : []

  // PowerScale node-erasure-coding region (`!powerScaleMirrorRegionFlag`, protection known): a
  // single flat domain spanning the WHOLE pool, not multiple independent stripe groups
  // (`isGroup` below) and not node-blind drive counting (the plain parity model at the bottom
  // of `runSingleSimulation`). Node widths reuse `distributeAcrossGroups` — the same
  // "spread the remainder instead of dropping it" utility the RAID50/60 group model uses below,
  // just applied to physical nodes instead of RAID groups. See the dedicated branch in
  // `runSingleSimulation` for the tolerance rule (nf node failures, or M drive failures
  // concentrated in one node) and why it needs its own branch rather than reusing `isGroup` or
  // the flat parity count: neither expresses "one flat domain, but counted per-node".
  const isPowerScaleFec = powerScaleShape !== undefined && !powerScaleMirrorRegionFlag
  const powerScaleNodeTolerance = powerScaleShape?.nf ?? 0
  const powerScaleDriveWithinNodeTolerance = powerScaleShape?.M ?? 0
  const powerScaleNodeWidths: number[] = isPowerScaleFec
    ? distributeAcrossGroups(driveCount, Math.max(1, serverCount))
    : []

  // Group topology: RAID 50/60 (and BeeGFS RAID6/RAIDZ2/RAID10 storage targets)
  // stripe across independent RAID groups.
  //
  // Buddy mirroring pairs whole storage targets, not individual drives, and a
  // BeeGFS buddy group is always exactly two targets (there is no 3-way buddy
  // mode) — hence `=== 2`, not `>= 2`: a stray 3 must never be silently
  // treated as a buddy pair. Two adjacent groups are merged into one buddy
  // unit with double the drives and tolerance `2 * parityDrives + 1`.
  //
  // It also requires an even target count. With an odd `serverCount` at least
  // one target is necessarily unpaired and therefore has no buddy protection
  // at all; merging `floor(serverCount / 2)` units would pool that unprotected
  // target's drives into a merged unit and hide it, which would OVERSTATE
  // resilience. So buddy credit is withheld entirely when `serverCount` is
  // odd, falling back to the (provably conservative, see below) unmerged
  // per-target model.
  //
  // INVARIANT (holds for every BeeGFS group level, buddy on or off): the set
  // of drive-failure patterns this simulation calls "data loss" is a SUPERSET
  // of the physically real one. The tool may therefore understate resilience,
  // never overstate it. It is NOT exact.
  //
  // Proof, per configuration, on any failure pattern:
  //  - Unmerged (buddy off, or odd serverCount). A group is one storage
  //    target; it is declared dead at `> parityDrives` failures — EXCEPT
  //    beegfs_raid10, which since #66 uses per-pair state instead of this
  //    flat counter (see buildGroupPairState below): a real RAID10 target is
  //    lost only when both drives of the SAME mirror pair die, and that is
  //    now exactly what the simulation checks, not merely `>= 2` failures
  //    anywhere in the target.
  //    * beegfs_raid6 / beegfs_raidz2 (parityDrives 2): a real target is lost
  //      once a 3rd drive in it fails — exactly the simulated threshold.
  //    * Cluster-wide: BeeGFS stripes across targets, so losing any single
  //      target is data loss with buddy mirroring off — matching "any group
  //      over tolerance".
  //  - Merged (buddy on, even serverCount). A buddy unit A+B is really lost
  //    only when A and B are each independently lost. From the unmerged case,
  //    A lost => A holds >= parityDrives + 1 failures, likewise B, so a real
  //    buddy loss implies >= 2 * parityDrives + 2 failures in the merged unit.
  //    The simulated threshold fires at `> 2 * parityDrives + 1`, i.e. at
  //    2 * parityDrives + 2. Real loss => simulated loss. Strict superset:
  //    2 * parityDrives + 2 failures concentrated in A alone are flagged here
  //    but survivable in reality (B is intact). (Buddy-merged beegfs_raid10
  //    keeps the flat counter — #66 is specifically about the unmerged case.)
  // URE-triggered losses only add further simulated failures on top, so they
  // preserve the superset direction for every group EXCEPT the per-pair
  // beegfs_raid10 case, which is exact rather than conservative by
  // construction (#66).
  //
  // Direction property for beegfs_raid10 (why `drivesPerTarget` now matters):
  // `serverCount = floor(totalDrives / drivesPerTarget)`, so a larger
  // `drivesPerTarget` yields fewer, wider groups at an unchanged tolerance —
  // more drives able to collide inside one fault group. Survival is therefore
  // non-increasing in `drivesPerTarget`, the physically correct direction
  // (more striped mirror pairs per target = more ways to lose one).
  const isBuddyMirroredGroup = isGroup && mirrorCopies === 2 && serverCount % 2 === 0
  const numGroups = isGroup
    ? isBuddyMirroredGroup
      ? Math.max(1, Math.floor(serverCount / 2))
      : serverCount
    : 0
  // Heterogeneous group widths (#70): the remainder of driveCount / numGroups is
  // distributed one-per-group across the first `driveCount % numGroups` groups
  // instead of being silently dropped by Math.floor. Every drive is now inside
  // exactly one simulated group.
  const groupWidths: number[] = isGroup ? distributeAcrossGroups(driveCount, numGroups) : []
  const parityPerGroup = isBuddyMirroredGroup ? parityDrives * 2 + 1 : parityDrives // 1 for RAID 50, 2 for RAID 60

  // Node identity for group topologies (issue #113): an ordinary group is one
  // storage target/RAID group on one physical server, so it lives on exactly
  // one node — its own group index. A buddy-mirrored group is two BeeGFS
  // storage targets on two different servers merged into one simulated
  // group (see the buddy-mirroring comment above), so it spans two nodes.
  // `serverCount` is the input's real node count either way (it is what
  // `numGroups` was derived from, a few lines up).
  const groupNodeIndices: number[][] = isGroup
    ? Array.from({ length: numGroups }, (_, g) => (isBuddyMirroredGroup ? [2 * g, 2 * g + 1] : [g]))
    : []

  // A RAID10-mirror storage target rebuilds by reading only the surviving
  // mirror partner — one drive's worth — never the rest of the target, unlike
  // a parity group rebuild (RAID50/60, beegfs_raid6/raidz2) which reads every
  // other group drive. The group-path formula below previously used
  // `(drivesPerGroup - 1) x capacity` unconditionally, overstating
  // beegfs_raid10's rebuild-read volume and therefore its URE exposure
  // (safe-direction bug: it could only overstate risk, never understate it).
  const isMirroredGroupLayout = isGroup && raidLevel.toLowerCase() === 'beegfs_raid10'

  // Per-pair mirror modelling for unmerged beegfs_raid10 groups (#66): a RAID10
  // storage target of width W is floor(W / 2) independent mirror pairs (plus one
  // unpaired, unprotected drive if W is odd), and the target is lost only when
  // BOTH drives of one specific pair fail — not at a fixed group-wide failure
  // count. The flat `parityPerGroup` counter used by every other group layout
  // cannot express that: it kills the group at failure count `parityDrives + 1`
  // (= 2) regardless of which pairs those failures hit, which is pessimistic for
  // wide targets (a 12-drive target really tolerates up to 6 failures, one per
  // pair). Buddy-merged beegfs_raid10 groups are unaffected — #66 is specifically
  // about the pessimistic *unmerged* tolerance — and keep the flat model above.
  const usesPerPairGroupModel = isMirroredGroupLayout && !isBuddyMirroredGroup

  const { pairCapacity, pairGroupIndex, groupPairStart, groupPairCount, pairNodeA, pairNodeB } =
    usesPerPairGroupModel
      ? buildGroupPairState(
          groupWidths,
          groupNodeIndices.map((nodes) => nodes[0] ?? 0),
        )
      : {
          pairCapacity: [],
          pairGroupIndex: [],
          groupPairStart: [],
          groupPairCount: [],
          pairNodeA: [],
          pairNodeB: [],
        }

  // URE probability during rebuild
  const ureRatePerBit = 10 ** -ureRate

  // Bits read during rebuild depends on topology:
  // Mirror: reads only 1 good copy (any surviving mirror partner)
  // Group: reads all drives in the group minus the failed one — except mirrored
  //   group layouts (beegfs_raid10, #67), which rebuild from a single
  //   surviving mirror partner regardless of the group's total width, same as
  //   the plain mirror case.
  // Parity: reads ALL surviving drives (N-1 drives)
  let bitsRead: number
  if (isMirror) {
    bitsRead = driveCapacityBytes * 8 // 1 drive
  } else if (isGroup) {
    bitsRead = 0 // computed per-group below — groups can have different widths now (#70)
  } else {
    bitsRead = driveCapacityBytes * 8 * (driveCount - 1)
  }
  const ureProbability = 1 - (1 - ureRatePerBit) ** bitsRead

  // Per-group rebuild-read volume and URE probability (#67, #70): each group can
  // now have a different width, and mirrored group layouts always read just one
  // drive's worth regardless of width (a RAID10 rebuild reads only the surviving
  // mirror partner, not `drivesPerGroup - 1` drives).
  const groupUreProbability: number[] = isGroup
    ? groupWidths.map((width) => {
        const groupBitsRead = isMirroredGroupLayout
          ? driveCapacityBytes * 8 // mirrored group: rebuild reads 1 surviving partner
          : width > 1
            ? driveCapacityBytes * 8 * (width - 1)
            : 0
        return 1 - (1 - ureRatePerBit) ** groupBitsRead
      })
    : []

  return {
    parityDrives,
    isGroup,
    isMirror,
    effectiveMirrorCopies,
    numMirrorGroups,
    mirrorParityPerGroup,
    numGroups,
    groupWidths,
    parityPerGroup,
    usesPerPairGroupModel,
    pairCapacity,
    pairGroupIndex,
    groupPairStart,
    groupPairCount,
    pairNodeA,
    pairNodeB,
    rebuildTimeHours,
    ureRatePerBit,
    bitsRead,
    ureProbability,
    groupUreProbability,
    groupNodeIndices,
    mirrorGroupNodes,
    isPowerScaleFec,
    powerScaleNodeTolerance,
    powerScaleDriveWithinNodeTolerance,
    powerScaleNodeWidths,
  }
}

/**
 * Run a single Monte Carlo simulation.
 * Returns true if the array survives, false if data loss occurs.
 *
 * This model includes:
 * - Individual drive failures based on AFR
 * - Correlated/batch failures (drives from same batch fail together)
 * - URE (Unrecoverable Read Error) during rebuild
 * - Stress-induced failures (rebuild increases failure rate of remaining drives)
 */
function runSingleSimulation(
  input: SimulationInput,
  topo: TopologyModel,
): {
  survived: boolean
  rebuildTimeHours: number
  hadURE: boolean
  hadDualFailure: boolean
} {
  const {
    driveCount,
    afrPercent,
    hasHotSpare = true,
    sharedFastTierAfrPercent = 0,
    fastTierDeviceCount = 0,
  } = input
  const {
    parityDrives,
    isGroup,
    isMirror,
    effectiveMirrorCopies,
    numMirrorGroups,
    mirrorParityPerGroup,
    numGroups,
    groupWidths,
    parityPerGroup,
    usesPerPairGroupModel,
    pairCapacity,
    pairGroupIndex,
    groupPairStart,
    groupPairCount,
    rebuildTimeHours,
    ureProbability,
    groupUreProbability,
    isPowerScaleFec,
    powerScaleNodeTolerance,
    powerScaleDriveWithinNodeTolerance,
    powerScaleNodeWidths,
  } = topo

  // Base daily failure rate per drive
  const baseDailyFailureRate = afrPercent / 100 / 365

  // Correlated failure factor: 10% chance a failure triggers another within 7 days
  // This models batch failures from same manufacturing lot
  const correlatedFailureProbability = 0.1
  const correlatedFailureWindowDays = 7

  // Stress factor: rebuild increases failure rate of remaining drives by 30%
  const rebuildStressFactor = 1.3

  /**
   * Shared fast-tier failure domain (issue #88). A vSAN OSA cache device takes its whole disk
   * group down with it, and a Ceph block.db device takes every OSD it serves — see
   * `SimulationInput.sharedFastTierAfrPercent` for the vendor statements.
   *
   * Both figures are zero unless the caller opts in, so every pre-#88 configuration takes the
   * `hasSharedFastTier === false` path and is bit-for-bit unchanged.
   *
   * `drivesPerFastTierDevice` is rounded UP: a device backing 2.5 drives on average cannot take
   * down half a drive, and rounding down would silently model a smaller blast radius than the
   * hardware has — the optimistic direction, which is the one this issue exists to remove.
   */
  const hasSharedFastTier = sharedFastTierAfrPercent > 0 && fastTierDeviceCount > 0
  const fastTierDailyFailureRate = sharedFastTierAfrPercent / 100 / 365
  const drivesPerFastTierDevice = hasSharedFastTier
    ? Math.ceil(driveCount / fastTierDeviceCount)
    : 0

  // Replacement-sourcing delay (issue #93): without a dedicated hot spare, rebuild cannot
  // start the moment a drive is declared failed — someone has to notice the alert, source a
  // replacement, and physically install it first. 1 day models a next-business-day advance
  // parts replacement SLA (the common enterprise support contract — e.g. Dell ProSupport NBD,
  // HPE Foundation Care NBD), which is also the middle of the three non-hot-spare MTTR
  // scenarios (10 min notification + immediate/NBD/7-day RMA + install) published in
  // ServeTheHome's MTTR guide
  // (https://www.servethehome.com/excess-capacity-whs-vail-aurora-hot-spares-raid-time-recover-mttr-guide/),
  // whose "24-Hour Supported System / Advanced Replacement" scenario totals ~24h45m
  // (600s notification + 8,640s technician arrival + 300s install). Rounded to 1 whole day
  // because this loop advances one day at a time. With a hot spare present, rebuild still
  // starts immediately (`hasHotSpare` defaults to `true`, unchanged from before #93).
  const REPLACEMENT_DELAY_DAYS = 1

  // No redundancy and no mirror layer = any failure is data loss
  if (parityDrives === 0 && !isMirror) {
    for (let day = 0; day < 365; day++) {
      for (let drive = 0; drive < driveCount; drive++) {
        if (random() < baseDailyFailureRate) {
          return { survived: false, rebuildTimeHours: 0, hadURE: false, hadDualFailure: true }
        }
      }
    }
    return { survived: true, rebuildTimeHours: 0, hadURE: false, hadDualFailure: false }
  }

  // Per-iteration mutable state only — the group/pair *structure* (widths,
  // capacities, offsets) is precomputed once per simulation run in
  // computeTopologyModel, not reallocated here on every one of the 100K calls.
  const pairFailures: number[] = usesPerPairGroupModel ? new Array(pairCapacity.length).fill(0) : []

  // Simulate one year of operation
  let failedDrives = 0
  // Mirror: per-group failure tracking (supports 2-way, 3-way, N-way mirrors)
  const mirrorGroupFailures = isMirror ? (new Array(numMirrorGroups).fill(0) as number[]) : []
  const groupFailures = isGroup ? (new Array(numGroups).fill(0) as number[]) : []
  // PowerScale FEC region: per-node failure counts, plus a running count of DISTINCT nodes
  // touched by any failure (cheaper than re-deriving it from powerScaleNodeFailures every day).
  const powerScaleNodeFailures = isPowerScaleFec
    ? (new Array(powerScaleNodeWidths.length).fill(0) as number[])
    : []
  let powerScaleNodesTouched = 0
  let isRebuilding = false
  let rebuildDaysRemaining = 0
  // Replacement-sourcing delay state (issue #93). `repairPending` and `isRebuilding` are
  // mutually exclusive: a triggering failure enters `repairPending` (spare-free) XOR
  // `isRebuilding` (spare present) directly, never both. Single global flag, matching the
  // pre-existing single-active-rebuild granularity of `isRebuilding` above — this model has
  // never tracked more than one concurrent repair operation, groups included.
  let repairPending = false
  let replacementDelayDaysRemaining = 0
  let correlatedFailureWindow = 0
  let hadURE = false
  let hadDualFailure = false

  for (let day = 0; day < 365; day++) {
    const activeDrives = driveCount - failedDrives

    // Calculate effective failure rate
    let effectiveFailureRate = baseDailyFailureRate

    // Increase failure rate during rebuild (stress on remaining drives)
    if (isRebuilding) {
      effectiveFailureRate *= rebuildStressFactor
    }

    // Increase failure rate during correlated failure window
    if (correlatedFailureWindow > 0) {
      effectiveFailureRate *= 2.0 // Double the rate during batch failure window
      correlatedFailureWindow--
    }

    // Roll the shared fast-tier devices before the per-drive pass (#88). Each device that fails
    // today takes its whole set of capacity drives with it, so those drives are declared failed
    // regardless of their own dice.
    //
    // The count is carried into the loop below rather than handled in a branch of its own,
    // deliberately: forced failures then run through the SAME body as ordinary ones and pick up
    // the mirror/pair/group assignment, the URE check, the rebuild trigger and the correlated
    // window exactly as they should. A parallel code path would have silently skipped all four.
    //
    // `activeDrives` bounds the loop, so a blast radius larger than the surviving population
    // simply fails everything left, which is the correct outcome rather than an overflow.
    //
    // KNOWN CONSERVATISM — this model is node-blind. The forced failures are assigned by the same
    // weighted-random logic as ordinary ones, so they can land on two replicas of the SAME mirror
    // pair. Real placement forbids that: vSAN's default fault domain is the host and Ceph's
    // default CRUSH failure domain is the host, so one cache/DB device failing can take at most
    // one copy of any given object. `assignNodesRoundRobin` already computes exactly the node
    // identity needed to enforce it (#113 built it for this), and `mirrorGroupNodes` is threaded
    // into the model — but nothing reads it yet, here included.
    //
    // The error therefore runs in the SAFE direction: it destroys arrangements a real cluster
    // would not build, so it overstates harm. That satisfies the worker's superset invariant
    // (may understate resilience, never overstate it), but it does mean the dual-failure figures
    // for mirrored levels are an upper bound rather than a calibrated estimate. Consuming
    // `mirrorGroupNodes` here is the refinement that would tighten them.
    let forcedFailuresToday = 0
    if (hasSharedFastTier) {
      for (let device = 0; device < fastTierDeviceCount; device++) {
        if (random() < fastTierDailyFailureRate) {
          forcedFailuresToday += drivesPerFastTierDevice
        }
      }
    }

    // Check for drive failures
    for (let drive = 0; drive < activeDrives; drive++) {
      if (drive < forcedFailuresToday || random() < effectiveFailureRate) {
        failedDrives++

        // Check for correlated failure trigger
        if (random() < correlatedFailureProbability) {
          correlatedFailureWindow = correlatedFailureWindowDays
        }

        if (isMirror) {
          // Mirror topology: N-way mirror groups (2-way, 3-way, etc.)
          // Assign failure to a mirror group weighted by surviving drives in each group
          const survivingPerGroup = mirrorGroupFailures.map(
            (_f, g) => effectiveMirrorCopies - (mirrorGroupFailures[g] ?? 0),
          )
          const totalSurviving = survivingPerGroup.reduce((a, b) => a + b, 0)

          let r = random() * totalSurviving
          let hitGroup = 0
          for (let g = 0; g < numMirrorGroups; g++) {
            r -= survivingPerGroup[g] ?? 0
            if (r <= 0) {
              hitGroup = g
              break
            }
          }

          mirrorGroupFailures[hitGroup] = (mirrorGroupFailures[hitGroup] ?? 0) + 1

          // Data loss if all copies in a mirror group are lost
          if ((mirrorGroupFailures[hitGroup] ?? 0) > mirrorParityPerGroup) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          // Start rebuild immediately (hot spare present) or begin the replacement-sourcing
          // delay first (#93) — see REPLACEMENT_DELAY_DAYS.
          if (!isRebuilding && !repairPending) {
            if (hasHotSpare) {
              isRebuilding = true
              rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
            } else {
              repairPending = true
              replacementDelayDaysRemaining = REPLACEMENT_DELAY_DAYS
            }
          }

          // URE only fatal when mirror group is at its parity limit (last copy being rebuilt).
          // Unconditional on `isRebuilding`/`repairPending` (#93): this is a one-shot check
          // evaluated at the failure event that exhausts the group's redundancy, exactly as
          // before #93 — the replacement-sourcing delay changes how long `failedDrives`/group
          // failure counts stay elevated (extending exposure to a second failure), not this
          // mechanic. Gating it on `isRebuilding` was tried and rejected: it silently dropped
          // URE risk for spare-free configs instead of adding exposure, moving survival the
          // wrong direction (see CHANGELOG).
          if (
            (mirrorGroupFailures[hitGroup] ?? 0) >= mirrorParityPerGroup &&
            random() < ureProbability
          ) {
            hadURE = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }
        } else if (isGroup) {
          // Group topology: assign failure to a group weighted by surviving drives.
          // Each group has (groupWidths[g] - groupFailures[g]) surviving drives —
          // groups can differ in width now that the remainder is distributed (#70).
          const survivingPerGroup = groupFailures.map(
            (_f, g) => (groupWidths[g] ?? 0) - (groupFailures[g] ?? 0),
          )
          const totalSurviving = survivingPerGroup.reduce((a, b) => a + b, 0)

          // Pick which group the failure hits (weighted by surviving drives in each group)
          let r = random() * totalSurviving
          let hitGroup = 0
          for (let g = 0; g < numGroups; g++) {
            r -= survivingPerGroup[g] ?? 0
            if (r <= 0) {
              hitGroup = g
              break
            }
          }

          groupFailures[hitGroup] = (groupFailures[hitGroup] ?? 0) + 1
          const groupUre = groupUreProbability[hitGroup] ?? 0

          if (usesPerPairGroupModel) {
            // Pick which mirror pair inside the group absorbs the failure, weighted
            // by each pair's surviving capacity — identical logic to the isMirror
            // branch above, scoped to this one group's pair range (#66).
            const start = groupPairStart[hitGroup] ?? 0
            const count = groupPairCount[hitGroup] ?? 0

            const survivingPerPair: number[] = []
            let totalPairSurviving = 0
            for (let p = 0; p < count; p++) {
              const idx = start + p
              const surviving = (pairCapacity[idx] ?? 0) - (pairFailures[idx] ?? 0)
              survivingPerPair.push(surviving)
              totalPairSurviving += surviving
            }

            let rp = random() * totalPairSurviving
            let hitPairOffset = 0
            for (let p = 0; p < count; p++) {
              rp -= survivingPerPair[p] ?? 0
              if (rp <= 0) {
                hitPairOffset = p
                break
              }
            }
            const hitPair = start + hitPairOffset

            pairFailures[hitPair] = (pairFailures[hitPair] ?? 0) + 1
            const capacity = pairCapacity[hitPair] ?? 1

            // Data loss only when THIS pair loses every copy it has — not at a
            // fixed group-wide failure count (#66).
            if ((pairFailures[hitPair] ?? 0) >= capacity) {
              hadDualFailure = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }

            if (!isRebuilding && !repairPending) {
              if (hasHotSpare) {
                isRebuilding = true
                rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
              } else {
                repairPending = true
                replacementDelayDaysRemaining = REPLACEMENT_DELAY_DAYS
              }
            }

            // URE only fatal when this specific pair is down to its last surviving copy
            // (mirrors the isMirror branch's "at parity limit" condition, scoped per-pair).
            // Unconditional on rebuild state — see the isMirror branch's comment (#93).
            if ((pairFailures[hitPair] ?? 0) >= capacity - 1 && random() < groupUre) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          } else {
            // Data loss if any group exceeds its parity tolerance
            if ((groupFailures[hitGroup] ?? 0) > parityPerGroup) {
              hadDualFailure = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }

            // Start rebuild immediately (hot spare present) or begin the replacement-sourcing
            // delay first (#93) — see REPLACEMENT_DELAY_DAYS.
            if (!isRebuilding && !repairPending) {
              if (hasHotSpare) {
                isRebuilding = true
                rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
              } else {
                repairPending = true
                replacementDelayDaysRemaining = REPLACEMENT_DELAY_DAYS
              }
            }

            // URE fatal only when the hit group is at its parity limit. Unconditional on
            // rebuild state — see the isMirror branch's comment (#93).
            if ((groupFailures[hitGroup] ?? 0) >= parityPerGroup && random() < groupUre) {
              hadURE = true
              return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
            }
          }
        } else if (isPowerScaleFec) {
          // PowerScale node-erasure-coding region (#1, fix round 1). NOT vendor-attested — see
          // `SimulationInput.powerScaleProtection`'s doc comment. Two independent tolerances,
          // per the published OneFS semantics `STRIPE_SHAPES` encodes (no vendor placement doc
          // exists to derive a single combined budget, so this deliberately does not invent
          // one): more than `nf` DISTINCT nodes touched by any failure is data loss, and more
          // than `M` failures concentrated in a single node is ALSO data loss, independently.
          //
          // Failure assignment is weighted by surviving drives per node — identical idiom to
          // the isGroup branch above, applied to physical nodes instead of RAID groups.
          const survivingPerNode = powerScaleNodeWidths.map(
            (width, n) => width - (powerScaleNodeFailures[n] ?? 0),
          )
          const totalSurviving = survivingPerNode.reduce((a, b) => a + b, 0)

          let r = random() * totalSurviving
          let hitNode = 0
          for (let n = 0; n < powerScaleNodeWidths.length; n++) {
            r -= survivingPerNode[n] ?? 0
            if (r <= 0) {
              hitNode = n
              break
            }
          }

          const nodeWasUntouched = (powerScaleNodeFailures[hitNode] ?? 0) === 0
          powerScaleNodeFailures[hitNode] = (powerScaleNodeFailures[hitNode] ?? 0) + 1
          if (nodeWasUntouched) powerScaleNodesTouched++

          if (
            powerScaleNodesTouched > powerScaleNodeTolerance ||
            (powerScaleNodeFailures[hitNode] ?? 0) > powerScaleDriveWithinNodeTolerance
          ) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          // Start rebuild immediately (hot spare present) or begin the replacement-sourcing
          // delay first (#93) — see REPLACEMENT_DELAY_DAYS.
          if (!isRebuilding && !repairPending) {
            if (hasHotSpare) {
              isRebuilding = true
              rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
            } else {
              repairPending = true
              replacementDelayDaysRemaining = REPLACEMENT_DELAY_DAYS
            }
          }

          // URE fatal once EITHER tolerance is at its limit (mirrors the group/mirror
          // branches' "at parity limit" condition). Unconditional on rebuild state — see the
          // isMirror branch's comment (#93).
          const atNodeLimit = powerScaleNodesTouched >= powerScaleNodeTolerance
          const atDriveLimit =
            (powerScaleNodeFailures[hitNode] ?? 0) >= powerScaleDriveWithinNodeTolerance
          if ((atNodeLimit || atDriveLimit) && random() < ureProbability) {
            hadURE = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }
        } else {
          // Standard parity topology: global failure count determines data loss
          if (failedDrives > parityDrives) {
            hadDualFailure = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }

          // Start rebuild immediately (hot spare present) or begin the replacement-sourcing
          // delay first (#93) — see REPLACEMENT_DELAY_DAYS.
          if (!isRebuilding && !repairPending) {
            if (hasHotSpare) {
              isRebuilding = true
              rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
            } else {
              repairPending = true
              replacementDelayDaysRemaining = REPLACEMENT_DELAY_DAYS
            }
          }

          // URE fatal once the array is at its parity limit. Unconditional on rebuild
          // state — see the isMirror branch's comment (#93).
          if (failedDrives >= parityDrives && random() < ureProbability) {
            hadURE = true
            return { survived: false, rebuildTimeHours, hadURE, hadDualFailure }
          }
        }
      }
    }

    // Advance the replacement-sourcing delay (#93): once it elapses, the pending repair
    // becomes an active rebuild, exactly as if a hot spare had just kicked one off.
    // `else if`, not two independent `if`s: a pending-delay-to-rebuild transition that happens
    // on THIS day must not also consume a rebuild day on the same pass — otherwise a 1-day
    // delay plus a <=1-day rebuild collapse to zero net delay (both counters would hit zero on
    // the same iteration as the triggering failure, exactly reproducing the immediate-rebuild
    // timeline and silently erasing the #93 fix). The rebuild countdown for a delay that ends
    // today starts ticking tomorrow instead.
    if (repairPending) {
      replacementDelayDaysRemaining--
      if (replacementDelayDaysRemaining <= 0) {
        repairPending = false
        isRebuilding = true
        rebuildDaysRemaining = Math.ceil(rebuildTimeHours / 24)
      }
    } else if (isRebuilding) {
      rebuildDaysRemaining--
      if (rebuildDaysRemaining <= 0) {
        isRebuilding = false
        failedDrives = Math.max(0, failedDrives - 1)
        if (isMirror) {
          // Repair the most degraded mirror group first
          let maxIdx = 0
          for (let g = 1; g < numMirrorGroups; g++) {
            if ((mirrorGroupFailures[g] ?? 0) > (mirrorGroupFailures[maxIdx] ?? 0)) maxIdx = g
          }
          {
            const cur = mirrorGroupFailures[maxIdx] ?? 0
            if (cur > 0) mirrorGroupFailures[maxIdx] = cur - 1
          }
        }
        if (isGroup) {
          if (usesPerPairGroupModel) {
            // Rebuild the most degraded pair first (mirrors the isMirror repair
            // logic above, scoped per-pair instead of per-group, #66).
            let maxIdx = 0
            for (let p = 1; p < pairFailures.length; p++) {
              if ((pairFailures[p] ?? 0) > (pairFailures[maxIdx] ?? 0)) maxIdx = p
            }
            const cur = pairFailures[maxIdx] ?? 0
            if (cur > 0) {
              pairFailures[maxIdx] = cur - 1
              const owningGroup = pairGroupIndex[maxIdx] ?? 0
              const groupCur = groupFailures[owningGroup] ?? 0
              if (groupCur > 0) groupFailures[owningGroup] = groupCur - 1
            }
          } else {
            // Rebuild the most degraded group first
            let maxIdx = 0
            for (let g = 1; g < numGroups; g++) {
              if ((groupFailures[g] ?? 0) > (groupFailures[maxIdx] ?? 0)) maxIdx = g
            }
            const cur = groupFailures[maxIdx] ?? 0
            if (cur > 0) groupFailures[maxIdx] = cur - 1
          }
        }
        if (isPowerScaleFec) {
          // Repair the most degraded node first (mirrors the group/mirror repair logic above).
          let maxIdx = 0
          for (let n = 1; n < powerScaleNodeWidths.length; n++) {
            if ((powerScaleNodeFailures[n] ?? 0) > (powerScaleNodeFailures[maxIdx] ?? 0)) maxIdx = n
          }
          const cur = powerScaleNodeFailures[maxIdx] ?? 0
          if (cur > 0) {
            powerScaleNodeFailures[maxIdx] = cur - 1
            if (powerScaleNodeFailures[maxIdx] === 0) {
              powerScaleNodesTouched = Math.max(0, powerScaleNodesTouched - 1)
            }
          }
        }
        if (failedDrives === 0) {
          correlatedFailureWindow = 0
        }
      }
    }
  }

  return { survived: true, rebuildTimeHours, hadURE, hadDualFailure }
}

/**
 * Run the full Monte Carlo simulation.
 */
function runSimulation(input: SimulationInput): void {
  const { simulationCount } = input

  let survivedCount = 0
  let totalRebuildTime = 0
  let ureCount = 0
  let dualFailureCount = 0
  let rebuildCount = 0

  const progressInterval = Math.max(1, Math.floor(simulationCount / 100))
  const topo = computeTopologyModel(input)

  for (let i = 0; i < simulationCount; i++) {
    const result = runSingleSimulation(input, topo)

    if (result.survived) {
      survivedCount++
    }

    if (result.rebuildTimeHours > 0) {
      totalRebuildTime += result.rebuildTimeHours
      rebuildCount++
    }

    if (result.hadURE) {
      ureCount++
    }

    if (result.hadDualFailure) {
      dualFailureCount++
    }

    // Report progress
    if ((i + 1) % progressInterval === 0 || i === simulationCount - 1) {
      postMessage({
        type: 'PROGRESS',
        payload: {
          completed: i + 1,
          total: simulationCount,
        },
      })
    }
  }

  // Calculate final results
  const survivalRate = survivedCount / simulationCount
  const averageRebuildTimeHours = rebuildCount > 0 ? totalRebuildTime / rebuildCount : 0
  const ureProbability = ureCount / simulationCount
  const dualFailureProbability = dualFailureCount / simulationCount

  // Format survival percentage with appropriate precision
  let survivalPercent: string
  if (survivalRate >= 1.0) {
    // Perfect survival - show as ">99.9999%" to indicate limits of simulation
    survivalPercent = '>99.9999%'
  } else if (survivalRate >= 0.99999) {
    survivalPercent = `${(survivalRate * 100).toFixed(4)}%`
  } else if (survivalRate >= 0.999) {
    survivalPercent = `${(survivalRate * 100).toFixed(3)}%`
  } else if (survivalRate >= 0.99) {
    survivalPercent = `${(survivalRate * 100).toFixed(2)}%`
  } else {
    survivalPercent = `${(survivalRate * 100).toFixed(1)}%`
  }

  postMessage({
    type: 'RESULT',
    payload: {
      survivalRate,
      survivalPercent,
      averageRebuildTimeHours,
      ureProbability,
      dualFailureProbability,
    },
  })
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  const message = event.data

  switch (message.type) {
    case 'START':
      try {
        runSimulation(message.payload)
      } catch (error) {
        postMessage({
          type: 'ERROR',
          payload: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      break

    case 'ABORT':
      // Note: Early termination not yet implemented
      postMessage({ type: 'ABORTED' })
      break
  }
}
