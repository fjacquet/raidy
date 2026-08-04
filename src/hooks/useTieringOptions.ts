/**
 * Assembles the complete tiering option bag for {@link resolveTiering}.
 *
 * `resolveTiering` only ever reads the single field matching `topology.type` and ignores the
 * rest, so an over-complete `TieringResolverOptions` bag is always safe to pass. Hand-listing a
 * subset per call site is not: it's the exact mistake that dropped a platform's options and
 * caused issues #59/#60, plus a sustainability gap found in review. Centralising the assembly
 * here makes that class of bug structurally impossible — callers can no longer forget a field.
 */

import { useMemo } from 'react'
import type { TieringResolverOptions } from '@/engines/shared/tiering'
import { useConfigStore } from '@/store'

/** Hook returning a memoized, always-complete {@link TieringResolverOptions} bag. */
export function useTieringOptions(): TieringResolverOptions {
  const { s2dOptions, vsanOptions, cephOptions, nutanixOptions, beeGfsOptions } = useConfigStore()

  return useMemo(
    () => ({ s2dOptions, vsanOptions, cephOptions, nutanixOptions, beeGfsOptions }),
    [s2dOptions, vsanOptions, cephOptions, nutanixOptions, beeGfsOptions],
  )
}
