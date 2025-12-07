'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'
import { useABFEStore } from '@/store/abfe-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { api } from '@/lib/api-client'
import { isValidProtein } from '@/lib/structure-validation'
import { ABFEStepResults } from './ABFE/ABFEStepResults'
import {
  WorkflowContainer,
  StructureSelector,
  ParameterSection,
  SliderParameter,
  SelectParameter,
  ToggleParameter,
  PresetSelector,
  ExecutionPanel,
  ResultsContainer,
  ResultMetric,
  ResultsTable,
  InfoBox,
} from './shared'
import type { WorkflowStep } from './shared'
import type { StructureOption } from '@/types/abfe-types'

// Define workflow steps
const ABFE_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection', description: 'Choose protein and ligand' },
  { id: 2, label: 'Parameters', description: 'Configure simulation settings' },
  { id: 3, label: 'Execute', description: 'Run calculation' },
  { id: 4, label: 'Results', description: 'View results' },
]

// Simulation presets
const SIMULATION_PRESETS = [
  {
    id: 'fast',
    name: 'Fast Mode',
    description: '~30 min, lower precision',
    icon: null,
  },
  {
    id: 'standard',
    name: 'Standard',
    description: '~2-4 hours, balanced',
    icon: null,
  },
  {
    id: 'production',
    name: 'Production',
    description: '~12-24 hours, high precision',
    icon: null,
  },
]

// Helper to get preset mode
const getPresetMode = (params: any): string => {
  if (params.fast_mode) return 'fast'
  if (params.production_length_ns && params.production_length_ns >= 5) return 'production'
  return 'standard'
}

// Forcefield options
const FORCEFIELD_OPTIONS = [
  { value: 'openff-2.0.0', label: 'OpenFF 2.0.0 (Sage)', description: 'Standard general-purpose force field' },
  { value: 'openff-2.1.0', label: 'OpenFF 2.1.0', description: 'Improved torsions and charged groups' },
  { value: 'openff-2.2.0', label: 'OpenFF 2.2.0', description: 'Latest stable Sage release' },
  { value: 'gaff-2.11', label: 'GAFF 2.11', description: 'General Amber Force Field' },
  { value: 'espaloma-0.3.2', label: 'Espaloma 0.3.2', description: 'Machine learning force field' },
]

// Charge method options
const CHARGE_METHOD_OPTIONS = [
  { value: 'am1bcc', label: 'AM1-BCC', description: 'Semi-empirical charge method (standard)' },
  { value: 'am1bccelf10', label: 'AM1-BCC ELF10', description: 'Improved AM1-BCC with ELF10 selection' },
  { value: 'nagl', label: 'NAGL', description: 'Graph neural network partial charges' },
  { value: 'espaloma', label: 'Espaloma', description: 'Machine learning based charges' },
]

export function ABFETool() {
  const abfeStore = useABFEStore()
  const { currentStructure } = useMolecularStore()
  const [error, setError] = useState<string | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Load persisted ABFE jobs on mount
  useEffect(() => {
    const loadPersistedJobs = async () => {
      try {
        const response = await api.listABFEJobs()
        const jobsData = Array.isArray(response.jobs) ? response.jobs : []
        abfeStore.setJobs(jobsData)
      } catch (err) {
        console.error('Failed to load persisted ABFE jobs:', err)
      }
    }

    loadPersistedJobs()
  }, [])

  // Fetch library molecules on mount and when structure changes
  useEffect(() => {
    const fetchLibraryMolecules = async () => {
      try {
        const molecules = await api.getMolecules()
        const libraryLigands: StructureOption[] = Array.isArray(molecules)
          ? molecules.map((mol: any) => ({
            id: `library_${mol.id}`,
            name: `${mol.name} (Library)`,
            type: 'ligand' as const,
            source: 'library' as const,
          }))
          : []

        const structureLigands: StructureOption[] = currentStructure?.ligands
          ? Object.entries(currentStructure.ligands).map(([id, ligand]: [string, any]) => ({
            id,
            name: ligand.residue_name || id,
            type: 'ligand' as const,
            source: 'current_structure' as const,
          }))
          : []

        const allLigands = [...structureLigands, ...libraryLigands]
        abfeStore.setAvailableLigands(allLigands)

        if (currentStructure?.pdb_data && isValidProtein(currentStructure)) {
          abfeStore.setSelectedProtein('current')
          if (allLigands.length > 0 && !abfeStore.selectedLigand) {
            abfeStore.setSelectedLigand(allLigands[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch library molecules:', err)
      }
    }

    fetchLibraryMolecules()
  }, [currentStructure])

  // Poll for job status
  useEffect(() => {
    if (abfeStore.jobId && abfeStore.isRunning) {
      const { loadAllJobs } = useUnifiedResultsStore.getState()
      const interval = setInterval(async () => {
        try {
          const status = await api.getABFEStatus(abfeStore.jobId!)

          // Transform the response to ABFEResult format
          const abfeResult = {
            job_id: status.id || abfeStore.jobId!,
            status: status.status as any,
            message: status.message || status.stage || '',
            progress: status.progress || 0,
            error: status.error_message,
            result: status.result,
          }

          abfeStore.setABFEResult(abfeResult)

          // Update progress and message from live Celery state
          if (status.progress !== undefined) {
            abfeStore.setProgress(status.progress, status.message || status.stage || '')
          }

          if (status.status === 'completed' || status.status === 'failed') {
            abfeStore.setIsRunning(false)
            clearInterval(interval)
            // Refresh unified results store to show job in completed section
            loadAllJobs()
          }
        } catch (err) {
          console.error('Error polling ABFE status:', err)
        }
      }, 5000)

      setPollingInterval(interval)
      return () => clearInterval(interval)
    }
  }, [abfeStore.jobId, abfeStore.isRunning])

  const runABFE = async () => {
    setError(null)
    abfeStore.setIsRunning(true)

    try {
      let ligandData = ''
      let ligandName = 'ligand'

      // Check for preloaded ligand first (from MD equilibration, Docking, etc.)
      if (abfeStore.preloadedLigand) {
        abfeStore.setProgress(5, 'Using preloaded ligand from MD equilibration...')
        ligandData = abfeStore.preloadedLigand.data
        ligandName = abfeStore.preloadedLigand.name
      } else if (abfeStore.selectedLigand) {
        const ligandId = abfeStore.selectedLigand

        if (ligandId.startsWith('library_')) {
          abfeStore.setProgress(5, 'Loading molecule from library...')
          const molecules = await api.getMolecules()
          const moleculeId = parseInt(ligandId.replace('library_', ''))
          const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)

          if (!libraryMolecule) throw new Error('Library molecule not found')

          abfeStore.setProgress(10, `Converting ${libraryMolecule.name} to 3D...`)
          const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
          ligandData = smilesResult.sdf_data || ''
          ligandName = libraryMolecule.name
        } else {
          const ligand = currentStructure?.ligands?.[ligandId]
          if (ligand) {
            ligandData = ligand.sdf_data || ligand.pdb_data || ''
            ligandName = ligand.residue_name || ligandId
          }
        }
      }

      if (!ligandData) throw new Error('No ligand data available')
      if (!currentStructure?.pdb_data) throw new Error('No protein structure available')

      abfeStore.setProgress(20, 'Submitting ABFE calculation...')

      const result = await api.submitABFECalculation({
        protein_pdb: currentStructure.pdb_data,
        ligand_sdf: ligandData,
        ligand_id: ligandName,
        protein_id: currentStructure.structure_id || 'protein',
        simulation_settings: abfeStore.abfeParameters,
      })

      abfeStore.setJobId(result.job_id)
      abfeStore.setProgress(30, result.message || 'Calculation submitted')
      abfeStore.addJob({
        job_id: result.job_id,
        status: result.status || 'submitted',
        ligand_id: ligandName,
        protein_id: currentStructure.structure_id || 'protein',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      abfeStore.setABFEResult(result)
    } catch (err: any) {
      setError(err.message)
      abfeStore.setIsRunning(false)
    }
  }

  // Check if we can proceed - need protein and either preloaded ligand or selected ligand
  const canProceed = abfeStore.selectedProtein &&
    (abfeStore.preloadedLigand || abfeStore.selectedLigand) &&
    isValidProtein(currentStructure)

  // Render step content
  const renderStepContent = () => {
    switch (abfeStore.currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Show preloaded ligand info if available */}
            {abfeStore.preloadedLigand && (
              <InfoBox variant="success" title="Ligand Pre-loaded from MD">
                <p>
                  <strong>{abfeStore.preloadedLigand.name}</strong> has been automatically loaded
                  from your {abfeStore.preloadedLigand.source.replace('_', ' ')} results.
                  You can proceed to parameters or select a different ligand below.
                </p>
                <button
                  onClick={() => abfeStore.setPreloadedLigand(null)}
                  className="mt-2 text-xs text-orange-400 hover:text-orange-300 underline"
                >
                  Clear and select different ligand
                </button>
              </InfoBox>
            )}

            <StructureSelector
              selectedProtein={isValidProtein(currentStructure) ? abfeStore.selectedProtein : null}
              onProteinSelect={abfeStore.setSelectedProtein}
              hasProtein={isValidProtein(currentStructure)}
              proteinName={currentStructure?.structure_id}
              selectedLigand={abfeStore.preloadedLigand ? 'preloaded' : abfeStore.selectedLigand}
              onLigandSelect={(id) => {
                // If selecting a different ligand, clear preloaded
                if (abfeStore.preloadedLigand && id !== 'preloaded') {
                  abfeStore.setPreloadedLigand(null)
                }
                abfeStore.setSelectedLigand(id)
              }}
              availableLigands={abfeStore.preloadedLigand
                ? [{ id: 'preloaded', name: `${abfeStore.preloadedLigand.name} (from MD)`, type: 'ligand' as const }, ...abfeStore.availableLigands]
                : abfeStore.availableLigands
              }
              ligandDescription={abfeStore.preloadedLigand
                ? "Using ligand from MD equilibration - or select a different one"
                : "Choose from extracted ligands or library molecules"
              }
              accentColor="orange"
            />
            <InfoBox variant="info" title="About ABFE Calculations">
              <p>
                Absolute Binding Free Energy (ABFE) calculations compute the binding affinity
                between a protein and ligand. This is computationally intensive and can take
                several hours to days depending on settings.
              </p>
            </InfoBox>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <PresetSelector
              label="Simulation Preset"
              presets={SIMULATION_PRESETS}
              selectedPreset={getPresetMode(abfeStore.abfeParameters)}
              onPresetSelect={(preset: string) => {
                if (preset === 'fast') {
                  abfeStore.setABFEParameters({ fast_mode: true, production_length_ns: 0.5, protocol_repeats: 1 })
                } else if (preset === 'production') {
                  abfeStore.setABFEParameters({ fast_mode: false, production_length_ns: 10, protocol_repeats: 3 })
                } else {
                  abfeStore.setABFEParameters({ fast_mode: false, production_length_ns: 2, protocol_repeats: 3 })
                }
              }}
              accentColor="orange"
            />

            <ParameterSection title="Simulation Settings" collapsible defaultExpanded>
              <SliderParameter
                label="Lambda Windows"
                value={abfeStore.abfeParameters.lambda_windows || 11}
                onChange={(v: number) => abfeStore.setABFEParameters({ lambda_windows: v })}
                min={5}
                max={21}
                step={2}
                description="More windows = higher precision but longer runtime"
                accentColor="orange"
              />
              <SliderParameter
                label="Production Length"
                value={abfeStore.abfeParameters.production_length_ns || 0.5}
                onChange={(v: number) => abfeStore.setABFEParameters({ production_length_ns: v })}
                min={0.1}
                max={10}
                step={0.1}
                unit="ns"
                description="Production simulation time in nanoseconds"
                accentColor="orange"
              />
              <SliderParameter
                label="Equilibration Length"
                value={abfeStore.abfeParameters.equilibration_length_ns || 0.1}
                onChange={(v: number) => abfeStore.setABFEParameters({ equilibration_length_ns: v })}
                min={0.05}
                max={1}
                step={0.05}
                unit="ns"
                description="Equilibration time before production"
                accentColor="orange"
              />
              <SliderParameter
                label="Protocol Repeats"
                value={abfeStore.abfeParameters.protocol_repeats || (abfeStore.abfeParameters.fast_mode ? 1 : 3)}
                onChange={(v: number) => abfeStore.setABFEParameters({ protocol_repeats: v })}
                min={1}
                max={5}
                step={1}
                description="Number of independent repetitions"
                accentColor="orange"
              />
            </ParameterSection>

            <ParameterSection title="Ligand Preparation Settings" collapsible defaultExpanded>
              <SelectParameter
                label="Ligand Forcefield"
                value={abfeStore.abfeParameters.ligand_forcefield || 'openff-2.0.0'}
                onChange={(v: string) => abfeStore.setABFEParameters({ ligand_forcefield: v })}
                options={FORCEFIELD_OPTIONS}
                description="Force field for small molecule parameterization"
              />
              <SelectParameter
                label="Partial Charge Method"
                value={abfeStore.abfeParameters.charge_method || 'am1bcc'}
                onChange={(v: string) => abfeStore.setABFEParameters({ charge_method: v as any })}
                options={CHARGE_METHOD_OPTIONS}
                description="Method for assigning partial charges to ligands"
              />
            </ParameterSection>

            <ParameterSection title="Checkpoint Settings" collapsible defaultExpanded>
              {/* Production Checkpoint Settings */}
              <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div>
                  <label className="block text-sm font-medium mb-3">
                    Production Checkpoint Mode
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                      Configure checkpoints for production phase
                    </span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="production_checkpoint_mode"
                        value="number"
                        checked={abfeStore.abfeParameters.production_checkpoint_mode === 'number' || !abfeStore.abfeParameters.production_checkpoint_mode}
                        onChange={(e) => abfeStore.setABFEParameters({ production_checkpoint_mode: 'number' })}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Number of Checkpoints</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="production_checkpoint_mode"
                        value="interval"
                        checked={abfeStore.abfeParameters.production_checkpoint_mode === 'interval'}
                        onChange={(e) => abfeStore.setABFEParameters({ production_checkpoint_mode: 'interval' })}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Checkpoint Interval (ns)</span>
                    </label>
                  </div>
                </div>

                {/* Number of Checkpoints Input */}
                {(abfeStore.abfeParameters.production_checkpoint_mode === 'number' || !abfeStore.abfeParameters.production_checkpoint_mode) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      Number of Production Checkpoints
                    </label>
                    <input
                      type="number"
                      value={abfeStore.abfeParameters.production_n_checkpoints || 10}
                      onChange={(e) => abfeStore.setABFEParameters({ production_n_checkpoints: parseInt(e.target.value) })}
                      min={1}
                      max={100}
                      step={1}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Calculated interval: {((abfeStore.abfeParameters.production_length_ns || 0.5) / (abfeStore.abfeParameters.production_n_checkpoints || 10)).toFixed(4)} ns
                    </p>
                  </div>
                )}

                {/* Checkpoint Interval Input */}
                {abfeStore.abfeParameters.production_checkpoint_mode === 'interval' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      Production Checkpoint Interval (ns)
                    </label>
                    <input
                      type="number"
                      value={abfeStore.abfeParameters.production_checkpoint_interval_ns || 0.05}
                      onChange={(e) => abfeStore.setABFEParameters({ production_checkpoint_interval_ns: parseFloat(e.target.value) })}
                      min={0.01}
                      max={10}
                      step={0.01}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Calculated checkpoints: {Math.ceil((abfeStore.abfeParameters.production_length_ns || 0.5) / (abfeStore.abfeParameters.production_checkpoint_interval_ns || 0.05))}
                    </p>
                  </div>
                )}
              </div>

              {/* Equilibration Checkpoint Settings */}
              <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-3">
                    Equilibration Checkpoint Mode
                    <span className="text-xs text-gray-400 ml-2 font-normal">
                      Configure checkpoints for equilibration phase
                    </span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="equilibration_checkpoint_mode"
                        value="number"
                        checked={abfeStore.abfeParameters.equilibration_checkpoint_mode === 'number' || !abfeStore.abfeParameters.equilibration_checkpoint_mode}
                        onChange={(e) => abfeStore.setABFEParameters({ equilibration_checkpoint_mode: 'number' })}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Number of Checkpoints</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="equilibration_checkpoint_mode"
                        value="interval"
                        checked={abfeStore.abfeParameters.equilibration_checkpoint_mode === 'interval'}
                        onChange={(e) => abfeStore.setABFEParameters({ equilibration_checkpoint_mode: 'interval' })}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Checkpoint Interval (ns)</span>
                    </label>
                  </div>
                </div>

                {/* Number of Checkpoints Input */}
                {(abfeStore.abfeParameters.equilibration_checkpoint_mode === 'number' || !abfeStore.abfeParameters.equilibration_checkpoint_mode) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      Number of Equilibration Checkpoints
                    </label>
                    <input
                      type="number"
                      value={abfeStore.abfeParameters.equilibration_n_checkpoints || 5}
                      onChange={(e) => abfeStore.setABFEParameters({ equilibration_n_checkpoints: parseInt(e.target.value) })}
                      min={1}
                      max={100}
                      step={1}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Calculated interval: {((abfeStore.abfeParameters.equilibration_length_ns || 0.1) / (abfeStore.abfeParameters.equilibration_n_checkpoints || 5)).toFixed(4)} ns
                    </p>
                  </div>
                )}

                {/* Checkpoint Interval Input */}
                {abfeStore.abfeParameters.equilibration_checkpoint_mode === 'interval' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      Equilibration Checkpoint Interval (ns)
                    </label>
                    <input
                      type="number"
                      value={abfeStore.abfeParameters.equilibration_checkpoint_interval_ns || 0.02}
                      onChange={(e) => abfeStore.setABFEParameters({ equilibration_checkpoint_interval_ns: parseFloat(e.target.value) })}
                      min={0.01}
                      max={10}
                      step={0.01}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Calculated checkpoints: {Math.ceil((abfeStore.abfeParameters.equilibration_length_ns || 0.1) / (abfeStore.abfeParameters.equilibration_checkpoint_interval_ns || 0.02))}
                    </p>
                  </div>
                )}
              </div>
            </ParameterSection>
          </div>
        )

      case 3:
        return (
          <ExecutionPanel
            isRunning={abfeStore.isRunning}
            progress={abfeStore.progress}
            progressMessage={abfeStore.progressMessage}
            error={error}
            accentColor="orange"
            configSummary={[
              { label: 'Protein', value: currentStructure?.structure_id || 'Current' },
              { label: 'Ligand', value: abfeStore.preloadedLigand?.name || abfeStore.selectedLigand || 'None' },
              { label: 'Source', value: abfeStore.preloadedLigand?.source ? `From ${abfeStore.preloadedLigand.source.replace('_', ' ')}` : 'Selected' },
              { label: 'Mode', value: abfeStore.abfeParameters.fast_mode ? 'Fast' : 'Standard' },
              { label: 'Lambda Windows', value: String(abfeStore.abfeParameters.lambda_windows || 11) },
            ]}
          />
        )

      case 4:
        const result = abfeStore.abfeResult

        return (
          <ABFEStepResults
            result={result}
            isRunning={abfeStore.isRunning}
            progress={abfeStore.progress}
            progressMessage={abfeStore.progressMessage}
            onReset={abfeStore.reset}
            onNewCalculation={() => {
              abfeStore.setStep(1)
              setError(null)
            }}
          />
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="ABFE Calculation"
      description="Compute absolute binding free energy for protein-ligand complexes"
      icon={<Flame className="h-5 w-5 text-orange-400" />}
      showHeader={false}
      steps={ABFE_STEPS}
      currentStep={abfeStore.currentStep}
      onStepClick={(step: number) => abfeStore.setStep(step)}
      onBack={abfeStore.previousStep}
      onNext={abfeStore.nextStep}
      onReset={abfeStore.reset}
      onExecute={runABFE}
      canProceed={!!canProceed}
      isRunning={false}
      executeLabel="Start ABFE"
      showExecuteOnStep={3}
      accentColor="orange"
      error={error}
      allowStepNavigationWhileRunning={true}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}
