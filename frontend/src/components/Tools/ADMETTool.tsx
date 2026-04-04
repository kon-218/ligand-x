'use client'

import React, { useState, useEffect } from 'react'
import { Beaker, History, RefreshCw, Trash2, ChevronDown, ChevronRight, Loader2, Plus, Check, Square, CheckSquare, Target, Layers } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ADMETResult } from '@/types/molecular'
import type { MoleculeOption, StoredADMETResult } from '@/types/admet'
import {
  StructureSelector,
  ExecutionPanel,
  ResultsContainer,
  ResultMetric,
  InfoBox,
  accentColorClasses,
} from './shared'
import type { StructureOption } from './shared'
import { parseValueUnit } from './ADMET/utils'

/**
 * Parse SMILES input string supporting multiple delimiters.
 * Splits by comma, semicolon, newline, and whitespace.
 * Trims each candidate and filters empty strings.
 */
function parseSmilesInput(input: string): string[] {
  if (!input.trim()) return []

  // Split by multiple delimiters: comma, semicolon, newline, and spaces
  const candidates = input.split(/[,;\n\s]+/)

  // Trim, filter empty strings, and remove duplicates
  const parsed = Array.from(new Set(
    candidates
      .map(s => s.trim())
      .filter(s => s.length > 0)
  ))

  return parsed
}

export function ADMETTool() {
  const { currentStructure, isAdmetRunning, setIsAdmetRunning } = useMolecularStore()
  const colors = accentColorClasses['pink']

  const [activeTab, setActiveTab] = useState<'predict' | 'history'>('predict')

  // Single mode state
  const [selectedMolecule, setSelectedMolecule] = useState('')
  const [ligandInputMethod, setLigandInputMethod] = useState<'existing' | 'smiles' | 'structure' | 'hetid'>('existing')
  const [singleSmiles, setSingleSmiles] = useState('')
  const [hetidInput, setHetidInput] = useState('')
  const [hetidValidation, setHetidValidation] = useState<{ valid: boolean; message?: string } | null>(null)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; data: string } | null>(null)

  // Batch mode state
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [batchMolecules, setBatchMolecules] = useState<Set<string>>(new Set())
  const [smilesInput, setSmilesInput] = useState('')

  // Common state
  const [availableMolecules, setAvailableMolecules] = useState<MoleculeOption[]>([])
  const [storedResults, setStoredResults] = useState<StoredADMETResult[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedResults, setExpandedResults] = useState<{ [key: number]: ADMETResult | null }>({})
  const [loadingResult, setLoadingResult] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)


  const fetchAvailableMolecules = async () => {
    const molecules: MoleculeOption[] = []
    const structureSmiles: Set<string> = new Set()

    if (currentStructure?.ligands && Object.keys(currentStructure.ligands).length > 0) {
      const ligands = Object.entries(currentStructure.ligands).map(([id, ligand]: [string, any]) => ({
        id: `structure_${id}`,
        name: `${ligand.residue_name || ligand.name || 'Ligand'} (Chain ${ligand.chain_id || ligand.chain})`,
        smiles: ligand.smiles,
        pdb_data: ligand.pdb_data,
        source: 'structure' as const,
      }))
      ligands.forEach(l => { if (l.smiles) structureSmiles.add(l.smiles) })
      molecules.push(...ligands)
    }

    try {
      const libraryMolecules = await api.getMolecules()
      if (Array.isArray(libraryMolecules) && libraryMolecules.length > 0) {
        const formattedLibraryMolecules = libraryMolecules
          .filter((mol: any) => !structureSmiles.has(mol.canonical_smiles))
          .map((mol: any) => ({
            id: `library_${mol.id}`,
            name: `${mol.name} (Library)`,
            smiles: mol.canonical_smiles,
            pdb_data: undefined,
            source: 'library' as const,
          }))
        molecules.push(...formattedLibraryMolecules)
      }
    } catch (err) {
      console.error('Failed to fetch library molecules:', err)
    }

    setAvailableMolecules(molecules)
    if (molecules.length === 1 && !isBatchMode) {
      setSelectedMolecule(molecules[0].id)
    } else if (molecules.length === 0) {
      setSelectedMolecule('')
    }
  }

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      setUploadedFile({ name: file.name, data: e.target?.result as string })
    }
    reader.readAsText(file)
  }

  const handleValidateHetid = () => {
    if (!hetidInput) return
    if (!currentStructure?.ligands) {
      setHetidValidation({ valid: false, message: 'No structure loaded' })
      return
    }
    const match = Object.values(currentStructure.ligands).find(
      (l: any) => (l.residue_name || l.name)?.toUpperCase() === hetidInput.toUpperCase()
    ) as any
    if (match?.smiles) {
      setHetidValidation({ valid: true, message: `Found ${hetidInput}` })
    } else {
      setHetidValidation({ valid: false, message: `${hetidInput} not found in loaded structure` })
    }
  }

  const isSingleInputReady = () => {
    switch (ligandInputMethod) {
      case 'existing': return !!selectedMolecule
      case 'smiles': return !!singleSmiles.trim()
      case 'hetid': return !!hetidValidation?.valid
      case 'structure': return !!uploadedFile
    }
  }

  const fetchStoredResults = async () => {
    try {
      setLoadingHistory(true)
      const response = await api.getADMETResults()
      if (response.success && response.results) {
        setStoredResults(response.results)
      }
    } catch (err) {
      console.error('Failed to fetch stored ADMET results:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const toggleExpandResult = async (resultId: number, smiles: string) => {
    if (expandedResults[resultId]) {
      setExpandedResults(prev => {
        const newState = { ...prev }
        delete newState[resultId]
        return newState
      })
      return
    }

    try {
      setLoadingResult(resultId)
      const response = await api.getADMETResultBySmiles(smiles)
      if (response.found && response.results) {
        setExpandedResults(prev => ({
          ...prev,
          [resultId]: response.results
        }))
      } else {
        setError('Results not found')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load stored results')
    } finally {
      setLoadingResult(null)
    }
  }

  const deleteStoredResult = async (resultId: number) => {
    try {
      await api.deleteADMETResult(resultId)
      fetchStoredResults()
    } catch (err) {
      console.error('Failed to delete result:', err)
    }
  }

  useEffect(() => {
    fetchAvailableMolecules()
    setError(null)
  }, [currentStructure])

  useEffect(() => {
    fetchStoredResults()
  }, [])

  useEffect(() => {
    if (activeTab === 'predict') {
      setError(null)
    }
  }, [])

  const handleBatchSelection = (id: string) => {
    setBatchMolecules(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (batchMolecules.size === availableMolecules.length) {
      setBatchMolecules(new Set())
    } else {
      setBatchMolecules(new Set(availableMolecules.map(m => m.id)))
    }
  }

  const handleAddSmiles = () => {
    const parsedSmiles = parseSmilesInput(smilesInput)
    if (parsedSmiles.length === 0) return

    // Add each parsed SMILES as a separate temporary option
    const newMolecules: MoleculeOption[] = parsedSmiles.map((smiles, index) => ({
      id: `smiles_${Date.now()}_${index}`,
      name: `SMILES: ${smiles.substring(0, 15)}${smiles.length > 15 ? '...' : ''}`,
      smiles: smiles,
      source: 'library' as const
    }))

    setAvailableMolecules(prev => [...prev, ...newMolecules])
    const newIds = new Set(batchMolecules)
    newMolecules.forEach(mol => newIds.add(mol.id))
    setBatchMolecules(newIds)
    setSmilesInput('')
  }

  const runPrediction = async () => {
    setIsAdmetRunning(true)
    setError(null)

    try {
      if (isBatchMode) {
        if (batchMolecules.size === 0) {
          throw new Error('Please select at least one molecule')
        }

        const smilesList: string[] = []
        const namesList: string[] = []
        batchMolecules.forEach(id => {
          const mol = availableMolecules.find(m => m.id === id)
          if (mol?.smiles) {
            smilesList.push(mol.smiles)
            namesList.push(mol.name)
          }
        })

        if (smilesList.length === 0) {
          throw new Error('No valid SMILES found in selected molecules')
        }

        await api.predictADMET({ smiles_list: smilesList, molecule_names: namesList })

      } else {
        let request: any

        if (ligandInputMethod === 'existing') {
          if (!selectedMolecule) throw new Error('Please select a molecule')
          const molecule = availableMolecules.find((m) => m.id === selectedMolecule)
          if (!molecule) throw new Error('Selected molecule not found')
          request = molecule.smiles
            ? { smiles: molecule.smiles, molecule_name: molecule.name }
            : { pdb_data: molecule.pdb_data, molecule_name: molecule.name }
        } else if (ligandInputMethod === 'smiles') {
          if (!singleSmiles.trim()) throw new Error('Please enter a SMILES string')
          request = { smiles: singleSmiles.trim(), molecule_name: `SMILES_${Date.now()}` }
        } else if (ligandInputMethod === 'hetid') {
          if (!hetidValidation?.valid) throw new Error('Please enter and validate a HET ID')
          const ligand = Object.values(currentStructure?.ligands || {}).find(
            (l: any) => (l.residue_name || l.name)?.toUpperCase() === hetidInput.toUpperCase()
          ) as any
          if (!ligand?.smiles) throw new Error('SMILES not found for this ligand')
          request = { smiles: ligand.smiles, molecule_name: hetidInput }
        } else if (ligandInputMethod === 'structure') {
          if (!uploadedFile) throw new Error('Please upload a structure file')
          request = { pdb_data: uploadedFile.data, molecule_name: uploadedFile.name }
        }

        await api.predictADMET(request)
      }

      await fetchStoredResults()
      setActiveTab('history')

    } catch (err: any) {
      console.error('ADMET prediction error:', err)
      setError(err.response?.data?.error || err.message || 'Failed to predict ADMET properties')
    } finally {
      setIsAdmetRunning(false)
    }
  }

  const getStructureOptions = (): StructureOption[] => {
    return availableMolecules.map(m => ({
      id: m.id,
      name: m.name,
      source: m.source === 'structure' ? 'current_structure' : 'library',
      smiles: m.smiles,
    }))
  }

  // Properties where high probability is GOOD (favor high)
  const HIGH_IS_GOOD = new Set([
    'Human Intestinal Absorption',
    'Oral Bioavailability',
    'Blood-Brain Barrier Penetration',
  ])
  // Properties where high probability is BAD (flag high values)
  const HIGH_IS_BAD = new Set([
    'P-glycoprotein Inhibition',
    'CYP1A2 Inhibition', 'CYP2C19 Inhibition', 'CYP2C9 Inhibition',
    'CYP2D6 Inhibition', 'CYP3A4 Inhibition',
    'CYP2C9 Substrate', 'CYP2D6 Substrate', 'CYP3A4 Substrate',
    'hERG Blocking', 'Clinical Toxicity', 'Mutagenicity (AMES)',
    'Drug-Induced Liver Injury', 'Carcinogenicity',
  ])

  const getProbStatus = (label: string, prob: number): 'good' | 'warning' | 'bad' | 'neutral' => {
    if (HIGH_IS_GOOD.has(label)) {
      if (prob >= 0.6) return 'good'
      if (prob >= 0.3) return 'warning'
      return 'bad'
    }
    if (HIGH_IS_BAD.has(label)) {
      if (prob <= 0.3) return 'good'
      if (prob <= 0.6) return 'warning'
      return 'bad'
    }
    return 'neutral'
  }

  const formatUnit = (unit: string): string => {
    const unitMap: Record<string, string> = {
      'Prob.': 'probability',
      'logD7.4': 'log D (pH 7.4)',
      'logS': 'log S',
      'logPapp': 'log Papp (cm/s)',
      'log(mol/kg)': 'log(mol/kg)',
    }
    return unitMap[unit] || unit
  }

  const renderPropertyRow = (label: string, rawValue: any) => {
    if (rawValue === undefined || rawValue === null) return null

    const { value: parsedValue, unit } = parseValueUnit(rawValue)
    const isProb = unit === 'Prob.'
    const numericVal = parseFloat(parsedValue)

    let status: 'good' | 'warning' | 'bad' | 'neutral' = 'neutral'
    if (isProb && !isNaN(numericVal)) {
      status = getProbStatus(label, numericVal)
    }

    const statusBarColors = {
      good: 'bg-green-500',
      warning: 'bg-yellow-500',
      bad: 'bg-red-500',
      neutral: 'bg-pink-500',
    }
    const statusTextColors = {
      good: 'text-green-400',
      warning: 'text-yellow-400',
      bad: 'text-red-400',
      neutral: 'text-white',
    }

    return (
      <div key={label} className="py-2 border-b border-gray-700/40 last:border-0">
        <div className="flex justify-between items-center gap-3 mb-1">
          <span className="text-sm text-gray-300">{label}</span>
          <span className={`text-sm font-semibold tabular-nums ${isProb ? statusTextColors[status] : 'text-white'}`}>
            {isProb && !isNaN(numericVal)
              ? `${Math.round(numericVal * 100)}%`
              : parsedValue}
          </span>
        </div>
        {isProb && !isNaN(numericVal) && (
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${statusBarColors[status]}`}
              style={{ width: `${Math.min(numericVal * 100, 100)}%` }}
            />
          </div>
        )}
        {unit && !isProb && (
          <div className="text-xs text-gray-500 mt-0.5 text-right">{formatUnit(unit)}</div>
        )}
      </div>
    )
  }

  const renderExpandedResults = (results: ADMETResult, fallbackSmiles?: string) => {
    const propertyGroups = ['Physicochemical', 'Absorption', 'Distribution', 'Metabolism', 'Excretion', 'Toxicity'] as const
    const smiles = results._metadata?.canonical_smiles || fallbackSmiles

    return (
      <div className="mt-4 space-y-4 pl-4 border-l-2 border-pink-500/30">
        {smiles && (
          <div className="flex justify-center mb-6">
            <div className="bg-white p-2 rounded-lg shadow-lg">
              <img
                src={api.getSmilesImageUrl(smiles)}
                alt="Molecule Structure"
                className="w-48 h-48 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.parentElement!.style.display = 'none'
                }}
              />
            </div>
          </div>
        )}

        {propertyGroups.map(groupName => {
          const group = results[groupName]
          if (!group || Object.keys(group).length === 0) return null

          return (
            <div key={groupName} className="space-y-1">
              <h5 className="text-sm font-medium text-pink-400 mb-2">{groupName}</h5>
              <div className="bg-gray-800/40 rounded-lg px-3">
                {Object.entries(group).map(([key, value]) => renderPropertyRow(key, value))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="relative space-y-6 h-full flex flex-col px-6 py-6">

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800/50">
        <button
          onClick={() => {
            setActiveTab('predict')
            setError(null)
          }}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'predict'
            ? 'text-pink-400 border-b-2 border-pink-400'
            : 'text-gray-400 hover:text-gray-300'
            }`}
        >
          <div className="flex items-center gap-2">
            <Beaker className="h-4 w-4" />
            New Prediction
          </div>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${activeTab === 'history'
            ? 'text-pink-400 border-b-2 border-pink-400'
            : 'text-gray-400 hover:text-gray-300'
            }`}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Stored Results
            {storedResults.length > 0 && (
              <span className="text-xs bg-pink-500/20 text-pink-400 px-1.5 py-0.5 rounded">
                {storedResults.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 relative min-h-0 overflow-y-auto">
        {activeTab === 'predict' ? (
          <div className="space-y-6 pb-20">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-300">Prediction Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIsBatchMode(false)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${!isBatchMode
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Target className={`w-4 h-4 ${!isBatchMode ? 'text-pink-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Single Ligand</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Predict ADMET for one molecule.
                  </div>
                </button>
                <button
                  onClick={() => setIsBatchMode(true)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${isBatchMode
                    ? 'border-pink-500 bg-pink-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className={`w-4 h-4 ${isBatchMode ? 'text-pink-400' : 'text-gray-400'}`} />
                    <div className="font-medium text-white">Batch Mode</div>
                  </div>
                  <div className="text-xs text-gray-400">
                    Screen multiple molecules at once.
                  </div>
                </button>
              </div>
            </div>

            {isBatchMode ? (
              <div className="space-y-4">
                <div className="p-3 bg-pink-900/20 border border-pink-500/30 rounded-lg text-xs text-pink-300">
                  <strong>SMILES Format:</strong> Enter one or more SMILES separated by commas, semicolons, newlines, or spaces. Duplicates are automatically removed.
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter SMILES string..."
                    value={smilesInput}
                    onChange={(e) => setSmilesInput(e.target.value)}
                    className="flex-1 bg-gray-800 border-gray-700"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSmiles()}
                  />
                  <Button onClick={handleAddSmiles} variant="secondary" className="px-2">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border border-gray-700 rounded-lg bg-gray-900/30 overflow-hidden">
                  <div className="p-3 border-b border-gray-800/50 bg-gray-900/50 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-300">Available Molecules</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      className="h-8 text-xs"
                    >
                      {batchMolecules.size === availableMolecules.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                    {availableMolecules.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No molecules available. Add SMILES or load a structure.
                      </div>
                    ) : (
                      availableMolecules.map(mol => (
                        <div
                          key={mol.id}
                          className={`flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer ${batchMolecules.has(mol.id) ? 'bg-pink-900/20 border border-pink-500/30' : ''}`}
                          onClick={() => handleBatchSelection(mol.id)}
                        >
                          {batchMolecules.has(mol.id) ? (
                            <CheckSquare className="h-4 w-4 text-pink-400 shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-500 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-200 truncate">{mol.name}</div>
                            {mol.smiles && (
                              <div className="text-xs text-gray-500 font-mono truncate">{mol.smiles}</div>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 uppercase px-1.5 py-0.5 bg-gray-800 rounded">
                            {mol.source === 'structure' ? 'STR' : 'LIB'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <StructureSelector
                selectedProtein={null}
                onProteinSelect={() => { }}
                showProteinStatus={false}
                selectedLigand={selectedMolecule}
                onLigandSelect={(id: string | null) => setSelectedMolecule(id || '')}
                availableLigands={getStructureOptions()}
                ligandLabel="Select Molecule"
                ligandDescription="Choose from structure ligands or library molecules"
                accentColor="pink"
                ligandInputMethod={ligandInputMethod}
                onLigandMethodChange={setLigandInputMethod}
                showSmilesInput={true}
                smilesValue={singleSmiles}
                onSmilesChange={setSingleSmiles}
                showFileUpload={true}
                onFileUpload={handleFileUpload}
                uploadedFileName={uploadedFile?.name}
                hetidValue={hetidInput}
                onHetidChange={(v) => { setHetidInput(v); setHetidValidation(null) }}
                hetidValidation={hetidValidation}
                onValidateHetid={handleValidateHetid}
              />
            )}

            {error && (
              <InfoBox variant="error" title="Error">
                {error}
              </InfoBox>
            )}

            <Button
              onClick={runPrediction}
              disabled={isAdmetRunning || (isBatchMode ? batchMolecules.size === 0 : !isSingleInputReady())}
              className={`w-full ${colors.bg} ${colors.bgHover} text-white`}
            >
              {isAdmetRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Prediction...
                </>
              ) : (
                `Run ${isBatchMode ? 'Batch ' : ''}ADMET Prediction`
              )}
            </Button>

            <InfoBox variant="info" title="About ADMET">
              <p>
                ADMET analysis predicts Absorption, Distribution, Metabolism, Excretion,
                and Toxicity properties of drug-like molecules. Results are automatically
                saved to the Stored Results tab.
              </p>
            </InfoBox>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-300">Stored Results</h4>
              <Button
                onClick={fetchStoredResults}
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={loadingHistory}
              >
                <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
              </div>
            ) : storedResults.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No stored results. Run a prediction to see results here.
              </div>
            ) : (
              <div className="space-y-3">
                {storedResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-4 bg-gray-900/30 border border-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleExpandResult(result.id, result.smiles)}
                        className="flex items-center gap-2 text-left flex-1"
                      >
                        {loadingResult === result.id ? (
                          <Loader2 className="w-4 h-4 text-pink-400 animate-spin" />
                        ) : expandedResults[result.id] ? (
                          <ChevronDown className="w-4 h-4 text-pink-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                        <div>
                          <div className="text-white font-medium">
                            {result.molecule_name || 'Unknown Molecule'}
                          </div>
                          <div className="text-xs text-gray-500 font-mono truncate max-w-xs">
                            {result.smiles}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {new Date(result.timestamp).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => deleteStoredResult(result.id)}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {expandedResults[result.id] && renderExpandedResults(expandedResults[result.id]!, result.smiles)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
