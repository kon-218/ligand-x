'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, RotateCcw, Play, Loader2 } from 'lucide-react'
import type { AccentColor } from './types'
import { accentColorClasses } from './types'

interface WorkflowNavigationProps {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onReset: () => void
  onExecute?: () => void
  canProceed?: boolean
  isRunning?: boolean
  executeLabel?: string
  accentColor?: AccentColor
  showExecuteOnStep?: number
}

export function WorkflowNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onReset,
  onExecute,
  canProceed = true,
  isRunning = false,
  executeLabel = 'Start',
  accentColor = 'blue',
  showExecuteOnStep = totalSteps - 1,
}: WorkflowNavigationProps) {
  const colors = accentColorClasses[accentColor]
  const isExecuteStep = currentStep === showExecuteOnStep
  const isResultsStep = currentStep === totalSteps

  return (
    <div className="flex justify-between items-center pt-4 border-t border-gray-700">
      {/* Back Button */}
      <Button
        onClick={onBack}
        disabled={currentStep === 1}
        variant="outline"
        className="gap-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </Button>

      {/* Reset Button */}
      <Button
        onClick={onReset}
        variant="outline"
        className="gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </Button>

      {/* Next/Execute Button */}
      {isExecuteStep && onExecute ? (
        <Button
          onClick={onExecute}
          disabled={isRunning || !canProceed}
          className={`gap-2 ${colors.bg} ${colors.bgHover} text-white`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              {executeLabel}
            </>
          )}
        </Button>
      ) : !isResultsStep ? (
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className={`gap-2 ${colors.bg} ${colors.bgHover} text-white`}
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      ) : (
        <div /> // Empty placeholder for results step
      )}
    </div>
  )
}
