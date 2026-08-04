/**
 * Shared `Worker` mock for `useResilience` specs.
 *
 * `useResilience` posts a `SimulationInput` payload to a real Web Worker; these tests stub the
 * global `Worker` constructor and capture every posted payload so assertions can inspect exactly
 * what the hook sent, without running the actual Monte Carlo simulation.
 *
 * Each call to {@link installMockWorker} builds its own `posted` array and its own `MockWorker`
 * class closed over it, so specs never share capture state even when run in the same file.
 */

import { vi } from 'vitest'
import type { SimulationInput } from '@/types/worker'

export interface MockWorkerHandle {
  /** SimulationInput payloads captured from every 'START' postMessage call. */
  posted: SimulationInput[]
  /** Restores the real global Worker. Call in afterEach. */
  uninstall: () => void
}

/** Installs a fresh mocked `Worker` global and returns its capture array. */
export function installMockWorker(): MockWorkerHandle {
  const posted: SimulationInput[] = []

  class MockWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    postMessage(message: { type: string; payload: SimulationInput }) {
      if (message.type === 'START') posted.push(message.payload)
    }
    terminate() {}
  }

  vi.stubGlobal('Worker', MockWorker)

  return {
    posted,
    uninstall: () => vi.unstubAllGlobals(),
  }
}
