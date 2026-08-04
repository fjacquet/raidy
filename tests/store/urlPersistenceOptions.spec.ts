/**
 * Task 9 — platform options must survive "Copy URL to Share".
 *
 * These tests exercise the real Zustand store + persist middleware (not just the
 * schema/urlHashStorage layer) to prove the end-to-end backward-compatibility
 * guarantee: a link shared before this fix (or before some future platform's
 * options existed) must rehydrate to the slice's full DEFAULT_*_OPTIONS object,
 * never a partially-populated one, and gating booleans must read as `false`
 * rather than `undefined`.
 */

import { compressToEncodedURIComponent } from 'lz-string'
import { beforeEach, describe, expect, it } from 'vitest'
import { useConfigStore } from '@/store'

describe('Config store URL persistence — platform options backward compatibility', () => {
  beforeEach(() => {
    window.location.hash = ''
    useConfigStore.getState().resetToDefaults()
  })

  it('falls back to full DEFAULT_*_OPTIONS objects when a legacy link omits every new platform option', async () => {
    // Simulates a link generated before this fix: no vsanOptions, cephOptions,
    // longhornOptions, beeGfsOptions, powerFlexOptions and no s2dOptions.tieringConfig.
    const legacyPayload = {
      driveId: 'ent-hdd-7k2-sata-24tb-cmr',
      driveCount: 12,
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      hotSpares: 1,
      s2dOptions: {
        faultDomains: 4,
        mirrorCopies: 2,
        rebuildReserve: true,
        reserveStrategy: 'node_failure',
        storageTiers: true, // gating boolean present but no tieringConfig payload
      },
    }
    // The store's persist middleware wraps partialized state in a
    // `{ state, version }` envelope (zustand's `createJSONStorage` contract)
    // before urlHashStorage ever sees it — a real shared link has this shape,
    // not the bare config object.
    const compressed = compressToEncodedURIComponent(
      JSON.stringify({ state: legacyPayload, version: 1 }),
    )
    window.location.hash = `#raidy=${compressed}`

    await useConfigStore.persist.rehydrate()

    const state = useConfigStore.getState()

    // Gating booleans must read false, never undefined/truthy, when their whole
    // options object was never in the link.
    expect(state.beeGfsOptions.metadataTargets).toBe(false)
    expect(state.cephOptions.walDbOffload).toBe(false)

    // Every field of each omitted options object is present (full default),
    // never a partially-populated object.
    expect(state.vsanOptions).toEqual({
      diskGroupMode: 'all-flash',
      compression: true,
      compressionRatio: 1.5,
      dedup: false,
      dedupRatio: 1.0,
      encryption: false,
    })
    expect(state.longhornOptions).toEqual({
      diskMode: 'dedicated',
      minimalAvailablePercent: 10,
      snapshotHeadroom: 1.2,
      growthHeadroom: 1.2,
      overProvisioningPercent: 200,
    })
    expect(state.powerFlexOptions.granularity).toBe('medium')
    expect(state.powerFlexOptions.protectionMode).toBe('mirror')

    // s2dOptions itself WAS in the link (fully valid, no tieringConfig) — it must
    // be honored as-is, and the optional tieringConfig field must not resurrect
    // stale data from the previous store state.
    expect(state.s2dOptions.storageTiers).toBe(true)
    expect(state.s2dOptions.tieringConfig).toBeUndefined()

    // Fields the legacy link DID carry are still honored.
    expect(state.driveCount).toBe(12)
    expect(state.topology).toEqual({ type: 'beegfs', level: 'beegfs_raid6' })
  })

  it('round-trips a fully populated set of platform options through the real store', async () => {
    useConfigStore.setState({
      beeGfsOptions: {
        drivesPerTarget: 10,
        storageBuddyMirror: true,
        metadataBuddyMirror: false,
        chunkSizeKb: 1024,
        numTargets: 8,
        network: 'ib-ndr',
        fsOverheadPercent: 3,
        metadataTargets: true,
        tiering: {
          enabled: true,
          fastTier: { driveId: 'mdt-drive', driveCount: 2 },
          capacityTier: { driveId: 'ost-drive', driveCount: 40 },
          cacheMode: 'write-back',
          workingSetPercent: 10,
        },
      },
    })

    // Simulate what the persist middleware writes to the URL, then rehydrate a
    // fresh read from it (round trip through compression + validation).
    const persistedHash = window.location.hash
    expect(persistedHash).toContain('raidy=')

    // Blow away the in-memory store (this also re-persists the defaults to the
    // URL) then restore the captured hash to simulate opening a fresh tab on
    // the previously shared link.
    useConfigStore.getState().resetToDefaults()
    expect(useConfigStore.getState().beeGfsOptions.metadataTargets).toBe(false)
    window.location.hash = persistedHash

    await useConfigStore.persist.rehydrate()

    const state = useConfigStore.getState()
    expect(state.beeGfsOptions).toEqual({
      drivesPerTarget: 10,
      storageBuddyMirror: true,
      metadataBuddyMirror: false,
      chunkSizeKb: 1024,
      numTargets: 8,
      network: 'ib-ndr',
      fsOverheadPercent: 3,
      metadataTargets: true,
      tiering: {
        enabled: true,
        fastTier: { driveId: 'mdt-drive', driveCount: 2 },
        capacityTier: { driveId: 'ost-drive', driveCount: 40 },
        cacheMode: 'write-back',
        workingSetPercent: 10,
      },
    })
  })

  it('keeps a realistic fully-customized single-platform link well under the ~2000-char budget', () => {
    // Realistic worst case: a user configures ONE platform's options panel in
    // full (every field pushed away from default) plus hardware/workload/
    // advanced settings — the other ~14 unused *Options objects stay at their
    // defaults and are omitted from the URL entirely (see `omitDefaults` in
    // src/store/configStore.ts).
    useConfigStore.setState({
      driveId: 'ent-nvme-tlc-u2-15tb',
      driveCount: 60,
      serverCount: 16,
      serverPowerWatts: 650,
      topology: { type: 'beegfs', level: 'beegfs_raid6' },
      hotSpares: 4,
      beeGfsOptions: {
        drivesPerTarget: 10,
        storageBuddyMirror: true,
        metadataBuddyMirror: false,
        chunkSizeKb: 1024,
        numTargets: 8,
        network: 'ib-ndr',
        fsOverheadPercent: 3,
        metadataTargets: true,
        tiering: {
          enabled: true,
          fastTier: { driveId: 'mdt-drive', driveCount: 2 },
          capacityTier: { driveId: 'ost-drive', driveCount: 40 },
          cacheMode: 'write-back',
          workingSetPercent: 10,
        },
      },
      readPercent: 80,
      blockSize: '1M',
      randomPercent: 20,
      datasetSize: 500 * 1024 * 1024 * 1024 * 1024,
      dailyWriteVolume: 5 * 1024 * 1024 * 1024 * 1024,
      compressionRatio: 1.0,
      dedupRatio: 1.0,
      networkSpeed: '100GbE',
      pcieGen: 'gen5',
      pcieLanes: 'x16',
      pue: 1.3,
      carbonRegion: 'usa_average',
      projectYears: 7,
      electricityCostPerKwh: 0.18,
      unitSystem: 'decimal',
    })

    const hash = window.location.hash
    console.info(`[Task 9] realistic single-platform link length: ${hash.length} chars`)
    expect(hash.length).toBeLessThan(2000)
  })
})
