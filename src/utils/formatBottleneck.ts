/**
 * Render a {@link BottleneckStatus} as a sentence, in the caller's language (#139).
 *
 * Two consumers need the identical sentence — the dashboard's Performance act and the PDF export
 * — and they reach i18next differently: the component through `useTranslation('output')`, the PDF
 * through its own `i18n.t('pdf:…')` wrapper. Rather than duplicate four keys across two
 * namespaces, both call this with a translate function bound to the `output` namespace.
 *
 * The engine deliberately does not do this itself: `src/engines/**` is pure functions with no
 * i18n, and translating inside the PDF path would freeze whatever language happened to be active
 * when the calculation ran rather than when the document is produced.
 */

import type { BottleneckStatus } from '@/types/results'

/** Minimal shape of an i18next `t` bound to the `output` namespace. */
type Translate = (key: string, options?: Record<string, string | number>) => string

export function formatBottleneck(status: BottleneckStatus, t: Translate): string {
  switch (status.kind) {
    case 'layer':
      // `layerName` is a technical identifier — "Media (Drives)", a controller model,
      // "PCIe gen5 x16" — and stays untranslated per the project's convention. Interpolated
      // rather than concatenated so a translator can reorder it; German and Italian need to.
      return t('performance.bottleneck.layer', {
        layer: status.layerName,
        throughput: status.throughputMBs,
      })
    case 'none':
      return t('performance.bottleneck.none')
    case 'noDrive':
      return t('performance.bottleneck.noDrive')
    case 'error':
      return t('performance.bottleneck.error')
  }
}
