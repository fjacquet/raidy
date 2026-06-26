/**
 * Microsoft Storage Spaces Direct (S2D) volumetry strategy.
 *
 * Supports: Simple, Mirror (2-way/3-way), Parity, Dual Parity, MAP.
 * The rebuild reserve is handled by the main volumetry engine (raw, before efficiency).
 */

import type { S2DOptions } from '@/types/topology'
import type { VolumetryStrategy } from './VolumetryStrategy'

/** Options passed to the S2D data-fraction calculation. */
export interface S2DDataFractionOptions extends S2DOptions {
  /** All-flash (SSD/NVMe) vs hybrid (contains HDD) — selects the dual-parity table. */
  isAllFlash?: boolean
}

/**
 * Dual-parity (erasure coding) storage efficiency by fault-domain count.
 *
 * Microsoft publishes two stepped tables — the parity layout (and thus efficiency) differs
 * between all-flash and hybrid clusters. Verified against Microsoft Learn "Fault tolerance and
 * storage efficiency on Azure Local and Windows Server clusters" (rev. 2025-08-22):
 *
 * All-flash: 4–6 RS 2+2 50% · 7–8 RS 4+2 66.7% · 9–15 RS 6+2 75% · 16 LRC(12,2,1) 80%
 * Hybrid:    4–6 RS 2+2 50% · 7–11 RS 4+2 66.7% · 12–16 LRC(8,2,1) 72.7%
 *
 * Dual parity requires ≥4 fault domains; N is clamped to [4, 16].
 *
 * @param faultDomains - Number of fault domains (nodes)
 * @param isAllFlash - Whether the cluster is all-flash (true) or hybrid (false)
 * @returns Storage efficiency fraction (0-1)
 */
export function getS2DDualParityEfficiency(faultDomains: number, isAllFlash: boolean): number {
  const n = Math.max(4, Math.min(16, Math.floor(faultDomains)))

  if (n <= 6) return 0.5 // RS 2+2

  if (isAllFlash) {
    if (n <= 8) return 2 / 3 // RS 4+2 → 66.7%
    if (n <= 15) return 0.75 // RS 6+2 → 75%
    return 0.8 // LRC (12,2,1) → 80%
  }

  // Hybrid
  if (n <= 11) return 2 / 3 // RS 4+2 → 66.7%
  return 8 / 11 // LRC (8,2,1) → 72.7%
}

export const s2dStrategy: VolumetryStrategy = {
  calculateDataFraction(level: string, _driveCount: number, options?: unknown): number {
    const s2dOptions = options as S2DDataFractionOptions | undefined
    const isAllFlash = s2dOptions?.isAllFlash ?? true

    switch (level) {
      case 'simple':
        // No redundancy - 100% efficiency
        return 1.0

      case 'mirror':
        // Mirror: efficiency = 1 / copies (2-way or 3-way)
        return 1 / (s2dOptions?.mirrorCopies ?? 2)

      case 'parity':
        // Single parity across fault domains
        // Handle division by zero
        if (!s2dOptions || s2dOptions.faultDomains === 0) return 0
        return (s2dOptions.faultDomains - 1) / s2dOptions.faultDomains

      case 'dual_parity':
        // Dual parity: Microsoft's stepped Reed-Solomon/LRC efficiency (all-flash vs hybrid)
        if (!s2dOptions || s2dOptions.faultDomains === 0) return 0
        return getS2DDualParityEfficiency(s2dOptions.faultDomains, isAllFlash)

      case 'map': {
        // MAP (Mirror-Accelerated Parity): hybrid layout, ~20% mirror / ~80% parity.
        // The parity portion uses the same stepped dual-parity efficiency.
        const mirrorPortion = 0.2 / (s2dOptions?.mirrorCopies ?? 2)
        if (!s2dOptions || s2dOptions.faultDomains === 0) return mirrorPortion
        const parityPortion = 0.8 * getS2DDualParityEfficiency(s2dOptions.faultDomains, isAllFlash)
        return mirrorPortion + parityPortion
      }

      default:
        // Unknown S2D level - return 100%
        return 1.0
    }
  },

  // S2D rebuild reserve is calculated in the main volumetry engine (raw, before efficiency).
  // calculateOverhead not applicable here.
}
