'use client'

import { ReactNode } from 'react'
import { StepIndicator } from './StepIndicator'
import { WorkflowNavigation } from './WorkflowNavigation'
import type { WorkflowStep, AccentColor } from './types'
import { accentColorClasses } from './types'

interface WorkflowContainerProps {
  // Allow step navigation even while running (useful for viewing results during long calculations)
  allowStepNavigationWhileRunning?: boolean
  // Header
  title: string
  description: string
  icon: ReactNode
  showHeader?: boolean

  // Steps
  steps: WorkflowStep[]
  currentStep: number
  onStepClick?: (step: number) => void

  // Navigation
  onBack: () => void
  onNext: () => void
  onReset: () => void
  onExecute?: () => void
  canProceed?: boolean
  isRunning?: boolean
  executeLabel?: string
  showExecuteOnStep?: number

  // Styling
  accentColor?: AccentColor

  // Content
  children: ReactNode

  // Error
  error?: string | null
}

export function WorkflowContainer({
  allowStepNavigationWhileRunning = false,
  title,
  description,
  icon,
  showHeader = true,
  steps,
  currentStep,
  onStepClick,
  onBack,
  onNext,
  onReset,
  onExecute,
  canProceed = true,
  isRunning = false,
  executeLabel = 'Start',
  showExecuteOnStep,
  accentColor = 'blue',
  children,
  error,
}: WorkflowContainerProps) {
  const colors = accentColorClasses[accentColor]

  return (
    <div className="h-full flex flex-col px-6 py-6">
      {/* Header */}
      {showHeader && (
        <div className="flex items-start gap-3 mb-6">
          <div className={`p-2.5 bg-gradient-to-br ${colors.gradient} rounded-lg`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <StepIndicator
        steps={steps}
        currentStep={currentStep}
        onStepClick={onStepClick}
        disabled={isRunning && !allowStepNavigationWhileRunning}
        accentColor={accentColor}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-3">
        {children}
      </div>

      {/* Error Display */}
      {error && (
        <div className="py-2">
          <div className="p-3 bg-red-900/30 border border-red-700/50 text-red-400 rounded-lg text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Navigation */}
      <WorkflowNavigation
        currentStep={currentStep}
        totalSteps={steps.length}
        onBack={onBack}
        onNext={onNext}
        onReset={onReset}
        onExecute={onExecute}
        canProceed={canProceed}
        isRunning={isRunning}
        executeLabel={executeLabel}
        accentColor={accentColor}
        showExecuteOnStep={showExecuteOnStep}
      />
    </div>
  )
}
