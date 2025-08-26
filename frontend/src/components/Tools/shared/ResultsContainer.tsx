'use client'

import { ReactNode } from 'react'
import { CheckCircle2, XCircle, Loader2, Download, Save, Activity, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AccentColor } from './types'
import { accentColorClasses } from './types'

interface ResultsContainerProps {
  // Status
  status: 'idle' | 'running' | 'success' | 'error' | 'pending'
  isRunning?: boolean
  progress?: number
  progressMessage?: string

  // Results
  title?: string
  subtitle?: string
  error?: string | null

  // Actions
  onNewCalculation?: () => void
  onDownload?: () => void
  onSave?: () => void
  onOptimize?: () => void

  // Styling
  accentColor?: AccentColor

  // Content
  children?: ReactNode
}

export function ResultsContainer({
  status,
  isRunning = false,
  progress = 0,
  progressMessage = '',
  title = 'Results',
  subtitle,
  error,
  onNewCalculation,
  onDownload,
  onSave,
  onOptimize,
  accentColor = 'blue',
  children,
}: ResultsContainerProps) {
  const colors = accentColorClasses[accentColor]

  const getStatusDisplay = () => {
    if (isRunning || status === 'running') {
      return (
        <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <Loader2 className={`w-6 h-6 ${colors.text} animate-spin`} />
          <div className="flex-1">
            <div className="flex justify-between items-center mb-2">
              <span className="text-white font-medium">Processing...</span>
              <span className={`text-sm ${colors.text}`}>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${colors.bg} transition-all duration-300`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {progressMessage && (
              <p className="text-sm text-gray-400 mt-2">{progressMessage}</p>
            )}
          </div>
        </div>
      )
    }

    if (status === 'error' || error) {
      return (
        <div className="flex items-start gap-3 p-4 bg-red-900/20 rounded-lg border border-red-700/50">
          <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <h4 className="text-red-400 font-medium mb-1">Calculation Failed</h4>
            <p className="text-red-300 text-sm">{error || 'An unknown error occurred'}</p>
          </div>
        </div>
      )
    }

    if (status === 'success') {
      return (
        <div className="flex items-center gap-3 p-4 bg-green-900/20 rounded-lg border border-green-700/50">
          <CheckCircle2 className="w-6 h-6 text-green-400" />
          <div>
            <h4 className="text-green-400 font-medium">Calculation Complete</h4>
            {subtitle && <p className="text-green-300 text-sm">{subtitle}</p>}
          </div>
        </div>
      )
    }

    if (status === 'pending') {
      return (
        <div className="flex items-center gap-3 p-4 bg-yellow-900/20 rounded-lg border border-yellow-700/50">
          <Loader2 className="w-6 h-6 text-yellow-400 animate-spin" />
          <div>
            <h4 className="text-yellow-400 font-medium">Waiting for Results</h4>
            <p className="text-yellow-300 text-sm">The calculation is queued or processing...</p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className={`w-6 h-6 rounded-full ${colors.bgLight} flex items-center justify-center`}>
          <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
        </div>
        <span className="text-gray-400">No results yet. Run a calculation to see results.</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {onNewCalculation && status !== 'running' && !isRunning && (
          <Button
            onClick={onNewCalculation}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            New Calculation
          </Button>
        )}
      </div>

      {/* Status Display */}
      {getStatusDisplay()}

      {/* Results Content */}
      {(status === 'success' || children) && !isRunning && (
        <div className="space-y-4">
          {children}
        </div>
      )}

      {/* Action Buttons */}
      {status === 'success' && (onDownload || onSave || onOptimize) && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-700">
          {onDownload && (
            <Button
              onClick={onDownload}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          )}
          {onSave && (
            <Button
              onClick={onSave}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save to Library
            </Button>
          )}
          {onOptimize && (
            <Button
              onClick={onOptimize}
              variant="outline"
              size="sm"
              className="gap-2 bg-blue-900/20 border-blue-700/50 hover:bg-blue-900/30"
            >
              <Activity className="w-4 h-4" />
              Optimize with MD
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Sub-component for displaying result metrics
interface ResultMetricProps {
  label: string
  value: string | number
  unit?: string
  description?: string
  status?: 'good' | 'warning' | 'bad' | 'neutral'
  accentColor?: AccentColor
}

export function ResultMetric({
  label,
  value,
  unit,
  description,
  status = 'neutral',
  accentColor = 'blue',
}: ResultMetricProps) {
  const colors = accentColorClasses[accentColor]

  const statusColors = {
    good: 'text-green-400 bg-green-900/20 border-green-700/50',
    warning: 'text-yellow-400 bg-yellow-900/20 border-yellow-700/50',
    bad: 'text-red-400 bg-red-900/20 border-red-700/50',
    neutral: `${colors.text} ${colors.bgLight} ${colors.border}`,
  }

  return (
    <div className={`p-4 rounded-lg border ${statusColors[status]}`}>
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  )
}

// Sub-component for results table
interface ResultsTableProps {
  columns: Array<{ key: string; label: string; align?: 'left' | 'center' | 'right' }>
  data: Array<Record<string, any>>
  onRowClick?: (row: Record<string, any>, index: number) => void
  selectedIndex?: number | null
  accentColor?: AccentColor
}

export function ResultsTable({
  columns,
  data,
  onRowClick,
  selectedIndex,
  accentColor = 'blue',
}: ResultsTableProps) {
  const colors = accentColorClasses[accentColor]

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`py-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row, idx)}
              className={`
                border-b border-gray-800 transition-colors
                ${onRowClick ? 'cursor-pointer hover:bg-gray-800/50' : ''}
                ${selectedIndex === idx ? `${colors.bgLight}` : ''}
              `}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-3 px-3 text-sm ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${selectedIndex === idx ? colors.text : 'text-gray-300'}`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
