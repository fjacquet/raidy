/**
 * Strategy interface for topology-specific performance calculations.
 *
 * Each topology type implements this interface to provide IOPS calculations
 * and write penalty factors for its specific redundancy model.
 *
 * Performance calculations validated against industry formulas:
 * - RAID5 write penalty: 4x (read-modify-write)
 * - RAID6 write penalty: 6x (dual parity update)
 * - ZFS: Similar to RAID but with ARC/ZIL effects
 */

/**
 * Performance calculation strategy interface.
 */
export interface PerformanceStrategy {
  /**
   * Calculate write penalty factor for topology.
   *
   * Write penalty represents additional I/O operations required for
   * parity/redundancy updates during writes.
   *
   * @param level - Topology level (e.g., 'RAID5', 'raidz2', 'ec_4_2')
   * @param options - Topology-specific options
   * @returns Write penalty multiplier (1.0 = no penalty, 4.0 = 4x penalty)
   *
   * @example
   * // RAID5: 4x penalty (1 write → 2 reads + 2 writes)
   * getWritePenalty('RAID5', {}) // 4.0
   *
   * // RAID6: 6x penalty (1 write → 3 reads + 3 writes)
   * getWritePenalty('RAID6', {}) // 6.0
   */
  getWritePenalty(level: string, options?: any): number

  /**
   * Calculate effective IOPS for topology under given workload.
   *
   * Accounts for read/write ratio and topology-specific penalties.
   *
   * @param level - Topology level
   * @param driveCount - Number of drives
   * @param driveIOPS - Per-drive IOPS capability
   * @param readPercent - Read percentage (0-100)
   * @param options - Topology-specific options
   * @returns Effective array IOPS
   *
   * @example
   * // RAID5 with 6 drives, 200 IOPS/drive, 50% reads
   * calculateIOPS('RAID5', 6, 200, 50, {})
   * // Reads: 6 * 200 * 0.5 = 600 IOPS
   * // Writes: 6 * 200 * 0.5 / 4 = 150 IOPS (4x penalty)
   * // Total: 750 IOPS
   */
  calculateIOPS(
    level: string,
    driveCount: number,
    driveIOPS: number,
    readPercent: number,
    options?: any
  ): number
}
