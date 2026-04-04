'use client'

import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import type { AccentColor, ExecutionState } from './types'
import { accentColorClasses } from './types'

export interface ConfigGroup {
  title: string
  items: Array<{ label: string; value: string; valueColor?: string }>
}

export interface RuntimeEstimate {
  value: string
  detail?: string
}

interface ExecutionPanelProps {
  // Execution state
  isRunning: boolean
  progress: number
  progressMessage: string
  completedStages?: string[]
  error?: string | null

  // Configuration — grouped sections (preferred) or flat list (backward compat)
  configGroups?: ConfigGroup[]
  configSummary?: Array<{ label: string; value: string }>
  runtimeEstimate?: RuntimeEstimate

  // Styling
  accentColor?: AccentColor

  // Custom content
  children?: React.ReactNode
}

export function ExecutionPanel({
  isRunning,
  progress,
  progressMessage,
  completedStages = [],
  error,
  configGroups,
  configSummary,
  runtimeEstimate,
  accentColor = 'cyan',
  children,
}: ExecutionPanelProps) {
  const colors = accentColorClasses[accentColor]

  // Convert flat configSummary to a single group for unified rendering
  const groups: ConfigGroup[] = configGroups
    ? configGroups
    : configSummary && configSummary.length > 0
      ? [{ title: 'Configuration', items: configSummary }]
      : []

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      {groups.length > 0 && (
        <div className={`p-3 ${colors.bgLight} border ${colors.borderLight} rounded-lg`}>
          <h4 className={`${colors.text} font-semibold text-sm`}>Review Configuration</h4>
          <p className="text-xs text-gray-400 mt-0.5">Verify your settings before starting.</p>
        </div>
      )}

      {/* Config Groups */}
      {groups.map((group, gIdx) => (
        <div key={gIdx} className="space-y-1.5">
          <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{group.title}</h5>
          <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 grid grid-cols-2 gap-y-1.5 gap-x-6 text-sm">
            {group.items.map((item, idx) => (
              <div key={idx} className="contents">
                <span className="text-gray-400">{item.label}</span>
                <span className={`font-medium ${item.valueColor || 'text-white'}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Runtime Estimate */}
      {runtimeEstimate && (
        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <span className="text-xs font-medium text-gray-400">Estimated Runtime</span>
          <p className={`text-base font-semibold ${colors.text} mt-0.5`}>{runtimeEstimate.value}</p>
          {runtimeEstimate.detail && (
            <p className="text-xs text-gray-500 mt-0.5">{runtimeEstimate.detail}</p>
          )}
        </div>
      )}

      {/* Progress Section */}
      {isRunning && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className={`w-5 h-5 ${colors.text} animate-spin`} />
            <span className="text-white font-medium">Processing...</span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">{progressMessage || 'Running...'}</span>
              <span className={colors.text}>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${colors.bg} transition-all duration-300 ease-out`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Completed Stages */}
          {completedStages.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Completed Stages
              </h5>
              <div className="space-y-1">
                {completedStages.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">{stage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 text-sm font-medium">Error</p>
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Ready State (not running, no error) */}
      {!isRunning && !error && groups.length > 0 && (
        <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${colors.text}`} />
            <span className="text-gray-300 text-sm">
              Ready to start. Click the button below to begin.
            </span>
          </div>
        </div>
      )}

      {/* Custom content */}
      {children}
    </div>
  )
}

// Sub-component for showing stage progress
interface StageProgressProps {
  stages: Array<{
    name: string
    status: 'pending' | 'running' | 'completed' | 'error'
    message?: string
  }>
  accentColor?: AccentColor
}

export function StageProgress({ stages, accentColor = 'cyan' }: StageProgressProps) {
  const colors = accentColorClasses[accentColor]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'running':
        return <Loader2 className={`w-4 h-4 ${colors.text} animate-spin`} />
      case 'error':
        return <XCircle className="w-4 h-4 text-red-400" />
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-600" />
    }
  }

  return (
    <div className="space-y-2">
      {stages.map((stage, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
            stage.status === 'running' ? `${colors.bgLight}` : ''
          }`}
        >
          {getStatusIcon(stage.status)}
          <div className="flex-1">
            <span className={`text-sm ${stage.status === 'running' ? 'text-white' : 'text-gray-400'}`}>
              {stage.name}
            </span>
            {stage.message && (
              <p className="text-xs text-gray-500">{stage.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
