/**
 * Left sidebar containing input panels in accordion style.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccordionItem } from '@/components/common'
import {
  AdvancedPanel,
  DrivePropertiesPanel,
  HardwarePanel,
  TopologyPanel,
  WorkloadPanel,
} from '@/components/inputs'

export function InputSidebar() {
  const { t } = useTranslation('common')
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['hardware', 'topology']))

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  return (
    <aside className="w-80 flex-shrink-0 bg-white dark:bg-surface-800 border-r border-slate-200 dark:border-surface-700 overflow-y-auto">
      <div className="p-4 border-b border-slate-200 dark:border-surface-700">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
          {t('nav.configuration')}
        </h2>
      </div>

      <AccordionItem
        title={t('sections.topology')}
        isOpen={openSections.has('topology')}
        onToggle={() => toggleSection('topology')}
      >
        <TopologyPanel />
      </AccordionItem>

      <AccordionItem
        title={t('sections.hardware')}
        isOpen={openSections.has('hardware')}
        onToggle={() => toggleSection('hardware')}
      >
        <HardwarePanel />
      </AccordionItem>

      <AccordionItem
        title={t('sections.workload')}
        isOpen={openSections.has('workload')}
        onToggle={() => toggleSection('workload')}
      >
        <WorkloadPanel />
      </AccordionItem>

      <AccordionItem
        title={t('sections.advanced')}
        isOpen={openSections.has('advanced')}
        onToggle={() => toggleSection('advanced')}
      >
        <AdvancedPanel />
      </AccordionItem>

      <AccordionItem
        title={t('sections.driveProperties')}
        isOpen={openSections.has('drive-properties')}
        onToggle={() => toggleSection('drive-properties')}
      >
        <DrivePropertiesPanel />
      </AccordionItem>
    </aside>
  )
}
