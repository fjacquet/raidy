/**
 * Strategy interface for topology-specific volumetry calculations.
 *
 * Each topology type (RAID, ZFS, vSAN, S2D, Ceph, etc.) implements this interface
 * to provide capacity calculations specific to its redundancy model.
 *
 * This enables the strategy pattern to replace large switch statements in the
 * main volumetry engine, improving maintainability and testability.
 */

/**
 * Volumetry calculation strategy interface.
 *
 * Implementations calculate data fraction (efficiency) and optional
 * overhead for specific topology types.
 */
export interface VolumetryStrategy {
  /**
   * Calculate data fraction (usable capacity / raw capacity) for topology.
   *
   * @param level - Topology level (e.g., 'RAID5', 'raidz2', 'ec_4_2')
   * @param driveCount - Total number of drives in array
   * @param options - Topology-specific options (optional)
   * @returns Data fraction between 0 and 1 (e.g., 0.75 = 75% efficiency)
   *
   * @example
   * // RAID5 with 6 drives: (6-1)/6 = 0.833 (83.3% efficiency)
   * calculateDataFraction('RAID5', 6, {}) // 0.833
   */
  calculateDataFraction(level: string, driveCount: number, options?: unknown): number

  /**
   * Calculate topology-specific overhead in bytes (optional).
   *
   * Some topologies have metadata overhead beyond RAID efficiency
   * (e.g., ZFS slop space, S2D rebuild reserve).
   *
   * @param rawCapacity - Total raw capacity in bytes
   * @param options - Topology-specific options
   * @returns Overhead in bytes to subtract from usable capacity
   *
   * @example
   * // ZFS slop: clamp(rawCapacity/32, 128 MiB, 128 GiB)
   * calculateOverhead(10 * TB, {}) // ~312 GiB slop space
   */
  calculateOverhead?(rawCapacity: number, options?: unknown): number
}
