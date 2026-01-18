/**
 * Type guard utilities for exhaustive checking and runtime validation.
 *
 * These utilities help catch missing cases at compile time when working
 * with discriminated unions in switch statements.
 */

/**
 * Exhaustive type checking helper for switch statements.
 *
 * Use in the default case of a switch on a discriminated union.
 * If all cases are handled, TypeScript infers `never` type and compiles successfully.
 * If a case is missing, TypeScript reports a compile error.
 *
 * @param value - Value that should be never (all cases handled)
 * @returns never (throws error if reached at runtime)
 * @throws Error with the unhandled value
 *
 * @example
 * function getDataFraction(topology: Topology): number {
 *   switch (topology.type) {
 *     case 'standard': return calculateRaid(topology)
 *     case 'zfs': return calculateZfs(topology)
 *     case 'ceph': return calculateCeph(topology)
 *     default:
 *       // TypeScript error if new topology type added without case
 *       return assertNever(topology)
 *   }
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`)
}
