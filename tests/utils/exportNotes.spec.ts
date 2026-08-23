/**
 * The positioning line that leaves the app with every customer-facing export.
 *
 * raidy matches the vendor exactly where the vendor publishes and estimates where it does not.
 * Both halves have to be said, in the same sentence, or the export overclaims.
 */
import { describe, expect, it } from 'vitest'
import de from '@/i18n/locales/de/common.json'
import common from '@/i18n/locales/en/common.json'
import fr from '@/i18n/locales/fr/common.json'
import it_ from '@/i18n/locales/it/common.json'
import { catalogEstimateNote } from '@/utils/exportNotes'

const t = (key: string) =>
  key === 'common:powerScale.estimateNote' ? common.powerScale.estimateNote : key

describe('catalogEstimateNote', () => {
  it('returns the note for PowerScale', () => {
    expect(catalogEstimateNote({ type: 'powerscale', level: 'powerscale_onefs' }, t)).toBe(
      common.powerScale.estimateNote,
    )
  })

  it('returns null for a platform sized from the user’s own drive selection', () => {
    expect(catalogEstimateNote({ type: 'standard', level: 'RAID6' }, t)).toBeNull()
    expect(catalogEstimateNote({ type: 'beegfs', level: 'beegfs_raid6' }, t)).toBeNull()
  })

  /**
   * Naming PowerSizer is the point: raidy is the shortcut, not the replacement. Every locale has
   * to keep the product name and say the estimate is not a vendor-published value.
   */
  it('names PowerSizer in all four locales', () => {
    for (const locale of [common, fr, de, it_]) {
      expect(locale.powerScale.estimateNote).toMatch(/PowerSizer/)
      expect(locale.powerScale.estimateNote.length).toBeGreaterThan(80)
    }
  })
})
