'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Target, Layers, Check } from 'lucide-react'
import { useBoltz2Store } from '@/store/boltz2-store'
import { useMolecularStore } from '@/store/molecular-store'
import { useUnifiedResultsStore } from '@/store/unified-results-store'
import { api } from '@/lib/api-client'
import { isValidProtein } from '@/lib/structure-validation'
import { Boltz2StepResults } from './Boltz2/Boltz2StepResults'
import {
  WorkflowContainer,
  StructureSelector,
  ParameterSection,
  SliderParameter,
  SelectParameter,
  ToggleParameter,
  ExecutionPanel,
  InfoBox,
} from './shared'
import type { WorkflowStep, StructureOption } from './shared'

// Define workflow steps
const BOLTZ2_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Selection', description: 'Choose protein and ligand' },
  { id: 2, label: 'Parameters', description: 'Configure prediction settings' },
  { id: 3, label: 'Execute', description: 'Run prediction' },
  { id: 4, label: 'Results', description: 'View results' },
]

interface LibraryMolecule {
  id: number
  name: string
  canonical_smiles: string
}

interface UploadedLigand {
  fileName: string
  fileData: string
  format: 'pdb' | 'sdf'
}

export function Boltz2Tool() {
  const boltzStore = useBoltz2Store()
  const { currentStructure } = useMolecularStore()
  const unifiedResultsStore = useUnifiedResultsStore()
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [libraryMolecules, setLibraryMolecules] = useState<LibraryMolecule[]>([])

  // Ligand Input State (matching DockingTool)
  const [ligandInputMethod, setLigandInputMethod] = useState<'existing' | 'smiles' | 'structure' | 'hetid'>('existing')
  const [uploadedLigand, setUploadedLigand] = useState<UploadedLigand | null>(null)
  const [uploadedLigandsData, setUploadedLigandsData] = useState<Record<string, UploadedLigand>>({})
  const [hetidValue, setHetidValue] = useState('')
  const [hetidValidation, setHetidValidation] = useState<{ valid: boolean; message?: string } | null>(null)

  // We use boltzStore.selectedLigand, boltzStore.batchLigands, boltzStore.ligandSmiles

  // Check service availability and fetch library molecules
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        const status = await api.getBoltz2Status()
        boltzStore.setServiceAvailable(status.available)
      } catch {
        boltzStore.setServiceAvailable(false)
      }
    }
    checkServiceStatus()

    const fetchLibraryMolecules = async () => {
      try {
        const molecules = await api.getMolecules()
        setLibraryMolecules(Array.isArray(molecules) ? molecules : [])
      } catch {
        setLibraryMolecules([])
      }
    }
    fetchLibraryMolecules()
  }, [])

  // Auto-select current structure
  useEffect(() => {
    if (currentStructure?.pdb_data && isValidProtein(currentStructure)) {
      boltzStore.setSelectedProtein('current')
      boltzStore.setProteinSource('current')

      if (currentStructure.ligands && Object.keys(currentStructure.ligands).length > 0) {
        const ligandIds = Object.keys(currentStructure.ligands)
        if (ligandIds.length > 0 && !boltzStore.selectedLigand) {
          boltzStore.setSelectedLigand(ligandIds[0])
          boltzStore.setLigandSource('current')
        }
      }
    } else {
      boltzStore.setSelectedProtein(null)
      boltzStore.setProteinSource(null)
    }
  }, [currentStructure])

  const handleValidateHetid = async () => {
    if (!hetidValue.trim()) {
      setHetidValidation({ valid: false, message: 'HET ID cannot be empty' })
      return
    }

    if (!currentStructure?.pdb_data) {
      setHetidValidation({ valid: false, message: 'No protein structure loaded' })
      return
    }

    try {
      setHetidValidation({ valid: false, message: 'Extracting ligand...' })
      const result = await api.extractLigandByHETID(currentStructure.pdb_data, hetidValue)
      
      // Add to uploaded ligands data
      const ligandId = `hetid_${hetidValue}`
      const ligandName = (result as any).ligand_name || hetidValue
      setUploadedLigandsData(prev => ({
        ...prev,
        [ligandId]: {
          fileName: ligandName,
          fileData: result.sdf_data || result.pdb_data || '',
          format: result.format === 'sdf' ? 'sdf' : 'pdb'
        }
      }))
      
      // Auto-select the extracted ligand
      boltzStore.setSelectedLigand(ligandId)
      boltzStore.setLigandSource('upload')
      
      setHetidValidation({ valid: true, message: `Successfully extracted ${hetidValue}` })
      setHetidValue('')
    } catch (err: any) {
      setHetidValidation({ valid: false, message: err.response?.data?.detail || 'Failed to extract ligand' })
    }
  }

  const getAvailableLigands = (): StructureOption[] => {
    const ligands: StructureOption[] = []

    // Add structure ligands
    if (currentStructure?.ligands) {
      Object.entries(currentStructure.ligands).forEach(([id, ligand]: [string, any]) => {
        ligands.push({
          id,
          name: ligand.residue_name || id,
          source: 'current_structure',
        })
      })
    }

    // Add library molecules
    libraryMolecules.forEach(mol => {
      ligands.push({
        id: `library_${mol.id}`,
        name: `${mol.name} (Library)`,
        source: 'library',
      })
    })

    // Add uploaded ligands
    Object.entries(uploadedLigandsData).forEach(([id, data]) => {
      ligands.push({
        id,
        name: `${data.fileName} (Uploaded)`,
        source: 'upload',
      })
    })

    return ligands
  }

  // Poll for job completion
  const pollJobStatus = async (jobId: string): Promise<void> => {
    const maxAttempts = 120 // 10 minutes max (5s intervals)
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        const jobDetails = await api.getJobDetails(jobId)
        const status = jobDetails.status
        const progress = jobDetails.progress || 0
        const message = jobDetails.message || 'Running prediction...'

        // Update progress (30-90% range for actual prediction)
        const displayProgress = 30 + Math.min(progress * 0.6, 60)
        boltzStore.setProgress(displayProgress, message)

        if (status === 'completed') {
          // Job completed - extract results
          const result = jobDetails.result
          if (result) {
            boltzStore.setProgress(95, 'Processing results...')
            boltzStore.setResult({
              success: true,
              job_id: jobId,
              ...result,
            })

            if (result.poses && result.poses.length > 0) {
              boltzStore.setSelectedPose(0)
            }

            boltzStore.setProgress(100, 'Prediction complete!')
          } else {
            throw new Error('Job completed but no results found')
          }
          return
        } else if (status === 'failed') {
          throw new Error(jobDetails.error_message || 'Prediction failed')
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 5000))
        attempts++
      } catch (err: any) {
        // If it's a network error, keep trying
        if (err.message?.includes('Network') || err.code === 'ECONNABORTED') {
          await new Promise(resolve => setTimeout(resolve, 5000))
          attempts++
          continue
        }
        throw err
      }
    }

    throw new Error('Prediction timed out after 10 minutes')
  }

  const runPrediction = async () => {
    setError(null)
    setWarnings([])
    boltzStore.setIsRunning(true)
    boltzStore.setStep(4)
    boltzStore.setProgress(0, 'Initializing prediction...')

    try {
      if (!currentStructure?.pdb_data) {
        throw new Error('No protein structure available')
      }

      boltzStore.setOriginalStructureData(currentStructure.pdb_data)

      let ligandData = ''

      // Resolve selected ligand data
      // Resolve selected ligand data
      const selectedLigandId = boltzStore.selectedLigand
      if (!selectedLigandId) throw new Error('No ligand selected')

      let ligandName = selectedLigandId

      if (selectedLigandId.startsWith('library_')) {
        const moleculeId = parseInt(selectedLigandId.replace('library_', ''))
        const libraryMolecule = libraryMolecules.find(m => m.id === moleculeId)
        if (!libraryMolecule) throw new Error('Library molecule not found')

        boltzStore.setProgress(10, `Converting ${libraryMolecule.name} to 3D...`)
        const smilesResult = await api.uploadSmiles(libraryMolecule.canonical_smiles, libraryMolecule.name)
        ligandData = smilesResult.sdf_data || smilesResult.pdb_data || ''
        ligandName = libraryMolecule.name
        if (!ligandData) throw new Error('Failed to convert SMILES')
      } else if (uploadedLigandsData[selectedLigandId]) {
        ligandData = uploadedLigandsData[selectedLigandId].fileData
        ligandName = uploadedLigandsData[selectedLigandId].fileName
      } else {
        const ligand = currentStructure.ligands?.[selectedLigandId]
        if (!ligand) throw new Error('Selected ligand not found in structure')
        ligandData = ligand.sdf_data || ligand.pdb_data || ''
        ligandName = (ligand as any).name || ligand.residue_name || selectedLigandId
      }

      if (!ligandData) throw new Error('No ligand data available')

      boltzStore.setProgress(20, 'Validating structures...')
      const validation = await api.validateBoltz2Input(currentStructure.pdb_data, ligandData)
      if (!validation.valid) throw new Error(validation.error || 'Validation failed')

      boltzStore.setProgress(25, 'Submitting job to queue...')
      const submitResult = await api.predictBoltz2(
        currentStructure.pdb_data,
        ligandData,
        boltzStore.predictionParams,
        boltzStore.alignmentOptions,
        boltzStore.msaOptions,
        currentStructure.structure_id,
        ligandName
      )

      if (!submitResult.success) {
        throw new Error(submitResult.error || 'Failed to submit job')
      }

      if (!submitResult.job_id) {
        throw new Error('No job ID returned from submission')
      }

      // Set active job and start polling
      boltzStore.setActiveJob(submitResult.job_id)
      boltzStore.setProgress(30, 'Running Boltz-2 prediction...')

      // Refresh unified results store to show job in recent list
      await unifiedResultsStore.loadAllJobs()

      // Poll for job completion
      await pollJobStatus(submitResult.job_id)

      // Refresh job lists after completion
      const jobsResponse = await api.listBoltz2Jobs()
      if (jobsResponse.jobs) {
        boltzStore.setJobs(jobsResponse.jobs)
      }
      await unifiedResultsStore.loadAllJobs()

    } catch (err: any) {
      setError(err.message || 'Prediction failed')
      boltzStore.setResult({ success: false, error: err.message })
    } finally {
      boltzStore.setIsRunning(false)
    }
  }

  const runBatchPrediction = async () => {
    setError(null)
    setWarnings([])
    boltzStore.setIsRunning(true)
    boltzStore.setStep(4)
    boltzStore.clearBatchResults()
    boltzStore.setProgress(0, 'Initializing batch prediction...')

    try {
      if (!currentStructure?.pdb_data) {
        throw new Error('No protein structure available')
      }

      // Build ligands array from batchLigands
      const ligands = boltzStore.batchLigands.map(id => {
        if (id.startsWith('library_')) {
          const mol = libraryMolecules.find(m => `library_${m.id}` === id)
          return {
            id,
            name: mol?.name || id,
            data: mol?.canonical_smiles || '',
            format: 'smiles' as const
          }
        } else if (uploadedLigandsData[id]) {
          const uploaded = uploadedLigandsData[id]
          return {
            id,
            name: uploaded.fileName,
            data: uploaded.fileData,
            format: uploaded.format
          }
        } else {
          const ligand = currentStructure?.ligands?.[id]
          // Prefer SMILES > SDF > PDB (PDB format is not supported by Boltz2 validation)
          const data = ligand?.smiles || ligand?.sdf_data || ligand?.pdb_data || ''
          const format = ligand?.smiles ? 'smiles' as const : 'sdf' as const
          return {
            id,
            name: id,
            data,
            format
          }
        }
      })

      if (ligands.length === 0) {
        throw new Error('No ligands selected for batch prediction')
      }

      boltzStore.setProgress(10, `Submitting batch of ${ligands.length} ligands to queue...`)

      const result = await api.batchPredictBoltz2(
        currentStructure.pdb_data,
        ligands,
        boltzStore.predictionParams,
        boltzStore.msaOptions,
        currentStructure.structure_id,
        boltzStore.alignmentOptions
      )

      if (!result.success) {
        throw new Error(result.error || 'Batch prediction failed')
      }

      // Set active job for tracking and refresh job list
      boltzStore.setActiveJob(result.job_id)
      boltzStore.setProgress(15, `Batch job submitted (${ligands.length} ligands). Running predictions...`)

      // Refresh unified results store to show job in recent list
      await unifiedResultsStore.loadAllJobs()

      // Poll for job completion using existing pollJobStatus
      await pollJobStatus(result.job_id)

      // On completion, refresh job lists
      const jobsResponse = await api.listBoltz2Jobs()
      if (jobsResponse.jobs) {
        boltzStore.setJobs(jobsResponse.jobs)
      }
      await unifiedResultsStore.loadAllJobs()

    } catch (err: any) {
      setError(err.message || 'Batch prediction failed')
    } finally {
      boltzStore.setIsRunning(false)
    }
  }

  const canProceed = (): boolean => {
    if (boltzStore.currentStep === 1) {
      if (boltzStore.isBatchMode) {
        return boltzStore.batchLigands.length >= 2 && isValidProtein(currentStructure)
      }
      return !!(boltzStore.selectedLigand && isValidProtein(currentStructure))
    }
    return true
  }

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const extension = file.name.split('.').pop()?.toLowerCase()
      const format = (extension === 'mol' ? 'sdf' : extension) as 'pdb' | 'sdf'
      const id = `upload_${Date.now()}`

      const newUploadedLigand: UploadedLigand = {
        fileName: file.name,
        fileData: content,
        format: format || 'pdb',
      }

      setUploadedLigand(newUploadedLigand)
      setUploadedLigandsData(prev => ({
        ...prev,
        [id]: newUploadedLigand
      }))

      if (boltzStore.isBatchMode) {
        boltzStore.toggleBatchLigand(id)
      } else {
        setLigandInputMethod('existing')
        boltzStore.setSelectedLigand(id)
        boltzStore.setLigandSource('upload')
      }
    }
    reader.readAsText(file)
  }

  const handleValidateSmiles = async () => {
    if (!boltzStore.ligandSmiles) return

    try {
      boltzStore.setProgress(0, 'Validating SMILES...')
      // Upload SMILES to get 3D structure
      const result = await api.uploadSmiles(boltzStore.ligandSmiles, `SMILES_${Date.now()}`)

      const id = `smiles_${Date.now()}`
      const name = `SMILES: ${boltzStore.ligandSmiles.substring(0, 15)}...`
      const data = result.sdf_data || result.pdb_data || ''
      const format = result.sdf_data ? 'sdf' : 'pdb'

      const newUploadedLigand: UploadedLigand = {
        fileName: name,
        fileData: data,
        format: format
      }

      setUploadedLigandsData(prev => ({
        ...prev,
        [id]: newUploadedLigand
      }))

      if (boltzStore.isBatchMode) {
        boltzStore.toggleBatchLigand(id)
      } else {
        setLigandInputMethod('existing')
        boltzStore.setSelectedLigand(id)
        boltzStore.setLigandSource('smiles')
      }
    } catch (err: any) {
      setError(err.message || 'Invalid SMILES')
    }
  }

  const handleSelectBatchLigand = (ligandId: string) => {
    boltzStore.toggleBatchLigand(ligandId)
  }

  const renderStepContent = () => {
    const availableLigands = getAvailableLigands()

    switch (boltzStore.currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Workflow Mode Selector (Unified UI) */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">Prediction Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => boltzStore.setIsBatchMode(false)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${!boltzStore.isBatchMode
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Target className={`w-4 h-4 ${!boltzStore.isBatchMode ? 'text-purple-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Single Ligand</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Predict affinity for one ligand. Best for detailed analysis.
                  </div>
                </button>
                <button
                  onClick={() => boltzStore.setIsBatchMode(true)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${boltzStore.isBatchMode
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className={`w-4 h-4 ${boltzStore.isBatchMode ? 'text-purple-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Batch Mode</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Screen multiple ligands sequentially. Efficient for virtual screening.
                  </div>
                </button>
              </div>
            </div>

            <StructureSelector
              selectedProtein={isValidProtein(currentStructure) ? 'current' : null}
              onProteinSelect={() => { }}
              hasProtein={isValidProtein(currentStructure)}
              proteinName={currentStructure?.structure_id}
              selectedLigand={!boltzStore.isBatchMode ? boltzStore.selectedLigand : null}
              onLigandSelect={(id: string | null) => boltzStore.setSelectedLigand(id)}
              availableLigands={availableLigands}
              accentColor="purple"
              showLigandInput={!boltzStore.isBatchMode}
              ligandInputMethod={ligandInputMethod}
              onLigandMethodChange={setLigandInputMethod}
              showSmilesInput={true}
              smilesValue={boltzStore.ligandSmiles}
              onSmilesChange={boltzStore.setLigandSmiles}
              onValidateSmiles={handleValidateSmiles}
              showFileUpload={true}
              onFileUpload={handleFileUpload}
              uploadedFileName={uploadedLigand?.fileName}
              hetidValue={hetidValue}
              onHetidChange={setHetidValue}
              hetidValidation={hetidValidation}
              onValidateHetid={handleValidateHetid}
            />

            {!boltzStore.serviceAvailable && (
              <InfoBox variant="warning" title="Service Unavailable">
                Boltz-2 service is not available. Please check the backend.
              </InfoBox>
            )}

            <InfoBox variant="info" title="About Boltz-2">
              <p>
                Boltz-2 predicts protein-ligand binding affinity using deep learning.
                It provides confidence scores and multiple pose predictions.
              </p>
            </InfoBox>

            {/* Batch Mode List */}
            {boltzStore.isBatchMode && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-white">Select Ligands for Batch Screening</h4>
                  <div className="flex gap-2">
                    <label className="text-xs px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded cursor-pointer transition-colors">
                      Upload Ligand
                      <input
                        type="file"
                        accept=".pdb,.sdf,.mol"
                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div className="text-xs text-gray-400 mb-2">
                  {boltzStore.batchLigands.length} selected
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableLigands.length === 0 ? (
                    <InfoBox variant="warning" title="No Ligands Available">
                      Please load a structure with ligands or add molecules to the library.
                    </InfoBox>
                  ) : (
                    availableLigands.map((ligand) => (
                      <label
                        key={ligand.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all group ${boltzStore.batchLigands.includes(ligand.id!)
                          ? 'bg-purple-500/10 border-purple-500/50'
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                          }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${boltzStore.batchLigands.includes(ligand.id!)
                          ? 'bg-purple-600 border-purple-600'
                          : 'bg-gray-900 border-gray-600 group-hover:border-gray-500'
                          }`}>
                          {boltzStore.batchLigands.includes(ligand.id!) && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <input
                          type="checkbox"
                          checked={boltzStore.batchLigands.includes(ligand.id!)}
                          onChange={() => handleSelectBatchLigand(ligand.id!)}
                          className="hidden"
                        />
                        <span className={`text-sm transition-colors ${boltzStore.batchLigands.includes(ligand.id!) ? 'text-white' : 'text-gray-300 group-hover:text-white'
                          }`}>
                          {ligand.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <ParameterSection title="Prediction Settings" collapsible defaultExpanded>
              {/* Number of poses slider removed - fixed to 1 */}
              <SelectParameter
                label="Accelerator"
                value={boltzStore.predictionParams.accelerator || 'gpu'}
                onChange={(v: string) => boltzStore.setPredictionParams({ accelerator: v as 'gpu' | 'cpu' })}
                options={[
                  { value: 'gpu', label: 'GPU (Faster)' },
                  { value: 'cpu', label: 'CPU (Slower)' },
                ]}
              />
            </ParameterSection>

            <ParameterSection title="Alignment Options" collapsible defaultExpanded={false}>
              <ToggleParameter
                label="Use Alignment"
                value={boltzStore.alignmentOptions.use_alignment}
                onChange={(v: boolean) => boltzStore.setAlignmentOptions({ use_alignment: v })}
                description="Align predicted poses to reference"
                accentColor="purple"
              />
              <SelectParameter
                label="Alignment Method"
                value={boltzStore.alignmentOptions.alignment_method}
                onChange={(v: string) => boltzStore.setAlignmentOptions({ alignment_method: v as any })}
                options={[
                  { value: 'binding_site', label: 'Binding Site' },
                  { value: 'full_structure', label: 'Full Structure' },
                  { value: 'none', label: 'None' },
                ]}
              />
              <SliderParameter
                label="Binding Site Radius"
                value={boltzStore.alignmentOptions.binding_site_radius}
                onChange={(v: number) => boltzStore.setAlignmentOptions({ binding_site_radius: v })}
                min={4}
                max={15}
                step={0.5}
                unit="Å"
                accentColor="purple"
              />
            </ParameterSection>

            <ParameterSection title="MSA Options" collapsible defaultExpanded={false}>
              <ToggleParameter
                label="Generate MSA"
                value={boltzStore.msaOptions.generateMsa}
                onChange={(v: boolean) => boltzStore.setMsaOptions({ generateMsa: v })}
                description="Generate multiple sequence alignment"
                accentColor="purple"
              />
              {boltzStore.msaOptions.generateMsa && (
                <SelectParameter
                  label="MSA Method"
                  value={boltzStore.msaOptions.msaMethod}
                  onChange={(v: string) => boltzStore.setMsaOptions({ msaMethod: v as any })}
                  options={[
                    { value: 'ncbi_blast', label: 'NCBI BLAST' },
                    { value: 'mmseqs2_server', label: 'MMseqs2 Server' },
                    { value: 'mmseqs2_local', label: 'MMseqs2 Local' },
                  ]}
                />
              )}
            </ParameterSection>
          </div>
        )

      case 3:
        const selectedLigandName = boltzStore.isBatchMode
          ? `${boltzStore.batchLigands.length} selected`
          : getAvailableLigands().find(l => l.id === boltzStore.selectedLigand)?.name || boltzStore.selectedLigand || boltzStore.ligandSmiles?.substring(0, 20) || 'None'

        return (
          <ExecutionPanel
            isRunning={boltzStore.isRunning}
            progress={boltzStore.progress}
            progressMessage={boltzStore.progressMessage}
            error={error}
            accentColor="purple"
            configSummary={[
              { label: 'Protein', value: currentStructure?.structure_id || 'Current' },
              { label: 'Ligand', value: selectedLigandName },
              { label: 'Poses', value: String(boltzStore.predictionParams.num_poses || 5) },
              { label: 'Accelerator', value: boltzStore.predictionParams.accelerator || 'GPU' },
            ]}
          />
        )

      case 4:
        // Both single and batch jobs now use the same results component
        // Batch jobs appear in the JobList with "Batch" tags
        return (
          <Boltz2StepResults
            result={boltzStore.result}
            isRunning={boltzStore.isRunning}
            progress={boltzStore.progress}
            progressMessage={boltzStore.progressMessage}
            selectedPose={boltzStore.selectedPose}
            originalStructureData={boltzStore.originalStructureData}
            onPoseSelect={boltzStore.setSelectedPose}
          />
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="Boltz-2 Prediction"
      description="Predict protein-ligand binding affinity using deep learning"
      icon={<Sparkles className="h-5 w-5 text-purple-400" />}
      showHeader={false}
      steps={BOLTZ2_STEPS}
      currentStep={boltzStore.currentStep}
      onStepClick={(step: number) => boltzStore.setStep(step)}
      onBack={boltzStore.previousStep}
      onNext={boltzStore.nextStep}
      onReset={boltzStore.reset}
      onExecute={boltzStore.isBatchMode ? runBatchPrediction : runPrediction}
      canProceed={canProceed()}
      isRunning={boltzStore.isRunning && boltzStore.currentStep === 4}
      allowStepNavigationWhileRunning={true}
      executeLabel="Start Prediction"
      showExecuteOnStep={3}
      accentColor="purple"
      error={error}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}
