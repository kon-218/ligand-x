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
import type { WorkflowStep } from './shared'
import type { LigandSelection, AlignmentInfo, MappingPreviewResult } from '@/types/rbfe-types'

// Define workflow steps
const RBFE_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Ligands', description: 'Select molecules for comparison' },
  { id: 2, label: 'Reference', description: 'Select reference binding pose' },
  { id: 3, label: 'Network', description: 'Set network topology' },
  { id: 4, label: 'Parameters', description: 'Configure simulation' },
  { id: 5, label: 'Results', description: 'View results' },
]

// Simulation presets
const SIMULATION_PRESETS = [
  {
    id: 'fast',
    name: 'Fast Mode',
    description: '~1-2 hours, lower precision',
    icon: null,
  },
  {
    id: 'standard',
    name: 'Standard',
    description: '~6-12 hours, balanced',
    icon: null,
  },
  {
    id: 'production',
    name: 'Production',
    description: '~24+ hours, high precision',
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
  { value: 'openff-2.0.0', label: 'OpenFF 2.0.0 (Sage)', description: 'Standard general-purpose force field' },
  { value: 'openff-2.1.0', label: 'OpenFF 2.1.0', description: 'Improved torsions and charged groups' },
  { value: 'openff-2.2.0', label: 'OpenFF 2.2.0', description: 'Latest stable Sage release' },
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
  if (params.production_length_ns && params.production_length_ns >= 5) return 'production'
  return 'standard'
}

export function RBFETool() {
  const rbfeStore = useRBFEStore()
  const { currentStructure } = useMolecularStore()
  const [error, setError] = useState<string | null>(null)
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
        })) : []
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
          rbfeStore.setIsRunning(true)
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
          rbfeStore.setStep(5) // Go to results step to show docked poses
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
      const interval = setInterval(async () => {
        try {
          const status = await api.getRBFEStatus(rbfeStore.jobId!)

          // Handle wrapped result structure from Celery task
          const actualResult = (status as any).result || status

          rbfeStore.updateJob(rbfeStore.jobId!, {
            status: actualResult.status,
            progress: actualResult.progress,
            message: actualResult.message,
            network: actualResult.network,
            results: actualResult.results,
            error: actualResult.error,
            // Include alignment/docking results if available
            docked_poses: actualResult.docked_poses,
            docking_scores: actualResult.docking_scores,
            docking_log: actualResult.docking_log,
            output_files: actualResult.output_files,
            alignment_info: actualResult.alignment_info,
            reference_ligand: actualResult.reference_ligand,
          } as any)

          if (rbfeStore.activeJobId === rbfeStore.jobId) {
            rbfeStore.setRBFEResult(actualResult)
          }

          // Stop polling if completed, failed, or docking_ready (waiting for user action)
          if (actualResult.status === 'completed' || actualResult.status === 'failed' || actualResult.status === 'docking_ready') {
            rbfeStore.setIsRunning(false)
            // Refresh unified results store to show job in completed section
            if (actualResult.status === 'completed' || actualResult.status === 'failed') {
              loadAllJobs()
            }
          }
        } catch (err) {
          console.error('Error polling RBFE status:', err)
        }
      }, 30000) // RBFE calculations take hours - poll every 30 seconds

      setPollingInterval(interval)
      return () => clearInterval(interval)
    }
  }, [rbfeStore.jobId, rbfeStore.isRunning])

  const runRBFE = async () => {
    setError(null)
    rbfeStore.setIsRunning(true)
    rbfeStore.setStep(5)

    try {
      // Prepare ligand data
      const selectedLigands = rbfeStore.availableLigands.filter((lig) =>
        rbfeStore.selectedLigandIds.includes(lig.id)
      )

      if (selectedLigands.length < 2) {
        throw new Error('At least 2 ligands are required for RBFE calculations')
      }

      if (!currentStructure?.pdb_data) {
        throw new Error('No protein structure available')
      }

      rbfeStore.setProgress(10, 'Preparing ligands...')

      // Convert ligands to the format expected by the API
      const ligandData = await Promise.all(
        selectedLigands.map(async (lig) => {
          let data = lig.sdf_data || ''
          let format: 'sdf' | 'mol' | 'pdb' = 'sdf'

          // If no SDF data but have SMILES, convert
          if (!data && lig.smiles) {
            try {
              const result = await api.uploadSmiles(lig.smiles, lig.name)
              data = result.sdf_data || ''
            } catch (e) {
              console.error(`Failed to convert SMILES for ${lig.name}:`, e)
            }
          }

          // Fall back to PDB data
          if (!data && lig.pdb_data) {
            data = lig.pdb_data
            format = 'pdb'
          }

          return {
            id: lig.name || lig.id,
            data,
            format,
            has_docked_pose: lig.has_docked_pose || false,
            docking_affinity: lig.docking_affinity,
          }
        })
      )

      rbfeStore.setProgress(20, 'Submitting RBFE calculation...')

      // Submit new job
      const requestBody = {
        protein_pdb: currentStructure.pdb_data,
        ligands: ligandData,
        protein_id: currentStructure.structure_id || 'protein',
        network_topology: rbfeStore.networkTopology,
        central_ligand: rbfeStore.centralLigand || undefined,
        atom_mapper: rbfeStore.rbfeParameters.atom_mapper || 'kartograf',
        atom_map_hydrogens: rbfeStore.rbfeParameters.atom_map_hydrogens !== false,
        lomap_max3d: rbfeStore.rbfeParameters.lomap_max3d || 1.0,
        simulation_settings: rbfeStore.rbfeParameters,
      }

      const result = await api.submitRBFECalculation(requestBody)
      rbfeStore.setJobId(result.job_id)
      rbfeStore.addJob({
        job_id: result.job_id,
        status: result.status || 'submitted',
        num_ligands: ligandData.length,
        network_topology: rbfeStore.networkTopology,
        created_at: new Date().toISOString(),
      })
      rbfeStore.setActiveJob(result.job_id)
      rbfeStore.setRBFEResult(result)

      rbfeStore.setProgress(30, result.message || 'Calculation submitted')
    } catch (err: any) {
      setError(err.message)
      rbfeStore.setIsRunning(false)
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
    rbfeStore.setIsRunning(true)

    try {
      // Update UI to show resuming state
      rbfeStore.updateJob(existingJobId, {
        status: 'resuming',
      })
      rbfeStore.setRBFEResult({
        ...rbfeStore.rbfeResult,
        status: 'resuming',
        docked_poses: undefined, // Clear docking preview
        docking_scores: undefined,
        docking_log: undefined,
      } as any)

      // Call the resume endpoint directly with existing job ID
      const result = await api.continueRBFEAfterDocking(existingJobId)

      // Update job status
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
    } catch (err: any) {
      setError(err.message || 'Failed to continue RBFE calculation')
      rbfeStore.setIsRunning(false)
      // Restore the docking_ready state so user can try again
      if (rbfeStore.rbfeResult) {
        rbfeStore.setRBFEResult({
          ...rbfeStore.rbfeResult,
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
      try {
        const status = await api.getJobDetails(jobId)
        const s = status?.status
        if (s === 'completed') {
          stopMappingPreviewPoll()
          // Unwrap task envelope: status.result = { status, result: { pairs, ... }, ... }
          const previewData: MappingPreviewResult | null =
            status?.result?.result ?? null
          if (previewData) {
            rbfeStore.setMappingPreviewResult(previewData)
            rbfeStore.setMappingPreviewStatus('completed')
          } else {
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
        return true // Docking is optional
      case 3:
        return rbfeStore.networkTopology !== undefined
      case 4:
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

      case 2: {
        const canPreview = rbfeStore.selectedLigandIds.length >= 2
        const previewStatus = rbfeStore.mappingPreviewStatus
        const previewRunning = previewStatus === 'running'

        return (
          <div className="space-y-6">
            <ParameterSection title="Atom Mapper (Network Creation)" collapsible defaultExpanded>
              <SelectParameter
                label="Atom Mapper"
                value={rbfeStore.rbfeParameters.atom_mapper || 'kartograf'}
                onChange={(v: string) => {
                  rbfeStore.setRBFEParameters({ atom_mapper: v as any })
                  // Clear any existing preview when mapper changes
                  if (rbfeStore.mappingPreviewStatus !== 'idle') {
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
                {!canPreview && (
                  <p className="text-xs text-gray-500 text-center">
                    Select at least 2 ligands in step 1 to preview mappings.
                  </p>
                )}
                {previewStatus === 'failed' && (
                  <p className="text-xs text-red-400 text-center">
                    Mapping preview failed. Check that your ligands have valid 3D structures and try again.
                  </p>
                )}
                <p className="text-xs text-gray-500 text-center">
                  Preview is optional — you can proceed to step 3 without running it.
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

            {previewStatus !== 'completed' && (
              <InfoBox variant="info" title="Atom Mapper Selection (OpenFE Best Practices)">
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>The atom mapper creates the network AND handles alignment automatically.</strong> No pre-alignment is needed.
                  </p>
                  <ul className="list-disc ml-4 space-y-1 mt-2">
                    <li><strong>Kartograf</strong>: Geometry-based, preserves 3D binding mode from docked poses.</li>
                    <li><strong>LOMAP</strong>: 2D MCS-based, may realign structures. Use when Kartograf fails.</li>
                  </ul>
                </div>
              </InfoBox>
            )}
          </div>
        )
      }

      case 3: {
        // Resolve central ligand name for NetworkPreview
        const centralLigandName = rbfeStore.centralLigand
          ? rbfeStore.availableLigands.find((l) => l.id === rbfeStore.centralLigand)?.name || rbfeStore.centralLigand
          : null

        const selectedLigandNames = rbfeStore.selectedLigandIds.map(
          (id) => rbfeStore.availableLigands.find((l) => l.id === id)?.name || id,
        )

        return (
          <div className="space-y-6">
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
                    lambda_windows: 11,
                    protocol_repeats: 1,
                  })
                } else if (preset === 'production') {
                  rbfeStore.setRBFEParameters({
                    fast_mode: false,
                    production_length_ns: 5,
                    lambda_windows: 11,
                    protocol_repeats: 3,
                  })
                } else {
                  rbfeStore.setRBFEParameters({
                    fast_mode: false,
                    production_length_ns: 2,
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
                description="Production simulation time per window"
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

            <ParameterSection title="Robustness Settings" collapsible defaultExpanded>
              <ToggleParameter
                label="Robust Mode"
                value={rbfeStore.rbfeParameters.robust || false}
                onChange={(v: boolean) => {
                  rbfeStore.setRBFEParameters({
                    robust: v,
                    // Auto-adjust timestep when robust mode changes
                    timestep_fs: v ? 2.0 : 4.0
                  })
                }}
                description="Use safer simulation settings (2.0 fs) for unstable systems"
                accentColor="cyan"
              />

              <ParameterSection title="Advanced Dynamics" collapsible={true} defaultExpanded={false}>
                <SliderParameter
                  label="Timestep (fs)"
                  value={rbfeStore.rbfeParameters.timestep_fs || (rbfeStore.rbfeParameters.robust ? 2.0 : 4.0)}
                  onChange={(v: number) => rbfeStore.setRBFEParameters({ timestep_fs: v })}
                  min={0.5}
                  max={4.0}
                  step={0.5}
                  description="Integration timestep (lower = more stable)"
                  accentColor="cyan"
                />

                <SliderParameter
                  label="Hydrogen Mass (amu)"
                  value={rbfeStore.rbfeParameters.hydrogen_mass || 3.0}
                  onChange={(v: number) => rbfeStore.setRBFEParameters({ hydrogen_mass: v })}
                  min={1.0}
                  max={4.0}
                  step={0.1}
                  description="Mass repartitioning (3.0 = HMR, 1.0 = standard)"
                  accentColor="cyan"
                />
              </ParameterSection>
            </ParameterSection>

            <ParameterSection title="Ligand Preparation Settings" collapsible defaultExpanded>
              <SelectParameter
                label="Ligand Forcefield"
                value={rbfeStore.rbfeParameters.ligand_forcefield || 'openff-2.0.0'}
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
          </div>
        )

      case 5:
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
              if (!jobId) return
              // Fetch full job status for the selected job
              try {
                const status = await api.getRBFEStatus(jobId)
                // Handle wrapped result structure and normalize to RBFEJob
                const resultPayload = status.result || {}
                const rbfeJob = {
                  ...status,
                  ...resultPayload,
                  job_id: status.id || resultPayload.job_id || jobId,
                  // Ensure status is authoritative from DB, unless it's 'running' and payload has 'docking_ready'
                  status: (status.status === 'running' && resultPayload.status === 'docking_ready')
                    ? 'docking_ready'
                    : status.status,
                  // Ensure docked_poses are at top level
                  docked_poses: resultPayload.docked_poses,
                  docking_scores: resultPayload.docking_scores,
                  docking_log: resultPayload.docking_log,
                  results: resultPayload.results || resultPayload, // Some payloads put results at top, some nested
                }

                // If results are nested in the payload (common in completed jobs), unwrap them
                if (rbfeJob.results?.results) {
                  rbfeJob.results = rbfeJob.results.results
                }

                rbfeStore.setRBFEResult(rbfeJob as any) // Cast to any to avoid strict type checks on status string
              } catch (err) {
                console.error('Failed to fetch job status:', err)
                // Fallback to cached job data
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
      isRunning={rbfeStore.isRunning}
      allowStepNavigationWhileRunning={true}
      executeLabel="Start RBFE"
      showExecuteOnStep={4}
      accentColor="cyan"
      error={error}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}

