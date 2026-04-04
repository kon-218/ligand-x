'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, AlertCircle, Library, Eye, Trash2, X, Beaker, Download, Pill, ChevronDown, Zap, PenTool, Check, Pencil, GitBranch, Maximize2 } from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { baseColorConfigs, generateLibraryPropBadgeStyles } from '@/lib/base-color-config'
import { useBaseColor } from '@/hooks/use-base-color'
import { useWarmAccent } from '@/hooks/use-warm-accent'
import type { ADMETResult } from '@/types/molecular'
import { cn } from '@/lib/utils'

interface Molecule {
  id: number
  name: string
  original_name?: string  // Original ligand name from protein (e.g., "NAG", "ATP")
  molfile: string
  canonical_smiles: string
  molecular_weight: number
  logp: number
  num_atoms?: number
  num_bonds?: number
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const { addStructureTab, addImageFileTab, setAdmetResults, setIsAdmetRunning, setCurrentStructure, setPendingEditorImport, setPendingTautomerSmiles, libraryLastUpdated, structureTabs, setActiveTab } = useMolecularStore()
  const { setActiveTool, isSidePanelExpanded, closeOverlay } = useUIStore()
  const bc_active = useBaseColor()
  const bcPreset = baseColorConfigs[bc_active.basePreset]
  const libraryPropBadgeStyles = useMemo(
    () => (bc_active.isCustom ? generateLibraryPropBadgeStyles(bc_active.hexValue) : null),
    [bc_active.isCustom, bc_active.hexValue]
  )
  const wa = useWarmAccent()
  const wac = wa.config

  // Fetch molecules on mount or when library is updated from elsewhere
  useEffect(() => {
    fetchMolecules()
  }, [libraryLastUpdated])

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
    setDeletingId(moleculeId)
    setConfirmDeleteId(null)
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
      // Check if a tab for this molecule is already open (priority: ID, fallback: canonical SMILES)
      // Note: Name is not part of the check since the tab name might differ from library name
      const existingTab = structureTabs.find(tab =>
        tab.metadata?.molecule_id === molecule.id ||
        tab.smiles === molecule.canonical_smiles
      )

      if (existingTab) {
        setActiveTab(existingTab.id)
        closeOverlay()
        return
      }

      // Convert molfile to a structure and load it in the viewer
      const structure = await api.uploadSmiles(molecule.canonical_smiles, molecule.name)
      // Tag with molecule ID for future tab reuse
      structure.metadata = { ...structure.metadata, molecule_id: molecule.id }

      // Add as a new tab instead of replacing current structure
      addStructureTab(structure, molecule.name)
      setViewingMolecule(null)
      // Switch to viewer: close library overlay
      closeOverlay()

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
      setAdmetResults(result as ADMETResult)
      setIsAdmetRunning(false)
      setRunningAdmet(null)

      // Switch to ADMET tool to show results
      // Switch to ADMET tool and close library overlay
      setActiveTool('admet')
      closeOverlay()
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
      closeOverlay()
    } catch (err: any) {
      console.error('Failed to load molecule for QC:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load molecule for QC')
    }
  }

  const handleExploreTautomers = (molecule: Molecule) => {
    setOpenDropdownId(null)
    setPendingTautomerSmiles(molecule.canonical_smiles)
    setActiveTool('input')
    closeOverlay()
  }

  const handleOpenEditor = async (molecule: Molecule) => {
    setOpenDropdownId(null)
    try {
      // Load molecule into viewer as a structure, then switch to editor
      const structure = await api.uploadSmiles(molecule.canonical_smiles, molecule.name)
      addStructureTab(structure, molecule.name)
      setPendingEditorImport(true)
      setActiveTool('editor')
      closeOverlay()
    } catch (err: any) {
      console.error('Failed to load molecule for editor:', err)
      setError(err.response?.data?.error || err.message || 'Failed to load molecule for editor')
    }
  }

  // PubChem PNG by SMILES (thumbnail vs viewer tab)
  const getMoleculeImageUrl = (molecule: Molecule, imageSize: string = '200x200') => {
    const encodedSmiles = encodeURIComponent(molecule.canonical_smiles)
    return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/PNG?image_size=${imageSize}`
  }

  const handleOpen2DInViewer = (molecule: Molecule) => {
    if (imageErrors.has(molecule.id)) return
    const url = getMoleculeImageUrl(molecule, '800x800')
    addImageFileTab(url, `${molecule.name} (2D)`, { libraryMoleculeId: molecule.id })
    closeOverlay()
  }

  return (
    <div className="space-y-6 h-full flex flex-col px-6 py-6" style={{ backgroundColor: '#0F172A' }}>
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
            <Loader2
              className={`h-8 w-8 animate-spin mx-auto ${!bc_active.isCustom ? bc_active.text : ''}`}
              style={bc_active.isCustom ? bc_active.styles?.text : undefined}
            />
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
          <div className={`grid gap-4 pb-4 ${isSidePanelExpanded ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {molecules.map((molecule) => (
              <div
                key={molecule.id}
                className={`bg-gray-800/50 border border-gray-700/60 rounded-xl overflow-visible hover:shadow-lg transition-all duration-200 flex flex-col`}
                style={{
                  borderColor: 'rgb(55, 65, 81)',
                  '--tw-shadow-color': `rgb(${bc_active.rgbString} / 0.1)`,
                } as React.CSSProperties & any}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `rgba(${bc_active.rgbString}, 0.4)`
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgb(55, 65, 81)'
                }}
              >
                {/* ── Top row: image + name/properties ── */}
                <div className="flex gap-3 p-3 pb-2">
                  {/* Left: molecule image */}
                  <div className="flex-shrink-0">
                    {imageErrors.has(molecule.id) ? (
                      <div className="bg-white rounded-lg overflow-hidden h-[90px] w-[90px] flex flex-col items-center justify-center text-gray-400 p-2 shadow-sm border border-gray-200/10">
                        <Beaker className="h-6 w-6 mb-1" />
                        <p className="text-[9px] text-center">No image</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpen2DInViewer(molecule)}
                        title="Open 2D structure in viewer"
                        className="group relative bg-white rounded-lg overflow-hidden h-[90px] w-[90px] flex items-center justify-center shadow-sm border border-gray-200/10 cursor-pointer transition-[box-shadow,transform] hover:shadow-md hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800 focus-visible:ring-cyan-500/80"
                      >
                        <img
                          src={getMoleculeImageUrl(molecule)}
                          alt={molecule.name}
                          className="w-full h-full object-contain pointer-events-none"
                          onError={() => handleImageError(molecule.id)}
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors pointer-events-none">
                          <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" aria-hidden />
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Right: name + properties */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    {/* Name */}
                    <div className="min-w-0">
                      {editingId === molecule.id ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, molecule.id)}
                            className={`flex-1 min-w-0 bg-gray-900 border rounded px-2 py-1 text-xs text-white focus:outline-none`}
                            style={{
                              borderColor: `rgba(${bc_active.rgbString}, 0.5)`,
                            }}
                            onFocus={(e) => {
                              (e.target as HTMLInputElement).style.borderColor = bc_active.hexValue
                            }}
                            onBlur={(e) => {
                              (e.target as HTMLInputElement).style.borderColor = `rgba(${bc_active.rgbString}, 0.5)`
                            }}
                            disabled={savingName}
                          />
                          <button
                            onClick={() => handleSaveName(molecule.id)}
                            disabled={savingName}
                            className="p-1 text-green-400 hover:text-green-300 transition-colors flex-shrink-0"
                            title="Save"
                          >
                            {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={savingName}
                            className="p-1 text-gray-400 hover:text-gray-300 transition-colors flex-shrink-0"
                            title="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1 group">
                          <h4 className="text-sm font-semibold text-white leading-snug truncate flex-1" title={molecule.name}>
                            {molecule.name}
                          </h4>
                          <button
                            onClick={() => handleStartEdit(molecule)}
                            className={`p-0.5 text-gray-600 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5`}
                            style={{
                              color: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.color = bc_active.hexValue
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.color = '#4b5563'
                            }}
                            title="Edit name"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {molecule.original_name && (
                        <p className="text-[10px] text-gray-500 truncate mt-0.5" title={`Original: ${molecule.original_name}`}>
                          {molecule.original_name}
                        </p>
                      )}
                    </div>

                    {/* Property badges — 2×2 grid (tinted with base colour) */}
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <div
                        className={cn('rounded-md px-2 py-1', !bc_active.isCustom && bcPreset.libraryPropCell)}
                        style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.cell : undefined}
                      >
                        <p
                          className={cn('text-[8px] uppercase tracking-wider font-semibold leading-none mb-0.5', !bc_active.isCustom && bcPreset.libraryPropLabel)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.label : undefined}
                        >
                          MW
                        </p>
                        <p
                          className={cn('text-[11px] font-bold leading-none', !bc_active.isCustom && bcPreset.libraryPropValue)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.value : undefined}
                        >
                          {molecule.molecular_weight.toFixed(1)}
                        </p>
                      </div>
                      <div
                        className={cn('rounded-md px-2 py-1', !bc_active.isCustom && bcPreset.libraryPropCell)}
                        style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.cell : undefined}
                      >
                        <p
                          className={cn('text-[8px] uppercase tracking-wider font-semibold leading-none mb-0.5', !bc_active.isCustom && bcPreset.libraryPropLabel)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.label : undefined}
                        >
                          LogP
                        </p>
                        <p
                          className={cn('text-[11px] font-bold leading-none', !bc_active.isCustom && bcPreset.libraryPropValue)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.value : undefined}
                        >
                          {molecule.logp.toFixed(2)}
                        </p>
                      </div>
                      <div
                        className={cn('rounded-md px-2 py-1', !bc_active.isCustom && bcPreset.libraryPropCell)}
                        style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.cell : undefined}
                      >
                        <p
                          className={cn('text-[8px] uppercase tracking-wider font-semibold leading-none mb-0.5', !bc_active.isCustom && bcPreset.libraryPropLabel)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.label : undefined}
                        >
                          Atoms
                        </p>
                        <p
                          className={cn('text-[11px] font-bold leading-none', !bc_active.isCustom && bcPreset.libraryPropValue)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.value : undefined}
                        >
                          {molecule.num_atoms ?? '—'}
                        </p>
                      </div>
                      <div
                        className={cn('rounded-md px-2 py-1', !bc_active.isCustom && bcPreset.libraryPropCell)}
                        style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.cell : undefined}
                      >
                        <p
                          className={cn('text-[8px] uppercase tracking-wider font-semibold leading-none mb-0.5', !bc_active.isCustom && bcPreset.libraryPropLabel)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.label : undefined}
                        >
                          Bonds
                        </p>
                        <p
                          className={cn('text-[11px] font-bold leading-none', !bc_active.isCustom && bcPreset.libraryPropValue)}
                          style={bc_active.isCustom && libraryPropBadgeStyles ? libraryPropBadgeStyles.value : undefined}
                        >
                          {molecule.num_bonds ?? '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Divider ── */}
                <div className="mx-3 border-t border-gray-700/50" />

                {/* ── SMILES ── */}
                <div className="px-3 py-2">
                  <p className="text-gray-500 text-[8px] uppercase tracking-wider font-semibold mb-0.5">SMILES</p>
                  <p
                    className="text-gray-400 text-[10px] font-mono leading-relaxed break-all line-clamp-2"
                    title={molecule.canonical_smiles}
                  >
                    {molecule.canonical_smiles}
                  </p>
                </div>

                {/* ── Divider ── */}
                <div className="mx-3 border-t border-gray-700/50" />

                {/* ── Action buttons ── */}
                <div className="p-3 pt-2 flex gap-1.5 mt-auto">
                  <Button
                    onClick={() => handleView3D(molecule)}
                    size="sm"
                    className={`flex-1 text-white text-xs font-medium h-7 px-2 ${!bc_active.isCustom ? `${bc_active.buttonBg} ${bc_active.buttonBgHover}` : ''}`}
                    style={bc_active.isCustom ? {
                      backgroundColor: bc_active.hexValue,
                    } : undefined}
                    onMouseEnter={(e) => {
                      if (bc_active.isCustom) {
                        (e.target as HTMLElement).style.backgroundColor = `rgba(${bc_active.rgbString}, 0.8)`
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (bc_active.isCustom) {
                        (e.target as HTMLElement).style.backgroundColor = bc_active.hexValue
                      }
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View 3D
                  </Button>

                  {/* Tools Dropdown */}
                  <div className="relative flex-1">
                    <Button
                      onClick={() => setOpenDropdownId(openDropdownId === molecule.id ? null : molecule.id)}
                      size="sm"
                      disabled={runningAdmet === molecule.id}
                      className={cn(
                        'w-full text-white text-xs font-medium h-7 px-2',
                        !wa.isCustom && wac && `${wac.buttonBg} ${wac.buttonBgHover}`
                      )}
                      style={wa.isCustom && wa.customStyles ? wa.customStyles.libraryToolsButton : undefined}
                      onMouseEnter={(e) => {
                        if (wa.isCustom) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = `rgba(${wa.rgbString}, 0.85)`
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (wa.isCustom && wa.customStyles) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = wa.customStyles.hexValue
                        }
                      }}
                      title="Tools"
                    >
                      {runningAdmet === molecule.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Pill className="h-3 w-3 mr-1" />
                          Tools
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </>
                      )}
                    </Button>
                    {openDropdownId === molecule.id && (
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => setOpenDropdownId(null)} />
                        <div className="absolute top-full left-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-[9999] overflow-hidden">
                          <button
                            onClick={() => handleRunADMET(molecule)}
                            className={cn(
                              'w-full px-3 py-2 text-left text-xs text-gray-300 hover:text-white flex items-center gap-2 transition-colors',
                              !wa.isCustom && wac && wac.menuItemHoverClass
                            )}
                            onMouseEnter={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = `rgba(${wa.rgbString}, 0.2)`
                            }}
                            onMouseLeave={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <Pill className="h-3.5 w-3.5" /> ADMET
                          </button>
                          <button
                            onClick={() => handleOpenQC(molecule)}
                            className={cn(
                              'w-full px-3 py-2 text-left text-xs text-gray-300 hover:text-white flex items-center gap-2 transition-colors',
                              !wa.isCustom && wac && wac.menuItemHoverClass
                            )}
                            onMouseEnter={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = `rgba(${wa.rgbString}, 0.2)`
                            }}
                            onMouseLeave={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <Zap className="h-3.5 w-3.5" /> QC
                          </button>
                          <button
                            onClick={() => handleOpenEditor(molecule)}
                            className={cn(
                              'w-full px-3 py-2 text-left text-xs text-gray-300 hover:text-white flex items-center gap-2 transition-colors',
                              !wa.isCustom && wac && wac.menuItemHoverClass
                            )}
                            onMouseEnter={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = `rgba(${wa.rgbString}, 0.2)`
                            }}
                            onMouseLeave={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <PenTool className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleExploreTautomers(molecule)}
                            className={cn(
                              'w-full px-3 py-2 text-left text-xs text-gray-300 hover:text-white flex items-center gap-2 transition-colors',
                              !wa.isCustom && wac && wac.menuItemHoverClass
                            )}
                            onMouseEnter={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = `rgba(${wa.rgbString}, 0.2)`
                            }}
                            onMouseLeave={(e) => {
                              if (wa.isCustom) e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                          >
                            <GitBranch className="h-3.5 w-3.5" /> Explore Tautomers
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <Button
                    onClick={() => handleDownloadSDF(molecule)}
                    size="sm"
                    variant="outline"
                    className="px-2 bg-transparent border-gray-600 hover:bg-green-900/40 hover:border-green-600 text-gray-400 hover:text-green-400 h-7"
                    title="Download as SDF"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    onClick={() => setConfirmDeleteId(molecule.id)}
                    size="sm"
                    variant="outline"
                    disabled={deletingId === molecule.id}
                    className="px-2 bg-transparent border-gray-600 hover:bg-red-900/40 hover:border-red-600 text-gray-400 hover:text-red-400 h-7"
                  >
                    {deletingId === molecule.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {/* Inline delete confirmation */}
                {confirmDeleteId === molecule.id && (
                  <div className="mx-3 mb-3 flex items-center justify-between gap-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
                    <p className="text-xs text-red-300">Delete this molecule?</p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setConfirmDeleteId(null)}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs bg-gray-800 border-gray-600 hover:bg-gray-700 text-gray-300"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleDelete(molecule.id)}
                        size="sm"
                        className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white border-0"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
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
