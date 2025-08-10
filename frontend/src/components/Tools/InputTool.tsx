'use client'

import { useState } from 'react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { isValidPdbId, isValidSmiles } from '@/lib/utils'
import { saveLigandsToLibrary } from '@/lib/structure-utils'
import { FileUpload } from '@/components/ui/FileUpload'

export function InputTool() {
  const [activeTab, setActiveTab] = useState<'pdb' | 'upload' | 'smiles' | 'hetid'>('pdb')
  const [pdbId, setPdbId] = useState('')
  const [smiles, setSmiles] = useState('')
  const [hetid, setHetid] = useState('')
  const [hetidError, setHetidError] = useState<string | null>(null)
  const [cleanAndKeepLigands, setCleanAndKeepLigands] = useState(false)
  const { currentStructure, addStructureTab, setCurrentStructure, setIsLoading, setError } = useMolecularStore()
  const { addNotification, recentPdbIds, addRecentPdbId } = useUIStore()

  const handleFetchPDB = async (overridePdbId?: string) => {
    const targetPdbId = (overridePdbId || pdbId).toUpperCase()
    if (!isValidPdbId(targetPdbId)) {
      setError('Invalid PDB ID format')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.fetchPDB(targetPdbId)
      let structureName = targetPdbId.toUpperCase()

      // If cleaning is enabled, clean the protein while keeping ligands
      if (cleanAndKeepLigands && structure.pdb_data) {
        addNotification('info', 'Cleaning protein structure...')
        try {
          const cleanResult = await api.cleanProteinStaged(structure.pdb_data, {
            remove_heterogens: true,
            remove_water: true,
            add_missing_residues: true,
            add_missing_atoms: true,
            add_missing_hydrogens: true,
            ph: 7.4,
            keep_ligands: true,
          })

          // Update structure with cleaned PDB data
          // Backend returns stages: final_with_ligands, after_hydrogens, after_missing_atoms, after_water, after_heterogens, original
          const cleanedPdb = cleanResult.stages?.final_with_ligands ||
            cleanResult.stages?.after_hydrogens ||
            cleanResult.stages?.after_missing_atoms
          if (cleanedPdb) {
            structure.pdb_data = cleanedPdb
            // Update structure ID so viewer treats it as a new structure
            structure.structure_id = `${pdbId.toUpperCase()}_cleaned`
            structureName = `${pdbId.toUpperCase()} (cleaned)`
            // Restore ligands if they were extracted
            if (cleanResult.ligands) {
              structure.ligands = cleanResult.ligands
            }
            addNotification('success', 'Protein cleaned successfully (ligands preserved)')
          }
        } catch (cleanError) {
          console.error('Failed to clean protein:', cleanError)
          addNotification('warning', 'Protein cleaning failed, using original structure')
        }
      }

      // Add the structure as a new tab
      addStructureTab(structure, structureName)
      addNotification('success', `Loaded structure: ${structureName}`)

      // Automatically save ligands to library if present
      if (structure.ligands && Object.keys(structure.ligands).length > 0) {
        const result = await saveLigandsToLibrary(structure)
        if (result.saved > 0) {
          addNotification('success', `Saved ${result.saved} ligand(s) to library`)
        } else if (result.duplicates > 0) {
          addNotification('info', `Ligand(s) already exist in library`)
        }
        if (result.errors.length > 0) {
          console.warn('Some ligands could not be saved:', result.errors)
        }
      }

      // Add to recent PDB IDs
      addRecentPdbId(targetPdbId)
    } catch (error: any) {
      setError(error.message || 'Failed to fetch PDB structure')
      addNotification('error', 'Failed to fetch PDB structure')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.uploadStructure(file)
      addStructureTab(structure, file.name)
      addNotification('success', `Uploaded structure: ${file.name}`)

      // Automatically save ligands to library if present
      if (structure.ligands && Object.keys(structure.ligands).length > 0) {
        const result = await saveLigandsToLibrary(structure)
        if (result.saved > 0) {
          addNotification('success', `Saved ${result.saved} ligand(s) to library`)
        } else if (result.duplicates > 0) {
          addNotification('info', `Ligand(s) already exist in library`)
        }
        if (result.errors.length > 0) {
          console.warn('Some ligands could not be saved:', result.errors)
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to upload structure')
      addNotification('error', 'Failed to upload structure')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSMILES = async () => {
    if (!isValidSmiles(smiles)) {
      setError('Invalid SMILES string')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const structure = await api.uploadSmiles(smiles, smiles)
      addStructureTab(structure, smiles)
      addNotification('success', 'Generated 3D structure from SMILES')

      // Check if molecule was saved to library
      if (structure.library_save) {
        if (structure.library_save.saved) {
          addNotification('success', `Saved to library: ${structure.structure_id}`)
        } else if (structure.library_save.already_exists) {
          addNotification('info', 'Molecule already exists in library')
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to process SMILES')
      addNotification('error', 'Failed to process SMILES')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHETID = async () => {
    if (!hetid.trim()) {
      setHetidError('HET ID cannot be empty')
      return
    }

    setIsLoading(true)
    setHetidError(null)
    setError(null)
    try {
      // Fetch structure from PDB database containing this HET ID
      const structure = await api.fetchLigandByHETID(hetid.toUpperCase())
      const sourcePdbId = (structure as any).source_pdb_id || 'Unknown'
      const structureName = `${hetid.toUpperCase()} (from ${sourcePdbId})`
      
      addStructureTab(structure, structureName)
      addNotification('success', `Fetched structure with HET ID ${hetid.toUpperCase()} from PDB ${sourcePdbId}`)

      setHetid('')
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to fetch structure'
      setHetidError(errorMsg)
      setError(errorMsg)
      addNotification('error', errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        {(['pdb', 'upload', 'smiles', 'hetid'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
              }`}
          >
            {tab === 'hetid' ? 'HET ID' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'pdb' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">PDB ID</label>
            <input
              type="text"
              value={pdbId}
              onChange={(e) => setPdbId(e.target.value.toUpperCase())}
              placeholder="e.g., 1CRN"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleFetchPDB()}
            />
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={cleanAndKeepLigands}
                onChange={(e) => setCleanAndKeepLigands(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              Clean Protein + Keep Ligands
            </label>
            {cleanAndKeepLigands && (
              <p className="text-xs text-gray-500 ml-6">
                Fixes missing atoms, adds hydrogens, removes water
              </p>
            )}

            {/* Quick Options */}
            {recentPdbIds.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs text-gray-500 w-full mb-1">Recent:</span>
                {recentPdbIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setPdbId(id)
                      handleFetchPDB(id)
                    }}
                    className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500/50 text-blue-400 rounded transition-all"
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => handleFetchPDB()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Fetch Structure
            </button>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-3">
            <FileUpload
              onFileSelect={(file) => {
                // Create a synthetic event to match the expected handler signature or update the handler
                const syntheticEvent = { target: { files: [file] } } as any
                handleFileUpload(syntheticEvent)
              }}
              accept=".pdb,.cif,.mmcif,.sdf"
              label="Upload Structure"
              description="Drag and drop a PDB, CIF, or SDF file"
            />
          </div>
        )}

        {activeTab === 'smiles' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">SMILES String</label>
            <input
              type="text"
              value={smiles}
              onChange={(e) => setSmiles(e.target.value)}
              placeholder="e.g., CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleSMILES()}
            />
            <button
              onClick={handleSMILES}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Generate 3D Structure
            </button>
          </div>
        )}

        {activeTab === 'hetid' && (
          <div className="space-y-3">
            <label className="block text-sm text-gray-300">HET ID</label>
            <p className="text-xs text-gray-500">
              Search PDB database for structures containing a specific ligand (e.g., LIG, ATP, GTP)
            </p>
            <input
              type="text"
              value={hetid}
              onChange={(e) => setHetid(e.target.value.toUpperCase())}
              placeholder="e.g., LIG, ATP, GTP"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
              onKeyDown={(e) => e.key === 'Enter' && handleHETID()}
            />
            {hetidError && (
              <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-sm text-red-400">
                {hetidError}
              </div>
            )}
            <button
              onClick={handleHETID}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              Fetch Structure
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
