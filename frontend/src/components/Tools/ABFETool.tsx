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
  InfoBox,
} from './shared'
import type { WorkflowStep, ConfigGroup } from './shared'
import type { StructureOption } from '@/types/abfe-types'

// Define workflow steps
const ABFE_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection', description: 'Choose protein and ligand' },
  { id: 2, label: 'Parameters', description: 'Configure simulation settings' },
  { id: 3, label: 'Execute', description: 'Run calculation' },
  { id: 4, label: 'Results', description: 'View results' },
]

// Simulation presets with scientifically recommended defaults
const SIMULATION_PRESETS = [
  {
    id: 'fast',
    name: 'Fast Mode',
    description: '~30 min, quick testing',
    icon: null,
  },
  {
    id: 'standard',
    name: 'Standard',
    description: '~2-4 h, balanced',
    icon: null,
  },
  {
    id: 'production',
    name: 'Production',
    description: '~8-24 h, highest accuracy',
    icon: null,
  },
]

// Helper to get preset mode
const getPresetMode = (params: any): string => {
  if (params.fast_mode) return 'fast'
  if (params.production_length_ns && params.production_length_ns >= 10) return 'production'
  return 'standard'
}

// Forcefield options
const FORCEFIELD_OPTIONS = [
  { value: 'openff-2.2.1', label: 'OpenFF 2.2.1 (Sage)', description: 'Latest stable — recommended default' },
  { value: 'openff-2.2.0', label: 'OpenFF 2.2.0', description: 'Previous Sage release' },
  { value: 'openff-2.1.0', label: 'OpenFF 2.1.0', description: 'Improved torsions and charged groups' },
  { value: 'openff-2.0.0', label: 'OpenFF 2.0.0', description: 'Original Sage force field' },
  { value: 'gaff-2.11', label: 'GAFF 2.11', description: 'General Amber Force Field' },
  { value: 'espaloma-0.3.2', label: 'Espaloma 0.3.2', description: 'Machine learning force field' },
]

// Solvent model options
const SOLVENT_MODEL_OPTIONS = [
  { value: 'tip3p', label: 'TIP3P', description: 'Standard 3-point water model (default)' },
  { value: 'tip4pew', label: 'TIP4P-Ew', description: '4-point water model, better density' },
  { value: 'spce', label: 'SPC/E', description: 'Extended simple point charge model' },
]

// Box shape options
const BOX_SHAPE_OPTIONS = [
  { value: 'dodecahedron', label: 'Dodecahedron', description: 'Smaller volume, fewer waters (default)' },
  { value: 'cube', label: 'Cube', description: 'Standard cubic box, more waters' },
]

// Restraint host selection options
const HOST_SELECTION_OPTIONS = [
  { value: 'backbone', label: 'Backbone', description: 'Protein backbone atoms (default, recommended)' },
  { value: 'protein and name CA', label: 'CA atoms', description: 'Alpha-carbon atoms only' },
  { value: 'protein', label: 'All protein', description: 'All protein atoms (slower, wider search)' },
]

// Anchor finding strategy options
const ANCHOR_STRATEGY_OPTIONS = [
  { value: 'bonded', label: 'Bonded', description: 'Follow bonded topology (default, faster)' },
  { value: 'multi-residue', label: 'Multi-residue', description: 'Search across residues (slower, more flexible)' },
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
  const [isSubmitting, setIsSubmitting] = useState(false)
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
    setIsSubmitting(true)

    try {
      let ligandData = ''
      let ligandName = 'ligand'

      // Check for preloaded ligand first (from MD equilibration, Docking, etc.)
      if (abfeStore.preloadedLigand) {
        ligandData = abfeStore.preloadedLigand.data
        ligandName = abfeStore.preloadedLigand.name
      } else if (abfeStore.selectedLigand) {
        const ligandId = abfeStore.selectedLigand

        if (ligandId.startsWith('library_')) {
          const molecules = await api.getMolecules()
          const moleculeId = parseInt(ligandId.replace('library_', ''))
          const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)

          if (!libraryMolecule) throw new Error('Library molecule not found')

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

      const result = await api.submitABFECalculation({
        protein_pdb: currentStructure.pdb_data,
        ligand_sdf: ligandData,
        ligand_id: ligandName,
        protein_id: currentStructure.structure_id || 'protein',
        simulation_settings: abfeStore.abfeParameters,
      })

      abfeStore.setJobId(result.job_id)
      abfeStore.setProgress(0, result.message || 'Calculation submitted')
      abfeStore.addJob({
        job_id: result.job_id,
        status: result.status || 'submitted',
        ligand_id: ligandName,
        protein_id: currentStructure.structure_id || 'protein',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      abfeStore.setABFEResult(result)
      abfeStore.setIsRunning(true)
      abfeStore.setStep(4)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
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
                  abfeStore.setABFEParameters({
                    fast_mode: true,
                    production_length_ns: 0.5,
                    equilibration_length_ns: 0.1,
                    protocol_repeats: 1,
                  })
                } else if (preset === 'production') {
                  abfeStore.setABFEParameters({
                    fast_mode: false,
                    production_length_ns: 10,
                    equilibration_length_ns: 1.0,
                    protocol_repeats: 3,
                  })
                } else {
                  abfeStore.setABFEParameters({
                    fast_mode: false,
                    production_length_ns: 5,
                    equilibration_length_ns: 0.5,
                    protocol_repeats: 3,
                  })
                }
              }}
              accentColor="orange"
            />

            <ParameterSection title="Simulation Settings" collapsible defaultExpanded>
              <SliderParameter
                label="Production Length"
                value={abfeStore.abfeParameters.production_length_ns || 0.5}
                onChange={(v: number) => abfeStore.setABFEParameters({ production_length_ns: v })}
                min={0.1}
                max={20}
                step={0.1}
                unit="ns"
                description="Production sampling time per lambda window"
                accentColor="orange"
              />
              <SliderParameter
                label="Equilibration Length"
                value={abfeStore.abfeParameters.equilibration_length_ns || 0.1}
                onChange={(v: number) => abfeStore.setABFEParameters({ equilibration_length_ns: v })}
                min={0.05}
                max={2}
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
                description="Independent repetitions for statistical confidence"
                accentColor="orange"
              />
            </ParameterSection>

            <ParameterSection title="Ligand Preparation" collapsible defaultExpanded>
              <SelectParameter
                label="Ligand Forcefield"
                value={abfeStore.abfeParameters.ligand_forcefield || 'openff-2.2.1'}
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

            <ParameterSection title="Environment" collapsible defaultExpanded={false}>
              <SliderParameter
                label="Temperature"
                value={abfeStore.abfeParameters.temperature || 298.15}
                onChange={(v: number) => abfeStore.setABFEParameters({ temperature: v })}
                min={273}
                max={373}
                step={0.5}
                unit="K"
                description="Simulation temperature (default: 298.15 K / 25 °C)"
                accentColor="orange"
              />
              <SliderParameter
                label="Pressure"
                value={abfeStore.abfeParameters.pressure || 1.0}
                onChange={(v: number) => abfeStore.setABFEParameters({ pressure: v })}
                min={0.5}
                max={2.0}
                step={0.1}
                unit="bar"
                description="Simulation pressure (default: 1.0 bar)"
                accentColor="orange"
              />
              <SelectParameter
                label="Solvent Model"
                value={abfeStore.abfeParameters.solvent_model || 'tip3p'}
                onChange={(v: string) => abfeStore.setABFEParameters({ solvent_model: v as any })}
                options={SOLVENT_MODEL_OPTIONS}
                description="Water model for solvation"
              />
              <SelectParameter
                label="Box Shape"
                value={abfeStore.abfeParameters.box_shape || 'dodecahedron'}
                onChange={(v: string) => abfeStore.setABFEParameters({ box_shape: v as any })}
                options={BOX_SHAPE_OPTIONS}
                description="Simulation box geometry"
              />
              <SliderParameter
                label="Ionic Strength"
                value={abfeStore.abfeParameters.ionic_strength || 0.15}
                onChange={(v: number) => abfeStore.setABFEParameters({ ionic_strength: v })}
                min={0}
                max={1}
                step={0.05}
                unit="M"
                description="NaCl concentration (physiological: ~0.15 M)"
                accentColor="orange"
              />
            </ParameterSection>

            <ParameterSection title="Restraint Settings (Boresch)" collapsible defaultExpanded={false}>
              <SelectParameter
                label="Host Atom Selection"
                value={abfeStore.abfeParameters.restraint_settings?.host_selection || 'backbone'}
                onChange={(v: string) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, host_selection: v }
                })}
                options={HOST_SELECTION_OPTIONS}
                description="Which protein atoms to search for restraint anchors"
              />
              <SliderParameter
                label="Host Min Distance"
                value={abfeStore.abfeParameters.restraint_settings?.host_min_distance_nm || 0.5}
                onChange={(v: number) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, host_min_distance_nm: v }
                })}
                min={0.1}
                max={2.0}
                step={0.1}
                unit="nm"
                description="Minimum distance from ligand for anchor search (default: 0.5)"
                accentColor="orange"
              />
              <SliderParameter
                label="Host Max Distance"
                value={abfeStore.abfeParameters.restraint_settings?.host_max_distance_nm || 1.5}
                onChange={(v: number) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, host_max_distance_nm: v }
                })}
                min={0.5}
                max={5.0}
                step={0.1}
                unit="nm"
                description="Maximum distance from ligand for anchor search (default: 1.5)"
                accentColor="orange"
              />
              <SliderParameter
                label="RMSF Cutoff"
                value={abfeStore.abfeParameters.restraint_settings?.rmsf_cutoff_nm || 0.1}
                onChange={(v: number) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, rmsf_cutoff_nm: v }
                })}
                min={0.05}
                max={0.5}
                step={0.01}
                unit="nm"
                description="Max RMSF for anchor atoms (lower = more rigid, default: 0.1)"
                accentColor="orange"
              />
              <ToggleParameter
                label="DSSP Filter"
                value={abfeStore.abfeParameters.restraint_settings?.dssp_filter !== false}
                onChange={(v: boolean) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, dssp_filter: v }
                })}
                description="Filter anchors by secondary structure (recommended)"
              />
              <SelectParameter
                label="Anchor Finding Strategy"
                value={abfeStore.abfeParameters.restraint_settings?.anchor_finding_strategy || 'bonded'}
                onChange={(v: string) => abfeStore.setABFEParameters({
                  restraint_settings: { ...abfeStore.abfeParameters.restraint_settings, anchor_finding_strategy: v as any }
                })}
                options={ANCHOR_STRATEGY_OPTIONS}
                description="How to search for anchor atom triplets"
              />
            </ParameterSection>

            <ParameterSection title="Advanced Settings" collapsible defaultExpanded={false}>
              <SliderParameter
                label="Complex Replicas"
                value={abfeStore.abfeParameters.n_replicas_complex || 30}
                onChange={(v: number) => abfeStore.setABFEParameters({ n_replicas_complex: v })}
                min={10}
                max={50}
                step={1}
                description="Lambda replicas for complex leg (default: 30)"
                accentColor="orange"
              />
              <SliderParameter
                label="Solvent Replicas"
                value={abfeStore.abfeParameters.n_replicas_solvent || 14}
                onChange={(v: number) => abfeStore.setABFEParameters({ n_replicas_solvent: v })}
                min={5}
                max={30}
                step={1}
                description="Lambda replicas for solvent leg (default: 14)"
                accentColor="orange"
              />
              <SliderParameter
                label="Minimization Steps"
                value={abfeStore.abfeParameters.minimization_steps || 5000}
                onChange={(v: number) => abfeStore.setABFEParameters({ minimization_steps: v })}
                min={1000}
                max={20000}
                step={1000}
                description="Energy minimization steps (default: 5000)"
                accentColor="orange"
              />
              <SliderParameter
                label="Integrator Timestep"
                value={abfeStore.abfeParameters.timestep_fs || 4.0}
                onChange={(v: number) => abfeStore.setABFEParameters({ timestep_fs: v })}
                min={1}
                max={4}
                step={0.5}
                unit="fs"
                description="Integration timestep (default: 4 fs with HMR)"
                accentColor="orange"
              />
              <SliderParameter
                label="Checkpoints (Production)"
                value={abfeStore.abfeParameters.production_n_checkpoints || 10}
                onChange={(v: number) => abfeStore.setABFEParameters({ production_n_checkpoints: v })}
                min={1}
                max={50}
                step={1}
                description="Number of analysis checkpoints during production"
                accentColor="orange"
              />
              <SliderParameter
                label="Checkpoints (Equilibration)"
                value={abfeStore.abfeParameters.equilibration_n_checkpoints || 5}
                onChange={(v: number) => abfeStore.setABFEParameters({ equilibration_n_checkpoints: v })}
                min={1}
                max={20}
                step={1}
                description="Number of analysis checkpoints during equilibration"
                accentColor="orange"
              />
            </ParameterSection>
          </div>
        )

      case 3: {
        const params = abfeStore.abfeParameters
        const prodNs = params.production_length_ns || 0.5
        const equilNs = params.equilibration_length_ns || 0.1
        const repeats = params.protocol_repeats || 1
        const mode = params.fast_mode ? 'Fast' : prodNs >= 10 ? 'Production' : 'Standard'
        const iterCount = Math.round(prodNs / ((params.time_per_iteration_ps || 2.5) / 1000))
        const complexReplicas = params.n_replicas_complex || 30
        const solventReplicas = params.n_replicas_solvent || 14
        const ligandName = abfeStore.preloadedLigand?.name || abfeStore.selectedLigand || 'None'
        const modeColor = mode === 'Fast' ? 'text-yellow-300' : mode === 'Production' ? 'text-green-300' : 'text-blue-300'

        const configGroups: ConfigGroup[] = [
          {
            title: 'Structures',
            items: [
              { label: 'Protein', value: currentStructure?.structure_id || 'Current structure' },
              { label: 'Ligand', value: ligandName },
              ...(abfeStore.preloadedLigand?.source
                ? [{ label: 'Source', value: abfeStore.preloadedLigand.source.replace('_', ' ') }]
                : []),
            ],
          },
          {
            title: 'Simulation',
            items: [
              { label: 'Preset', value: mode, valueColor: modeColor },
              { label: 'Production', value: `${prodNs} ns (${iterCount.toLocaleString()} iterations)` },
              { label: 'Equilibration', value: `${equilNs} ns` },
              { label: 'Repeats', value: `${repeats}` },
              { label: 'Replicas', value: `Complex: ${complexReplicas}, Solvent: ${solventReplicas}` },
            ],
          },
          {
            title: 'Environment',
            items: [
              { label: 'Temperature', value: `${params.temperature || 298.15} K` },
              { label: 'Pressure', value: `${params.pressure || 1.0} bar` },
              { label: 'Solvent', value: (params.solvent_model || 'tip3p').toUpperCase() },
              { label: 'Box Shape', value: (params.box_shape || 'dodecahedron').charAt(0).toUpperCase() + (params.box_shape || 'dodecahedron').slice(1) },
            ],
          },
          {
            title: 'Ligand Preparation',
            items: [
              { label: 'Forcefield', value: params.ligand_forcefield || 'openff-2.2.1' },
              { label: 'Charge Method', value: (params.charge_method || 'am1bcc').toUpperCase() },
            ],
          },
        ]

        return (
          <ExecutionPanel
            isRunning={false}
            progress={0}
            progressMessage=""
            error={error}
            accentColor="orange"
            configGroups={configGroups}
            runtimeEstimate={{
              value: mode === 'Fast' ? '~15-30 minutes' : mode === 'Standard' ? '~2-4 hours' : '~8-24 hours',
              detail: `${repeats > 1 ? `${repeats} independent repeats` : 'Single run'} · ${complexReplicas + solventReplicas} total replicas · GPU accelerated`,
            }}
          />
        )
      }

      case 4:
        const result = abfeStore.abfeResult

        return (
          <ABFEStepResults
            result={result}
            isRunning={abfeStore.isRunning}
            progress={abfeStore.progress}
            progressMessage={abfeStore.progressMessage}
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
      isRunning={isSubmitting}
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
