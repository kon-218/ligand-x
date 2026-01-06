'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, AlertCircle, Loader2, Download, TrendingDown, Activity, Save, Eye, Database, Clock, RefreshCw } from 'lucide-react'
import { useBoltz2Store, Boltz2MSAOptions, Boltz2BatchLigandResult } from '@/store/boltz2-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useMDStore } from '@/store/md-store'
import { useUIStore } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { ResultsContainer, ResultMetric, ResultsTable, InfoBox, UnifiedJobList } from '../shared'
import type { Boltz2Result, Boltz2Pose, Boltz2Job } from '@/store/boltz2-store'
import type { MolecularStructure } from '@/types/molecular'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import type { UnifiedJob } from '@/types/unified-job-types'
import { Boltz2SinglePoseDisplay } from './Boltz2SinglePoseDisplay'
import { BatchBoltz2Results } from './BatchBoltz2Results'

interface Boltz2StepResultsProps {
  result: Boltz2Result | null
  isRunning: boolean
  progress: number
  progressMessage: string
  selectedPose: number
  originalStructureData: string | null
  onPoseSelect: (poseIndex: number) => void
  // Callbacks are now optional as we can handle them internally
  onLoadPose?: (pose: Boltz2Pose, poseIndex: number) => void
  onLoadOriginal?: () => void
  onOptimizeWithMD?: (pose: Boltz2Pose, poseIndex: number) => void
}

export function Boltz2StepResults({
  result,
  isRunning,
  progress,
  progressMessage,
  selectedPose,
  originalStructureData,
  onPoseSelect,
}: Boltz2StepResultsProps) {
  const boltzStore = useBoltz2Store()
  const { currentStructure, setCurrentStructure } = useMolecularStore()
  const mdStore = useMDStore()
  const uiStore = useUIStore()
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [savingPose, setSavingPose] = useState<number | null>(null)

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

  const filteredJobs = getFilteredJobs().filter((j: UnifiedJob) => j.service === 'boltz2')

  const handleSelectJob = async (jobId: string) => {
    boltzStore.setActiveJob(jobId)
    try {
      const job = await api.getBoltz2Job(jobId) as any
      console.log('[Boltz2StepResults] Job loaded:', job)

      // Handle both 'result' (PostgreSQL format) and 'results' (legacy format)
      const jobResult = job.result || job.results

      // Check if job has results and set them
      if (jobResult && job.status === 'completed') {
        // Adapt job results to store format if needed
        const resultData: Boltz2Result = {
          success: job.status === 'completed',
          job_id: job.id,
          ...jobResult,
          error: job.error_message,
          warnings: jobResult.warnings
        }
        console.log('[Boltz2StepResults] Setting result:', resultData)
        boltzStore.setResult(resultData)
        boltzStore.setIsRunning(false)
      } else if (job.status === 'running' || job.status === 'submitted' || job.status === 'pending') {
        // Clear previous results when job is running
        boltzStore.setResult(null)
        boltzStore.setIsRunning(true)
      } else {
        // Job completed but no results - might need to reload
        console.log('[Boltz2StepResults] Job has no results, status:', job.status)
        boltzStore.setResult(null)
        boltzStore.setIsRunning(false)
      }
    } catch (error) {
      console.error('Failed to load job details:', error)
    }
  }

  // Internal handlers for actions (migrated from Boltz2Tool)
  const handleLoadPose = (pose: Boltz2Pose, poseIndex: number) => {
    if (!pose.structure_data) return

    const timestamp = Date.now()
    const structure: MolecularStructure = {
      structure_id: `boltz_pose_${poseIndex}`,
      filename: `pose_${poseIndex}.pdb`,
      format: 'pdb',
      pdb_data: pose.structure_data || '',
      atoms: [],
      bonds: [],
      residues: [],
      chains: [],
      metadata: {
        confidence: pose.confidence_score,
        affinity: pose.affinity_pred_value,
        iptm: pose.iptm,
        plddt: pose.complex_plddt,
        boltz2_affinity: pose.affinity_pred_value,
        boltz2_probability: pose.affinity_probability_binary,
        pose_index: poseIndex,
        is_boltz2_pose: true,
      },
      ligands: currentStructure?.ligands || {}
    }
    setCurrentStructure(structure)
  }

  const handleOptimizeWithMD = async (pose: Boltz2Pose, poseIndex: number) => {
    try {
      if (!pose.structure_data) throw new Error('No structure data')

      const extractResult = await api.extractLigandFromComplex(pose.structure_data)
      if (!extractResult.success) throw new Error(extractResult.error || 'Failed to extract ligand')

      const ligandData = extractResult.ligand_sdf || extractResult.ligand_pdb
      const fileExtension = extractResult.ligand_sdf ? 'sdf' : 'pdb'
      if (!ligandData) throw new Error('No ligand data extracted')

      const poseName = `boltz2_pose_${poseIndex + 1}_${pose.affinity_pred_value?.toFixed(2)}.${fileExtension}`

      // Get protein ID from the active job to ensure correct display in job list
      const activeJob = filteredJobs.find((j: UnifiedJob) => j.job_id === boltzStore.activeJobId)
      const proteinId = activeJob?.metadata?.protein_id || 'current'

      mdStore.reset()
      mdStore.setSelectedProtein(proteinId)
      mdStore.setSelectedLigandMethod('structure')
      mdStore.setLigandInput({
        method: 'structure',
        file_data: ligandData,
        file_name: poseName,
        preserve_pose: true,
        generate_conformer: false,
      })

      uiStore.setActiveTool('md-optimization')
    } catch (err: any) {
      console.error('Failed to prepare MD optimization:', err)
      setSaveMessage({ type: 'error', text: err.message || 'Failed to prepare MD optimization' })
    }
  }

  const handleSavePose = async (pose: Boltz2Pose, poseIndex: number) => {
    setSavingPose(poseIndex)
    setSaveMessage(null)

    try {
      if (!pose.structure_data) {
        throw new Error('No structure data available for this pose')
      }

      const extractResult = await api.extractLigandFromComplex(pose.structure_data)

      if (!extractResult.success || !extractResult.ligand_pdb) {
        throw new Error(extractResult.error || 'Failed to extract ligand from complex')
      }

      const name = `Boltz2 Pose ${poseIndex + 1} (Affinity: ${pose.affinity_pred_value?.toFixed(2)})`
      await api.saveStructureToLibrary(extractResult.ligand_pdb, name)

      setSaveMessage({
        type: 'success',
        text: `Ligand from Pose ${poseIndex + 1} saved to library successfully!`
      })
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (error: any) {
      console.error('Failed to save pose:', error)
      setSaveMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Failed to save ligand to library'
      })
    } finally {
      setSavingPose(null)
    }
  }

  // Handle viewing a specific result from a batch
  const handleViewResult = (ligandResult: Boltz2BatchLigandResult) => {
    if (ligandResult.poses && ligandResult.poses.length > 0) {
      // Create a single result object from the batch ligand result
      const singleResult: Boltz2Result = {
        success: ligandResult.success,
        job_id: result?.job_id,
        affinity_pred_value: ligandResult.affinity_pred_value,
        binding_free_energy: ligandResult.binding_free_energy,
        affinity_probability_binary: ligandResult.affinity_probability_binary,
        prediction_confidence: ligandResult.prediction_confidence,
        processing_time: ligandResult.processing_time,
        poses: ligandResult.poses,
        error: ligandResult.error,
        warnings: ligandResult.warnings
      }

      // Update store with this single result to trigger re-render in single view mode
      boltzStore.setResult(singleResult)
      onPoseSelect(0) // Select first pose
    }
  }

  // Handle exporting batch results
  const handleExportResults = () => {
    if (!result?.results || result.results.length === 0) return

    const headers = ['Ligand ID', 'Ligand Name', 'Status', 'Affinity (log IC50)', 'Delta G (kcal/mol)', 'Probability', 'Confidence']
    const csvContent = [
      headers.join(','),
      ...result.results.map(r => [
        r.ligand_id,
        r.ligand_name,
        r.success ? 'Success' : 'Failed',
        r.affinity_pred_value ?? 'N/A',
        r.binding_free_energy ?? 'N/A',
        r.affinity_probability_binary ?? 'N/A',
        r.prediction_confidence ?? 'N/A'
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `boltz2_batch_${result.job_id}_results.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-400" />
      case 'running': return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
      default: return <Clock className="w-4 h-4 text-yellow-400" />
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Job List */}
      <UnifiedJobList
        jobs={filteredJobs}
        activeJobId={boltzStore.activeJobId}
        onSelectJob={(jobId) => handleSelectJob(jobId)}
        onCancelJob={(jobId, service) => cancelJob(jobId, service)}
        onDeleteJob={(jobId, service) => deleteJob(jobId, service)}
        resultsTab={resultsTab}
        onTabChange={setResultsTab}
        showServiceBadge={false}
        accentColor="purple"
        title="Boltz2 Jobs"
        maxHeight="160px"
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Running state - show only progress, no results */}
        {isRunning ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
              <div>
                <p className="font-medium text-purple-300">Running Boltz-2 Prediction...</p>
                <p className="text-sm text-purple-400/70">{progressMessage || 'Processing...'}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 text-center">{progress.toFixed(0)}% Complete</p>
            </div>

            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">What's happening:</h4>
              <ul className="space-y-1 text-sm text-gray-400">
                <li>• Preparing protein and ligand structures</li>
                <li>• Running Boltz-2 binding affinity prediction</li>
                <li>• Generating multiple binding poses</li>
                <li>• Calculating confidence scores</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {/* Error state */}
            {result && !result.success && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Prediction Failed</p>
                  <p className="text-sm">{result.error || 'Unknown error occurred'}</p>
                </AlertDescription>
              </Alert>
            )}

            {/* Success state */}
            {result?.success && (
              <div className="space-y-6">
                {/* Check if this is a batch result */}
                {result.results && result.results.length > 0 ? (
                  <BatchBoltz2Results
                    batchId={result.job_id || null}
                    results={result.results}
                    isRunning={isRunning}
                    progress={progress}
                    progressMessage={progressMessage}
                    onViewResult={handleViewResult}
                    onExportResults={handleExportResults}
                  />
                ) : result.poses && result.poses.length > 0 ? (
                  /* Single Pose Display */
                  result.poses.length === 1 ? (
                    <Boltz2SinglePoseDisplay
                      pose={result.poses[0]}
                      jobId={result.job_id || ''}
                      onVisualize={() => {
                        onPoseSelect(0)
                        handleLoadPose(result.poses![0], 0)
                      }}
                      onOptimizeWithMD={() => handleOptimizeWithMD(result.poses![0], 0)}
                      onSave={() => handleSavePose(result.poses![0], 0)}
                      isSaving={savingPose === 0}
                      saveMessage={saveMessage}
                      predictionConfidence={result.prediction_confidence}
                    />
                  ) : (
                    /* Multiple Poses Table */
                    <ResultsContainer
                      status="success"
                      subtitle={`Generated ${result.poses.length} poses`}
                      onNewCalculation={boltzStore.reset}
                      accentColor="purple"
                    >
                      <ResultsTable
                        columns={[
                          { key: 'pose', label: 'Pose', align: 'center' },
                          { key: 'affinity', label: 'Delta G', align: 'right' },
                          { key: 'score', label: 'Score', align: 'right' },
                          { key: 'prob', label: 'Prob.', align: 'right' },
                          { key: 'actions', label: 'Actions', align: 'center' },
                        ]}
                        data={result.poses.map((pose, idx) => ({
                          pose: idx + 1,
                          affinity: pose.binding_free_energy != null ? pose.binding_free_energy.toFixed(2) : 'N/A',
                          score: pose.aggregate_score != null ? pose.aggregate_score.toFixed(2) : 'N/A',
                          prob: pose.affinity_probability_binary != null ? `${(pose.affinity_probability_binary * 100).toFixed(0)}%` : 'N/A',
                          actions: (
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => {
                                  onPoseSelect(idx)
                                  handleLoadPose(pose, idx)
                                }}
                                className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded"
                              >
                                View
                              </button>
                              <button
                                onClick={() => handleOptimizeWithMD(pose, idx)}
                                className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded"
                              >
                                MD
                              </button>
                              <button
                                onClick={() => handleSavePose(pose, idx)}
                                disabled={savingPose === idx}
                                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 flex items-center justify-center min-w-[40px]"
                              >
                                {savingPose === idx ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                              </button>
                            </div>
                          ),
                        }))}
                        selectedIndex={selectedPose}
                        onRowClick={(_: any, idx: number) => {
                          onPoseSelect(idx)
                          handleLoadPose(result.poses![idx], idx)
                        }}
                        accentColor="purple"
                      />
                    </ResultsContainer>
                  )
                ) : null}
              </div>
            )}

            {/* Empty state */}
            {!result && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center text-gray-400">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No job selected</p>
                  <p className="text-sm mt-1">Select a job from the list or run a new prediction</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

