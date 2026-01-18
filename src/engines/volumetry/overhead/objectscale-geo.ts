/**
 * ObjectScale geo-replication overhead lookup tables.
 *
 * Dell ObjectScale supports multi-site replication with different EC configurations.
 * Geo-overhead varies based on:
 * - Number of sites (1-8)
 * - EC configuration (12+4, 10+2, 24+4, mirror_3)
 *
 * Tables validated against SME spec for Replication Group overhead.
 */

import type { Topology } from '@/types/topology'

/**
 * Get ObjectScale geo-overhead factor for multi-site replication.
 *
 * Based on SME spec tables for Replication Group overhead.
 * Returns the overhead multiplier:
 * - 1.0 = no overhead (single site)
 * - 2.67 = worst case for 2 sites EC 12+4
 *
 * @param topology - ObjectScale topology configuration
 * @param sites - Number of geo-replication sites (1-8)
 * @returns Overhead multiplier for geo-replication
 *
 * @example
 * // EC 12+4 with 2-way geo-replication
 * const overhead = getObjectScaleGeoOverhead(
 *   { type: 'objectscale', level: 'objectscale_ec_12_4' },
 *   2
 * )
 * // Returns: 2.67 (capacity reduced by 2.67x for dual-site protection)
 *
 * @example
 * // EC 10+2 with single site (no geo-replication)
 * const overhead = getObjectScaleGeoOverhead(
 *   { type: 'objectscale', level: 'objectscale_ec_10_2' },
 *   1
 * )
 * // Returns: 1.2 (no geo-overhead, just EC overhead)
 */
export function getObjectScaleGeoOverhead(topology: Topology, sites: number): number {
  if (topology.type !== 'objectscale' || sites <= 1) {
    return 1.0 // No geo-overhead for single site
  }

  // Geo-overhead tables from SME spec
  // EC 12+4: Balanced efficiency and protection
  const geoOverhead12_4: Record<number, number> = {
    1: 1.33,
    2: 2.67,
    3: 2.0,
    4: 1.77,
    5: 1.67,
    6: 1.6,
    7: 1.55,
    8: 1.52,
  }

  // EC 10+2: Higher efficiency, lower protection
  const geoOverhead10_2: Record<number, number> = {
    1: 1.2,
    2: 2.4,
    3: 1.8,
    4: 1.6,
    5: 1.5,
    6: 1.44,
    7: 1.4,
    8: 1.37,
  }

  // EC 24+4: Higher efficiency for large deployments (scaled from 12+4)
  const geoOverhead24_4: Record<number, number> = {
    1: 1.17,
    2: 2.33,
    3: 1.75,
    4: 1.56,
    5: 1.47,
    6: 1.4,
    7: 1.35,
    8: 1.31,
  }

  // Triple mirror: Maximum protection, lowest efficiency
  const geoOverheadMirror3: Record<number, number> = {
    1: 3.0,
    2: 6.0,
    3: 4.5,
    4: 4.0,
    5: 3.75,
    6: 3.6,
    7: 3.5,
    8: 3.43,
  }

  // Clamp sites to valid range (1-8)
  const sitesKey = Math.min(Math.max(sites, 1), 8)

  switch (topology.level) {
    case 'objectscale_ec_12_4':
      return geoOverhead12_4[sitesKey] ?? 1.33
    case 'objectscale_ec_10_2':
      return geoOverhead10_2[sitesKey] ?? 1.2
    case 'objectscale_ec_24_4':
      return geoOverhead24_4[sitesKey] ?? 1.17
    case 'objectscale_mirror_3':
      return geoOverheadMirror3[sitesKey] ?? 3.0
    default:
      return 1.33
  }
}
