/**
 * Reusable form control components for the input panels.
 */

import type { ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'

interface LabelProps {
  children: ReactNode
  htmlFor?: string
  hint?: string
  tooltip?: string
}

export function Label({ children, htmlFor, hint, tooltip }: LabelProps) {
  return (
    <div className="flex items-baseline justify-between">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          {children}
        </label>
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      {hint && <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </div>
  )
}

interface SliderProps {
  id: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

export function Slider({ id, value, min, max, step = 1, onChange, formatValue }: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : value.toString()

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-slate-100 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
      />
      <span className="w-16 text-right text-sm font-mono text-slate-600 dark:text-slate-300">
        {displayValue}
      </span>
    </div>
  )
}

interface SelectOption {
  value: string
  label: string
  description?: string
  /**
   * Optional `<optgroup>` heading. Options carrying the same group are rendered under one
   * heading, in first-appearance order; options with no group render at the top level. Added
   * for the PowerScale node catalog, where 22 models only become scannable once they are split
   * into All Flash / Hybrid / Archive.
   */
  group?: string
}

interface SelectProps {
  id: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}

const SELECT_CLASS =
  'w-full px-3 py-2 bg-slate-100 dark:bg-surface-700 border border-slate-200 dark:border-surface-600 rounded-lg text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'

function Option({ option }: { option: SelectOption }) {
  return <option value={option.value}>{option.label}</option>
}

export function Select({ id, value, options, onChange }: SelectProps) {
  // Group headings are collected in first-appearance order so the caller's ordering is what
  // shows, rather than an alphabetical one imposed here.
  const groups: string[] = []
  for (const opt of options) {
    if (opt.group !== undefined && !groups.includes(opt.group)) groups.push(opt.group)
  }

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      {options
        .filter((opt) => opt.group === undefined)
        .map((opt) => (
          <Option key={opt.value} option={opt} />
        ))}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {options
            .filter((opt) => opt.group === group)
            .map((opt) => (
              <Option key={opt.value} option={opt} />
            ))}
        </optgroup>
      ))}
    </select>
  )
}

interface ToggleProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /**
   * Explanatory text, shown on hover/tap rather than as a permanent paragraph.
   *
   * Toggles had no tooltip until 2026-08-05, which is why every toggle that needed explaining
   * grew a `<p>` beneath it — three of the four text blocks on the BeeGFS panel were that.
   * Computed feedback still belongs on screen; only static prose belongs here.
   */
  tooltip?: string
}

export function Toggle({ id, checked, onChange, label, tooltip }: ToggleProps) {
  return (
    /*
      Two <label>s for one checkbox, deliberately: the text and the switch are each clickable,
      while the tooltip sits BETWEEN them, outside both. InfoTooltip renders a <button> with an
      onClick on touch devices — nested inside a label, tapping it to read the explanation would
      also flip the setting.
    */
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
          {label}
        </label>
        {tooltip && <InfoTooltip content={tooltip} />}
      </span>
      <label htmlFor={id} className="relative cursor-pointer">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-slate-200 dark:bg-surface-600 rounded-full peer peer-checked:bg-primary-600 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  )
}

interface NumberInputProps {
  id: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  suffix?: string
}

export function NumberInput({ id, value, min, max, step = 1, onChange, suffix }: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 px-3 py-2 bg-slate-100 dark:bg-surface-700 border border-slate-200 dark:border-surface-600 rounded-lg text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      />
      {suffix && <span className="text-sm text-slate-500 dark:text-slate-400">{suffix}</span>}
    </div>
  )
}

interface SegmentedControlProps {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export function SegmentedControl({ value, options, onChange }: SegmentedControlProps) {
  return (
    <div className="flex bg-slate-100 dark:bg-surface-700 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            value === opt.value
              ? 'bg-primary-600 text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
