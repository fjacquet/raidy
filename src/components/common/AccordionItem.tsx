/**
 * Shared accordion item component for collapsible sections.
 * Used in InputSidebar and GuideView.
 */

interface AccordionItemProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function AccordionItem({ title, isOpen, onToggle, children }: AccordionItemProps) {
  return (
    <div className="border-b border-slate-200 dark:border-surface-700 last:border-b-0">
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
