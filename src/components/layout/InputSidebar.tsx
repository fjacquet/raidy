/**
 * Left sidebar containing input panels in accordion style.
 */

import { useState } from 'react'
import { AdvancedPanel, HardwarePanel, TopologyPanel, WorkloadPanel } from '@/components/inputs'

interface AccordionItemProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

function AccordionItem({ title, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div className="border-b border-surface-700 last:border-b-0">
      <button type="button" onClick={onToggle} className="accordion-trigger">
        <span>{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="accordion-content" style={{ maxHeight: isOpen ? '2000px' : '0px' }}>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

export function InputSidebar() {
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
    <aside className="w-80 flex-shrink-0 bg-surface-800 border-r border-surface-700 overflow-y-auto">
      <div className="p-4 border-b border-surface-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Configuration
        </h2>
      </div>

      <AccordionItem
        title="Topology"
        isOpen={openSections.has('topology')}
        onToggle={() => toggleSection('topology')}
      >
        <TopologyPanel />
      </AccordionItem>

      <AccordionItem
        title="Hardware"
        isOpen={openSections.has('hardware')}
        onToggle={() => toggleSection('hardware')}
      >
        <HardwarePanel />
      </AccordionItem>

      <AccordionItem
        title="Workload"
        isOpen={openSections.has('workload')}
        onToggle={() => toggleSection('workload')}
      >
        <WorkloadPanel />
      </AccordionItem>

      <AccordionItem
        title="Advanced"
        isOpen={openSections.has('advanced')}
        onToggle={() => toggleSection('advanced')}
      >
        <AdvancedPanel />
      </AccordionItem>
    </aside>
  )
}
