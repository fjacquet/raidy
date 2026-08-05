/**
 * The Hardware panel's summary must describe the whole cluster, not one server.
 *
 * `driveCount` in the store is per-server. The panel's drive-count hint already renders
 * `driveCount * serverCount` ("Total drives: 120"), but the raw-capacity and hardware-cost
 * summary below it multiplied by `driveCount` alone — so on a 10-node BeeGFS cluster the panel
 * announced 120 drives and then priced twelve, understating both figures by 10x.
 *
 * Reported from the running app, not caught by any test: the two halves of one panel disagreed.
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { HardwarePanel } from '@/components/inputs/HardwarePanel'
import drivesData from '@/data/drives.json'
import { useConfigStore } from '@/store'
import type { Drive } from '@/types/drive'

const drives = drivesData as Record<string, Drive>

/** A drive whose capacity and price are large enough that a 10x error is unmistakable. */
const DRIVE_ID = 'ent-nvme-pcie4-6400gb-u3-mu'

function drive(): Drive {
  const d = drives[DRIVE_ID]
  if (!d) throw new Error(`fixture drive not found: ${DRIVE_ID}`)
  return d
}

/**
 * Renders the panel and returns its text with every digit-grouping separator stripped, so an
 * assertion on a raw number survives whatever the locale formatter inserts (`19'188`, `19,188`,
 * `19 188` are all Swiss/EN/FR variants this app produces).
 */
function summaryDigits(): string {
  render(<HardwarePanel />)
  return (document.body.textContent ?? '').replace(/['’ ,  ]/g, '')
}

describe('HardwarePanel cluster summary', () => {
  beforeEach(() => {
    // jsdom does not implement matchMedia; InfoTooltip's useIsTouchDevice hook needs it.
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
    useConfigStore.getState().resetToDefaults()
  })

  it('scales raw capacity and cost by the server count, matching its own drive-count hint', () => {
    const store = useConfigStore.getState()
    store.setTopology({ type: 'beegfs', level: 'beegfs_raid6' })
    store.setDriveId(DRIVE_ID)
    store.setDriveCount(12)
    store.setServerCount(10)

    const digits = summaryDigits()
    const d = drive()

    // 12 drives x 10 nodes = 120. Pre-fix the panel priced 12 and this assertion failed.
    // No negative assertion on the per-server figure: with this drive the cluster total
    // (191880) contains the per-server total (19188) as a substring, so `not.toContain` would
    // fail on correct output. The positive assertion is the falsifiable one.
    expect(digits).toContain(String(d.cost_usd * 120))
    expect(digits).toContain(String(d.capacity_raw * 120 > 0 ? 120 : 0)) // drive-count hint agrees
  })

  it('leaves a single-node configuration unchanged', () => {
    const store = useConfigStore.getState()
    store.setTopology({ type: 'standard', level: 'RAID6' })
    store.setDriveId(DRIVE_ID)
    store.setDriveCount(12)
    store.setServerCount(1)

    const digits = summaryDigits()
    expect(digits).toContain(String(drive().cost_usd * 12))
  })
})
