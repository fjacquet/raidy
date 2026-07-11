/**
 * Longhorn capacity test vectors — sources recorded per vector and in
 * .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is compared against VolumetryResult.usableCapacity, i.e. AFTER replica
 * division, AFTER the xfs 1% filesystem-overhead layer, AND AFTER the Longhorn free-space
 * reserve. The engine applies these in that order
 * (`src/engines/volumetry/index.ts:240-269`, `src/engines/volumetry/strategies/longhorn.ts:12-22`):
 *   1. capacityAfterParity = rawCapacity x dataFraction   [R2: 1/2, R3: 1/3 — full-copy
 *      replication, one replica per node]
 *   2. usableCapacity      = capacityAfterParity x (1 - xfsOverhead)   [xfs 1%,
 *      `FILESYSTEM_OVERHEAD.xfs` in src/types/topology.ts]
 *   3. usableCapacity      = usableCapacity x freeSpaceFactor          [freeSpaceFactor =
 *      1 - minimalAvailablePercent/100, clamped to [0,1]]
 *   4. usableCapacity      = usableCapacity / snapshotHeadroom         [snapshotHeadroom
 *      clamped to >= 1]
 *
 * `overProvisioningPercent` and `growthHeadroom` are advisory-only (surfaced in
 * `longhornDetails`, never subtracted from `usableCapacity` — index.ts:251), so they are not
 * exercised by these vectors.
 *
 * HONESTY NOTE (binding): of the pipeline's layers exercised here, replica division and the
 * free-space reserve percentage used in the vectors below are genuinely Longhorn-published;
 * the snapshot-headroom divisor is NOT a longhorn.io-published formula, so it is held neutral
 * (snapshotHeadroom: 1) in every vector so the tested numbers are traceable to a documented
 * source, not the engine's own guardrail heuristic:
 *   - Replica-count capacity semantics (usable = raw / replica count, because each replica is
 *     a full copy, one per node) are genuinely Longhorn-published: "Longhorn creates 3
 *     replicas of the volume by default, one on each node" plus the general N-replica full-copy
 *     model documented in the Longhorn architecture/settings docs. Matches
 *     `src/engines/volumetry/strategies/longhorn.ts:12-22` (R2 = 1/2, R3 = 1/3) exactly.
 *     https://longhorn.io/docs/latest/nodes-and-volumes/volumes/
 *   - `storageMinimalAvailablePercentage` free-space reserve: the Longhorn settings reference
 *     documents the DEFAULT as 25%, not the engine's `DEFAULT_LONGHORN_OPTIONS
 *     .minimalAvailablePercent = 10` (src/types/topology.ts:641). The vectors below use
 *     `minimalAvailablePercent: 25` as an EXPLICIT OVERRIDE (not the engine default) so the
 *     tested free-space factor (0.75) is traceable to the documented value. The engine's own
 *     default of 10% diverges from the published 25% default — logged as ledger finding #10
 *     (value-wrong). `overProvisioningPercent: 200` (engine default) DOES match the
 *     Longhorn-documented default of 200% (`storage-over-provisioning-percentage`) — no
 *     divergence there; not exercised by these vectors since over-provisioning is
 *     advisory-only in the capacity pipeline.
 *     https://longhorn.io/kb/space-consumption-guideline/
 *     https://documentation.suse.com/cloudnative/storage/1.11/en/longhorn-system/settings.html
 *   - xfs 1% filesystem overhead is an engine-formula analog (generic fs-metadata constant
 *     applied uniformly across topologies, not a Longhorn-specific published number) —
 *     no divergence claimed for this layer.
 *   - Snapshot headroom (`snapshotHeadroom`) is held at 1 (neutral, no-op) in every vector:
 *     Longhorn's space-consumption guide describes qualitative guidance for reserving space for
 *     snapshot growth, but does NOT publish a fixed capacity divisor — using the engine default
 *     (1.2) here would mix an engine heuristic into an "external-reference" vector.
 *
 * Genuinely-external vector count: 4/4 vectors validate the Longhorn-published replica-count
 * full-copy model (R2 = 1/2, R3 = 1/3) and the Longhorn-published 25% minimal-available default
 * (used as an explicit override, since the engine's own default of 10% diverges — finding #10).
 * serverCount (3 vs. 6) is varied to confirm usableCapacity is invariant to node count once
 * serverCount >= replica count (Longhorn's placement constraint), not because the published
 * capacity formula itself depends on node count.
 */
import type { LonghornTopology, Topology } from '@/types/topology'
import type { PlatformVector } from './vector-harness'

export type { PlatformVector } from './vector-harness'

const TB = 1_000_000_000_000

function longhorn(level: LonghornTopology): Topology {
  return { type: 'longhorn', level }
}

// Shared longhornOptions override: minimalAvailablePercent uses the longhorn.io-published
// default (25%, not the engine's diverging 10% default — finding #10); snapshotHeadroom held
// neutral (1) since no longhorn.io page publishes a fixed snapshot-space divisor.
const publishedFreeSpaceOptions = {
  diskMode: 'dedicated' as const,
  minimalAvailablePercent: 25,
  snapshotHeadroom: 1,
  growthHeadroom: 1.2,
  overProvisioningPercent: 200,
}

export const longhornVectors: PlatformVector[] = [
  {
    // R2, 18x1TB drives, 3 nodes: dataFraction = 1/2 (full-copy replication, one replica per
    // node, longhorn.io-published). Pipeline: 18 TB raw x 0.5 = 9 TB after parity; x 0.99
    // (xfs 1% overhead, engine-formula analog) = 8.91 TB; x 0.75 (25% minimal-available
    // reserve, longhorn.io-published default) = 6.6825 TB; /1 (snapshot headroom held neutral)
    // = 6.6825 TB.
    name: 'Longhorn R2, 18 drives, 3 nodes',
    topology: longhorn('longhorn_r2'),
    drives: 18,
    serverCount: 3,
    driveSize: TB,
    expectedUsable: 6_682_500_000_000,
    tolerance: 0.01,
    source:
      'Longhorn volumes docs (full-copy replication, one replica per node) + Longhorn settings reference / space-consumption KB (storageMinimalAvailablePercentage default 25%, engine default of 10% diverges — see file header honesty note / ledger finding #10)',
    url: 'https://longhorn.io/docs/latest/nodes-and-volumes/volumes/',
    overrides: { longhornOptions: publishedFreeSpaceOptions },
  },
  {
    // R2, 18x1TB drives, 6 nodes: same capacity math as the 3-node case above — usableCapacity
    // depends only on replica count + free-space reserve, not node count, once
    // serverCount >= replicas (Longhorn's placement constraint).
    name: 'Longhorn R2, 18 drives, 6 nodes',
    topology: longhorn('longhorn_r2'),
    drives: 18,
    serverCount: 6,
    driveSize: TB,
    expectedUsable: 6_682_500_000_000,
    tolerance: 0.01,
    source:
      'Longhorn volumes docs (full-copy replication, one replica per node) + Longhorn settings reference / space-consumption KB (storageMinimalAvailablePercentage default 25%, engine default of 10% diverges — see file header honesty note / ledger finding #10)',
    url: 'https://longhorn.io/docs/latest/nodes-and-volumes/volumes/',
    overrides: { longhornOptions: publishedFreeSpaceOptions },
  },
  {
    // R3, 18x1TB drives, 3 nodes: dataFraction = 1/3 (full-copy replication, one replica per
    // node, longhorn.io-published; Longhorn's own default replica count is 3). Pipeline:
    // 18 TB raw x (1/3) = 6 TB after parity; x 0.99 (xfs) = 5.94 TB; x 0.75 (25% minimal-
    // available reserve, longhorn.io-published default) = 4.455 TB; /1 = 4.455 TB.
    name: 'Longhorn R3, 18 drives, 3 nodes',
    topology: longhorn('longhorn_r3'),
    drives: 18,
    serverCount: 3,
    driveSize: TB,
    expectedUsable: 4_455_000_000_000,
    tolerance: 0.01,
    source:
      'Longhorn volumes docs (full-copy replication, default 3 replicas, one per node) + Longhorn settings reference / space-consumption KB (storageMinimalAvailablePercentage default 25%, engine default of 10% diverges — see file header honesty note / ledger finding #10)',
    url: 'https://longhorn.io/docs/latest/nodes-and-volumes/volumes/',
    overrides: { longhornOptions: publishedFreeSpaceOptions },
  },
  {
    // R3, 18x1TB drives, 6 nodes: same capacity math as the 3-node case above — usableCapacity
    // is invariant to node count once serverCount >= replicas.
    name: 'Longhorn R3, 18 drives, 6 nodes',
    topology: longhorn('longhorn_r3'),
    drives: 18,
    serverCount: 6,
    driveSize: TB,
    expectedUsable: 4_455_000_000_000,
    tolerance: 0.01,
    source:
      'Longhorn volumes docs (full-copy replication, default 3 replicas, one per node) + Longhorn settings reference / space-consumption KB (storageMinimalAvailablePercentage default 25%, engine default of 10% diverges — see file header honesty note / ledger finding #10)',
    url: 'https://longhorn.io/docs/latest/nodes-and-volumes/volumes/',
    overrides: { longhornOptions: publishedFreeSpaceOptions },
  },
]
