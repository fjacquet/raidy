/**
 * Sizing Guide view - educational content explaining storage calculations.
 * Uses accordion sections for organized, collapsible content.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccordionItem } from '@/components/common'
import {
  CapacityGuide,
  PerformanceGuide,
  PlatformGuide,
  RaidGuide,
  ResilienceGuide,
  SustainabilityGuide,
} from './sections'

type SectionKey =
  | 'capacity'
  | 'raid'
  | 'performance'
  | 'resilience'
  | 'sustainability'
  | 'platforms'

const SECTIONS: { key: SectionKey; component: React.FC }[] = [
  { key: 'capacity', component: CapacityGuide },
  { key: 'raid', component: RaidGuide },
  { key: 'performance', component: PerformanceGuide },
  { key: 'resilience', component: ResilienceGuide },
  { key: 'sustainability', component: SustainabilityGuide },
  { key: 'platforms', component: PlatformGuide },
]

export function GuideView() {
  const { t } = useTranslation('guide')
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['capacity']))

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('subtitle')}</p>
        </div>

        <div className="panel">
          {SECTIONS.map(({ key, component: Section }) => (
            <AccordionItem
              key={key}
              title={t(`${key}.title`)}
              isOpen={openSections.has(key)}
              onToggle={() => toggleSection(key)}
            >
              <Section />
            </AccordionItem>
          ))}
        </div>
      </div>
    </main>
  )
}
