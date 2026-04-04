'use client'

import { RefreshCw, Check, AlertCircle, Upload, FlaskConical, Atom } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { StructureOption, AccentColor } from './types'
import { accentColorClasses } from './types'

interface StructureSelectorProps {
  // Protein selection
  selectedProtein: string | null
  onProteinSelect: (id: string | null) => void
  proteinLabel?: string
  proteinDescription?: string
  showProteinStatus?: boolean
  hasProtein?: boolean
  proteinName?: string

  // Ligand selection
  selectedLigand: string | null
  onLigandSelect: (id: string | null) => void
  availableLigands: StructureOption[]
  ligandLabel?: string
  ligandDescription?: string
  showLigandInput?: boolean

  // SMILES input (optional)
  showSmilesInput?: boolean
  smilesValue?: string
  onSmilesChange?: (smiles: string) => void
  smilesValidation?: { valid: boolean; message?: string } | null
  onValidateSmiles?: () => void

  // File upload (optional)
  showFileUpload?: boolean
  onFileUpload?: (file: File) => void
  uploadedFileName?: string

  // Ligand input method selection
  ligandInputMethod?: 'existing' | 'smiles' | 'structure' | 'hetid'
  onLigandMethodChange?: (method: 'existing' | 'smiles' | 'structure' | 'hetid') => void

  // HET ID input (optional)
  hetidValue?: string
  onHetidChange?: (hetid: string) => void
  hetidValidation?: { valid: boolean; message?: string } | null
  onValidateHetid?: () => void

  // Actions
  onRefresh?: () => void

  // Styling
  accentColor?: AccentColor
}

export function StructureSelector({
  selectedProtein,
  onProteinSelect,
  proteinLabel = 'Protein Structure',
  proteinDescription,
  showProteinStatus = true,
  hasProtein = false,
  proteinName,

  selectedLigand,
  onLigandSelect,
  availableLigands,
  ligandLabel = 'Ligand Selection',
  ligandDescription = 'Choose from extracted ligands or library molecules',
  showLigandInput = true,

  showSmilesInput = false,
  smilesValue = '',
  onSmilesChange,
  smilesValidation,
  onValidateSmiles,

  showFileUpload = false,
  onFileUpload,
  uploadedFileName,

  ligandInputMethod = 'existing',
  onLigandMethodChange,

  hetidValue = '',
  onHetidChange,
  hetidValidation,
  onValidateHetid,

  onRefresh,

  accentColor = 'cyan',
}: StructureSelectorProps) {
  const colors = accentColorClasses[accentColor]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onFileUpload) {
      onFileUpload(file)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      {onRefresh && (
        <div className="flex items-center justify-end">
          <Button
            onClick={onRefresh}
            size="sm"
            variant="outline"
            className="gap-2 bg-gray-700 hover:bg-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      )}

      {/* Protein Selection - Only show if enabled */}
      {showProteinStatus && (
        <div className="space-y-2">
          <Label className="text-gray-300">{proteinLabel}</Label>
          <div className={`p-3 rounded-lg border ${hasProtein ? 'bg-gray-800 border-gray-700' : 'bg-gray-800/50 border-gray-700/50'}`}>
            <div className="flex items-center gap-2">
              {hasProtein ? (
                <>
                  <div className={`p-1 rounded-full ${colors.bgLight}`}>
                    <Check className={`w-4 h-4 ${colors.text}`} />
                  </div>
                  <span className="text-gray-300">
                    {proteinName || 'Structure loaded'}
                  </span>
                </>
              ) : (
                <>
                  <div className="p-1 rounded-full bg-yellow-500/20">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  </div>
                  <span className="text-gray-400">
                    No protein structure loaded. Please load a structure first.
                  </span>
                </>
              )}
            </div>
            {proteinDescription && (
              <p className="text-xs text-gray-500 mt-1 ml-7">{proteinDescription}</p>
            )}
          </div>
        </div>
      )}

      {/* Ligand Input Method Selection */}
      {onLigandMethodChange && (
        <div className="space-y-2">
          <Label className="text-gray-300">Ligand Input Method</Label>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => onLigandMethodChange('existing')}
              className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                ligandInputMethod === 'existing'
                  ? `${colors.border} ${colors.bgLight}`
                  : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <Atom className={`w-5 h-5 ${ligandInputMethod === 'existing' ? colors.text : 'text-gray-400'}`} />
              <span className={`text-xs ${ligandInputMethod === 'existing' ? colors.text : 'text-gray-400'}`}>
                Existing
              </span>
            </button>
            <button
              onClick={() => onLigandMethodChange('smiles')}
              className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                ligandInputMethod === 'smiles'
                  ? `${colors.border} ${colors.bgLight}`
                  : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <FlaskConical className={`w-5 h-5 ${ligandInputMethod === 'smiles' ? colors.text : 'text-gray-400'}`} />
              <span className={`text-xs ${ligandInputMethod === 'smiles' ? colors.text : 'text-gray-400'}`}>
                SMILES
              </span>
            </button>
            <button
              onClick={() => onLigandMethodChange('hetid')}
              className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                ligandInputMethod === 'hetid'
                  ? `${colors.border} ${colors.bgLight}`
                  : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <Atom className={`w-5 h-5 ${ligandInputMethod === 'hetid' ? colors.text : 'text-gray-400'}`} />
              <span className={`text-xs ${ligandInputMethod === 'hetid' ? colors.text : 'text-gray-400'}`}>
                HET ID
              </span>
            </button>
            <button
              onClick={() => onLigandMethodChange('structure')}
              className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 ${
                ligandInputMethod === 'structure'
                  ? `${colors.border} ${colors.bgLight}`
                  : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
              }`}
            >
              <Upload className={`w-5 h-5 ${ligandInputMethod === 'structure' ? colors.text : 'text-gray-400'}`} />
              <span className={`text-xs ${ligandInputMethod === 'structure' ? colors.text : 'text-gray-400'}`}>
                Upload
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Ligand Selection Dropdown */}
      {showLigandInput && ligandInputMethod === 'existing' && (
        <div className="space-y-2">
          <Label className="text-gray-300">{ligandLabel}</Label>
          <select
            value={selectedLigand || ''}
            onChange={(e) => onLigandSelect(e.target.value || null)}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">Select ligand...</option>
            {availableLigands.map((ligand) => (
              <option key={ligand.id} value={ligand.id}>
                {ligand.name}
                {ligand.source && ` (${ligand.source === 'current_structure' ? 'Structure' : 'Library'})`}
              </option>
            ))}
          </select>
          {ligandDescription && (
            <p className="text-xs text-gray-500">{ligandDescription}</p>
          )}
        </div>
      )}

      {/* SMILES Input */}
      {showSmilesInput && ligandInputMethod === 'smiles' && (
        <div className="space-y-2">
          <Label className="text-gray-300">SMILES String</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={smilesValue}
              onChange={(e) => onSmilesChange?.(e.target.value)}
              placeholder="Enter SMILES string..."
              className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {onValidateSmiles && (
              <Button
                onClick={onValidateSmiles}
                variant="outline"
                className="bg-gray-700 hover:bg-gray-600"
              >
                Validate
              </Button>
            )}
          </div>
          {smilesValidation && (
            <div className={`text-xs ${smilesValidation.valid ? 'text-green-400' : 'text-red-400'}`}>
              {smilesValidation.message || (smilesValidation.valid ? 'Valid SMILES' : 'Invalid SMILES')}
            </div>
          )}
        </div>
      )}

      {/* HET ID Input */}
      {ligandInputMethod === 'hetid' && (
        <div className="space-y-2">
          <Label className="text-gray-300">HET ID</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={hetidValue}
              onChange={(e) => onHetidChange?.(e.target.value.toUpperCase())}
              placeholder="Enter HET ID (e.g., LIG, ATP, GTP)..."
              className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            {onValidateHetid && (
              <Button
                onClick={onValidateHetid}
                variant="outline"
                className="bg-gray-700 hover:bg-gray-600"
              >
                Extract
              </Button>
            )}
          </div>
          {hetidValidation && (
            <div className={`text-xs ${hetidValidation.valid ? 'text-green-400' : 'text-red-400'}`}>
              {hetidValidation.message || (hetidValidation.valid ? 'Valid HET ID' : 'Invalid HET ID')}
            </div>
          )}
          <p className="text-xs text-gray-500">Enter the 3-letter HET ID code from the PDB structure</p>
        </div>
      )}

      {/* File Upload */}
      {showFileUpload && ligandInputMethod === 'structure' && (
        <div className="space-y-2">
          <Label className="text-gray-300">Upload Structure File</Label>
          <div className="relative">
            <input
              type="file"
              accept=".pdb,.sdf,.mol,.mol2"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="p-4 border-2 border-dashed border-gray-700 rounded-lg text-center hover:border-gray-600 transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
              {uploadedFileName ? (
                <p className={`text-sm ${colors.text}`}>{uploadedFileName}</p>
              ) : (
                <p className="text-sm text-gray-400">
                  Click or drag to upload PDB, SDF, or MOL file
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
