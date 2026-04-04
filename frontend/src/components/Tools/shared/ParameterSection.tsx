'use client'

import { ReactNode, useState } from 'react'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Label } from '@/components/ui/label'
import type { AccentColor } from './types'
import { accentColorClasses } from './types'

interface ParameterSectionProps {
  title: string
  description?: string
  collapsible?: boolean
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  accentColor?: AccentColor
  children: ReactNode
}

export function ParameterSection({
  title,
  description,
  collapsible = false,
  defaultExpanded = true,
  expanded,
  onExpandedChange,
  accentColor = 'cyan',
  children,
}: ParameterSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isExpanded = expanded ?? internalExpanded
  const setIsExpanded = (next: boolean) => {
    if (expanded === undefined) {
      setInternalExpanded(next)
    }
    onExpandedChange?.(next)
  }
  const colors = accentColorClasses[accentColor]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className={`flex items-center justify-between ${collapsible ? 'cursor-pointer' : ''}`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          )}
          <h4 className="text-sm font-medium text-white">{title}</h4>
        </div>
        {description && (
          <span className="text-xs text-gray-500">{description}</span>
        )}
      </div>

      {/* Content */}
      {(!collapsible || isExpanded) && (
        <div className="space-y-4 pl-6">
          {children}
        </div>
      )}
    </div>
  )
}

// Parameter input components
interface ParameterInputProps {
  label: string
  description?: string
  tooltip?: string
  required?: boolean
  error?: string
  children: ReactNode
}

export function ParameterInput({
  label,
  description,
  tooltip,
  required = false,
  error,
  children,
}: ParameterInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-gray-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        {tooltip && (
          <div className="group relative">
            <Info className="w-4 h-4 text-gray-500 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-gray-800 text-gray-300 text-xs p-2 rounded shadow-lg max-w-xs">
                {tooltip}
              </div>
            </div>
          </div>
        )}
      </div>
      {children}
      {description && !error && (
        <p className="text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

// Slider parameter
interface SliderParameterProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  description?: string
  tooltip?: string
  accentColor?: AccentColor
}

export function SliderParameter({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  description,
  tooltip,
  accentColor = 'cyan',
}: SliderParameterProps) {
  const colors = accentColorClasses[accentColor]

  return (
    <ParameterInput label={label} description={description} tooltip={tooltip}>
      <div className="flex items-center gap-4">
        <input
          type="range"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className={`flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-${accentColor}-500`}
        />
        <div className="flex items-center gap-1 min-w-[60px] justify-end">
          <span className="text-white font-medium">{value}</span>
          {unit && <span className="text-gray-400 text-sm">{unit}</span>}
        </div>
      </div>
    </ParameterInput>
  )
}

// Select parameter
interface SelectParameterProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; description?: string }>
  description?: string
  tooltip?: string
}

export function SelectParameter({
  label,
  value,
  onChange,
  options,
  description,
  tooltip,
}: SelectParameterProps) {
  return (
    <ParameterInput label={label} description={description} tooltip={tooltip}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </ParameterInput>
  )
}

// Number input parameter
interface NumberParameterProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  description?: string
  tooltip?: string
}

export function NumberParameter({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  description,
  tooltip,
}: NumberParameterProps) {
  return (
    <ParameterInput label={label} description={description} tooltip={tooltip}>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="flex-1 p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
        {unit && <span className="text-gray-400 text-sm">{unit}</span>}
      </div>
    </ParameterInput>
  )
}

// Toggle/Switch parameter
interface ToggleParameterProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  description?: string
  tooltip?: string
  accentColor?: AccentColor
}

export function ToggleParameter({
  label,
  value,
  onChange,
  description,
  tooltip,
  accentColor = 'cyan',
}: ToggleParameterProps) {
  const colors = accentColorClasses[accentColor]

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <Label className="text-gray-300">{label}</Label>
        {tooltip && (
          <div className="group relative">
            <Info className="w-4 h-4 text-gray-500 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-gray-800 text-gray-300 text-xs p-2 rounded shadow-lg max-w-xs">
                {tooltip}
              </div>
            </div>
          </div>
        )}
        {description && (
          <span className="text-xs text-gray-500">({description})</span>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          value ? colors.bg : 'bg-gray-700'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

// Preset selector (for common configurations)
interface PresetOption {
  id: string
  name: string
  description: string
  icon?: ReactNode
}

interface PresetSelectorProps {
  label: string
  presets: PresetOption[]
  selectedPreset: string
  onPresetSelect: (presetId: string) => void
  accentColor?: AccentColor
  columnsClassName?: string
}

export function PresetSelector({
  label,
  presets,
  selectedPreset,
  onPresetSelect,
  accentColor = 'cyan',
  columnsClassName = 'grid-cols-1 sm:grid-cols-3',
}: PresetSelectorProps) {
  const colors = accentColorClasses[accentColor]
  const renderDescription = (description: string) => {
    const segments = description.split(', ')
    if (segments.length === 1) return description

    return segments.map((segment, index) => (
      <span key={`${segment}-${index}`} className="inline-block whitespace-nowrap">
        {segment}
        {index < segments.length - 1 && ','}
        {index < segments.length - 1 && ' '}
      </span>
    ))
  }

  return (
    <div className="space-y-3">
      <Label className="text-gray-300">{label}</Label>
      <div className={`grid ${columnsClassName} gap-3`}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onPresetSelect(preset.id)}
            className={`h-full min-h-[104px] p-4 rounded-lg border text-left transition-all ${
              selectedPreset === preset.id
                ? `${colors.border} ${colors.bgLight}`
                : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {preset.icon}
              <span className={`text-base font-semibold leading-tight ${selectedPreset === preset.id ? colors.text : 'text-white'}`}>
                {preset.name}
              </span>
            </div>
            <p className="text-sm leading-snug text-gray-400">{renderDescription(preset.description)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
