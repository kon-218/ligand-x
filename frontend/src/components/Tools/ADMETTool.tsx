'use client'

import React, { useState, useEffect } from 'react'
import { Beaker, History, RefreshCw, Trash2, ChevronDown, ChevronRight, Loader2, Plus, Check, Square, CheckSquare, Download } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import type { ADMETResult, ADMETBatchResult } from '@/types/molecular'
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
  const { currentStructure, admetResults, setAdmetResults, isAdmetRunning, setIsAdmetRunning } = useMolecularStore()
  const colors = accentColorClasses['teal']

  const [activeTab, setActiveTab] = useState<'predict' | 'history'>('predict')
  
  // Single mode state
  const [selectedMolecule, setSelectedMolecule] = useState('')
  
  // Batch mode state
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [batchMolecules, setBatchMolecules] = useState<Set<string>>(new Set())
  const [smilesInput, setSmilesInput] = useState('')
  const [batchResults, setBatchResults] = useState<ADMETBatchResult | null>(null)
  
  // Common state
  const [availableMolecules, setAvailableMolecules] = useState<MoleculeOption[]>([])
  const [storedResults, setStoredResults] = useState<StoredADMETResult[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [expandedResults, setExpandedResults] = useState<{ [key: number]: ADMETResult | null }>({})
  const [loadingResult, setLoadingResult] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedBatchRow, setExpandedBatchRow] = useState<number | null>(null)

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
      setAdmetResults(null)
      setBatchResults(null)
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
    setAdmetResults(null)
    setBatchResults(null)

    try {
      if (isBatchMode) {
        if (batchMolecules.size === 0) {
          throw new Error('Please select at least one molecule')
        }

        const smilesList: string[] = []
        batchMolecules.forEach(id => {
          const mol = availableMolecules.find(m => m.id === id)
          if (mol?.smiles) {
            smilesList.push(mol.smiles)
          }
        })

        if (smilesList.length === 0) {
          throw new Error('No valid SMILES found in selected molecules')
        }

        const result = await api.predictADMET({ smiles_list: smilesList }) as ADMETBatchResult
        setBatchResults(result)
        
      } else {
        if (!selectedMolecule) {
          throw new Error('Please select a molecule')
        }

        const molecule = availableMolecules.find((m) => m.id === selectedMolecule)
        if (!molecule) throw new Error('Selected molecule not found')

        const request = molecule.smiles
          ? { smiles: molecule.smiles }
          : { pdb_data: molecule.pdb_data }

        const result = await api.predictADMET(request) as ADMETResult
        setAdmetResults(result) // Only set single result here
      }

      await fetchStoredResults()
      
      // If single mode, switch to history tab, otherwise stay to show batch results
      if (!isBatchMode) {
        setActiveTab('history')
      }
      
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

  const renderPropertyCard = (label: string, value: any, interpretation?: string, status?: 'good' | 'warning' | 'bad' | 'neutral') => {
    const statusColors = {
      good: 'border-green-500/50 bg-green-900/20',
      warning: 'border-yellow-500/50 bg-yellow-900/20',
      bad: 'border-red-500/50 bg-red-900/20',
      neutral: 'border-gray-700 bg-gray-800/50',
    }

    return (
      <div className={`p-3 rounded-lg border ${statusColors[status || 'neutral']}`}>
        <div className="text-xs text-gray-400 mb-1">{label}</div>
        <div className="text-white font-medium">{value}</div>
        {interpretation && (
          <div className="text-xs text-gray-500 mt-1">{interpretation}</div>
        )}
      </div>
    )
  }

  const renderExpandedResults = (results: ADMETResult) => {
    // Render all property groups dynamically
    const propertyGroups = ['Physicochemical', 'Absorption', 'Distribution', 'Metabolism', 'Excretion', 'Toxicity'] as const
    
    const smiles = results._metadata?.canonical_smiles

    return (
      <div className="mt-4 space-y-4 pl-4 border-l-2 border-teal-500/30">
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
            <div key={groupName} className="space-y-2">
              <h5 className="text-sm font-medium text-teal-400">{groupName}</h5>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(group).map(([key, value]) => {
                  if (value === undefined || value === null) return null
                  
                  // Format the key for display
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  
                  // Format the value
                  let displayValue: string
                  let status: 'good' | 'warning' | 'bad' | 'neutral' = 'neutral'
                  
                  if (typeof value === 'boolean') {
                    displayValue = value ? 'Yes' : 'No'
                  } else if (typeof value === 'number') {
                    displayValue = (value as number).toFixed(2)
                  } else {
                    displayValue = String(value)
                  }
                  
                  return renderPropertyCard(label, displayValue, undefined, status)
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const renderBatchResults = () => {
    if (!batchResults) return null

    return (
      <div className="space-y-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Batch Results Summary</h3>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Input SMILES</div>
            <div className="text-lg font-semibold text-white">{batchResults.total}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-gray-400">Valid Results</div>
            <div className="text-lg font-semibold text-green-400">{batchResults.valid}</div>
          </div>
          {batchResults.duplicates_removed > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Duplicates Removed</div>
              <div className="text-lg font-semibold text-yellow-400">{batchResults.duplicates_removed}</div>
            </div>
          )}
          {batchResults.already_cached > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400">From Cache</div>
              <div className="text-lg font-semibold text-blue-400">{batchResults.already_cached}</div>
            </div>
          )}
          {batchResults.invalid_count > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Invalid SMILES</div>
              <div className="text-lg font-semibold text-red-400">{batchResults.invalid_count}</div>
            </div>
          )}
          {batchResults.predicted > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Newly Predicted</div>
              <div className="text-lg font-semibold text-teal-400">{batchResults.predicted}</div>
            </div>
          )}
        </div>

        {/* Invalid SMILES list (if any) */}
        {batchResults.invalid_smiles && batchResults.invalid_smiles.length > 0 && (
          <div className="p-4 bg-red-900/10 border border-red-500/30 rounded-lg">
            <div className="text-sm font-medium text-red-400 mb-2">Invalid SMILES ({batchResults.invalid_smiles.length})</div>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {batchResults.invalid_smiles.map((item, idx) => (
                <div key={idx} className="text-xs text-red-300">
                  <span className="font-mono text-red-200">{item.smiles}</span>
                  <span className="text-red-400"> — {item.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results table */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Prediction Results</h4>
          {batchResults.results.map((item, index) => (
            <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
              <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-700/50"
                   onClick={() => setExpandedBatchRow(expandedBatchRow === index ? null : index)}>
                <div className="flex items-center gap-3 overflow-hidden">
                  {expandedBatchRow === index ? <ChevronDown className="w-4 h-4 text-teal-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white truncate max-w-[200px]">
                      {item.molecule_name || `Molecule ${index + 1}`}
                    </span>
                    <span className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
                      {item.smiles}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {item.valid ? (
                    <>
                      {item.cached && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full whitespace-nowrap">
                          Cached
                        </span>
                      )}
                      {!item.cached && (
                        <span className="px-2 py-0.5 text-xs bg-teal-500/20 text-teal-400 rounded-full whitespace-nowrap">
                          Predicted
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                        Success
                      </span>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                      Error
                    </span>
                  )}
                </div>
              </div>

              {expandedBatchRow === index && item.result && (
                <div className="p-4 border-t border-gray-700 bg-gray-900/30">
                  {renderExpandedResults(item.result)}
                </div>
              )}

              {expandedBatchRow === index && item.error && (
                <div className="p-4 border-t border-gray-700 bg-red-900/10 text-red-400 text-sm">
                  Error: {item.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-6 h-full flex flex-col px-6 py-6">

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => {
            setActiveTab('predict')
            setAdmetResults(null)
            setBatchResults(null)
            setError(null)
          }}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'predict'
              ? 'text-teal-400 border-b-2 border-teal-400'
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
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'history'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Stored Results
            {storedResults.length > 0 && (
              <span className="text-xs bg-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={isBatchMode} 
                  onCheckedChange={setIsBatchMode}
                  id="batch-mode"
                />
                <label htmlFor="batch-mode" className="text-sm font-medium text-gray-200 cursor-pointer">
                  Batch Mode
                </label>
              </div>
              
              {isBatchMode && (
                <div className="text-sm text-gray-400">
                  {batchMolecules.size} selected
                </div>
              )}
            </div>

            {isBatchMode ? (
              <div className="space-y-4">
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-xs text-blue-300">
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
                  <Button onClick={handleAddSmiles} variant="secondary" size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="border border-gray-700 rounded-lg bg-gray-900/30 overflow-hidden">
                  <div className="p-3 border-b border-gray-700 bg-gray-800/50 flex items-center justify-between">
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
                          className={`flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer ${batchMolecules.has(mol.id) ? 'bg-teal-900/20 border border-teal-500/30' : ''}`}
                          onClick={() => handleBatchSelection(mol.id)}
                        >
                          {batchMolecules.has(mol.id) ? (
                            <CheckSquare className="h-4 w-4 text-teal-400 shrink-0" />
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
                onProteinSelect={() => {}}
                showProteinStatus={false}
                selectedLigand={selectedMolecule}
                onLigandSelect={(id: string | null) => setSelectedMolecule(id || '')}
                availableLigands={getStructureOptions()}
                ligandLabel="Select Molecule"
                ligandDescription="Choose from structure ligands or library molecules"
                onRefresh={fetchAvailableMolecules}
                accentColor="teal"
              />
            )}

            {error && (
              <InfoBox variant="error" title="Error">
                {error}
              </InfoBox>
            )}

            <Button
              onClick={runPrediction}
              disabled={isAdmetRunning || (isBatchMode ? batchMolecules.size === 0 : !selectedMolecule)}
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
            
            {batchResults && renderBatchResults()}

            {!batchResults && (
              <InfoBox variant="info" title="About ADMET">
                <p>
                  ADMET analysis predicts Absorption, Distribution, Metabolism, Excretion, 
                  and Toxicity properties of drug-like molecules. Results are automatically 
                  saved to the history tab.
                </p>
              </InfoBox>
            )}
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
                <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
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
                    className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleExpandResult(result.id, result.smiles)}
                        className="flex items-center gap-2 text-left flex-1"
                      >
                        {loadingResult === result.id ? (
                          <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                        ) : expandedResults[result.id] ? (
                          <ChevronDown className="w-4 h-4 text-teal-400" />
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

                    {expandedResults[result.id] && renderExpandedResults(expandedResults[result.id]!)}
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
