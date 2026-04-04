'use client'

import { useEffect, useRef, useState } from 'react'
import { GitBranch, Loader2 } from 'lucide-react'
import { useRBFEStore } from '@/store/rbfe-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { api } from '@/lib/api-client'
import { isValidProtein } from '@/lib/structure-validation'
import {
  WorkflowContainer,
  ParameterSection,
  SliderParameter,
  SelectParameter,
  ToggleParameter,
  PresetSelector,
  ExecutionPanel,
  InfoBox,
} from './shared'
import RBFENetworkSelector from './RBFE/RBFENetworkSelector'
import { RBFEResultsPanel } from './RBFE/RBFEResultsPanel'
import { AlignmentPreview } from './RBFE/AlignmentPreview'
import { AtomMappingPreview } from './RBFE/AtomMappingPreview'
import { NetworkPreview } from './RBFE/NetworkPreview'
import { RBFEReferenceSetup } from './RBFE/RBFEReferenceSetup'
import type { WorkflowStep, ConfigGroup } from './shared'
import type { LigandSelection, AlignmentInfo, MappingPreviewResult } from '@/types/rbfe-types'

// Define workflow steps
const RBFE_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Ligands', description: 'Select molecules for comparison' },
  { id: 2, label: 'Reference', description: 'Select reference binding pose' },
  { id: 3, label: 'Network', description: 'Set network topology' },
  { id: 4, label: 'Parameters', description: 'Configure simulation' },
  { id: 5, label: 'Execute', description: 'Review and run' },
  { id: 6, label: 'Results', description: 'View results' },
]

// Simulation presets
const SIMULATION_PRESETS = [
  {
    id: 'fast',
    name: 'Fast Mode',
    description: '0.5 ns, 1 repeat, ~1-2 h/edge',
    icon: null,
  },
  {
    id: 'standard',
    name: 'Standard',
    description: '2 ns, 3 repeats, ~4-8 h/edge',
    icon: null,
  },
  {
    id: 'production',
    name: 'Production',
    description: '5 ns, 3 repeats, ~12-24 h/edge',
    icon: null,
  },
]

// Charge method options
const CHARGE_METHOD_OPTIONS = [
  { value: 'am1bcc', label: 'AM1-BCC', description: 'Semi-empirical charge method (standard)' },
  { value: 'am1bccelf10', label: 'AM1-BCC ELF10', description: 'Improved AM1-BCC with ELF10 selection' },
  { value: 'nagl', label: 'NAGL', description: 'Graph neural network partial charges' },
  { value: 'espaloma', label: 'Espaloma', description: 'Machine learning based charges' },
]

// Forcefield options
const FORCEFIELD_OPTIONS = [
  { value: 'openff-2.2.1', label: 'OpenFF 2.2.1 (Sage)', description: 'Latest Sage release (recommended)' },
  { value: 'openff-2.1.0', label: 'OpenFF 2.1.0', description: 'Improved torsions and charged groups' },
  { value: 'openff-2.0.0', label: 'OpenFF 2.0.0 (Sage)', description: 'Standard general-purpose force field' },
  { value: 'gaff-2.11', label: 'GAFF 2.11', description: 'General Amber Force Field' },
  { value: 'espaloma-0.3.2', label: 'Espaloma 0.3.2', description: 'Machine learning force field' },
]

// Network topology options for RBFE calculations
const NETWORK_TOPOLOGIES = [
  { value: 'mst', label: 'Minimum Spanning Tree' },
  { value: 'radial', label: 'Radial (Star) Network' },
  { value: 'maximal', label: 'Maximal (All Pairs)' },
]

const getPresetMode = (params: any): string => {
  if (params.fast_mode) return 'fast'
  const prodNs = params.production_length_ns || 0.5
  if (prodNs >= 5) return 'production'
  if (prodNs >= 2) return 'standard'
  return 'fast'
}

export function RBFETool() {
  const rbfeStore = useRBFEStore()
  const { currentStructure } = useMolecularStore()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Load persisted RBFE jobs on mount (from PostgreSQL via unified jobs API)
  useEffect(() => {
    const loadPersistedJobs = async () => {
      try {
        // Use unified jobs API with job_type filter for PostgreSQL persistence
        const response = await api.listUnifiedJobs({ job_type: 'rbfe', limit: 50 })
        // Transform PostgreSQL format to RBFE job format
        const jobsData = Array.isArray(response.jobs) ? response.jobs.map((j: any) => ({
          job_id: j.id,
          status: j.status,
          created_at: j.created_at,
          updated_at: j.completed_at || j.started_at,
          progress: j.progress,
          message: j.stage,
          protein_id: j.input_params?.protein_id,
          num_ligands: j.input_params?.ligands?.length,
          network_topology: j.input_params?.network_topology,
          results: j.result,
          error: j.error_message,
          // Extract alignment and docking data from result
          docked_poses: j.result?.docked_poses,
          docking_scores: j.result?.docking_scores,
          docking_log: j.result?.docking_log,
          output_files: j.result?.output_files,
          alignment_info: j.result?.alignment_info,
          reference_ligand: j.result?.reference_ligand,
        })).filter((j: any) => j.network_topology) : []
        rbfeStore.setJobs(jobsData)

        // Check for running jobs and resume polling
        const runningJobs = jobsData.filter(
          (j: any) => j.status === 'running' || j.status === 'preparing' || j.status === 'submitted' || j.status === 'docking'
        )
        if (runningJobs.length > 0) {
          const mostRecentRunning = runningJobs.sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]
          rbfeStore.setJobId(mostRecentRunning.job_id)
          rbfeStore.setActiveJob(mostRecentRunning.job_id)
          rbfeStore.setIsRunning(true)
          rbfeStore.setStep(6)
        }

        // Check for docking_ready jobs (waiting for user validation)
        const dockingReadyJobs = jobsData.filter((j: any) => j.status === 'docking_ready')
        if (dockingReadyJobs.length > 0 && runningJobs.length === 0) {
          const mostRecentDockingReady = dockingReadyJobs.sort(
            (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]
          rbfeStore.setJobId(mostRecentDockingReady.job_id)
          rbfeStore.setActiveJob(mostRecentDockingReady.job_id)
          rbfeStore.setRBFEResult(mostRecentDockingReady)
          rbfeStore.setStep(6) // Go to results step to show docked poses
        }
      } catch (err) {
        console.error('Failed to load persisted RBFE jobs:', err)
      }
    }

    loadPersistedJobs()
  }, [])

  // Fetch library molecules on mount and when structure changes
  useEffect(() => {
    const fetchAvailableLigands = async () => {
      try {
        const molecules = await api.getMolecules()
        const libraryLigands: LigandSelection[] = Array.isArray(molecules)
          ? molecules.map((mol: any) => ({
            id: `library_${mol.id}`,
            name: `${mol.name} (Library)`,
            source: 'library' as const,
            smiles: mol.canonical_smiles,
            sdf_data: mol.molfile,
          }))
          : []

        const structureLigands: LigandSelection[] = currentStructure?.ligands
          ? Object.entries(currentStructure.ligands).map(([id, ligand]: [string, any]) => {
            // Extract best pose affinity if available
            let docking_affinity: number | undefined
            if (ligand.poses) {
              const poseEntries = Object.values(ligand.poses) as Array<{ affinity?: number }>
              if (poseEntries.length > 0 && poseEntries[0].affinity !== undefined) {
                // Get the best (most negative) affinity from available poses
                docking_affinity = Math.min(...poseEntries.map(p => p.affinity ?? 0))
              }
            }
            return {
              id,
              name: ligand.residue_name || id,
              source: 'current_structure' as const,
              smiles: ligand.smiles || ligand.canonical_smiles,
              sdf_data: ligand.sdf_data,
              pdb_data: ligand.pdb_data,
              has_docked_pose: true, // Assume structure ligands have docked poses
              docking_affinity,
            }
          })
          : []

        const allLigands = [...structureLigands, ...libraryLigands]
        rbfeStore.setAvailableLigands(allLigands)

        if (currentStructure?.pdb_data && isValidProtein(currentStructure)) {
          rbfeStore.setSelectedProtein('current')
        }
      } catch (err) {
        console.error('Failed to fetch available ligands:', err)
      }
    }

    fetchAvailableLigands()
  }, [currentStructure])

  // Poll for job status
  useEffect(() => {
    if (rbfeStore.jobId && rbfeStore.isRunning) {
      const { loadAllJobs } = useUnifiedResultsStore.getState()
      const polledJobId = rbfeStore.jobId

      const pollOnce = async () => {
        try {
          const status = await api.getRBFEStatus(polledJobId) as any
          const resultPayload = status.result || {}
          const dbStatus = status.status
          const dbStage = status.stage || ''

          // Determine the effective status. If the DB says the job is running
          // but the stale result field still has docking_ready data, only treat
          // it as docking_ready if the DB stage actually matches.
          const resultStatus = resultPayload.status
          let effectiveStatus: string
          if (dbStatus === 'running' && resultStatus === 'docking_ready' && dbStage === 'docking_ready') {
            effectiveStatus = 'docking_ready'
          } else {
            effectiveStatus = dbStatus
          }

          // Build a normalized job object that the UI can render
          const normalizedJob = {
            ...status,
            ...resultPayload,
            job_id: status.id || resultPayload.job_id || polledJobId,
            status: effectiveStatus,
            progress: status.progress ?? resultPayload.progress ?? 0,
            message: dbStage || resultPayload.message || status.message || '',
            // Only carry forward pose data for docking_ready or completed (for the "View Alignment" button)
            docked_poses: (effectiveStatus === 'docking_ready' || effectiveStatus === 'completed') ? resultPayload.docked_poses : undefined,
            docking_scores: (effectiveStatus === 'docking_ready' || effectiveStatus === 'completed') ? resultPayload.docking_scores : undefined,
            docking_log: (effectiveStatus === 'docking_ready' || effectiveStatus === 'completed') ? resultPayload.docking_log : undefined,
          }

          const { activeJobId, updateJob, setRBFEResult, setIsRunning } = useRBFEStore.getState()

          updateJob(polledJobId, {
            status: effectiveStatus,
            progress: normalizedJob.progress,
            message: normalizedJob.message,
            network: resultPayload.network,
            results: resultPayload.results,
            error: resultPayload.error || status.error_message,
            docked_poses: normalizedJob.docked_poses,
            docking_scores: normalizedJob.docking_scores,
            docking_log: normalizedJob.docking_log,
            output_files: resultPayload.output_files,
            alignment_info: resultPayload.alignment_info,
            reference_ligand: resultPayload.reference_ligand,
          } as any)

          if (activeJobId === polledJobId) {
            setRBFEResult(normalizedJob)
          }

          if (effectiveStatus === 'completed' || effectiveStatus === 'failed' || effectiveStatus === 'docking_ready') {
            setIsRunning(false)
            if (effectiveStatus === 'completed' || effectiveStatus === 'failed') {
              loadAllJobs()
            }
          }
        } catch (err) {
          console.error('Error polling RBFE status:', err)
        }
      }

      // Fetch immediately, then poll every 30s
      pollOnce()
      const interval = setInterval(pollOnce, 30000)

      setPollingInterval(interval)
      return () => clearInterval(interval)
    }
  }, [rbfeStore.jobId, rbfeStore.isRunning])

  // Default radial central ligand to the selected reference when entering step 3.
  useEffect(() => {
    if (
      rbfeStore.currentStep === 3 &&
      rbfeStore.networkTopology === 'radial' &&
      rbfeStore.centralLigand === null &&
      rbfeStore.referenceLigandId !== null
    ) {
      rbfeStore.setCentralLigand(rbfeStore.referenceLigandId)
    }
  }, [
    rbfeStore.currentStep,
    rbfeStore.networkTopology,
    rbfeStore.centralLigand,
    rbfeStore.referenceLigandId,
    rbfeStore.setCentralLigand,
  ])

  const runRBFE = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const selectedLigands = rbfeStore.availableLigands.filter((lig) =>
        rbfeStore.selectedLigandIds.includes(lig.id)
      )

      if (selectedLigands.length < 2) {
        throw new Error('At least 2 ligands are required for RBFE calculations')
      }

      if (!currentStructure?.pdb_data) {
        throw new Error('No protein structure available')
      }

      const ligandData = await Promise.all(
        selectedLigands.map(async (lig) => {
          let data = lig.sdf_data || ''
          let format: 'sdf' | 'mol' | 'pdb' = 'sdf'

          if (!data && lig.smiles) {
            try {
              const result = await api.uploadSmiles(lig.smiles, lig.name)
              data = result.sdf_data || ''
            } catch (e) {
              console.error(`Failed to convert SMILES for ${lig.name}:`, e)
            }
          }

          if (!data && lig.pdb_data) {
            data = lig.pdb_data
            format = 'pdb'
          }

          return {
            // Keep stable internal IDs so reference_ligand_id matches backend lookup.
            id: lig.id || lig.name,
            data,
            format,
            has_docked_pose: lig.has_docked_pose || false,
            docking_affinity: lig.docking_affinity,
          }
        })
      )

      const requestBody = {
        protein_pdb: currentStructure.pdb_data,
        ligands: ligandData,
        protein_id: currentStructure.structure_id || 'protein',
        network_topology: rbfeStore.networkTopology,
        central_ligand: rbfeStore.centralLigand || undefined,
        atom_mapper: rbfeStore.rbfeParameters.atom_mapper || 'kartograf',
        atom_map_hydrogens: rbfeStore.rbfeParameters.atom_map_hydrogens !== false,
        lomap_max3d: rbfeStore.rbfeParameters.lomap_max3d || 1.0,
        simulation_settings: {
          ...rbfeStore.rbfeParameters,
          reference_ligand_id: rbfeStore.referenceLigandId || undefined,
          reference_pose_source: rbfeStore.referencePoseSource || undefined,
          reference_pose_pdb: rbfeStore.referencePosePdb || undefined,
          vina_exhaustiveness: rbfeStore.vinaExhaustiveness,
          vina_grid_box: rbfeStore.vinaGridBox || undefined,
        },
      }

      const result = await api.submitRBFECalculation(requestBody)
      rbfeStore.setJobId(result.job_id)
      rbfeStore.setProgress(0, result.message || 'Calculation submitted')
      rbfeStore.addJob({
        job_id: result.job_id,
        status: result.status || 'submitted',
        num_ligands: ligandData.length,
        network_topology: rbfeStore.networkTopology,
        created_at: new Date().toISOString(),
      })
      rbfeStore.setActiveJob(result.job_id)
      rbfeStore.setRBFEResult(result)
      rbfeStore.setIsRunning(true)
      rbfeStore.setStep(6)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler for continuing after docking validation
  const handleContinueAfterDocking = async () => {
    const existingJobId = rbfeStore.jobId

    if (!existingJobId) {
      setError('No job to continue - please start a new RBFE calculation')
      return
    }

    if (rbfeStore.rbfeResult?.status !== 'docking_ready') {
      setError('Job is not ready for continuation')
      return
    }

    setError(null)

    // Immediately show the resuming state (clear docked poses from display)
    // but don't start polling yet — wait for the backend to clear stale data first.
    rbfeStore.updateJob(existingJobId, { status: 'resuming' })
    rbfeStore.setRBFEResult({
      ...rbfeStore.rbfeResult,
      status: 'resuming',
      docked_poses: undefined,
      docking_scores: undefined,
      docking_log: undefined,
    } as any)

    try {
      // Backend clears stale Celery result + DB result, then submits new task
      const result = await api.continueRBFEAfterDocking(existingJobId)

      const jobId = result.job_id || existingJobId
      rbfeStore.updateJob(jobId, {
        status: result.status || 'running',
        message: result.message,
        progress: result.progress,
      })

      rbfeStore.setJobId(jobId)
      rbfeStore.setActiveJob(jobId)
      rbfeStore.setRBFEResult({
        ...result,
        job_id: jobId,
      })
      rbfeStore.setProgress(30, result.message || 'Calculation resumed')

      // Start polling only AFTER the backend has cleared stale data
      rbfeStore.setIsRunning(true)
    } catch (err: any) {
      setError(err.message || 'Failed to continue RBFE calculation')
      // Restore the docking_ready state so user can try again
      const currentResult = useRBFEStore.getState().rbfeResult
      if (currentResult) {
        rbfeStore.setRBFEResult({
          ...currentResult,
          status: 'docking_ready',
        } as any)
      }
    }
  }

  // Handler for clearing docking preview
  const handleClearDockingPreview = () => {
    if (rbfeStore.rbfeResult && rbfeStore.rbfeResult.status === 'docking_ready') {
      // Clear the docking preview state but keep the job
      rbfeStore.updateJob(rbfeStore.jobId!, {
        status: 'resuming',
      })
    }
  }

  // Mapping preview polling ref
  const mappingPreviewPollRef = useRef<NodeJS.Timeout | null>(null)

  const stopMappingPreviewPoll = () => {
    if (mappingPreviewPollRef.current) {
      clearInterval(mappingPreviewPollRef.current)
      mappingPreviewPollRef.current = null
    }
  }

  // Start polling for mapping preview job
  const startMappingPreviewPoll = (jobId: string) => {
    stopMappingPreviewPoll()
    mappingPreviewPollRef.current = setInterval(async () => {
      // Guard against stale closure — use getState() to check current store value
      const currentJobId = useRBFEStore.getState().mappingPreviewJobId
      if (currentJobId !== jobId) {
        stopMappingPreviewPoll()
        return
      }
      try {
        const status = await api.getJobDetails(jobId)
        const s = status?.status?.toLowerCase()
        
        if (s === 'completed') {
          stopMappingPreviewPoll()
          
          // Unwrap task envelope: status.result might be wrapped or unwrapped
          // Wrapped: status.result = { status, result: { pairs, ... }, ... }
          // Unwrapped: status.result = { pairs, ... }
          const resultData = status?.result
          const previewData: MappingPreviewResult | null = 
            resultData?.result || resultData || null
            
          // Verify we have the actual data (check for pairs array)
          if (previewData && Array.isArray(previewData.pairs)) {
            rbfeStore.setMappingPreviewResult(previewData)
            rbfeStore.setMappingPreviewStatus('completed')
          } else {
            console.error('Mapping preview completed but result format invalid:', status)
            rbfeStore.setMappingPreviewStatus('failed')
          }
        } else if (s === 'failed') {
          stopMappingPreviewPoll()
          rbfeStore.setMappingPreviewStatus('failed')
        }
      } catch (err) {
        console.error('Error polling mapping preview:', err)
      }
    }, 5000) // poll every 5s (preview finishes in ~30-90s)
  }

  // Clean up on unmount
  useEffect(() => () => stopMappingPreviewPoll(), [])

  const handlePreviewMapping = async () => {
    const selectedLigands = rbfeStore.availableLigands.filter((lig) =>
      rbfeStore.selectedLigandIds.includes(lig.id)
    )

    if (selectedLigands.length < 2) return

    rbfeStore.setMappingPreviewStatus('running')
    rbfeStore.setMappingPreviewResult(null)

    try {
      const ligandData = await Promise.all(
        selectedLigands.map(async (lig) => {
          let data = lig.sdf_data || ''
          let format = 'sdf'

          if (!data && lig.smiles) {
            try {
              const result = await api.uploadSmiles(lig.smiles, lig.name)
              data = result.sdf_data || ''
            } catch (e) {
              console.error(`Failed to convert SMILES for ${lig.name}:`, e)
            }
          }
          if (!data && lig.pdb_data) {
            data = lig.pdb_data
            format = 'pdb'
          }

          return { id: lig.name || lig.id, data, format }
        })
      )

      const response = await api.submitMappingPreview({
        ligands: ligandData,
        atom_mapper: rbfeStore.rbfeParameters.atom_mapper || 'kartograf',
        atom_map_hydrogens: rbfeStore.rbfeParameters.atom_map_hydrogens !== false,
        lomap_max3d: rbfeStore.rbfeParameters.lomap_max3d || 1.0,
        charge_method: rbfeStore.rbfeParameters.charge_method || 'am1bcc',
      })

      rbfeStore.setMappingPreviewJobId(response.job_id)
      startMappingPreviewPoll(response.job_id)
    } catch (err: any) {
      console.error('Failed to submit mapping preview:', err)
      rbfeStore.setMappingPreviewStatus('failed')
    }
  }

  // Check if can proceed to next step
  const canProceed = (() => {
    switch (rbfeStore.currentStep) {
      case 1:
        return rbfeStore.selectedLigandIds.length >= 2 && isValidProtein(currentStructure)
      case 2:
        return (
          rbfeStore.referenceLigandId !== null &&
          rbfeStore.referencePoseSource !== null &&
          (rbfeStore.referencePoseSource === 'vina' || rbfeStore.referencePosePdb !== null)
        )
      case 3:
        return rbfeStore.networkTopology !== undefined
      case 4:
        return true
      case 5:
        return true
      default:
        return true
    }
  })()

  // Render step content
  const renderStepContent = () => {
    switch (rbfeStore.currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <RBFENetworkSelector
              availableLigands={rbfeStore.availableLigands}
              selectedLigandIds={rbfeStore.selectedLigandIds}
              onToggleLigand={rbfeStore.toggleLigandSelection}
              onClearSelection={rbfeStore.clearLigandSelection}
              hasProtein={isValidProtein(currentStructure)}
              proteinName={currentStructure?.structure_id}
              currentStructure={currentStructure}
              minLigands={2}
            />
            <InfoBox variant="info" title="About RBFE Calculations">
              <p>
                Relative Binding Free Energy (RBFE) calculates the difference in binding affinity
                between pairs of ligands. This is more accurate than rbfe for comparing similar
                compounds. Select at least 2 ligands to compare.
              </p>
            </InfoBox>
          </div>
        )

      case 2:
        return <RBFEReferenceSetup />

      case 3: {
        const canPreview = rbfeStore.selectedLigandIds.length >= 2
        const previewStatus = rbfeStore.mappingPreviewStatus
        const previewRunning = previewStatus === 'running'

        // Resolve central ligand name for NetworkPreview
        const centralLigandName = rbfeStore.centralLigand
          ? rbfeStore.availableLigands.find((l) => l.id === rbfeStore.centralLigand)?.name || rbfeStore.centralLigand
          : null

        const selectedLigandNames = rbfeStore.selectedLigandIds.map(
          (id) => rbfeStore.availableLigands.find((l) => l.id === id)?.name || id,
        )

        return (
          <div className="space-y-6">
            <ParameterSection title="Atom Mapper" collapsible defaultExpanded>
              <SelectParameter
                label="Atom Mapper"
                value={rbfeStore.rbfeParameters.atom_mapper || 'kartograf'}
                onChange={(v: string) => {
                  rbfeStore.setRBFEParameters({ atom_mapper: v as any })
                  if (rbfeStore.mappingPreviewStatus !== 'idle') {
                    stopMappingPreviewPoll()
                    rbfeStore.clearMappingPreview()
                  }
                }}
                options={[
                  { value: 'kartograf', label: 'Kartograf (Recommended - 3D geometry)' },
                  { value: 'lomap', label: 'LOMAP (2D MCS-based)' },
                  { value: 'lomap_relaxed', label: 'LOMAP Relaxed (difficult pairs)' },
                ]}
                description="Atom mapper creates the network and handles alignment automatically"
              />

              {rbfeStore.rbfeParameters.atom_mapper === 'kartograf' && (
                <div className="mt-3 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="atom_map_hydrogens"
                    checked={rbfeStore.rbfeParameters.atom_map_hydrogens !== false}
                    onChange={(e) => rbfeStore.setRBFEParameters({ atom_map_hydrogens: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="atom_map_hydrogens" className="text-sm text-gray-300">
                    Map hydrogens (recommended)
                  </label>
                </div>
              )}
            </ParameterSection>

            {/* Preview Mappings button */}
            {previewStatus !== 'completed' && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handlePreviewMapping}
                  disabled={!canPreview || previewRunning}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
                >
                  {previewRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Computing atom mappings...
                    </>
                  ) : (
                    'Preview Atom Mappings'
                  )}
                </button>
                {previewStatus === 'failed' && (
                  <p className="text-xs text-red-400 text-center">
                    Mapping preview failed. Check that your ligands have valid 3D structures and try again.
                  </p>
                )}
                <p className="text-xs text-gray-500 text-center">
                  Preview is optional — you can proceed without running it.
                </p>
              </div>
            )}

            {/* Completed preview */}
            {previewStatus === 'completed' && rbfeStore.mappingPreviewResult && (
              <AtomMappingPreview
                result={rbfeStore.mappingPreviewResult}
                onClear={() => rbfeStore.clearMappingPreview()}
              />
            )}

            <ParameterSection title="Network Topology" collapsible defaultExpanded>
              <SelectParameter
                label="Topology Type"
                value={rbfeStore.networkTopology}
                onChange={(v: string) => rbfeStore.setNetworkTopology(v as any)}
                options={NETWORK_TOPOLOGIES.map((t) => ({ value: t.value, label: t.label }))}
                description="How ligands are connected for pairwise comparisons"
              />

              {rbfeStore.networkTopology === 'radial' && (
                <SelectParameter
                  label="Central Ligand"
                  value={rbfeStore.centralLigand || ''}
                  onChange={(v: string) => rbfeStore.setCentralLigand(v || null)}
                  options={[
                    { value: '', label: 'Auto-select (first ligand)' },
                    ...rbfeStore.selectedLigandIds.map((id) => {
                      const lig = rbfeStore.availableLigands.find((l) => l.id === id)
                      return { value: id, label: lig?.name || id }
                    }),
                  ]}
                  description="Reference ligand that all others connect to"
                />
              )}
            </ParameterSection>

            {/* Live network preview — always shown when ≥2 ligands selected */}
            {selectedLigandNames.length >= 2 && (
              <div>
                <div className="text-sm font-medium text-gray-300 mb-2">Network Preview</div>
                <NetworkPreview
                  pairs={rbfeStore.mappingPreviewResult?.pairs ?? []}
                  topology={rbfeStore.networkTopology}
                  centralLigand={centralLigandName}
                  ligandNames={selectedLigandNames}
                  availableLigands={rbfeStore.availableLigands}
                />
              </div>
            )}

            <InfoBox variant="info" title="Network Topology Guide">
              <ul className="list-disc ml-4 space-y-1 text-sm">
                <li><strong>MST:</strong> Minimizes edges, best for small-medium sets</li>
                <li><strong>Radial:</strong> Compare analogs to a reference lead</li>
                <li><strong>Maximal:</strong> All pairs for redundancy/error checking</li>
              </ul>
            </InfoBox>
          </div>
        )
      }

      case 4:
        return (
          <div className="space-y-6">
            <PresetSelector
              label="Simulation Preset"
              presets={SIMULATION_PRESETS}
              selectedPreset={getPresetMode(rbfeStore.rbfeParameters)}
              onPresetSelect={(preset: string) => {
                if (preset === 'fast') {
                  rbfeStore.setRBFEParameters({
                    fast_mode: true,
                    production_length_ns: 0.5,
                    equilibration_length_ns: 0.1,
                    lambda_windows: 11,
                    protocol_repeats: 1,
                  })
                } else if (preset === 'production') {
                  rbfeStore.setRBFEParameters({
                    fast_mode: false,
                    production_length_ns: 5,
                    equilibration_length_ns: 1.0,
                    lambda_windows: 11,
                    protocol_repeats: 3,
                  })
                } else {
                  rbfeStore.setRBFEParameters({
                    fast_mode: false,
                    production_length_ns: 2,
                    equilibration_length_ns: 0.5,
                    lambda_windows: 11,
                    protocol_repeats: 3,
                  })
                }
              }}
              accentColor="cyan"
            />

            <ParameterSection title="Simulation Settings" collapsible defaultExpanded>
              <SliderParameter
                label="Lambda Windows"
                value={rbfeStore.rbfeParameters.lambda_windows || 11}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ lambda_windows: v })}
                min={5}
                max={21}
                step={2}
                description="More windows = higher precision but longer runtime"
                accentColor="cyan"
              />
              <SliderParameter
                label="Production Length"
                value={rbfeStore.rbfeParameters.production_length_ns || 0.5}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ production_length_ns: v })}
                min={0.1}
                max={10}
                step={0.1}
                unit="ns"
                description="Production simulation time per lambda window"
                accentColor="cyan"
              />
              <SliderParameter
                label="Equilibration Length"
                value={rbfeStore.rbfeParameters.equilibration_length_ns || 0.1}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ equilibration_length_ns: v })}
                min={0.05}
                max={2}
                step={0.05}
                unit="ns"
                description="Equilibration time before production per window"
                accentColor="cyan"
              />
              <SliderParameter
                label="Protocol Repeats"
                value={rbfeStore.rbfeParameters.protocol_repeats || (rbfeStore.rbfeParameters.fast_mode ? 1 : 3)}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ protocol_repeats: v })}
                min={1}
                max={5}
                step={1}
                description="Number of independent repetitions"
                accentColor="cyan"
              />
            </ParameterSection>

            <ParameterSection title="Ligand Preparation" collapsible defaultExpanded>
              <SelectParameter
                label="Ligand Forcefield"
                value={rbfeStore.rbfeParameters.ligand_forcefield || 'openff-2.2.1'}
                onChange={(v: string) => rbfeStore.setRBFEParameters({ ligand_forcefield: v })}
                options={FORCEFIELD_OPTIONS}
                description="Force field for small molecule parameterization"
              />
              <SelectParameter
                label="Partial Charge Method"
                value={rbfeStore.rbfeParameters.charge_method || 'am1bcc'}
                onChange={(v: string) => rbfeStore.setRBFEParameters({ charge_method: v as any })}
                options={CHARGE_METHOD_OPTIONS}
                description="Method for assigning partial charges to ligands"
              />
            </ParameterSection>

            <ParameterSection title="Environment" collapsible defaultExpanded={false}>
              <SliderParameter
                label="Temperature"
                value={rbfeStore.rbfeParameters.temperature || 298.15}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ temperature: v })}
                min={273}
                max={373}
                step={0.5}
                unit="K"
                description="Simulation temperature"
                accentColor="cyan"
              />
              <SliderParameter
                label="Pressure"
                value={rbfeStore.rbfeParameters.pressure || 1.0}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ pressure: v })}
                min={0.5}
                max={2.0}
                step={0.1}
                unit="bar"
                description="Simulation pressure"
                accentColor="cyan"
              />
              <SelectParameter
                label="Solvent Model"
                value={rbfeStore.rbfeParameters.solvent_model || 'tip3p'}
                onChange={(v: string) => rbfeStore.setRBFEParameters({ solvent_model: v })}
                options={[
                  { value: 'tip3p', label: 'TIP3P (standard)' },
                  { value: 'spce', label: 'SPC/E' },
                  { value: 'tip4pew', label: 'TIP4P-Ew' },
                ]}
                description="Water model for solvation"
              />
              <SelectParameter
                label="Box Shape"
                value={rbfeStore.rbfeParameters.box_shape || 'dodecahedron'}
                onChange={(v: string) => rbfeStore.setRBFEParameters({ box_shape: v })}
                options={[
                  { value: 'dodecahedron', label: 'Dodecahedron (recommended)' },
                  { value: 'cube', label: 'Cube' },
                  { value: 'octahedron', label: 'Octahedron' },
                ]}
                description="Periodic box shape"
              />
              <SliderParameter
                label="Ionic Strength"
                value={rbfeStore.rbfeParameters.ionic_strength || 0.15}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ ionic_strength: v })}
                min={0.0}
                max={0.5}
                step={0.01}
                unit="M"
                description="NaCl concentration for charge neutralization"
                accentColor="cyan"
              />
            </ParameterSection>

            <ParameterSection title="Advanced Settings" collapsible defaultExpanded={false}>
              <ToggleParameter
                label="Robust Mode"
                value={rbfeStore.rbfeParameters.robust || false}
                onChange={(v: boolean) => {
                  rbfeStore.setRBFEParameters({
                    robust: v,
                    timestep_fs: v ? 2.0 : 4.0,
                  })
                }}
                description="Use safer simulation settings (2.0 fs timestep) for unstable systems"
                accentColor="cyan"
              />
              <SliderParameter
                label="Timestep"
                value={rbfeStore.rbfeParameters.timestep_fs || 4.0}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ timestep_fs: v })}
                min={0.5}
                max={4.0}
                step={0.5}
                unit="fs"
                description="Integration timestep (lower = more stable but slower)"
                accentColor="cyan"
              />
              <SliderParameter
                label="Hydrogen Mass"
                value={rbfeStore.rbfeParameters.hydrogen_mass || 3.0}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ hydrogen_mass: v })}
                min={1.0}
                max={4.0}
                step={0.1}
                unit="amu"
                description="Mass repartitioning (3.0 = HMR standard, 1.0 = no HMR)"
                accentColor="cyan"
              />
              <SliderParameter
                label="Minimization Steps"
                value={rbfeStore.rbfeParameters.minimization_steps || 10000}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ minimization_steps: v })}
                min={1000}
                max={50000}
                step={1000}
                description="Energy minimization steps before simulation"
                accentColor="cyan"
              />
              <SliderParameter
                label="Solvent Padding"
                value={rbfeStore.rbfeParameters.solvent_padding_nm || 1.5}
                onChange={(v: number) => rbfeStore.setRBFEParameters({ solvent_padding_nm: v })}
                min={0.8}
                max={2.5}
                step={0.1}
                unit="nm"
                description="Minimum distance from solute to box edge"
                accentColor="cyan"
              />
            </ParameterSection>
          </div>
        )

      case 5: {
        const params = rbfeStore.rbfeParameters
        const prodNs = params.production_length_ns || 0.5
        const equilNs = params.equilibration_length_ns || 0.1
        const repeats = params.protocol_repeats || 1
        const lambdaWindows = params.lambda_windows || 11
        const mode = params.fast_mode ? 'Fast' : prodNs >= 5 ? 'Production' : 'Standard'
        const modeColor = mode === 'Fast' ? 'text-yellow-300' : mode === 'Production' ? 'text-green-300' : 'text-blue-300'
        const numLigands = rbfeStore.selectedLigandIds.length
        const topology = rbfeStore.networkTopology || 'mst'
        const rawEdges = topology === 'maximal'
          ? numLigands * (numLigands - 1) / 2
          : topology === 'radial'
            ? numLigands - 1
            : numLigands - 1
        const estimatedEdges = Math.max(0, rawEdges)

        const selectedNames = rbfeStore.selectedLigandIds
          .map((id) => rbfeStore.availableLigands.find((l) => l.id === id)?.name || id)
          .slice(0, 6)
        const selectedNamesLabel =
          selectedNames.length > 0
            ? selectedNames.join(', ') + (numLigands > 6 ? ` +${numLigands - 6} more` : '')
            : 'No ligands selected'

        const refLigandName = rbfeStore.referenceLigandId
          ? rbfeStore.availableLigands.find((l) => l.id === rbfeStore.referenceLigandId)?.name || rbfeStore.referenceLigandId
          : 'Not selected'
        const poseSourceLabel = rbfeStore.referencePoseSource === 'cocrystal'
          ? 'Co-crystal from PDB'
          : rbfeStore.referencePoseSource === 'vina'
            ? 'Vina docking'
            : rbfeStore.referencePoseSource === 'prior_job'
              ? 'Imported from prior job'
              : 'Not selected'

        const configGroups: ConfigGroup[] = [
          {
            title: 'Structures',
            items: [
              { label: 'Protein', value: currentStructure?.structure_id || 'Current structure' },
              { label: 'Ligands', value: `${numLigands} selected` },
              { label: 'Names', value: selectedNamesLabel },
            ],
          },
          {
            title: 'Reference Pose',
            items: [
              { label: 'Reference Ligand', value: refLigandName },
              { label: 'Pose Source', value: poseSourceLabel },
              ...(rbfeStore.referencePoseSource === 'vina'
                ? [{ label: 'Vina Exhaustiveness', value: `${rbfeStore.vinaExhaustiveness}` }]
                : []),
            ],
          },
          {
            title: 'Network',
            items: [
              { label: 'Topology', value: topology === 'mst' ? 'Minimum Spanning Tree' : topology.charAt(0).toUpperCase() + topology.slice(1) },
              { label: 'Atom Mapper', value: (params.atom_mapper || 'kartograf').charAt(0).toUpperCase() + (params.atom_mapper || 'kartograf').slice(1) },
              { label: 'Estimated Edges', value: estimatedEdges === 0 ? 'N/A (select 2+ ligands)' : `~${estimatedEdges} transformations (${estimatedEdges * 2} legs)` },
            ],
          },
          {
            title: 'Simulation',
            items: [
              { label: 'Preset', value: mode, valueColor: modeColor },
              { label: 'Production', value: `${prodNs} ns per window` },
              { label: 'Equilibration', value: `${equilNs} ns` },
              { label: 'Lambda Windows', value: `${lambdaWindows}` },
              { label: 'Repeats', value: `${repeats}` },
            ],
          },
          {
            title: 'Environment',
            items: [
              { label: 'Temperature', value: `${params.temperature || 298.15} K` },
              { label: 'Pressure', value: `${params.pressure || 1.0} bar` },
              { label: 'Solvent', value: (params.solvent_model || 'tip3p').toUpperCase() },
              { label: 'Forcefield', value: params.ligand_forcefield || 'openff-2.2.1' },
              { label: 'Timestep', value: `${params.timestep_fs || 4.0} fs ${params.robust ? '(robust)' : '(HMR)'}` },
            ],
          },
        ]

        const runtimeValue = estimatedEdges === 0
          ? 'N/A (select 2+ ligands)'
          : mode === 'Fast'
            ? `~${Math.ceil(estimatedEdges * 2 * 1)} - ${Math.ceil(estimatedEdges * 2 * 2)} hours`
            : mode === 'Standard'
              ? `~${Math.ceil(estimatedEdges * 2 * 4)} - ${Math.ceil(estimatedEdges * 2 * 8)} hours`
              : `~${Math.ceil(estimatedEdges * 2 * 12)} - ${Math.ceil(estimatedEdges * 2 * 24)} hours`

        return (
          <ExecutionPanel
            isRunning={false}
            progress={0}
            progressMessage=""
            error={error}
            accentColor="cyan"
            configGroups={configGroups}
            runtimeEstimate={{
              value: runtimeValue,
              detail: `${estimatedEdges} edges × 2 legs (complex + solvent) × ${repeats} repeat${repeats > 1 ? 's' : ''} · GPU accelerated`,
            }}
          />
        )
      }

      case 6:
        return (
          <RBFEResultsPanel
            result={rbfeStore.rbfeResult}
            isRunning={rbfeStore.isRunning}
            progress={rbfeStore.progress}
            progressMessage={rbfeStore.progressMessage}
            jobs={rbfeStore.jobs}
            activeJobId={rbfeStore.activeJobId}
            onSelectJob={async (jobId) => {
              rbfeStore.setActiveJob(jobId)
              if (!jobId) {
                rbfeStore.setRBFEResult(null)
                rbfeStore.setIsRunning(false)
                rbfeStore.setJobId(null)
                return
              }
              try {
                const status = await api.getRBFEStatus(jobId) as any
                const resultPayload = status.result || {}
                const dbStatus = status.status
                const dbStage = status.stage || ''
                const resultStatus = resultPayload.status

                // Only treat as docking_ready if DB stage actually matches
                let effectiveStatus: string
                if (dbStatus === 'running' && resultStatus === 'docking_ready' && dbStage === 'docking_ready') {
                  effectiveStatus = 'docking_ready'
                } else {
                  effectiveStatus = dbStatus
                }

                const showPoses = effectiveStatus === 'docking_ready' || effectiveStatus === 'completed'
                const rbfeJob = {
                  ...status,
                  ...resultPayload,
                  job_id: status.id || resultPayload.job_id || jobId,
                  status: effectiveStatus,
                  docked_poses: showPoses ? resultPayload.docked_poses : undefined,
                  docking_scores: showPoses ? resultPayload.docking_scores : undefined,
                  docking_log: showPoses ? resultPayload.docking_log : undefined,
                  results: resultPayload.results || resultPayload,
                }

                if (rbfeJob.results?.results) {
                  rbfeJob.results = rbfeJob.results.results
                }

                rbfeStore.setRBFEResult(rbfeJob as any)

                // If job is running, start tracking it
                if (effectiveStatus === 'running' || effectiveStatus === 'preparing' || effectiveStatus === 'submitted' || effectiveStatus === 'resuming') {
                  rbfeStore.setJobId(jobId)
                  rbfeStore.setIsRunning(true)
                }
              } catch (err) {
                console.error('Failed to fetch job status:', err)
                const job = rbfeStore.jobs.find((j) => j.job_id === jobId)
                if (job) {
                  rbfeStore.setRBFEResult(job)
                }
              }
            }}
            onContinueAfterDocking={handleContinueAfterDocking}
            onClearDockingPreview={handleClearDockingPreview}
            onJobsLoaded={(jobs) => {
              rbfeStore.setJobs(jobs)
            }}
          />
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="RBFE Calculation"
      description="Compare binding affinities between multiple ligands"
      icon={<GitBranch className="h-5 w-5 text-cyan-400" />}
      showHeader={false}
      steps={RBFE_STEPS}
      currentStep={rbfeStore.currentStep}
      onStepClick={(step: number) => rbfeStore.setStep(step)}
      onBack={rbfeStore.previousStep}
      onNext={rbfeStore.nextStep}
      onReset={rbfeStore.reset}
      onExecute={() => runRBFE()}
      canProceed={canProceed}
      isRunning={isSubmitting}
      allowStepNavigationWhileRunning={true}
      executeLabel="Start RBFE"
      showExecuteOnStep={5}
      accentColor="cyan"
      error={error}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}

