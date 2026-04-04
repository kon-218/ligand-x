'use client'

import { useState, useEffect } from 'react'
import {
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Check,
  Upload,
  FlaskConical,
  Atom,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { InfoBox } from '@/components/Tools/shared'
import { getProteinValidationError } from '@/lib/structure-validation'
import { api } from '@/lib/api-client'
import type { LigandSelection } from '@/types/rbfe-types'
import type { MolecularStructure } from '@/types/molecular'

interface LibraryMolecule {
  id: number
  name: string
  canonical_smiles: string
}

interface RBFENetworkSelectorProps {
  availableLigands: LigandSelection[]
  selectedLigandIds: string[]
  onToggleLigand: (ligandId: string) => void
  onClearSelection: () => void
  hasProtein: boolean
  proteinName?: string
  currentStructure?: MolecularStructure | null
  minLigands?: number
}

export default function RBFENetworkSelector({
  availableLigands = [],
  selectedLigandIds = [],
  onToggleLigand,
  onClearSelection,
  hasProtein,
  proteinName,
  currentStructure,
  minLigands = 2,
}: RBFENetworkSelectorProps) {
  const [libraryMolecules, setLibraryMolecules] = useState<LibraryMolecule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [ligandInputMethod, setLigandInputMethod] = useState<'existing' | 'smiles' | 'upload'>('existing')

  // Compute protein validation error internally
  const proteinValidationError = currentStructure ? getProteinValidationError(currentStructure) : null

  const fetchLibraryMolecules = async () => {
    setIsLoading(true)
    try {
      const molecules = await api.getMolecules()
      setLibraryMolecules(Array.isArray(molecules) ? molecules : [])
    } catch (err) {
      console.error('Failed to fetch library molecules:', err)
      setLibraryMolecules([])
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch library molecules on mount
  useEffect(() => {
    fetchLibraryMolecules()
  }, [])

  // Combine available ligands with library molecules
  const allAvailableLigands: LigandSelection[] = [
    ...availableLigands,
    ...libraryMolecules
      .filter((mol) => !availableLigands.some((l) => l.id === `library_${mol.id}`))
      .map((mol) => ({
        id: `library_${mol.id}`,
        name: mol.name,
        source: 'library' as const,
        smiles: mol.canonical_smiles,
      })),
  ]

  const selectedCount = selectedLigandIds.length
  const isValid = selectedCount >= minLigands

  return (
    <div className="space-y-6">
      {/* Protein Validation Warning */}
      {proteinValidationError && (
        <InfoBox variant="warning" title="Invalid Protein Structure">
          {proteinValidationError}
        </InfoBox>
      )}

      {/* Protein Status */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Protein Structure</Label>
        <div className={`p-3 rounded-lg border ${
          hasProtein 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-gray-800/50 border-gray-700/50'
        }`}>
          <div className="flex items-center gap-2">
            {hasProtein ? (
              <>
                <div className="p-1 rounded-full bg-cyan-500/20">
                  <Check className="w-4 h-4 text-cyan-400" />
                </div>
                <span className="text-gray-300">{proteinName || 'Protein loaded'}</span>
              </>
            ) : (
              <>
                <div className="p-1 rounded-full bg-yellow-500/20">
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                </div>
                <span className="text-gray-400">No protein structure loaded</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ligand Input Method Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Ligand Input Method</Label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setLigandInputMethod('existing')}
            className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
              ligandInputMethod === 'existing'
                ? 'border-cyan-500 bg-cyan-900/30'
                : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <Atom className={`w-5 h-5 ${ligandInputMethod === 'existing' ? 'text-cyan-400' : 'text-gray-400'}`} />
            <span className={`text-xs ${ligandInputMethod === 'existing' ? 'text-cyan-400' : 'text-gray-400'}`}>
              Existing
            </span>
          </button>
          <button
            onClick={() => setLigandInputMethod('smiles')}
            className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
              ligandInputMethod === 'smiles'
                ? 'border-cyan-500 bg-cyan-900/30'
                : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <FlaskConical className={`w-5 h-5 ${ligandInputMethod === 'smiles' ? 'text-cyan-400' : 'text-gray-400'}`} />
            <span className={`text-xs ${ligandInputMethod === 'smiles' ? 'text-cyan-400' : 'text-gray-400'}`}>
              SMILES
            </span>
          </button>
          <button
            onClick={() => setLigandInputMethod('upload')}
            className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
              ligandInputMethod === 'upload'
                ? 'border-cyan-500 bg-cyan-900/30'
                : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <Upload className={`w-5 h-5 ${ligandInputMethod === 'upload' ? 'text-cyan-400' : 'text-gray-400'}`} />
            <span className={`text-xs ${ligandInputMethod === 'upload' ? 'text-cyan-400' : 'text-gray-400'}`}>
              Upload
            </span>
          </button>
        </div>
        <p className="text-xs text-gray-500">Select how you want to add ligands to your RBFE network</p>
      </div>

      {/* Ligand Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">Select Ligands for RBFE Network</Label>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-7 px-2 text-gray-400 hover:text-white"
              >
                Clear ({selectedCount})
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchLibraryMolecules}
              disabled={isLoading}
              className="h-7 px-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Available ligands list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {allAvailableLigands.length === 0 ? (
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg text-center text-gray-400">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading ligands...</span>
                </div>
              ) : (
                <>
                  <p>No ligands available</p>
                  <p className="text-xs mt-1">Load a structure with ligands or add molecules to library</p>
                </>
              )}
            </div>
          ) : (
            allAvailableLigands.map((ligand) => {
              const isSelected = selectedLigandIds.includes(ligand.id)
              return (
                <button
                  key={ligand.id}
                  onClick={() => onToggleLigand(ligand.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-900/30'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-500'
                          : 'border-gray-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div>
                      <p className="font-medium text-white">{ligand.name}</p>
                      <p className="text-xs text-gray-400">
                        {ligand.source === 'library' ? 'From library' : 'From structure'}
                        {ligand.has_docked_pose && (
                          <span className="ml-2 text-green-400">
                            <CheckCircle className="w-3 h-3 inline mr-1" />
                            Docked
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Selection status */}
        <div className="mt-3">
          {isValid ? (
            <p className="text-sm text-green-400">
              <CheckCircle className="w-4 h-4 inline mr-1" />
              {selectedCount} ligands selected - ready to proceed
            </p>
          ) : selectedCount > 0 ? (
            <p className="text-sm text-yellow-400">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Select at least {minLigands - selectedCount} more ligand{minLigands - selectedCount > 1 ? 's' : ''} (minimum {minLigands} required)
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              Select at least {minLigands} ligands to create a network
            </p>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-cyan-900/20 border border-cyan-700/50 rounded-lg">
        <div className="flex items-start">
          <CheckCircle className="w-5 h-5 text-cyan-400 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold mb-1">About Ligand Selection</p>
            <p className="text-gray-400">
              Select the ligands you want to include in the RBFE network. You can select ligands from the current 
              structure or from your molecule library. Each ligand pair will be compared to calculate relative 
              binding affinities.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
