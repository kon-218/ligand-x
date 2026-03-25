'use client'

import { useEffect } from 'react'
import { Activity, Loader2, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { UnifiedJobList } from '../shared'
import { MDResultsDisplay } from './MDResultsDisplay'
import { useMDStore } from '@/store/md-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import type { MDResult, MDParameters } from '@/types/md-types'

interface MDStepResultsProps {
  result: MDResult | null
  isRunning: boolean
  progress: number
  progressMessage: string
  completedStages?: string[]
  onResumePreview?: () => void
  onResumeMinimized?: () => void
  parameters?: MDParameters
}

export function MDStepResults({ result, isRunning, progress, progressMessage, completedStages = [], onResumePreview, onResumeMinimized, parameters }: MDStepResultsProps) {
  const mdStore = useMDStore()
  const {
    resultsTab,
    setResultsTab,
    cancelJob,
    deleteJob,
    loadAllJobs,
    getFilteredJobs,
  } = useUnifiedResultsStore()

  // Load jobs on mount
  useEffect(() => {
    loadAllJobs()
  }, [])

  const filteredJobs = getFilteredJobs().filter(j => j.service === 'md')

  const handleSelectJob = async (jobId: string | null) => {
    mdStore.setActiveJob(jobId)
    if (!jobId) return
    try {
      const job = await api.getMDJob(jobId)
      console.log('📋 Fetched MD job:', { jobId, status: job.status, hasResult: !!job.result, result: job.result })

      // Determine if job is in a running state
      const isRunningState = job.status === 'running' || job.status === 'submitted' || job.status === 'preparing' || job.status === 'pending'

      if (isRunningState) {
        mdStore.setMDResult(null)
        mdStore.setIsRunning(true)

        // Track whether this job includes production MD
        const jobProductionSteps = job.input_params?.production_steps ?? 0
        mdStore.setHasProduction(jobProductionSteps > 0)

        // Infer completed stages from progress when selecting an existing running job.
        // Use backend stage keys so setProgress can map them to display names correctly.
        // Also try to parse the DB stage field (comma-joined backend names from Celery).
        const jobProgress = job.progress || 0
        let inferredStages: string[] = []

        if (job.stage && job.stage !== 'running') {
          // Stage field may be comma-joined backend stage names (e.g. "preparation,minimization")
          inferredStages = job.stage.split(',').map((s: string) => s.trim()).filter(Boolean)
        } else {
          // Fallback: infer from progress percentages
          if (jobProgress > 5)  inferredStages.push('preparation')
          if (jobProgress > 9)  inferredStages.push('minimization')
          if (jobProgress > 15) inferredStages.push('nvt')
          if (jobProgress > 28) inferredStages.push('npt')
        }

        mdStore.setProgress(jobProgress, job.stage || 'Running...', inferredStages)
      } else if (job.result) {
        // Check if job has result and set them
        const actualResult = job.result
        
        // Ensure result has success field if missing
        if (actualResult.success === undefined) {
          actualResult.success = job.status === 'completed'
        }
        console.log('SUCCESS: Setting MD result with output_files:', actualResult.output_files)
        mdStore.setMDResult(actualResult as MDResult)
        mdStore.setIsRunning(false)
      } else if (job.status === 'failed') {
        mdStore.setIsRunning(false)
        mdStore.setMDResult({ 
          success: false, 
          error: job.error_message || 'Job failed',
          status: 'failed'
        })
      }
    } catch (error) {
      console.error('Failed to load job details:', error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Job List */}
      <UnifiedJobList
        jobs={filteredJobs}
        activeJobId={mdStore.activeJobId}
        onSelectJob={(jobId) => handleSelectJob(jobId)}
        onCancelJob={(jobId, service) => cancelJob(jobId, service)}
        onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
        resultsTab={resultsTab}
        onTabChange={setResultsTab}
        showServiceBadge={false}
        accentColor="green"
        title="MD Jobs"
        maxHeight="160px"
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Show "No job selected" when no active job is selected */}
        {!mdStore.activeJobId && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-400">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No job selected</p>
              <p className="text-sm mt-1">Select a job from the list or run a new optimization</p>
            </div>
          </div>
        )}

        {/* Show loader when a job is selected and running */}
        {mdStore.activeJobId && isRunning && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">MD Optimization</h3>

            {/* Loading Animation */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative">
                  <Loader2 className="w-20 h-20 animate-spin text-blue-500" />
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-lg font-medium text-blue-400 animate-pulse">Running MD Optimization</p>
                <p className="text-sm text-gray-400 mt-1">{progressMessage || 'This may take a few minutes...'}</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Progress</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden shadow-inner">
                <div
                  className="absolute inset-0 bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500 transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Preparation', key: 'Preparation', done: completedStages.includes('Preparation') },
                { name: 'Minimization', key: 'Minimization', done: completedStages.includes('Minimization') },
                ...((result?.minimization_only || parameters?.minimization_only) ? [] : [
                  { name: 'NVT Equilibration', key: 'NVT Equilibration', done: completedStages.includes('NVT Equilibration') },
                  { name: 'NPT Equilibration', key: 'NPT Equilibration', done: completedStages.includes('NPT Equilibration') },
                  ...(mdStore.hasProduction || completedStages.includes('Production') ? [
                    { name: 'Production MD', key: 'Production', done: completedStages.includes('Production') },
                  ] : []),
                ]),
              ].map((step) => (
                <div
                  key={step.key}
                  className={`p-3 rounded-lg border transition-all ${step.done
                    ? 'bg-green-900/20 border-green-700/50'
                    : 'bg-gray-800/30 border-gray-700/50'
                    }`}
                >
                  <div className="flex items-center space-x-2">
                    {step.done ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-gray-600"></div>
                    )}
                    <span className={`text-xs font-medium ${step.done ? 'text-green-400' : 'text-gray-400'
                      }`}>
                      {step.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {mdStore.activeJobId && !isRunning && (result?.status === 'preview_ready' || result?.status === 'minimized_ready' || result?.success || result?.error) && (
          <MDResultsDisplay
            result={result as MDResult}
            jobId={mdStore.activeJobId}
            isRunning={isRunning}
            onResumePreview={onResumePreview}
            onResumeMinimized={onResumeMinimized}
            parameters={parameters}
          />
        )}
      </div>
    </div>
  )
}
