'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStep, AccentColor } from './types'
import { accentColorClasses } from './types'

/** Literal shadow classes so Tailwind emits them (dynamic `shadow-${x}-500/30` never does). */
const STEP_ACTIVE_SHADOW: Record<AccentColor, string> = {
  blue: 'shadow-blue-500/30',
  green: 'shadow-green-500/30',
  purple: 'shadow-purple-500/30',
  orange: 'shadow-orange-500/30',
  pink: 'shadow-pink-500/30',
  teal: 'shadow-teal-500/30',
  indigo: 'shadow-indigo-500/30',
  cyan: 'shadow-cyan-500/30',
  amber: 'shadow-amber-500/30',
  fuchsia: 'shadow-fuchsia-500/30',
  rose: 'shadow-rose-500/30',
}

interface StepIndicatorProps {
  steps: WorkflowStep[]
  currentStep: number
  onStepClick?: (step: number) => void
  disabled?: boolean
  accentColor?: AccentColor
}

export function StepIndicator({
  steps,
  currentStep,
  onStepClick,
  disabled = false,
  accentColor = 'cyan',
}: StepIndicatorProps) {
  const colors = accentColorClasses[accentColor]

  return (
    <div className="flex justify-between items-center mb-6">
      {steps.map((step, index) => {
        const stepNumber = index + 1
        const isActive = currentStep === stepNumber
        const isCompleted = currentStep > stepNumber
        const isClickable = onStepClick && !disabled

        return (
          <div key={step.id} className="flex flex-col items-center flex-1 relative">
            {/* Connector line */}
            {index > 0 && (
              <div
                className={`absolute top-5 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                  isCompleted || isActive ? 'bg-green-500' : 'bg-gray-700'
                }`}
                style={{ width: 'calc(100% - 2.5rem)', right: 'calc(50% + 1.25rem)' }}
              />
            )}

            {/* Step circle */}
            <button
              onClick={() => isClickable && onStepClick(stepNumber)}
              disabled={disabled && isClickable === false}
              className={cn(
                'relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all duration-200',
                isClickable ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                disabled && isClickable === false && 'opacity-50',
                isActive && cn(colors.bg, 'text-white shadow-lg', STEP_ACTIVE_SHADOW[accentColor]),
                isCompleted && 'bg-green-500 text-white',
                !isActive && !isCompleted && 'bg-gray-700 text-gray-400',
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                stepNumber
              )}
            </button>

            {/* Step label */}
            <span
              className={`
                text-xs mt-2 whitespace-nowrap transition-colors
                ${isActive ? `${colors.text} font-medium` : 'text-gray-400'}
              `}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
