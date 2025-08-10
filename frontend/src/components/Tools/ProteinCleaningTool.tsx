'use client'

import { useState, useEffect } from 'react'
import { Droplets, Check, AlertCircle, Upload, FileBox, Eye, Download } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { Label } from '@/components/ui/label'
import {
  WorkflowContainer,
  SliderParameter,
  ToggleParameter,
  NumberParameter,
  ExecutionPanel,
  ResultsContainer,
  ResultMetric,
  InfoBox,
} from './shared'
import type { WorkflowStep } from './shared'

interface CleaningStage {
  name: string
  description: string
  pdb_data: string
  step: number
}

// Define workflow steps
const CLEANING_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Input', description: 'Choose protein structure' },
  { id: 2, label: 'Options', description: 'Configure cleaning settings' },
  { id: 3, label: 'Execute', description: 'Run protein cleaning' },
  { id: 4, label: 'Results', description: 'View cleaning stages' },
]

export function ProteinCleaningTool() {
  const { currentStructure, addStructureTab, setIsLoading, setError } = useMolecularStore()
  const { addNotification } = useUIStore()
  
  const [currentStep, setCurrentStep] = useState(1)
  const [inputSource, setInputSource] = useState<'current' | 'upload'>('current')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedPdbData, setUploadedPdbData] = useState<string | null>(null)
  
  const [removeHeterogens, setRemoveHeterogens] = useState(true)
  const [removeWater, setRemoveWater] = useState(true)
  const [addMissingResidues, setAddMissingResidues] = useState(true)
  const [addMissingAtoms, setAddMissingAtoms] = useState(true)
  const [addMissingHydrogens, setAddMissingHydrogens] = useState(true)
  const [ph, setPh] = useState(7.4)
  const [addSolvation, setAddSolvation] = useState(false)
  const [solvationBoxSize, setSolvationBoxSize] = useState(10.0)
  const [solvationBoxShape, setSolvationBoxShape] = useState<'cubic' | 'octahedral'>('cubic')
  const [keepLigands, setKeepLigands] = useState(false)
  
  const [stages, setStages] = useState<Record<string, CleaningStage>>({})
  const [preservedLigands, setPreservedLigands] = useState<Record<string, any>>({})
  const [isCleaning, setIsCleaning] = useState(false)
  const [cleaningProgress, setCleaningProgress] = useState(0)
  const [cleaningStatus, setCleaningStatus] = useState('')
  const [cleaningError, setCleaningError] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      setUploadedFile(file)
      setUploadedPdbData(text)
      setStages({})
      setCleaningError(null)
      addNotification('success', `Loaded file: ${file.name}`)
    } catch (error: any) {
      addNotification('error', 'Failed to read file')
      setError(error.message || 'Failed to read file')
    }
  }

  const getCurrentPdbData = (): string | null => {
    if (inputSource === 'current') {
      return currentStructure?.pdb_data || null
    } else {
      return uploadedPdbData
    }
  }

  const getCurrentStructureName = (): string => {
    if (inputSource === 'current') {
      return currentStructure?.structure_id || 'Current Structure'
    } else {
      return uploadedFile?.name || 'Uploaded File'
    }
  }

  const handleCleanProtein = async () => {
    const pdbData = getCurrentPdbData()
    if (!pdbData) {
      setCleaningError('No PDB data available. Please select a structure or upload a file.')
      return
    }

    setIsCleaning(true)
    setCleaningError(null)
    setStages({})
    setIsLoading(true)

    try {
      setCleaningProgress(0)
      setCleaningStatus('Initializing protein cleaning...')
      
      const result = await api.cleanProteinStaged(pdbData, {
        remove_heterogens: removeHeterogens,
        remove_water: removeWater,
        add_missing_residues: addMissingResidues,
        add_missing_atoms: addMissingAtoms,
        add_missing_hydrogens: addMissingHydrogens,
        ph: ph,
        add_solvation: addSolvation,
        solvation_box_size: solvationBoxSize,
        solvation_box_shape: solvationBoxShape,
        keep_ligands: keepLigands,
      })

      setCleaningProgress(100)
      setCleaningStatus('Protein cleaning completed!')

      // Convert result to CleaningStage format
      const stageMap: Record<string, CleaningStage> = {}
      for (const [stageName, pdbData] of Object.entries(result.stages)) {
        const info = result.stage_info[stageName] || {}
        stageMap[stageName] = {
          name: stageName,
          description: info.description || stageName,
          pdb_data: pdbData,
          step: info.step || 0,
        }
      }

      setStages(stageMap)
      // Store preserved ligands from the result
      if (result.ligands) {
        setPreservedLigands(result.ligands)
      } else {
        setPreservedLigands({})
      }
      addNotification('success', `Protein cleaning completed. Generated ${Object.keys(stageMap).length} stages.`)
      
      // Auto-advance to results step
      setCurrentStep(4)
      
      // Auto-load final cleaned structure in viewer as a new tab
      const finalStage = stageMap['final_with_ligands'] ||
                        stageMap['after_solvation'] ||
                        stageMap['after_hydrogens'] || 
                        stageMap['after_missing_atoms'] ||
                        Object.values(stageMap).sort((a, b) => b.step - a.step)[0]
      
      if (finalStage) {
        // Load directly using stageMap data (don't rely on state update)
        try {
          const structureName = `${getCurrentStructureName()}_cleaned`
          const structure = {
            structure_id: structureName,
            format: 'pdb' as const,
            pdb_data: finalStage.pdb_data,
            components: {
              protein: [],
              ligands: [],
              water: [],
              ions: [],
            }, // Will be processed when loaded
            // Include ligands from the cleaning result if they were preserved
            ligands: result.ligands || {},
          }
          addStructureTab(structure, structureName)
          addNotification('success', `Loaded cleaned structure: ${finalStage.description}`)
        } catch (error: any) {
          addNotification('error', 'Failed to load cleaned structure into viewer')
          setError(error.message || 'Failed to load structure')
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to clean protein'
      setCleaningError(errorMessage)
      addNotification('error', errorMessage)
      setError(errorMessage)
    } finally {
      setIsCleaning(false)
      setIsLoading(false)
    }
  }

  const handleViewStage = (stageName: string) => {
    const stage = stages[stageName]
    if (!stage) return

    try {
      // Create a structure object compatible with addStructureTab
      const structureName = `${getCurrentStructureName()}_${stageName}`
      const structure = {
        structure_id: structureName,
        format: 'pdb' as const,
        pdb_data: stage.pdb_data,
        components: {
          protein: [],
          ligands: [],
          water: [],
          ions: [],
        }, // Will be processed when loaded
        // Include preserved ligands for the final stage with ligands
        ligands: stageName === 'final_with_ligands' ? preservedLigands : {},
      }
      addStructureTab(structure, structureName)
      addNotification('success', `Loaded stage: ${stage.description}`)
    } catch (error: any) {
      addNotification('error', 'Failed to load stage into viewer')
      setError(error.message || 'Failed to load stage')
    }
  }

  const handleDownloadStage = (stageName: string) => {
    const stage = stages[stageName]
    if (!stage) return

    try {
      const blob = new Blob([stage.pdb_data], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${getCurrentStructureName()}_${stageName}.pdb`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addNotification('success', `Downloaded: ${stage.description}`)
    } catch (error: any) {
      addNotification('error', 'Failed to download stage')
      setError(error.message || 'Failed to download')
    }
  }

  const stageOrder = ['original', 'after_heterogens', 'after_water', 'after_missing_atoms', 'after_hydrogens', 'after_solvation', 'final_with_ligands']
  const sortedStages = stageOrder
    .filter(name => stages[name])
    .map(name => stages[name])

  const handleReset = () => {
    setStages({})
    setPreservedLigands({})
    setIsCleaning(false)
    setCleaningProgress(0)
    setCleaningStatus('')
    setCleaningError(null)
    setCurrentStep(1)
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1: return getCurrentPdbData() !== null
      case 2: return true
      case 3: return !isCleaning
      default: return true
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Structure Selection</h3>
            </div>

            {/* Protein Structure Status */}
            <div className="space-y-2">
              <Label className="text-gray-300">Protein Structure</Label>
              <div className={`p-3 rounded-lg border ${
                inputSource === 'current' && currentStructure 
                  ? 'bg-gray-800 border-gray-700' 
                  : inputSource === 'upload' && uploadedFile
                    ? 'bg-gray-800 border-gray-700'
                    : 'bg-gray-800/50 border-gray-700/50'
              }`}>
                <div className="flex items-center gap-2">
                  {(inputSource === 'current' && currentStructure) || (inputSource === 'upload' && uploadedFile) ? (
                    <>
                      <div className="p-1 rounded-full bg-teal-500/20">
                        <Check className="w-4 h-4 text-teal-400" />
                      </div>
                      <span className="text-gray-300">
                        {inputSource === 'current' 
                          ? (currentStructure?.structure_id || 'Current Structure')
                          : uploadedFile?.name
                        }
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="p-1 rounded-full bg-yellow-500/20">
                        <AlertCircle className="w-4 h-4 text-yellow-400" />
                      </div>
                      <span className="text-gray-400">
                        {inputSource === 'current' 
                          ? 'No structure loaded. Please load a structure or upload a file.'
                          : 'No file uploaded. Please upload a PDB/CIF file.'
                        }
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Input Method Selection */}
            <div className="space-y-2">
              <Label className="text-gray-300">Input Method</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setInputSource('current')
                    setStages({})
                    setCleaningError(null)
                  }}
                  className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                    inputSource === 'current'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <FileBox className={`w-5 h-5 ${inputSource === 'current' ? 'text-teal-400' : 'text-gray-400'}`} />
                  <span className={`text-xs ${inputSource === 'current' ? 'text-teal-400' : 'text-gray-400'}`}>
                    Current
                  </span>
                </button>
                <button
                  onClick={() => {
                    setInputSource('upload')
                    setStages({})
                    setCleaningError(null)
                  }}
                  className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                    inputSource === 'upload'
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <Upload className={`w-5 h-5 ${inputSource === 'upload' ? 'text-teal-400' : 'text-gray-400'}`} />
                  <span className={`text-xs ${inputSource === 'upload' ? 'text-teal-400' : 'text-gray-400'}`}>
                    Upload
                  </span>
                </button>
              </div>
            </div>

            {/* File Upload Area */}
            {inputSource === 'upload' && (
              <div className="space-y-2">
                <Label className="text-gray-300">Upload Structure File</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdb,.cif,.mmcif"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="p-4 border-2 border-dashed border-gray-700 rounded-lg text-center hover:border-gray-600 transition-colors">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    {uploadedFile ? (
                      <p className="text-sm text-teal-400">{uploadedFile.name}</p>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Click or drag to upload PDB, CIF, or mmCIF file
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <InfoBox variant="info" title="About Protein Cleaning">
              <p>
                Protein cleaning prepares structures for computational workflows by removing 
                unwanted components, adding missing atoms, and optimizing the structure.
              </p>
            </InfoBox>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            {/* Structure Cleaning Options */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Structure Cleaning</h3>
              <div className="space-y-3">
                <ToggleParameter
                  label="Remove Heterogens"
                  value={removeHeterogens}
                  onChange={setRemoveHeterogens}
                  description="Remove non-standard residues"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Remove Water"
                  value={removeWater}
                  onChange={setRemoveWater}
                  description="Remove water molecules"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Find Missing Residues"
                  value={addMissingResidues}
                  onChange={setAddMissingResidues}
                  description="Identify gaps in sequence"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Add Missing Atoms"
                  value={addMissingAtoms}
                  onChange={setAddMissingAtoms}
                  description="Fill in missing side chain atoms"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Add Missing Hydrogens"
                  value={addMissingHydrogens}
                  onChange={setAddMissingHydrogens}
                  description="Add hydrogen atoms for proper pH"
                  accentColor="teal"
                />
              </div>
            </div>

            {/* Protonation & Solvation Options */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Protonation & Solvation</h3>
              <div className="space-y-3">
                <SliderParameter
                  label="pH"
                  value={ph}
                  onChange={setPh}
                  min={4}
                  max={10}
                  step={0.1}
                  description="pH for protonation state"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Keep Ligands"
                  value={keepLigands}
                  onChange={setKeepLigands}
                  description="Extract ligands and reinsert after cleaning"
                  accentColor="teal"
                />
                <ToggleParameter
                  label="Add Solvation"
                  value={addSolvation}
                  onChange={setAddSolvation}
                  description="Add water box around protein"
                  accentColor="teal"
                />
                {addSolvation && (
                  <div className="pl-4 pt-2 border-l-2 border-teal-500/30 space-y-3">
                    <NumberParameter
                      label="Box Size"
                      value={solvationBoxSize}
                      onChange={setSolvationBoxSize}
                      min={5}
                      max={20}
                      step={0.5}
                      unit="Å"
                      description="Padding distance around protein"
                    />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-gray-400">Box Shape</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSolvationBoxShape('cubic')}
                          className={`p-2 rounded-lg border text-xs transition-all ${
                            solvationBoxShape === 'cubic'
                              ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                              : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          <div className="font-medium">Cubic</div>
                          <div className="text-gray-500 mt-0.5">Rectangular box</div>
                        </button>
                        <button
                          onClick={() => setSolvationBoxShape('octahedral')}
                          className={`p-2 rounded-lg border text-xs transition-all ${
                            solvationBoxShape === 'octahedral'
                              ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                              : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          <div className="font-medium">Octahedral</div>
                          <div className="text-gray-500 mt-0.5">~24% fewer waters</div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <ExecutionPanel
            isRunning={isCleaning}
            progress={cleaningProgress}
            progressMessage={cleaningStatus}
            error={cleaningError}
            accentColor="teal"
            configSummary={[
              { label: 'Protein', value: getCurrentStructureName() },
              { label: 'Remove Heterogens', value: removeHeterogens ? 'Yes' : 'No' },
              { label: 'Remove Water', value: removeWater ? 'Yes' : 'No' },
              { label: 'Add Hydrogens', value: addMissingHydrogens ? 'Yes' : 'No' },
              { label: 'pH', value: ph.toString() },
            ]}
          />
        )

      case 4:
        const status = isCleaning ? 'running' :
                       Object.keys(stages).length > 0 ? 'success' :
                       cleaningError ? 'error' : 'idle'

        return (
          <ResultsContainer
            status={status}
            subtitle={`${Object.keys(stages).length} cleaning stages generated`}
            onNewCalculation={handleReset}
            accentColor="teal"
          >
            {Object.keys(stages).length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <ResultMetric
                    label="Stages Generated"
                    value={Object.keys(stages).length}
                    status="neutral"
                    accentColor="teal"
                  />
                  <ResultMetric
                    label="Ligands Preserved"
                    value={Object.keys(preservedLigands).length}
                    status={Object.keys(preservedLigands).length > 0 ? 'good' : 'neutral'}
                    accentColor="teal"
                  />
                </div>

                {/* Output Files Section - styled like MD Optimization */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-300">Output Files</h4>
                  <div className="space-y-2">
                    {sortedStages.map((stage) => (
                      <div 
                        key={stage.name} 
                        className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm text-white font-medium">{stage.description}</span>
                          <span className="text-xs text-gray-500">Step {stage.step}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleViewStage(stage.name)}
                            className="px-3 py-1.5 text-sm bg-teal-900/30 border border-teal-700/50 hover:bg-teal-900/50 hover:border-teal-600 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadStage(stage.name)}
                            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </ResultsContainer>
        )

      default:
        return null
    }
  }

  return (
    <WorkflowContainer
      title="Protein Cleaning"
      description="Prepare protein structures for computational workflows"
      icon={<Droplets className="h-5 w-5 text-teal-400" />}
      showHeader={false}
      steps={CLEANING_STEPS}
      currentStep={currentStep}
      onStepClick={(step: number) => !isCleaning && setCurrentStep(step)}
      onBack={() => setCurrentStep(Math.max(1, currentStep - 1))}
      onNext={() => setCurrentStep(Math.min(4, currentStep + 1))}
      onReset={handleReset}
      onExecute={currentStep === 3 ? handleCleanProtein : undefined}
      canProceed={canProceed()}
      isRunning={isCleaning}
      executeLabel="Clean Protein"
      showExecuteOnStep={3}
      accentColor="teal"
      error={cleaningError}
    >
      {renderStepContent()}
    </WorkflowContainer>
  )
}

