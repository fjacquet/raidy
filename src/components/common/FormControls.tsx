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
}

interface SelectProps {
  id: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
}

export function Select({ id, value, options, onChange }: SelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-slate-100 dark:bg-surface-700 border border-slate-200 dark:border-surface-600 rounded-lg text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

interface ToggleProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function Toggle({ id, checked, onChange, label }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      <div className="relative">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-slate-200 dark:bg-surface-600 rounded-full peer peer-checked:bg-primary-600 transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
      </div>
    </label>
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
