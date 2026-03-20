import React from 'react'
import { motion } from 'framer-motion'
import { XCircle, Terminal, Activity, CheckCircle } from 'lucide-react'
import type { QCJob } from '@/store/qc-store'

interface QCJobProgressProps {
  job: QCJob
  onCancel: () => void
}

interface Stage {
  key: string
  name: string
}

const QC_STAGES: Record<string, Stage[]> = {
  standard: [
    { key: 'preparation', name: 'Input Preparation' },
    { key: 'scf', name: 'SCF Convergence' },
    { key: 'properties', name: 'Properties' },
  ],
  ir: [
    { key: 'preparation', name: 'Input Preparation' },
    { key: 'scf', name: 'SCF Convergence' },
    { key: 'optimization', name: 'Geometry Opt.' },
    { key: 'frequencies', name: 'Frequencies' },
    { key: 'properties', name: 'Properties' },
  ],
  fukui: [
    { key: 'preparation', name: 'Input Preparation' },
    { key: 'neutral', name: 'Neutral (N)' },
    { key: 'anion', name: 'Anion (N+1)' },
    { key: 'cation', name: 'Cation (N-1)' },
    { key: 'analysis', name: 'Fukui Analysis' },
  ],
  conformer: [
    { key: 'generation', name: 'Conformer Generation' },
    { key: 'filtering', name: 'Energy Filtering' },
    { key: 'optimization', name: 'DFT Optimization' },
    { key: 'ranking', name: 'Ranking' },
  ],
  bde: [
    { key: 'preparation', name: 'Bond Detection' },
    { key: 'parent_opt', name: 'Parent Optimization' },
    { key: 'fragments', name: 'Fragment Calculations' },
    { key: 'analysis', name: 'BDE Analysis' },
  ],
}

function inferCompletedStages(stages: Stage[], percent: number): string[] {
  const threshold = 100 / stages.length
  return stages
    .filter((_, i) => percent >= (i + 1) * threshold)
    .map(s => s.key)
}

export function QCJobProgress({ job, onCancel }: QCJobProgressProps) {
  // If progress object exists, use it. Otherwise fallback to simple number or 0
  const percent = typeof job.progress === 'object' ? job.progress.percent : (job.progress || 0)
  const step = typeof job.progress === 'object' ? job.progress.step : 'Processing...'
  const details = typeof job.progress === 'object' ? job.progress.details : ''

  // Determine job title based on type
  const getJobTitle = () => {
    switch (job.job_type) {
      case 'ir': return 'IR Spectrum Calculation'
      case 'fukui': return 'Fukui Indices Calculation'
      case 'conformer': return 'Conformer Search'
      case 'bde': return 'Bond Dissociation Energy Analysis'
      default: return 'Quantum Chemistry Calculation'
    }
  }

  // Get stages for this job type
  const stages = QC_STAGES[job.job_type || 'standard'] ?? QC_STAGES.standard

  // Resolve completed stages: use explicit list if available, else infer from percent
  const completedStages: string[] =
    job.completed_stages && job.completed_stages.length > 0
      ? job.completed_stages
      : inferCompletedStages(stages, percent)

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{getJobTitle()}</h3>
              <p className="text-sm text-gray-400 font-mono">{job.method} {job.basis_set && `/ ${job.basis_set}`}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4" />
            Cancel Job
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-400 font-medium">{percent}% Complete</span>
              <span className="text-gray-500 font-mono text-xs">{job.id.slice(0, 8)}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 relative overflow-hidden"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, percent)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                {/* Sweeping shine */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.8 }}
                />
              </motion.div>
            </div>
          </div>

          {/* Stage Grid */}
          {stages.length > 2 && (
            <div className="grid grid-cols-2 gap-2">
              {stages.map(stage => {
                const isDone = completedStages.includes(stage.key)
                return (
                  <div
                    key={stage.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                      isDone
                        ? 'bg-green-900/20 border-green-700/50 text-green-400'
                        : 'bg-gray-900/40 border-gray-700/50 text-gray-500'
                    }`}
                  >
                    {isDone
                      ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      : <div className="w-3.5 h-3.5 flex-shrink-0 rounded-full border border-gray-600" />
                    }
                    {stage.name}
                  </div>
                )
              })}
            </div>
          )}

          {/* Terminal / Log Snippet */}
          <div className="bg-black/50 rounded-md border border-gray-700/50 p-3 font-mono text-xs text-gray-300">
            <div className="flex items-center gap-2 mb-2 text-gray-500 border-b border-gray-700/50 pb-2">
              <Terminal className="w-3 h-3" />
              <span>Live Output</span>
            </div>
            <div className="space-y-1 opacity-80">
              <div className="text-gray-500">&gt; Job started at {new Date(job.created_at).toLocaleTimeString()}</div>
              {step !== 'Initializing...' && (
                <div className="text-blue-400/80">&gt; {step}</div>
              )}
              {details && (
                <div className="text-green-400/80">&gt; {details}</div>
              )}
              <div className="animate-pulse">_</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
