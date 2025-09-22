'use client'

import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { useMDStore } from '@/store/md-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { isValidProtein } from '@/lib/structure-validation'
import { MDStepResults } from './MD/MDStepResults'
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
import type { WorkflowStep, StructureOption } from './shared'

// Define workflow steps
const MD_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection', description: 'Choose protein and ligand' },
  { id: 2, label: 'Parameters', description: 'Configure simulation settings' },
  { id: 3, label: 'Execute', description: 'Run optimization' },
  { id: 4, label: 'Results', description: 'View results' },
]

// Simulation length presets (with HMR 4fs timestep)
const SIMULATION_PRESETS = [
  { id: 'short', name: 'Short', description: '~5 min, equilibration only' },
  { id: 'medium', name: 'Medium', description: '~30 min, 10 ns production' },
  { id: 'long', name: 'Long', description: '~60 min, 25 ns production' },
]

export function MDOptimizationTool() {
  const mdStore = useMDStore()
  const { currentStructure } = useMolecularStore()
  const { addNotification } = useUIStore()
  const [error, setError] = useState<string | null>(null)
  const [currentPreviewJobId, setCurrentPreviewJobId] = useState<string | null>(null)
  const [currentMinimizedJobId, setCurrentMinimizedJobId] = useState<string | null>(null)

  // Track preview job when it completes with preview_ready status
  useEffect(() => {
    if (mdStore.mdResult?.status === 'preview_ready' && mdStore.jobId) {
      setCurrentPreviewJobId(mdStore.jobId)
    }
  }, [mdStore.mdResult, mdStore.jobId])

  // Track minimized job when it completes with minimized_ready status
  useEffect(() => {
    if (mdStore.mdResult?.status === 'minimized_ready' && mdStore.jobId) {
      setCurrentMinimizedJobId(mdStore.jobId)
    }
  }, [mdStore.mdResult, mdStore.jobId])

  // Fetch library molecules on mount
  useEffect(() => {
    if (mdStore.ligandInput.file_data && mdStore.ligandInput.method === 'structure') {
      if (currentStructure?.pdb_data && !mdStore.selectedProtein) {
        mdStore.setSelectedProtein(currentStructure.structure_id || 'current')
      }
      return
    }

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
        mdStore.setAvailableLigands(allLigands)

        if (currentStructure?.pdb_data && isValidProtein(currentStructure)) {
          mdStore.setSelectedProtein(currentStructure.structure_id || 'current')
          if (allLigands.length > 0) {
            mdStore.setLigandInput({ ligand_id: allLigands[0].id })
          }
        }
      } catch (err) {
        console.error('Failed to fetch library molecules:', err)
      }
    }

    fetchLibraryMolecules()
  }, [currentStructure])

  const runMD = async (options?: { previewAcknowledged?: boolean; minimizedAcknowledged?: boolean }) => {
    setError(null)
    // Clear previous results and active job if starting a fresh run
    if (!options?.previewAcknowledged && !options?.minimizedAcknowledged) {
      mdStore.resetResults()
    }
    mdStore.setIsRunning(true)
    mdStore.setStep(4)

    try {
      let ligandInput = { ...mdStore.ligandInput }
      let ligandName = 'ligand'  // Track ligand name for job display

      if (mdStore.ligandInput.method === 'none') {
        // protein-only: no ligand data needed
        ligandName = 'none'
      } else if (mdStore.ligandInput.method === 'existing' && mdStore.ligandInput.ligand_id) {
        const ligandId = mdStore.ligandInput.ligand_id

        if (ligandId.startsWith('library_')) {
          mdStore.setProgress(5, 'Loading molecule from library...')
          const molecules = await api.getMolecules()
          const moleculeId = parseInt(ligandId.replace('library_', ''))
          const libraryMolecule = molecules?.find((m: any) => m.id === moleculeId)

          if (!libraryMolecule) throw new Error('Library molecule not found')

          mdStore.setProgress(10, `Converting ${libraryMolecule.name} to 3D...`)
          const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
          const structureData = smilesResult.sdf_data || smilesResult.pdb_data || ''

          ligandName = libraryMolecule.name  // Use library molecule name
          ligandInput = {
            ...ligandInput,
            file_data: structureData,
            file_name: `${libraryMolecule.name}.${smilesResult.sdf_data ? 'sdf' : 'pdb'}`,
            preserve_pose: false,
            generate_conformer: false,
          }
        } else {
          const ligand = currentStructure?.ligands?.[ligandId]
          if (ligand) {
            ligandName = ligand.residue_name || ligandId  // Use residue name or ID
            ligandInput = {
              ...ligandInput,
              file_data: ligand.sdf_data || ligand.pdb_data,
              file_name: `${ligand.residue_name || ligandId}.${ligand.sdf_data ? 'sdf' : 'pdb'}`,
              preserve_pose: true,
            }
          }
        }
      } else if (mdStore.ligandInput.file_name) {
        // For uploaded files, use the file name
        ligandName = mdStore.ligandInput.file_name.replace(/\.(sdf|pdb|mol2)$/i, '')
      }

      const result = await api.optimizeMD({
        protein_id: mdStore.selectedProtein || undefined,
        protein_name: currentStructure?.structure_id || 'protein',
        ligand_name: ligandName,
        protein_data: currentStructure?.pdb_data,
        ligand_input: ligandInput,
        parameters: mdStore.mdParameters,
        preview_before_equilibration: mdStore.mdParameters.preview_before_equilibration ?? false,
        preview_acknowledged: options?.previewAcknowledged ?? false,
        pause_at_minimized: mdStore.mdParameters.pause_at_minimized ?? false,
        minimization_only: mdStore.mdParameters.minimization_only ?? false,
        minimized_acknowledged: options?.minimizedAcknowledged ?? false,
      }, mdStore.setProgress)

      // If job_id is returned in the result (it should be now), set it in the store
      // Note: api-client optimizeMD transformation might need update to pass through job_id if it's in the response
      // For now, we rely on the store update in api-client or here.
      if (result.job_id) {
        mdStore.setJobId(result.job_id)
        mdStore.setActiveJob(result.job_id)
        // Refresh job list
        const jobsResponse = await api.listMDJobs()
        if (jobsResponse.jobs) {
          mdStore.setJobs(jobsResponse.jobs)
        }
      }

      mdStore.setMDResult(result)
      if (result.status !== 'preview_ready' && result.status !== 'minimized_ready' && !result.success) {
        setError(result.error || 'Optimization failed')
      }
    } catch (err: any) {
      setError(err.message)
      mdStore.setIsRunning(false)
    }
  }

  const isProteinOnly = mdStore.selectedLigandMethod === 'none'

  const canProceed = mdStore.selectedProtein && isValidProtein(currentStructure) && (
    isProteinOnly ||
    mdStore.ligandInput.ligand_id ||
    mdStore.ligandInput.smiles ||
    mdStore.ligandInput.file_data
  )

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      mdStore.setLigandInput({
        file_data: e.target?.result as string,
        file_name: file.name,
        method: 'structure'
      })
    }
    reader.readAsText(file)
  }

  const handleResumePreview = async () => {
    try {
      if (!currentPreviewJobId) {
        addNotification('error', 'Preview job ID not found')
        return
      }

      await mdStore.resumeJob(currentPreviewJobId)
      addNotification('success', 'MD job resumed - continuing equilibration')
      // Job will reappear in joblist via WebSocket updates
    } catch (error) {
      console.error('Failed to resume MD preview:', error)
      addNotification('error', `Failed to resume job: ${(error as any).message || 'Unknown error'}`)
    }
  }

  const handleResumeMinimized = async () => {
    try {
      if (!currentMinimizedJobId) {
        addNotification('error', 'Minimization job ID not found')
        return
      }

      await mdStore.resumeJob(currentMinimizedJobId)
      addNotification('success', 'MD job resumed - continuing equilibration')
      // Job will reappear in joblist via WebSocket updates
    } catch (error) {
      console.error('Failed to resume minimized job:', error)
      addNotification('error', `Failed to resume job: ${(error as any).message || 'Unknown error'}`)
    }
  }

  const renderStepContent = () => {
    switch (mdStore.currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Ligand Mode Toggle */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">Ligand Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    mdStore.setSelectedLigandMethod('existing')
                    mdStore.setLigandInput({ ligand_id: undefined })
                  }}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${!isProteinOnly
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="font-medium text-white text-sm">Protein + Ligand</div>
                  <div className="text-xs text-gray-400">Standard complex simulation</div>
                </button>
                <button
                  onClick={() => mdStore.setSelectedLigandMethod('none')}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${isProteinOnly
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="font-medium text-white text-sm">Protein Only</div>
                  <div className="text-xs text-gray-400">AMBER14, no ligand required</div>
                </button>
              </div>
            </div>

            <StructureSelector
              selectedProtein={isValidProtein(currentStructure) ? mdStore.selectedProtein : null}
              onProteinSelect={mdStore.setSelectedProtein}
              hasProtein={isValidProtein(currentStructure)}
              proteinName={currentStructure?.structure_id}
              selectedLigand={isProteinOnly ? null : (mdStore.ligandInput.ligand_id || null)}
              onLigandSelect={(id: string | null) => mdStore.setLigandInput({ ligand_id: id || undefined })}
              availableLigands={isProteinOnly ? [] : mdStore.availableLigands}
              ligandInputMethod={isProteinOnly ? 'existing' : mdStore.selectedLigandMethod}
              onLigandMethodChange={isProteinOnly ? undefined : mdStore.setSelectedLigandMethod}
              showLigandInput={!isProteinOnly}
              showSmilesInput={!isProteinOnly}
              smilesValue={mdStore.ligandInput.smiles}
              onSmilesChange={(smiles: string) => mdStore.setLigandInput({ smiles })}
              showFileUpload={!isProteinOnly}
              onFileUpload={handleFileUpload}
              uploadedFileName={mdStore.ligandInput.file_name}
              accentColor="green"
            />
            <InfoBox variant="info" title="About MD Optimization">
              {isProteinOnly ? (
                <p>
                  Protein-only MD uses AMBER14 directly in OpenMM — no ligand
                  parametrization needed. Useful for apo-state dynamics,
                  conformational studies, and stability checks.
                </p>
              ) : (
                <p>
                  Molecular Dynamics optimization uses OpenMM and OpenFF to relax
                  protein-ligand complexes. This helps refine docked poses and
                  identify stable binding conformations.
                </p>
              )}
            </InfoBox>
          </div>
        )

      case 2:
        const isMinimizationOnly = mdStore.mdParameters.minimization_only ?? false

        return (
          <div className="space-y-6">
            {/* Primary workflow choice */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">Workflow Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => mdStore.setMDParameters({ minimization_only: true, preview_before_equilibration: false })}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${isMinimizationOnly
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="font-medium text-white mb-1">Minimization Only</div>
                  <div className="text-xs text-gray-400">
                    Quick energy minimization to remove steric clashes. Fast (~1-2 min).
                  </div>
                </button>
                <button
                  onClick={() => mdStore.setMDParameters({ minimization_only: false })}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${!isMinimizationOnly
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="font-medium text-white mb-1">Full Equilibration</div>
                  <div className="text-xs text-gray-400">
                    Complete MD protocol with NVT & NPT equilibration for production-ready structures.
                  </div>
                </button>
              </div>
            </div>

            {/* Show equilibration settings only when not minimization-only */}
            {!isMinimizationOnly && (
              <>
                <PresetSelector
                  label="Simulation Length"
                  presets={SIMULATION_PRESETS}
                  selectedPreset={mdStore.mdParameters.simulation_length}
                  onPresetSelect={(preset: string) => mdStore.setSimulationLength(preset as any)}
                  accentColor="green"
                />

                <ParameterSection title="Temperature & Pressure" collapsible defaultExpanded>
                  <SliderParameter
                    label="Temperature"
                    value={mdStore.mdParameters.temperature}
                    onChange={(v: number) => mdStore.setTemperature(v)}
                    min={250}
                    max={400}
                    step={5}
                    unit="K"
                    description="Simulation temperature in Kelvin"
                    accentColor="green"
                  />
                  <SliderParameter
                    label="Pressure"
                    value={mdStore.mdParameters.pressure}
                    onChange={(v: number) => mdStore.setPressure(v)}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    unit="bar"
                    description="Simulation pressure"
                    accentColor="green"
                  />
                  <SliderParameter
                    label="Ionic Strength"
                    value={mdStore.mdParameters.ionic_strength}
                    onChange={(v: number) => mdStore.setIonicStrength(v)}
                    min={0}
                    max={0.5}
                    step={0.05}
                    unit="M"
                    description="Salt concentration"
                    accentColor="green"
                  />
                </ParameterSection>

                <ParameterSection title="System Setup" collapsible defaultExpanded>
                  <SelectParameter
                    label="Box Shape"
                    value={mdStore.mdParameters.box_shape || 'dodecahedron'}
                    onChange={(v: string) => mdStore.setMDParameters({ box_shape: v as any })}
                    options={[
                      { value: 'dodecahedron', label: 'Rhombic Dodecahedron (Recommended)' },
                      { value: 'cubic', label: 'Cubic' },
                    ]}
                    description="Dodecahedron uses ~29% fewer water molecules than cubic, significantly reducing computation time."
                    accentColor="green"
                  />
                </ParameterSection>

                {!isProteinOnly && (
                  <ParameterSection title="Force Field Settings" collapsible defaultExpanded={false}>
                    <SelectParameter
                      label="Charge Method"
                      value={mdStore.mdParameters.charge_method || 'am1bcc'}
                      onChange={(v: string) => mdStore.setMDParameters({ charge_method: v as any })}
                      options={[
                        { value: 'am1bcc', label: 'AM1-BCC (Recommended, high quality)' },
                        { value: 'mmff94', label: 'MMFF94 (Fast, strict atom typing)' },
                        { value: 'gasteiger', label: 'Gasteiger (Fast, permissive)' },
                        { value: 'orca', label: 'ORCA QC (Very slow, handles anything)' },
                      ]}
                      description="AM1-BCC provides publication-quality charges via AmberTools. Use MMFF94 for quick tests or ORCA for exotic chemistry."
                      accentColor="green"
                    />
                    <SelectParameter
                      label="Force Field"
                      value={mdStore.mdParameters.forcefield_method || 'openff-2.2.0'}
                      onChange={(v: string) => mdStore.setMDParameters({ forcefield_method: v as any })}
                      options={[
                        { value: 'openff-2.2.0', label: 'OpenFF-2.2.0 (Modern, limited atoms)' },
                        { value: 'gaff', label: 'GAFF (Classic, broad coverage)' },
                        { value: 'gaff2', label: 'GAFF2 (Modern GAFF, more atoms)' },
                      ]}
                      description="Force field for ligand parametrization. OpenFF is modern but may fail on exotic atoms (e.g., carbenes). GAFF/GAFF2 have broader atom type coverage."
                      accentColor="green"
                    />
                  </ParameterSection>
                )}

                <ParameterSection title="Advanced Options" collapsible defaultExpanded={false}>
                  <ToggleParameter
                    label="Preview Before Equilibration"
                    value={mdStore.mdParameters.preview_before_equilibration ?? false}
                    onChange={(v: boolean) => mdStore.setMDParameters({ preview_before_equilibration: v })}
                    description="Pause after minimization to review structure before continuing"
                    accentColor="green"
                  />
                </ParameterSection>
              </>
            )}

            {/* Info box based on selection */}
            {isMinimizationOnly ? (
              <InfoBox variant="info" title="Minimization Only">
                <p>
                  {isProteinOnly
                    ? 'Protein-only MD uses AMBER14 directly in OpenMM — no ligand parametrization needed.'
                    : 'Energy minimization removes bad contacts and relaxes the structure. This is useful for quick refinement of docked poses or preparing structures for visualization.'}
                </p>
              </InfoBox>
            ) : (
              <InfoBox variant="info" title="Full Equilibration">
                <p>
                  {isProteinOnly
                    ? 'Protein-only MD uses AMBER14 directly in OpenMM — no ligand parametrization needed. The protocol runs restrained minimization, NVT heating, and NPT equilibration using HMR with 4 fs timestep.'
                    : 'The protocol uses positional restraints to prevent ligand ejection: restrained minimization, restrained NVT heating, then gradual restraint release during NPT (7 stages from 10→0 kcal/mol/A²). Medium and Long presets include production MD with trajectory output. Uses HMR with 4 fs timestep for efficiency.'}
                </p>
              </InfoBox>
            )}
          </div>
        )

      case 3:
        return (
          <ExecutionPanel
            isRunning={false}
            progress={0}
            progressMessage=""
            completedStages={[]}
            error={error}
            accentColor="green"
            configSummary={[
              { label: 'Protein', value: currentStructure?.structure_id || 'Current' },
              isProteinOnly
                ? { label: 'Mode', value: 'Protein Only (AMBER14)' }
                : { label: 'Ligand', value: mdStore.ligandInput.ligand_id || mdStore.ligandInput.file_name || 'None' },
              { label: 'Workflow', value: mdStore.mdParameters.minimization_only ? 'Minimization Only' : 'Full Equilibration' },
              ...(!mdStore.mdParameters.minimization_only ? [
                { label: 'Simulation Length', value: mdStore.mdParameters.simulation_length?.charAt(0).toUpperCase() + mdStore.mdParameters.simulation_length?.slice(1) || 'Short' },
                { label: 'Box Shape', value: mdStore.mdParameters.box_shape === 'cubic' ? 'Cubic' : 'Rhombic Dodecahedron' },
              ] : []),
              { label: 'Temperature', value: `${mdStore.mdParameters.temperature} K` },
              { label: 'Pressure', value: `${mdStore.mdParameters.pressure} bar` },
              { label: 'Ionic Strength', value: `${mdStore.mdParameters.ionic_strength} M` },
              ...(!isProteinOnly ? [{ label: 'Charge Method', value: (mdStore.mdParameters.charge_method || 'am1bcc').toUpperCase() }] : []),
              ...(!mdStore.mdParameters.minimization_only && mdStore.mdParameters.preview_before_equilibration ? [
                { label: 'Preview Before Equilibration', value: 'Yes' },
              ] : []),
            ]}
          />
        )

      case 4:
        return (
          <MDStepResults
            result={mdStore.mdResult}
            isRunning={mdStore.isRunning}
            progress={mdStore.progress}
            progressMessage={mdStore.progressMessage}
            completedStages={mdStore.completedStages}
            onResumePreview={handleResumePreview}
            onResumeMinimized={handleResumeMinimized}
            parameters={mdStore.mdParameters}
          />
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="MD Optimization"
      description="Optimize protein structures and complexes using molecular dynamics"
      icon={<Activity className="h-5 w-5 text-green-400" />}
      showHeader={false}
      steps={MD_STEPS}
      currentStep={mdStore.currentStep}
      onStepClick={(step: number) => mdStore.setStep(step)}
      onBack={mdStore.previousStep}
      onNext={mdStore.nextStep}
      onReset={mdStore.reset}
      onExecute={() => runMD()}
      canProceed={!!canProceed}
      isRunning={mdStore.isRunning && mdStore.currentStep === 4}
      allowStepNavigationWhileRunning={true}
      executeLabel="Start MD"
      showExecuteOnStep={3}
      accentColor="green"
      error={error}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}
