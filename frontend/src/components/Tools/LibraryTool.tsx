'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Library, Eye, Trash2, X, Beaker, Download, Pill, ChevronDown, Zap, PenTool, Check, Pencil } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'

interface Molecule {
  id: number
  name: string
  original_name?: string  // Original ligand name from protein (e.g., "NAG", "ATP")
  molfile: string
  canonical_smiles: string
  molecular_weight: number
  logp: number
}

export function LibraryTool() {
  const [molecules, setMolecules] = useState<Molecule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [viewingMolecule, setViewingMolecule] = useState<Molecule | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set())
  const [runningAdmet, setRunningAdmet] = useState<number | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const { addStructureTab, setAdmetResults, setIsAdmetRunning, setCurrentStructure, setPendingEditorImport } = useMolecularStore()
  const { setActiveTool } = useUIStore()

  // Fetch molecules on mount
  useEffect(() => {
    fetchMolecules()
  }, [])

  const fetchMolecules = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMolecules()
      setMolecules(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error('Failed to fetch molecules:', err)
      setError(err.response?.data?.error || err.message || 'Failed to fetch molecules')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (moleculeId: number) => {
    if (!confirm('Are you sure you want to delete this molecule?')) {
      return
    }

    setDeletingId(moleculeId)
    try {
      await api.deleteMolecule(String(moleculeId))
      setMolecules(prev => prev.filter(m => m.id !== moleculeId))
    } catch (err: any) {
      console.error('Failed to delete molecule:', err)
      setError(err.response?.data?.error || err.message || 'Failed to delete molecule')
    } finally {
      setDeletingId(null)
    }
  }

  const handleView3D = async (molecule: Molecule) => {
    try {
      // Convert molfile to a structure and load it in the viewer
      // We'll use the uploadSmiles endpoint to create a structure
      const structure = await api.uploadSmiles(molecule.canonical_smiles, molecule.name)
      // Add as a new tab instead of replacing current structure
      addStructureTab(structure, molecule.name)
      setViewingMolecule(null)

      // You might want to show a toast notification here
      console.log('Molecule loaded in new 3D viewer tab:', molecule.name)
    } catch (err: any) {
      console.error('Failed to load molecule in 3D:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load molecule in 3D viewer')
    }
  }

  const handleDownloadSDF = (molecule: Molecule) => {
    try {
      // Create SDF content from molfile
      // The molfile is already in SDF format (V2000 or V3000)
      const sdfContent = molecule.molfile

      // Create a blob from the SDF content
      const blob = new Blob([sdfContent], { type: 'chemical/x-mdl-sdfile' })

      // Create a download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      // Sanitize filename - remove special characters and spaces
      const sanitizedName = molecule.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      link.download = `${sanitizedName}.sdf`

      // Trigger download
      document.body.appendChild(link)
      link.click()

      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log('Downloaded molecule as SDF:', molecule.name)
    } catch (err: any) {
      console.error('Failed to download molecule:', err)
      setError(err.message || 'Failed to download molecule')
    }
  }

  const handleImageError = (moleculeId: number) => {
    setImageErrors(prev => new Set(prev).add(moleculeId))
  }

  const handleStartEdit = (molecule: Molecule) => {
    setEditingId(molecule.id)
    setEditingName(molecule.name)
    // Focus the input after it renders
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleSaveName = async (moleculeId: number) => {
    if (!editingName.trim()) {
      setError('Name cannot be empty')
      return
    }

    setSavingName(true)
    try {
      const updatedMolecule = await api.updateMolecule(moleculeId, { name: editingName.trim() })
      setMolecules(prev => prev.map(m =>
        m.id === moleculeId ? { ...m, name: updatedMolecule.name } : m
      ))
      setEditingId(null)
      setEditingName('')
    } catch (err: any) {
      console.error('Failed to update molecule name:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, moleculeId: number) => {
    if (e.key === 'Enter') {
      handleSaveName(moleculeId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleRunADMET = async (molecule: Molecule) => {
    setOpenDropdownId(null)
    setRunningAdmet(molecule.id)
    setIsAdmetRunning(true)
    setError(null)

    try {
      const result = await api.predictADMET({ smiles: molecule.canonical_smiles })
      setAdmetResults(result)
      setIsAdmetRunning(false)
      setRunningAdmet(null)

      // Switch to ADMET tool to show results
      setActiveTool('admet')
    } catch (err: any) {
      console.error('Failed to run ADMET prediction:', err)
      setError(err.response?.data?.error || err.message || 'Failed to run ADMET prediction')
      setIsAdmetRunning(false)
      setRunningAdmet(null)
    }
  }

  const handleOpenQC = async (molecule: Molecule) => {
    setOpenDropdownId(null)
    try {
      // Load molecule into viewer first, then switch to QC tool
      const structure = await api.uploadSmiles(molecule.canonical_smiles, molecule.name)
      addStructureTab(structure, molecule.name)
      setActiveTool('quantum-chemistry')
    } catch (err: any) {
      console.error('Failed to load molecule for QC:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load molecule for QC')
    }
  }

  const handleOpenEditor = async (molecule: Molecule) => {
    setOpenDropdownId(null)
    try {
      // Load molecule into viewer as a structure, then switch to editor
      const structure = await api.uploadSmiles(molecule.canonical_smiles, molecule.name)
      addStructureTab(structure, molecule.name)
      setPendingEditorImport(true)
      setActiveTool('editor')
    } catch (err: any) {
      console.error('Failed to load molecule for editor:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load molecule for editor')
    }
  }

  // Generate image URL for molecule using SMILES
  const getMoleculeImageUrl = (molecule: Molecule) => {
    // Use a public SMILES to image service or your backend endpoint
    // For now, we'll use PubChem's depict service as a fallback
    const encodedSmiles = encodeURIComponent(molecule.canonical_smiles)
    return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/PNG?image_size=200x200`
  }

  return (
    <div className="space-y-6 h-full flex flex-col px-6 py-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-1">Saved Molecules</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Browse your saved molecules
            </p>
          </div>
          <Button
            onClick={fetchMolecules}
            disabled={loading}
            variant="outline"
            size="sm"
            className="bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="bg-red-500/10 border-red-500/50">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && molecules.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto" />
            <p className="text-sm text-gray-400">Loading molecules...</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && molecules.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <div className="p-4 bg-gray-800/50 rounded-full w-fit mx-auto">
              <Beaker className="h-8 w-8 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">No molecules saved yet</p>
              <p className="text-xs text-gray-500 mt-1">Molecules will appear here when saved</p>
            </div>
          </div>
        </div>
      )}

      {/* Molecule Grid */}
      {!loading && molecules.length > 0 && (
        <div className="flex-1 overflow-y-auto pr-1 overflow-x-visible">
          <div className="grid grid-cols-1 gap-4 pb-4">
            {molecules.map((molecule) => (
              <div
                key={molecule.id}
                className="bg-gradient-to-br from-gray-800/70 to-gray-800/40 border border-gray-700/60 rounded-xl overflow-visible hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200"
              >
                <div className="p-4">
                  <div className="flex gap-4">
                    {/* Molecule Image */}
                    <div className="flex-shrink-0">
                      <div className="bg-white rounded-lg overflow-hidden w-28 h-28 flex items-center justify-center shadow-md">
                        {imageErrors.has(molecule.id) ? (
                          <div className="flex flex-col items-center justify-center text-gray-400 p-3">
                            <Beaker className="h-8 w-8 mb-1" />
                            <p className="text-[10px] text-center">No image</p>
                          </div>
                        ) : (
                          <img
                            src={getMoleculeImageUrl(molecule)}
                            alt={molecule.name}
                            className="w-full h-full object-contain p-1.5"
                            onError={() => handleImageError(molecule.id)}
                          />
                        )}
                      </div>
                    </div>

                    {/* Molecule Info */}
                    <div className="flex-1 min-w-0 space-y-3">
                      {/* Name - Editable */}
                      <div className="space-y-1 min-w-0">
                        {editingId === molecule.id ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, molecule.id)}
                              className="flex-1 min-w-0 bg-gray-900 border border-blue-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                              disabled={savingName}
                            />
                            <button
                              onClick={() => handleSaveName(molecule.id)}
                              disabled={savingName}
                              className="p-1 text-green-400 hover:text-green-300 transition-colors"
                              title="Save"
                            >
                              {savingName ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={savingName}
                              className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <h4 className="text-sm font-semibold text-white leading-tight truncate flex-1" title={molecule.name}>
                              {molecule.name}
                            </h4>
                            <button
                              onClick={() => handleStartEdit(molecule)}
                              className="p-1 text-gray-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
                              title="Edit name"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {/* Original Name (from protein) */}
                        {molecule.original_name && (
                          <p className="text-xs text-gray-500 truncate" title={`Original: ${molecule.original_name}`}>
                            {molecule.original_name}
                          </p>
                        )}
                      </div>

                      {/* Properties Row */}
                      <div className="flex gap-2">
                        <div className="flex-1 bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-700/30 rounded-lg px-2.5 py-1.5">
                          <p className="text-blue-400 text-[9px] uppercase tracking-wider font-semibold mb-0.5">Mol. Weight</p>
                          <p className="text-white text-xs font-bold">
                            {molecule.molecular_weight.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex-1 bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-700/30 rounded-lg px-2.5 py-1.5">
                          <p className="text-purple-400 text-[9px] uppercase tracking-wider font-semibold mb-0.5">LogP</p>
                          <p className="text-white text-xs font-bold">
                            {molecule.logp.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SMILES - Full Width Below */}
                  <div className="mt-3 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2">
                    <p className="text-gray-400 text-[9px] uppercase tracking-wider font-semibold mb-1">SMILES</p>
                    <p className="text-gray-300 text-[11px] font-mono leading-relaxed break-all" title={molecule.canonical_smiles}>
                      {molecule.canonical_smiles}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={() => handleView3D(molecule)}
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-xs font-medium shadow-md h-8"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View 3D
                    </Button>
                    {/* Tools Dropdown */}
                    <div className="relative flex-1">
                      <Button
                        onClick={() => setOpenDropdownId(openDropdownId === molecule.id ? null : molecule.id)}
                        size="sm"
                        disabled={runningAdmet === molecule.id}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-xs font-medium shadow-md h-8"
                        title="Tools"
                      >
                        {runningAdmet === molecule.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Pill className="h-3.5 w-3.5 mr-1.5" />
                            Tools
                            <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                          </>
                        )}
                      </Button>
                      {/* Dropdown Menu - Absolute positioning relative to button container */}
                      {openDropdownId === molecule.id && (
                        <>
                          {/* Backdrop to close dropdown */}
                          <div
                            className="fixed inset-0 z-[9998]"
                            onClick={() => setOpenDropdownId(null)}
                          />
                          {/* Dropdown Menu - Absolute position relative to parent */}
                          <div
                            className="absolute top-full left-0 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-[9999] overflow-hidden"
                          >
                            <button
                              onClick={() => handleRunADMET(molecule)}
                              className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-purple-600/20 hover:text-white flex items-center gap-2 transition-colors whitespace-nowrap"
                            >
                              <Pill className="h-3.5 w-3.5" />
                              ADMET
                            </button>
                            <button
                              onClick={() => handleOpenQC(molecule)}
                              className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-blue-600/20 hover:text-white flex items-center gap-2 transition-colors whitespace-nowrap"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              QC
                            </button>
                            <button
                              onClick={() => handleOpenEditor(molecule)}
                              className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-green-600/20 hover:text-white flex items-center gap-2 transition-colors whitespace-nowrap"
                            >
                              <PenTool className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <Button
                      onClick={() => handleDownloadSDF(molecule)}
                      size="sm"
                      variant="outline"
                      className="px-3 bg-gray-800/80 border-gray-600 hover:bg-green-900/60 hover:border-green-600 text-gray-300 hover:text-green-400 h-8"
                      title="Download as SDF"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(molecule.id)}
                      size="sm"
                      variant="outline"
                      disabled={deletingId === molecule.id}
                      className="px-3 bg-gray-800/80 border-gray-600 hover:bg-red-900/60 hover:border-red-600 text-gray-300 hover:text-red-400 h-8"
                    >
                      {deletingId === molecule.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3D View Modal */}
      {viewingMolecule && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">{viewingMolecule.name}</h3>
              <Button
                onClick={() => setViewingMolecule(null)}
                size="sm"
                variant="outline"
                className="bg-gray-800 border-gray-700 hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-400 text-center py-8">
                3D viewer integration coming soon...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
