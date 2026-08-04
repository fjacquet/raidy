import type { z } from 'zod'
import { ConfigStateSchema } from '@/utils/schemas'

/**
 * Which configuration fields belong in a shared link, and which deliberately do not.
 *
 * `PERSISTED_KEYS` is derived from `ConfigStateSchema`, the richer artifact — it already carries
 * per-field validation, so the field set follows from it rather than being hand-maintained a
 * second time. `tests/store/persistedKeys.spec.ts` still asserts that `PERSISTED_KEYS ∪
 * EPHEMERAL_KEYS` partitions the store's configuration state, so a field missing from the schema
 * is caught by that test rather than silently vanishing from a shared link, as `performanceThreshold`
 * once did (#63).
 */
export type PersistedKey = keyof z.infer<typeof ConfigStateSchema>
export const PERSISTED_KEYS = Object.keys(ConfigStateSchema.shape) as PersistedKey[]

/**
 * Configuration state deliberately kept out of shared links.
 *
 * The drive filters narrow the picker for the current session; they describe how someone is
 * browsing the drive database, not the configuration the link is meant to reproduce.
 */
export const EPHEMERAL_KEYS = ['driveConnectivity', 'driveFormFactor'] as const
