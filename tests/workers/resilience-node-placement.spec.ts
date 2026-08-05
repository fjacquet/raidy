/**
 * Node-aware placement tests for issue #113.
 *
 * This is placement-only work: no correlated-failure model reads these
 * structures yet (#88 will). These tests pin the placement RULES themselves
 * — distinct nodes per replica when possible, graceful degradation
 * otherwise, and the single-node degenerate case for platforms with no node
 * concept — rather than any survival number, which the regression suite in
 * `resilience-group-modelling.spec.ts` / `resilience.spec.ts` already covers
 * and which this change must not move (see CHANGELOG.md for the measured
 * before/after).
 */
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('assignNodesRoundRobin (#113)', () => {
  it('every replica slot within a group lands on a distinct node when nodeCount >= copiesPerGroup', async () => {
    const { assignNodesRoundRobin } = await import('@/workers/resilienceWorker')

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }), // numGroups
        fc.integer({ min: 1, max: 4 }), // copiesPerGroup
        fc.integer({ min: 1, max: 64 }), // extra nodes on top of copiesPerGroup
        (numGroups, copiesPerGroup, extraNodes) => {
          const nodeCount = copiesPerGroup + extraNodes
          const assignments = assignNodesRoundRobin(numGroups, copiesPerGroup, nodeCount)
          expect(assignments).toHaveLength(numGroups)
          for (const nodes of assignments) {
            expect(nodes).toHaveLength(copiesPerGroup)
            expect(new Set(nodes).size).toBe(copiesPerGroup)
            for (const n of nodes) {
              expect(n).toBeGreaterThanOrEqual(0)
              expect(n).toBeLessThan(nodeCount)
            }
          }
        },
      ),
    )
  })

  it('degenerates to node 0 for every copy when nodeCount is 1 (single-node platforms: plain RAID1/10)', async () => {
    const { assignNodesRoundRobin } = await import('@/workers/resilienceWorker')
    const assignments = assignNodesRoundRobin(4, 2, 1)
    for (const nodes of assignments) {
      expect(nodes).toEqual([0, 0])
    }
  })

  it('wraps rather than throwing when nodeCount < copiesPerGroup (more mirror copies than nodes)', async () => {
    const { assignNodesRoundRobin } = await import('@/workers/resilienceWorker')
    expect(() => assignNodesRoundRobin(3, 3, 2)).not.toThrow()
    const assignments = assignNodesRoundRobin(3, 3, 2)
    for (const nodes of assignments) {
      for (const n of nodes) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThan(2)
      }
    }
  })

  it('treats nodeCount <= 0 the same as nodeCount 1 (defensive floor, never divides by zero)', async () => {
    const { assignNodesRoundRobin } = await import('@/workers/resilienceWorker')
    expect(() => assignNodesRoundRobin(2, 2, 0)).not.toThrow()
    const assignments = assignNodesRoundRobin(2, 2, 0)
    for (const nodes of assignments) {
      expect(nodes.every((n) => n === 0)).toBe(true)
    }
  })
})

describe('buildGroupPairState node identity (#113)', () => {
  it('defaults every pair slot to its own group index as node (identity mapping)', async () => {
    const { buildGroupPairState, distributeAcrossGroups } = await import(
      '@/workers/resilienceWorker'
    )
    const widths = distributeAcrossGroups(23, 4)
    const { pairGroupIndex, pairNodeA, pairNodeB } = buildGroupPairState(widths)
    for (let i = 0; i < pairGroupIndex.length; i++) {
      expect(pairNodeA[i]).toBe(pairGroupIndex[i])
      expect(pairNodeB[i]).toBe(pairGroupIndex[i])
    }
  })

  it('both copies of every pair (real pair or solo slot) share the SAME node — local within-target mirroring', async () => {
    const { buildGroupPairState, distributeAcrossGroups } = await import(
      '@/workers/resilienceWorker'
    )
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 50 }),
        (total, groups) => {
          const widths = distributeAcrossGroups(total, groups)
          const { pairNodeA, pairNodeB } = buildGroupPairState(widths)
          for (let i = 0; i < pairNodeA.length; i++) {
            expect(pairNodeA[i]).toBe(pairNodeB[i])
          }
        },
      ),
    )
  })

  it('honours an explicit groupNodeIndex override (buddy-merged-style multi-node groups)', async () => {
    const { buildGroupPairState } = await import('@/workers/resilienceWorker')
    const widths = [4, 6]
    const { pairGroupIndex, pairNodeA, pairNodeB } = buildGroupPairState(widths, [10, 20])
    for (let i = 0; i < pairGroupIndex.length; i++) {
      const expectedNode = pairGroupIndex[i] === 0 ? 10 : 20
      expect(pairNodeA[i]).toBe(expectedNode)
      expect(pairNodeB[i]).toBe(expectedNode)
    }
  })
})

describe('computeTopologyModel node fields (#113)', () => {
  const baseInput = {
    driveCapacityBytes: 4_000_000_000_000,
    rebuildSpeedMBs: 150,
    ureRate: 16 as const,
    afrPercent: 1.0,
    simulationCount: 1,
  }

  it('single-node standard RAID10 (serverCount default 1): all mirror copies on node 0', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      ...baseInput,
      driveCount: 8,
      raidLevel: 'RAID10',
      mirrorCopies: 2,
    })
    expect(topo.isMirror).toBe(true)
    expect(topo.mirrorGroupNodes.length).toBeGreaterThan(0)
    for (const nodes of topo.mirrorGroupNodes) {
      expect(nodes).toEqual([0, 0])
    }
  })

  it('tiered mirror platform (vsan_osa_raid1, serverCount = host count): copies spread across distinct hosts', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      ...baseInput,
      driveCount: 24,
      raidLevel: 'vsan_osa_raid1',
      mirrorCopies: 2,
      serverCount: 6,
    })
    expect(topo.isMirror).toBe(true)
    for (const nodes of topo.mirrorGroupNodes) {
      expect(new Set(nodes).size).toBe(2)
      for (const n of nodes) {
        expect(n).toBeLessThan(6)
      }
    }
  })

  it('RAID50 group topology: each ordinary group maps to exactly one node, its own index', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      ...baseInput,
      driveCount: 11,
      raidLevel: 'RAID50',
      serverCount: 3,
    })
    expect(topo.isGroup).toBe(true)
    expect(topo.groupNodeIndices).toEqual([[0], [1], [2]])
  })

  it('buddy-mirrored beegfs_raid10 group spans exactly two nodes per merged unit', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      ...baseInput,
      driveCount: 80,
      raidLevel: 'beegfs_raid10',
      mirrorCopies: 2,
      serverCount: 8,
    })
    expect(topo.isGroup).toBe(true)
    expect(topo.groupNodeIndices).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ])
  })

  it('unmerged beegfs_raid10: per-pair node identity matches the owning storage target, both copies local', async () => {
    const { computeTopologyModel } = await import('@/workers/resilienceWorker')
    const topo = computeTopologyModel({
      ...baseInput,
      driveCount: 40,
      raidLevel: 'beegfs_raid10',
      serverCount: 4,
    })
    expect(topo.usesPerPairGroupModel).toBe(true)
    for (let i = 0; i < topo.pairGroupIndex.length; i++) {
      expect(topo.pairNodeA[i]).toBe(topo.pairGroupIndex[i])
      expect(topo.pairNodeB[i]).toBe(topo.pairGroupIndex[i])
    }
  })
})
