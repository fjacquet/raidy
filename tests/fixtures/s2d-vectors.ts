/**
 * S2D Test Vectors — validated against Microsoft Learn / Azure Local docs.
 * Source URLs recorded per vector and in .planning/phases/18-quality-audit/18-AUDIT.md.
 *
 * expectedUsable is BEFORE compression/dedup, AFTER parity + reserves + fs overhead —
 * i.e. compared against VolumetryResult.usableCapacity.
 *
 * Microsoft's published tables give the *resiliency efficiency fraction* only (e.g. "3-way
 * mirror = 33.3%", "dual parity at 7 fault domains = 66.7%"). Raidy's engine additionally
 * removes, in order: (1) a pre-parity rebuild reserve sized in whole capacity-tier drives
 * (`min(faultDomains, 4)` drives by default — see DEFAULT_S2D_OPTIONS.reserveStrategy =
 * 'drive_failure'), (2) a fixed 277 GB post-efficiency infrastructure-volume reserve
 * (ARC Resource Bridge + AKS images + ClusterPerformanceHistory + system, see
 * src/engines/volumetry/overhead/overheadCalculator.ts), and (3) 2% ReFS filesystem overhead
 * (FILESYSTEM_OVERHEAD.refs). Each expectedUsable below applies the Microsoft efficiency
 * fraction on top of that same, engine-documented reserve pipeline so the comparison is
 * apples-to-apples — the number being validated is the *resiliency fraction*, not the reserve
 * bytes (which are cross-checked separately against their own code-comment sources).
 *
 * testDrive1TB.type === 'HDD', so isAllFlashMedia() resolves to hybrid media for dual_parity /
 * map vectors, selecting Microsoft's hybrid stepped table (not the all-flash table).
 */
import { DEFAULT_S2D_OPTIONS } from '@/types'
import type { S2DTopology, Topology } from '@/types/topology'

const TB = 1_000_000_000_000

function s2d(level: S2DTopology): Topology {
  return { type: 's2d', level }
}

export interface PlatformVector {
  name: string
  topology: Topology
  drives: number
  serverCount: number
  driveSize: number
  /** Expected VolumetryResult.usableCapacity in bytes (external reference minus engine overheads). */
  expectedUsable: number
  tolerance: number // 0.01 = 1%
  source: string
  url: string
  /** Overrides merged into VolumetryInput (e.g. s2dOptions) beyond drives/topology/serverCount. */
  overrides?: Record<string, unknown>
}

export const s2dVectors: PlatformVector[] = [
  {
    // Microsoft: three-way mirror = 33.3% efficiency (1 TB usable per 3 TB raw).
    // Reserve pipeline: 12 raw drives - 4-drive rebuild reserve (min(faultDomains=4, 4)) = 8 TB
    // pool; 8 TB × 1/3 = 2.6̄ TB after parity; - 277 GB infra reserve; × 0.98 for ReFS.
    name: 'S2D 3-way mirror, 12 drives, 4 servers',
    topology: s2d('mirror'),
    drives: 12,
    serverCount: 4,
    driveSize: TB,
    expectedUsable: 2_341_873_333_333.33,
    tolerance: 0.01,
    source:
      'Microsoft Learn — Plan volumes on Azure Local and Windows Server clusters (mirror efficiency table)',
    url: 'https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/plan-volumes',
    overrides: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, mirrorCopies: 3 } },
  },
  {
    // Microsoft: single parity efficiency = (N-1)/N fault domains; at 4 fault domains = 75%.
    // Reserve pipeline: 16 raw drives - 4-drive rebuild reserve = 12 TB pool; × 0.75 = 9 TB
    // after parity; - 277 GB infra reserve; × 0.98 for ReFS.
    name: 'S2D single parity, 16 drives, 4 servers (4 fault domains)',
    topology: s2d('parity'),
    drives: 16,
    serverCount: 4,
    driveSize: TB,
    expectedUsable: 8_548_540_000_000,
    tolerance: 0.01,
    source:
      'Microsoft Learn — Plan volumes on Azure Local and Windows Server clusters (single-parity efficiency = (N-1)/N fault domains)',
    url: 'https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/plan-volumes',
    overrides: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, faultDomains: 4 } },
  },
  {
    // Microsoft dual-parity hybrid table: 7-11 fault domains = 66.7% efficiency (RS 4+2).
    // testDrive1TB is HDD, so the engine selects the hybrid stepped table.
    // Reserve pipeline: 16 raw drives - 4-drive rebuild reserve = 12 TB pool; × 2/3 = 8 TB
    // after parity; - 277 GB infra reserve; × 0.98 for ReFS.
    name: 'S2D dual parity, 16 drives, 7 servers (7 fault domains, hybrid)',
    topology: s2d('dual_parity'),
    drives: 16,
    serverCount: 7,
    driveSize: TB,
    expectedUsable: 7_568_540_000_000,
    tolerance: 0.01,
    source:
      'Microsoft Learn — Fault tolerance and storage efficiency on Azure Local and Windows Server clusters (dual-parity hybrid stepped table, 7-11 fault domains = 66.7%)',
    url: 'https://learn.microsoft.com/en-us/windows-server/storage/storage-spaces/fault-tolerance',
    overrides: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, faultDomains: 7 } },
  },
  {
    // Mirror-accelerated parity: ~20% mirror tier / ~80% parity tier (ReFS tiered volume).
    // Parity portion uses the same hybrid dual-parity efficiency (66.7% at 7 fault domains):
    // fraction = 0.2/mirrorCopies(2) + 0.8 × 2/3 = 0.1 + 0.5333... = 0.6333...
    // Reserve pipeline: 16 raw drives - 4-drive rebuild reserve = 12 TB pool; × 0.6333... =
    // 7.6 TB after parity; - 277 GB infra reserve; × 0.98 for ReFS.
    name: 'S2D mirror-accelerated parity, 16 drives, 7 servers (7 fault domains, hybrid)',
    topology: s2d('map'),
    drives: 16,
    serverCount: 7,
    driveSize: TB,
    expectedUsable: 7_176_540_000_000,
    tolerance: 0.01,
    source:
      'Microsoft Learn — Mirror-accelerated parity (ReFS) — ~20% mirror / ~80% parity tiering, parity tier uses dual-parity stepped efficiency',
    url: 'https://learn.microsoft.com/en-us/windows-server/storage/refs/mirror-accelerated-parity',
    overrides: { s2dOptions: { ...DEFAULT_S2D_OPTIONS, faultDomains: 7 } },
  },
]
