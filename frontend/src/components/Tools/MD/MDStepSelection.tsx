'use client'

import { Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoBox } from '@/components/Tools/shared'
import type { LigandInput, LigandInputMethod } from '@/types/md-types'
import type { StructureOption } from '@/components/Tools/shared/types'
import type { MolecularStructure } from '@/types/molecular'

interface MDStepSelectionProps {
  selectedProtein: string | null
  selectedLigandMethod: LigandInputMethod
  ligandInput: LigandInput
  availableProteins: StructureOption[]
  availableLigands: StructureOption[]
  currentStructure: MolecularStructure | null
  smilesValidation: { valid: boolean; message?: string } | null
  onProteinSelect: (proteinId: string | null) => void
  onLigandMethodChange: (method: LigandInputMethod) => void
  onLigandInputChange: (input: Partial<LigandInput>) => void
  onValidateSMILES: () => void
  onStructureFile: (file: File) => void
  onRefresh: () => void
}

export function MDStepSelection({
  selectedProtein,
  selectedLigandMethod,
  ligandInput,
  availableProteins,
  availableLigands,
  currentStructure,
  smilesValidation,
  onProteinSelect,
  onLigandMethodChange,
  onLigandInputChange,
  onValidateSMILES,
  onStructureFile,
  onRefresh,
}: MDStepSelectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Step 1: Complex Selection</h3>
        <Button onClick={onRefresh} size="sm" variant="outline" className="bg-gray-700 hover:bg-gray-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
      </div>

      {/* Protein Selection */}
      <div className="space-y-3">
        <Label className="mb-2 block">Protein Structure</Label>
        <div className={`p-3 rounded-lg border ${
          currentStructure 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-gray-800/50 border-gray-700/50'
        }`}>
          <div className="flex items-center gap-2">
            {currentStructure ? (
              <>
                <div className="p-1 rounded-full bg-green-500/20">
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <span className="text-gray-300">
                  {currentStructure.structure_id || 'Structure loaded'}
                </span>
              </>
            ) : (
              <>
                <div className="p-1 rounded-full bg-yellow-500/20">
                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                </div>
                <span className="text-gray-400">
                  No protein structure loaded
                </span>
              </>
            )}
          </div>
        </div>
        {!currentStructure && (
          <InfoBox variant="warning" title="No Structure Loaded">
            Please load a protein structure first using the Input tool.
          </InfoBox>
        )}
      </div>

      {/* Ligand Input Tabs */}
      <div>
        <Label className="mb-2 block">Ligand Input Method</Label>
        <div className="flex space-x-2 mb-4">
          {[
            { id: 'existing' as LigandInputMethod, label: 'Existing', icon: '📋' },
            { id: 'smiles' as LigandInputMethod, label: 'SMILES', icon: '🧪' },
            { id: 'structure' as LigandInputMethod, label: 'File', icon: '📁' },
          ].map((method) => (
            <button
              key={method.id}
              onClick={() => onLigandMethodChange(method.id)}
              className={`flex-1 py-2 px-4 rounded transition-colors ${
                selectedLigandMethod === method.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className="mr-2">{method.icon}</span>
              {method.label}
            </button>
          ))}
        </div>

        {/* Existing Ligands */}
        {selectedLigandMethod === 'existing' && (
          <div>
            <select
              value={ligandInput.ligand_id || ''}
              onChange={(e) => onLigandInputChange({ ligand_id: e.target.value })}
              className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="">Select ligand...</option>
              {availableLigands.map((ligand) => (
                <option key={ligand.id} value={ligand.id}>
                  {ligand.name} ({ligand.type})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Choose from extracted ligands, edited molecules, or docked poses</p>
          </div>
        )}

        {/* SMILES Input */}
        {selectedLigandMethod === 'smiles' && (
          <div className="space-y-3">
            <Input
              value={ligandInput.smiles || ''}
              onChange={(e) => onLigandInputChange({ smiles: e.target.value })}
              placeholder="Enter SMILES string (e.g., CC(C)NC(=O)c1ccccc1)"
              className="bg-gray-700 border-gray-600"
            />
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={ligandInput.generate_conformer ?? true}
                  onChange={(e) => onLigandInputChange({ generate_conformer: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-300">Generate 3D conformer</span>
              </label>
              <Button onClick={onValidateSMILES} size="sm" variant="outline">
                Validate
              </Button>
            </div>
            {smilesValidation && (
              <div
                className={`p-2 rounded text-xs ${
                  smilesValidation.valid ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                }`}
              >
                {smilesValidation.message}
              </div>
            )}
          </div>
        )}

        {/* Structure File Upload */}
        {selectedLigandMethod === 'structure' && (
          <div className="space-y-3">
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-gray-500 transition-colors cursor-pointer"
              onClick={() => document.getElementById('structure-file-input')?.click()}
            >
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-gray-300 mb-1">Drop structure file or click to browse</p>
              <p className="text-xs text-gray-400">Supports SDF, MOL, PDB formats</p>
              <input
                id="structure-file-input"
                type="file"
                accept=".sdf,.mol,.pdb"
                onChange={(e) => e.target.files?.[0] && onStructureFile(e.target.files[0])}
                className="hidden"
              />
            </div>
            {ligandInput.file_name && (
              <div className="p-2 bg-gray-800 rounded text-sm text-gray-300">
                <span className="font-semibold">File:</span> {ligandInput.file_name}
              </div>
            )}
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={ligandInput.preserve_pose ?? true}
                onChange={(e) => onLigandInputChange({ preserve_pose: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-300">Preserve original 3D pose</span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
