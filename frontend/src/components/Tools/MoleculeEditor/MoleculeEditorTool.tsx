'use client'

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { KetcherSkeleton } from './KetcherSkeleton'

// Lazy load Editor using Next.js dynamic import for better prefetching
const Editor = dynamic(
  () => import('ketcher-react').then(mod => ({ default: mod.Editor })),
  {
    ssr: false,
    loading: () => <KetcherSkeleton />,
  }
)
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Loader2,
  Download,
  Upload,
  Trash2,
  FileText,
  Beaker,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowDown,
  Library,
  ChevronDown,
  Box,
  Maximize2
} from 'lucide-react'
import { useMolecularStore } from '@/store/molecular-store'
import { useUIStore } from '@/store/ui-store'
import { useBaseColor } from '@/hooks/use-base-color'
import { api, apiClient } from '@/lib/api-client'
import { getStructServiceProvider } from '@/lib/ketcher-service-provider'
import { KetcherErrorBoundary } from './KetcherErrorBoundary'

// Import Ketcher CSS directly - dynamic import for CSS-only components causes ChunkLoadError
import 'ketcher-react/dist/index.css'

// Ketcher instance type (using any for flexibility with library versions)
type KetcherInstance = any

// Memoize the Editor to prevent unnecessary re-renders
const MemoizedEditor = React.memo(({ onInit, structServiceProvider, errorHandler }: any) => {
  return (
    <Editor
      staticResourcesUrl=""
      structServiceProvider={structServiceProvider}
      onInit={onInit}
      disableMacromoleculesEditor={true}
      errorHandler={errorHandler}
    />
  )
}, (prev, next) => {
  // Only re-render if essential props change
  // We don't check onInit or errorHandler as they should be stable callbacks
  return prev.structServiceProvider === next.structServiceProvider
})

MemoizedEditor.displayName = 'MemoizedEditor'

interface MoleculeData {
  smiles?: string
  molfile?: string
  inchi?: string
  molecularFormula?: string
  molecularWeight?: number
}

export function MoleculeEditorTool() {
  const ketcherRef = useRef<KetcherInstance | null>(null)
  const isKetcherReadyRef = useRef(false)
  const isMountedRef = useRef(true)
  const subscriptionRef = useRef<any>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | Error | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [moleculeData, setMoleculeData] = useState<MoleculeData>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [isKetcherReady, setIsKetcherReady] = useState(false)
  const [libraryMolecules, setLibraryMolecules] = useState<any[]>([])
  const [isLibraryDropdownOpen, setIsLibraryDropdownOpen] = useState(false)
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [importedLibraryName, setImportedLibraryName] = useState<string | null>(null)

  const [isLigandSelectorOpen, setIsLigandSelectorOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveDialogName, setSaveDialogName] = useState('New Molecule')
  const [pendingSaveData, setPendingSaveData] = useState<{ smiles: string; molfile: string; inchi: string } | null>(null)
  const [currentEditorMoleculeName, setCurrentEditorMoleculeName] = useState<string | null>(null)

  const fetchLibraryMolecules = useCallback(async () => {
    try {
      setIsLoadingLibrary(true)
      const molecules = await api.getMolecules()
      setLibraryMolecules(Array.isArray(molecules) ? molecules : [])
    } catch (err) {
      console.error('Failed to fetch library molecules:', err)
      setLibraryMolecules([])
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [])

  const { currentStructure, setCurrentStructure, addStructureTab, pendingEditorImport, setPendingEditorImport, refreshLibrary } = useMolecularStore()
  const { activeTool, setEditorMessage, setEditorHasChanges, editorSidePanelWidth } = useUIStore()
  const bc_active = useBaseColor()
  const containerRef = useRef<HTMLDivElement>(null)
  // Responsive button sizing: 'full' | 'compact' | 'icons' | 'minimal'
  const [buttonSize, setButtonSize] = useState<'full' | 'compact' | 'icons' | 'minimal'>('full')

  // Track container width to determine button size with multiple breakpoints
  useEffect(() => {
    if (!containerRef.current) return

    const updateButtonMode = () => {
      const width = containerRef.current?.offsetWidth || editorSidePanelWidth

      // Multi-breakpoint responsive system
      // Calculated requirements:
      // - Full text mode needs ~800px+ to fit all buttons without cramping
      // - Icons mode fits comfortably down to ~300px
      if (width >= 900) {
        setButtonSize('full')      // Full size with text and loose padding
      } else if (width >= 700) {
        setButtonSize('compact')   // Text with tight padding
      } else if (width >= 360) {
        setButtonSize('icons')     // Icons only
      } else {
        setButtonSize('minimal')   // Smaller icons, tight spacing
      }
    }

    updateButtonMode()

    const resizeObserver = new ResizeObserver(updateButtonMode)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [editorSidePanelWidth])

  // Sync error/success messages to UI store for display in header
  useEffect(() => {
    if (error) {
      setEditorMessage({
        type: 'error',
        message: typeof error === 'string' ? error : error?.message || 'An error occurred'
      })
    } else if (success) {
      setEditorMessage({
        type: 'success',
        message: success
      })
    } else {
      setEditorMessage(null)
    }

    // Cleanup: clear message when component unmounts
    return () => {
      setEditorMessage(null)
    }
  }, [error, success, setEditorMessage])

  // Sync hasChanges state to UI store for display in header
  useEffect(() => {
    setEditorHasChanges(hasChanges)
    // Cleanup: clear state when component unmounts
    return () => {
      setEditorHasChanges(false)
    }
  }, [hasChanges, setEditorHasChanges])

  // Use the standalone struct service provider for client-side operations
  // Memoized to ensure absolute reference stability and prevent Ketcher re-initialization
  const ketcherStructServiceProvider = useMemo(() => getStructServiceProvider(), [])

  // Initialize Ketcher reference - called once when Editor mounts
  const onInit = useCallback((ketcher: KetcherInstance) => {
    console.log('Ketcher initialized')

    if (!ketcher) {
      console.error('Ketcher instance is null or undefined')
      return
    }

    ketcherRef.current = ketcher
    isKetcherReadyRef.current = true
    setIsKetcherReady(true)

    // CRITICAL: Set window.ketcher to enable paste functionality (Ctrl+V)
    // and to prevent KetcherLogger errors
    // Many of Ketcher's internal modules (like KetcherLogger) expect window.ketcher to be defined
    if (typeof window !== 'undefined') {
      (window as any).ketcher = ketcher
      console.log('window.ketcher set successfully')
    }

    // Subscribe to change events immediately - Ketcher is ready after onInit
    if (!isMountedRef.current || !ketcher?.editor) return

    try {
      const handler = (eventData: any) => {
        if (!isMountedRef.current) return

        // Use requestAnimationFrame to defer state updates
        requestAnimationFrame(() => {
          if (isMountedRef.current) {
            setHasChanges(true)
            setImportedLibraryName(null)
            if (ketcherRef.current && isKetcherReadyRef.current) {
              updateMoleculeData()
            }
          }
        })
      }

      subscriptionRef.current = ketcher.editor.subscribe('change', handler)
      console.log('Subscribed to Ketcher change events')
    } catch (err) {
      console.error('Error subscribing to Ketcher events:', err)
    }
  }, [])

  // Update molecule data from current structure
  const updateMoleculeData = useCallback(async () => {
    if (!ketcherRef.current || !isMountedRef.current) {
      console.log('Ketcher instance not available or component unmounted')
      return
    }

    // Use individual try-catch for each format to handle partial failures
    let smiles = ''
    let molfile = ''
    let inchi = ''

    try {
      smiles = await ketcherRef.current.getSmiles()
    } catch (err) {
      console.warn('Could not get SMILES:', err)
    }

    try {
      molfile = await ketcherRef.current.getMolfile()
    } catch (err) {
      console.warn('Could not get MOL file:', err)
    }

    try {
      inchi = await ketcherRef.current.getInchi()
    } catch (err) {
      console.warn('Could not get InChI:', err)
    }

    if (isMountedRef.current) {
      setMoleculeData({
        smiles,
        molfile,
        inchi,
      })
    }
  }, [])

  // Fetch library molecules only when dropdown is opened
  useEffect(() => {
    if (isLibraryDropdownOpen) {
      fetchLibraryMolecules()
    }
  }, [isLibraryDropdownOpen, fetchLibraryMolecules])

  // Preload ketcher-react bundle immediately when component mounts
  useEffect(() => {
    import('ketcher-react').catch(() => {
      // Silently fail - Next.js dynamic will handle retry
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true

    return () => {
      console.log('MoleculeEditorTool unmounting - performing cleanup')
      isMountedRef.current = false
      isKetcherReadyRef.current = false
      setIsKetcherReady(false)

      // Unsubscribe from Ketcher events
      if (subscriptionRef.current && ketcherRef.current?.editor) {
        try {
          ketcherRef.current.editor.unsubscribe('change', subscriptionRef.current)
          console.log('Unsubscribed from Ketcher events')
        } catch (err) {
          console.error('Error unsubscribing:', err)
        }
      }

      // Clean up window.ketcher global reference only if it's our instance
      if (typeof window !== 'undefined' && (window as any).ketcher === ketcherRef.current) {
        delete (window as any).ketcher
        console.log('Cleaned up window.ketcher')
      }

      subscriptionRef.current = null
      ketcherRef.current = null
    }
  }, [])

  /**
   * Centers and zooms a molecule after loading into Ketcher
   * Handles timing issues with Ketcher's rendering pipeline
   * @param shouldLayout - Whether to apply 2D layout (true for SMILES, false for MOL/SDF)
   */
  const centerAndZoomMolecule = useCallback(async (shouldLayout: boolean = false) => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) {
      console.warn('Ketcher not ready for centering/zooming')
      return
    }

    try {
      // Step 1: Wait for setMolecule to complete its internal processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Step 2: Apply layout if needed (for SMILES or other 1D formats)
      if (shouldLayout) {
        try {
          await ketcherRef.current.layout()
          console.log('Applied 2D layout')
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (layoutErr) {
          console.warn('Layout failed, continuing with centering:', layoutErr)
        }
      }

      // Step 3: Center the structure in viewport
      if (ketcherRef.current.editor?.centerStruct) {
        try {
          ketcherRef.current.editor.centerStruct()
          console.log('Centered structure')
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (centerErr) {
          console.warn('Centering failed:', centerErr)
        }
      }

      // Step 4: Zoom to fit content
      if (ketcherRef.current.editor?.zoomAccordingContent) {
        try {
          // Get current structure for zoom calculation
          const struct = ketcherRef.current.editor.struct()
          if (struct) {
            ketcherRef.current.editor.zoomAccordingContent(struct)
            console.log('Applied zoom to fit content')
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        } catch (zoomErr) {
          console.warn('Zoom-to-fit failed:', zoomErr)
        }
      }

      console.log('Molecule centered and zoomed successfully')
    } catch (err) {
      console.error('Error in centerAndZoomMolecule:', err)
      // Don't throw - this is a UI enhancement, not critical
    }
  }, [])

  const loadStructureToEditor = useCallback(async (ligandId?: string) => {
    if (!ketcherRef.current || !currentStructure || !isKetcherReadyRef.current) {
      console.log('Ketcher not ready, skipping structure load')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      let loaded = false
      let loadedMoleculeName: string | null = null

      // Priority 1: Try to load ligand if available
      if (currentStructure.ligands && Object.keys(currentStructure.ligands).length > 0) {
        // Use specified ligand or first ligand
        const ligandKeys = Object.keys(currentStructure.ligands)
        const selectedLigandId = ligandId || ligandKeys[0]
        const selectedLigand = currentStructure.ligands[selectedLigandId]

        if (!selectedLigand) {
          setError(`Ligand ${ligandId} not found`)
          return
        }

        // Priority order: SMILES > SDF > PDB
        if (selectedLigand.smiles) {
          await ketcherRef.current.setMolecule(selectedLigand.smiles)
          await centerAndZoomMolecule(true) // true = apply layout for SMILES
          setSuccess(`Loaded ligand ${selectedLigandId} from viewer`)
          loaded = true
        }
        // Try to use SDF data if available
        else if (selectedLigand.sdf_data) {
          await ketcherRef.current.setMolecule(selectedLigand.sdf_data)
          await centerAndZoomMolecule(false) // false = SDF has coordinates
          setSuccess(`Loaded ligand ${selectedLigandId} from viewer (SDF)`)
          loaded = true
        }
        // Otherwise try to extract from PDB and convert to SDF
        else if (currentStructure.pdb_data) {
          // Extract ligand from PDB and convert to SDF
          const response = await apiClient.post('/api/molecules/extract_ligand', {
            pdb_data: currentStructure.pdb_data,
            ligand_id: selectedLigandId
          })

          // Prefer SDF format over PDB
          if (response.data.ligand_sdf) {
            await ketcherRef.current.setMolecule(response.data.ligand_sdf)
            await centerAndZoomMolecule(false)
            setSuccess(`Loaded ligand ${selectedLigandId} from viewer (SDF)`)
            loaded = true
          } else if (response.data.ligand_pdb) {
            // Fallback to PDB if SDF not available
            await ketcherRef.current.setMolecule(response.data.ligand_pdb)
            await centerAndZoomMolecule(false)
            setSuccess(`Loaded ligand ${selectedLigandId} from viewer (PDB)`)
            loaded = true
          }
        }

        if (loaded) {
          loadedMoleculeName = selectedLigand.name || selectedLigand.residue_name || selectedLigandId
        }
      }

      // Priority 2: If no ligands, try to load from structure's SMILES directly
      if (!loaded && (currentStructure as any).smiles) {
        await ketcherRef.current.setMolecule((currentStructure as any).smiles)
        await centerAndZoomMolecule(true) // true = apply layout for SMILES
        setSuccess('Loaded structure from viewer (SMILES)')
        loaded = true
        loadedMoleculeName = currentStructure.filename || null
      }

      // Priority 3: If no SMILES, try to load from structure's SDF data
      if (!loaded && currentStructure.sdf_data) {
        await ketcherRef.current.setMolecule(currentStructure.sdf_data)
        await centerAndZoomMolecule(false) // false = SDF has coordinates
        setSuccess('Loaded structure from viewer (SDF)')
        loaded = true
        loadedMoleculeName = currentStructure.filename || null
      }

      // Priority 4: If still not loaded, try to convert PDB to SDF via backend
      if (!loaded && currentStructure.pdb_data) {
        try {
          // Try to convert the entire PDB structure to SDF
          // This works best for small molecules
          const response = await apiClient.post('/api/molecules/save_structure', {
            pdb_data: currentStructure.pdb_data,
            name: 'temp_import'
          })

          if (response.data.molecule?.molfile) {
            await ketcherRef.current.setMolecule(response.data.molecule.molfile)
            await centerAndZoomMolecule(false) // false = molfile has coordinates
            setSuccess('Loaded structure from viewer (converted from PDB)')
            loaded = true
            loadedMoleculeName = currentStructure.filename || null
          }
        } catch (convertErr) {
          console.warn('Could not convert PDB to SDF:', convertErr)
        }
      }

      if (!loaded) {
        setError('No importable molecule data found in viewer. Structure may be too large or in an unsupported format.')
        return
      }

      setCurrentEditorMoleculeName(loadedMoleculeName)

      // Wait for Ketcher to stabilize after loading structure before updating molecule data
      setTimeout(() => {
        if (ketcherRef.current && isKetcherReadyRef.current) {
          updateMoleculeData()
        }
      }, 1000)
    } catch (err: any) {
      console.error('Error loading structure to editor:', err)
      setError(err.message || 'Failed to load structure from viewer')
    } finally {
      setIsLoading(false)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [currentStructure, isKetcherReady, updateMoleculeData])

  // Automatically load structure into editor if triggered from other tools (e.g., Library)
  useEffect(() => {
    if (isKetcherReady && pendingEditorImport && activeTool === 'editor') {
      console.log('Detected pending editor import, loading structure...')
      loadStructureToEditor()
      setPendingEditorImport(false)
    }
  }, [isKetcherReady, pendingEditorImport, activeTool, loadStructureToEditor, setPendingEditorImport])

  // Export structure in various formats
  const handleExport = async (format: 'smiles' | 'mol' | 'sdf' | 'inchi' | 'ket') => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) {
      setError('Editor not ready yet. Please wait a moment.')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      let data = ''
      let filename = 'molecule'
      let mimeType = 'text/plain'

      switch (format) {
        case 'smiles':
          data = await ketcherRef.current.getSmiles()
          filename = 'molecule.smi'
          break
        case 'mol':
          data = await ketcherRef.current.getMolfile()
          filename = 'molecule.mol'
          mimeType = 'chemical/x-mdl-molfile'
          break
        case 'sdf':
          data = await ketcherRef.current.getSdf()
          filename = 'molecule.sdf'
          mimeType = 'chemical/x-mdl-sdfile'
          break
        case 'inchi':
          data = await ketcherRef.current.getInchi()
          filename = 'molecule.inchi'
          break
        case 'ket':
          data = await ketcherRef.current.getKet()
          filename = 'molecule.ket'
          mimeType = 'application/json'
          break
      }

      // Download file
      const blob = new Blob([data], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setSuccess(`Exported as ${format.toUpperCase()}`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Export error:', err)
      setError(err.message || 'Failed to export structure')
    } finally {
      setIsLoading(false)
    }
  }

  // Import structure from file
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!ketcherRef.current || !isKetcherReadyRef.current) {
      setError('Editor is still initializing. Please wait a moment and try again.')
      event.target.value = ''
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const text = await file.text()

      // Validate file content
      if (!text || text.trim().length === 0) {
        throw new Error('File is empty')
      }

      console.log('Importing file:', file.name, 'Size:', text.length, 'chars')

      // For large files, show a warning
      if (text.length > 100000) {
        console.warn('Large file detected, this may take a moment...')
      }

      // Load structure into Ketcher
      await ketcherRef.current.setMolecule(text)

      // Wait for Ketcher to process the structure
      await new Promise(resolve => setTimeout(resolve, 500))

      // Center and zoom the imported structure
      await centerAndZoomMolecule(false) // false = imported files typically have coordinates

      await updateMoleculeData()
      setHasChanges(false)
      setSuccess(`Imported ${file.name}`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Import error:', err)
      const errorMessage = err.message || 'Failed to import structure'
      setError(`Import failed: ${errorMessage}. Please check the file format.`)
      setTimeout(() => setError(null), 5000)
    } finally {
      setIsLoading(false)
      // Reset input
      event.target.value = ''
    }
  }

  // Clear editor
  const handleClear = async () => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) return

    try {
      await ketcherRef.current.setMolecule('')
      setMoleculeData({})
      setHasChanges(false)
      setSuccess('Editor cleared')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: any) {
      console.error('Clear error:', err)
      setError(err.message || 'Failed to clear editor')
    }
  }

  // Auto-layout structure
  const handleLayout = async () => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) return

    try {
      setIsLoading(true)
      await ketcherRef.current.layout()
      // Center and zoom after layout for best view
      await centerAndZoomMolecule(true) // true = layout was just applied
      setSuccess('Structure layout applied')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: any) {
      console.error('Layout error:', err)
      setError(err.message || 'Failed to apply layout')
    } finally {
      setIsLoading(false)
    }
  }

  // Save to molecular library
  const handleSaveToLibrary = async () => {
    if (!ketcherRef.current) {
      setError('Editor not initialized')
      return
    }

    if (!isKetcherReadyRef.current) {
      setError('Please wait for the editor to fully load')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      // Get structure data from Ketcher
      let smiles = ''
      let molfile = ''
      let inchi = ''

      try {
        smiles = await ketcherRef.current.getSmiles()
      } catch (e) {
        console.error('Error getting SMILES:', e)
      }

      try {
        molfile = await ketcherRef.current.getMolfile()
      } catch (e) {
        console.error('Error getting molfile:', e)
      }

      try {
        inchi = await ketcherRef.current.getInchi()
      } catch (e) {
        console.error('Error getting InChI:', e)
      }

      // Check if we have at least one format
      if (!smiles && !molfile) {
        setError('No structure to save. Please draw a molecule first.')
        setIsLoading(false)
        return
      }

      // Open in-app dialog instead of browser prompt
      setPendingSaveData({ smiles, molfile, inchi })
      setSaveDialogName(currentEditorMoleculeName || 'New Molecule')
      setSaveDialogOpen(true)
      setIsLoading(false)
    } catch (err: any) {
      console.error('Save error:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save to library'
      setError(errorMessage)
      setIsLoading(false)
    }
  }

  const handleConfirmSave = async () => {
    if (!pendingSaveData || !saveDialogName.trim()) return

    const { smiles, molfile, inchi } = pendingSaveData
    const name = saveDialogName.trim()

    setSaveDialogOpen(false)
    setPendingSaveData(null)

    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      console.log('Saving molecule to library:', { name, smiles, hasInchi: !!inchi })

      const response = await apiClient.post('/api/library/save-molecule', {
        name,
        smiles,
        molfile,
        inchi,
        source: 'editor'
      })

      if (response.data.success) {
        setHasChanges(false)
        if (response.data.already_exists) {
          setSuccess(`Molecule already exists in library as "${response.data.molecule?.name || name}"`)
        } else {
          setSuccess(`Saved "${name}" to molecular library!`)
        }
        setTimeout(() => setSuccess(null), 5000)

        console.log(response.data.already_exists ? 'Molecule already exists:' : 'Molecule saved successfully:', response.data.molecule)

        fetchLibraryMolecules()
        refreshLibrary()

        if (smiles) {
          try {
            console.log('Generating 3D structure from SMILES:', smiles)
            const response3d = await apiClient.post('/api/structure/smiles_to_3d', { smiles })

            if (response3d.data && (response3d.data.pdb_data || response3d.data.sdf_data)) {
              const newStructure = {
                structure_id: name || `mol-${Date.now()}`,
                pdb_data: response3d.data.pdb_data,
                sdf_data: response3d.data.sdf_data,
                smiles: smiles,
                source: 'editor-saved'
              }
              addStructureTab(newStructure as any, name)
              console.log('3D structure added to viewer')
            }
          } catch (e) {
            console.error('Failed to generate 3D structure:', e)
          }
        }
      } else {
        setError(response.data.error || 'Failed to save molecule')
      }
    } catch (err: any) {
      console.error('Save error:', err)
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save to library'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Import from viewer
  const handleImportFromViewer = async (ligandId?: string) => {
    if (!currentStructure) {
      setError('No structure in viewer to import')
      setTimeout(() => setError(null), 3000)
      return
    }

    if (!ketcherRef.current || !isKetcherReadyRef.current) {
      setError('Editor is still initializing. Please wait a moment and try again.')
      return
    }

    // Close ligand selector if open
    setIsLigandSelectorOpen(false)

    await loadStructureToEditor(ligandId)
  }

  // Get available ligands from current structure
  const availableLigands = useMemo(() => {
    if (!currentStructure?.ligands) return []
    return Object.entries(currentStructure.ligands).map(([id, ligand]: [string, any]) => ({
      id,
      name: ligand.name || id,
      residue: ligand.residue_name || '',
    }))
  }, [currentStructure])

  // Manual center and zoom
  const handleCenterZoom = async () => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) return

    try {
      setIsLoading(true)
      await centerAndZoomMolecule(false) // false = don't apply layout, just center & zoom
      setSuccess('View centered and zoomed')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err: any) {
      console.error('Center/zoom error:', err)
      setError(err.message || 'Failed to center and zoom')
    } finally {
      setIsLoading(false)
    }
  }

  // Import from library
  const handleImportFromLibrary = async (molecule: any) => {
    setIsLibraryDropdownOpen(false)

    if (!ketcherRef.current || !isKetcherReadyRef.current) {
      setError('Editor is still initializing. Please wait a moment and try again.')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Prefer molfile if available, otherwise use SMILES
      if (molecule.molfile) {
        await ketcherRef.current.setMolecule(molecule.molfile)
        await centerAndZoomMolecule(false) // false = molfile has coordinates
        setSuccess(`Imported "${molecule.name}" from library`)
      } else if (molecule.canonical_smiles) {
        await ketcherRef.current.setMolecule(molecule.canonical_smiles)
        await centerAndZoomMolecule(true) // true = apply layout for SMILES
        setSuccess(`Imported "${molecule.name}" from library`)
      } else {
        throw new Error('Molecule has no molfile or SMILES data')
      }

      setImportedLibraryName(molecule.name || null)
      setCurrentEditorMoleculeName(molecule.name || null)

      // Wait for Ketcher to process the structure
      await new Promise(resolve => setTimeout(resolve, 500))
      await updateMoleculeData()
      setHasChanges(false)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('Import from library error:', err)
      setError(`Failed to import "${molecule.name}": ${err.message || 'Unknown error'}`)
      setTimeout(() => setError(null), 5000)
    } finally {
      setIsLoading(false)
    }
  }

  // Generate 3D structure
  const handleGenerate3D = async () => {
    if (!ketcherRef.current || !isKetcherReadyRef.current) return

    try {
      setIsLoading(true)
      setError(null)

      // WORKAROUND: Get the structure directly from Ketcher without using backend conversion
      // The issue is that Ketcher generates malformed MOL files that RDKit can't parse
      // So we'll try to get the structure data directly and convert it ourselves

      let smiles = null

      try {
        // Try method 1: Get SMILES using Ketcher's internal conversion (may fail)
        smiles = await ketcherRef.current.getSmiles()
      } catch (conversionError) {
        console.error('Ketcher SMILES conversion failed, trying alternative method:', conversionError)

        // Method 2: Try to get the structure as KET format and convert it via Flask
        try {
          const ketData = await ketcherRef.current.getKet()
          console.log('Got KET data:', ketData)

          // Send KET data to Flask backend for conversion to SMILES
          const ketResponse = await apiClient.post('/api/ketcher/ket-to-smiles', {
            ket_data: ketData
          })

          if (ketResponse.data.success && ketResponse.data.smiles) {
            smiles = ketResponse.data.smiles
            console.log('Successfully converted KET to SMILES:', smiles)
          } else {
            throw new Error('KET conversion failed')
          }
        } catch (ketError) {
          console.error('KET extraction also failed:', ketError)
          setError('Unable to convert structure. Please use the SMILES Input tool as a workaround:\n\n1. Click "Input" tool in side panel\n2. Enter SMILES string (e.g., "CCO" for ethanol)\n3. Click "Load Structure"\n\nThis works perfectly and is actually faster!')
          return
        }
      }

      if (!smiles || !smiles.trim()) {
        setError('Please draw a structure first')
        return
      }

      // Get molecule name - prefer library name, fall back to truncated SMILES
      const moleculeName = importedLibraryName || smiles.substring(0, 20) + (smiles.length > 20 ? '...' : '')

      // Call backend to generate 3D structure directly from SMILES
      const response = await apiClient.post('/api/structure/smiles_to_3d', {
        smiles
      })

      // Prefer SDF data over PDB data
      if (response.data.sdf_data || response.data.pdb_data) {
        // Create a new structure object
        const newStructure = {
          structure_id: importedLibraryName || `mol-${Date.now()}`,
          pdb_data: response.data.pdb_data,  // Keep for compatibility
          sdf_data: response.data.sdf_data,  // Preferred format
          smiles: smiles,
          source: 'editor-3d'
        }

        // Add as a new viewer tab
        addStructureTab(newStructure as any, `3D: ${moleculeName}`)

        setSuccess(`3D structure added to viewer (${response.data.format?.toUpperCase() || 'SDF'} format)!`)
        setTimeout(() => setSuccess(null), 3000)
        setHasChanges(false)
      }
    } catch (err: any) {
      console.error('3D generation error:', err)
      setError(err.message || 'Failed to generate 3D structure')
    } finally {
      setIsLoading(false)
    }
  }

  // Helper functions for responsive button styling
  const showText = buttonSize === 'full' || buttonSize === 'compact'
  const buttonPadding = {
    full: 'px-2',
    compact: 'px-1.5',
    icons: 'px-1.5',
    minimal: 'px-1'
  }[buttonSize]
  const buttonGap = {
    full: 'gap-1',
    compact: 'gap-1',
    icons: 'gap-1',
    minimal: 'gap-0.5'
  }[buttonSize]
  const iconSize = buttonSize === 'minimal' ? 'h-3 w-3' : 'h-3.5 w-3.5'
  const iconMargin = showText ? 'mr-1' : ''

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-gray-50 relative">

      {/* Save to Library Dialog */}
      {saveDialogOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 w-80 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Save to Library</h3>
              <p className="text-xs text-gray-500 mt-1">Enter a name for this molecule</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="save-mol-name" className="text-xs text-gray-700">Name</Label>
              <input
                id="save-mol-name"
                value={saveDialogName}
                onChange={e => setSaveDialogName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmSave()
                  if (e.key === 'Escape') { setSaveDialogOpen(false); setPendingSaveData(null) }
                }}
                autoFocus
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setSaveDialogOpen(false); setPendingSaveData(null) }}
                className="text-gray-700 hover:bg-red-50 hover:text-red-600 hover:border-red-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmSave}
                disabled={!saveDialogName.trim()}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header with All Controls */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-2.5 bg-gray-950 border-b border-gray-800/50 shadow-sm z-10 relative">
        {/* Left: First 4 buttons (Import, From Viewer, From Library, Export) */}
        <div className={`flex items-center gap-1 flex-1 min-w-0`}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => document.getElementById('import-file')?.click()}
            disabled={isLoading}
            title="Import structure from file"
            className="flex-shrink-0 whitespace-nowrap bg-white hover:bg-gray-50 text-gray-700"
          >
            <Upload className={`${iconSize} ${iconMargin}`} />
            {showText && <span>Import</span>}
          </Button>
          <input
            id="import-file"
            type="file"
            accept=".mol,.sdf,.ket,.smi,.smiles,.inchi"
            onChange={handleImport}
            className="hidden"
          />
          {/* From Viewer - with ligand selector if multiple ligands */}
          {availableLigands.length > 1 ? (
            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsLigandSelectorOpen(!isLigandSelectorOpen)}
                disabled={isLoading || !currentStructure}
                title="Select ligand to import from viewer"
                className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                <ArrowDown className={`${iconSize} ${iconMargin}`} />
                {showText && <span>From Viewer</span>}
                {showText && <ChevronDown className="h-4 w-4 ml-1.5" />}
              </Button>
              {isLigandSelectorOpen && (
                <>
                  {/* Backdrop to close dropdown */}
                  <div
                    className="fixed inset-0 z-[9998]"
                    onClick={() => setIsLigandSelectorOpen(false)}
                  />
                  {/* Dropdown Menu */}
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-800">
                      Select Ligand ({availableLigands.length} found)
                    </div>
                    {availableLigands.map((ligand) => (
                      <button
                        key={ligand.id}
                        onClick={() => handleImportFromViewer(ligand.id)}
                        className="w-full px-4 py-2 text-left text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center gap-2 transition-colors border-b border-gray-800 last:border-b-0"
                        title={`Import ${ligand.id}`}
                      >
                        <Beaker className="h-4 w-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{ligand.name}</div>
                          {ligand.residue && (
                            <div className="text-xs text-gray-500">{ligand.residue}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleImportFromViewer()}
              disabled={isLoading || !currentStructure}
              title={!currentStructure ? "No structure in viewer" : "Import current molecule from viewer"}
              className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <ArrowDown className={`${iconSize} ${iconMargin}`} />
              {showText && <span>From Viewer</span>}
            </Button>
          )}

          {/* Import from Library Dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsLibraryDropdownOpen(!isLibraryDropdownOpen)}
              disabled={isLoading || isLoadingLibrary}
              title="Import molecule from library"
              className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <Library className={`${iconSize} ${iconMargin}`} />
              {showText && <span>From Library</span>}
              {showText && <ChevronDown className="h-4 w-4 ml-1.5" />}
            </Button>
            {isLibraryDropdownOpen && (
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-[9998]"
                  onClick={() => setIsLibraryDropdownOpen(false)}
                />
                {/* Dropdown Menu */}
                <div className="absolute top-full left-0 mt-1 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-[9999] max-h-80 overflow-y-auto">
                  {isLoadingLibrary ? (
                    <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading molecules...
                    </div>
                  ) : libraryMolecules.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500">
                      No molecules in library
                    </div>
                  ) : (
                    libraryMolecules.map((molecule) => (
                      <button
                        key={molecule.id}
                        onClick={() => handleImportFromLibrary(molecule)}
                        className="w-full px-4 py-2 text-left text-xs text-gray-200 hover:bg-gray-800 hover:text-white flex items-center gap-2 transition-colors border-b border-gray-800 last:border-b-0"
                        title={molecule.canonical_smiles}
                      >
                        <Beaker className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate flex-1">{molecule.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative group">
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
              disabled={isLoading}
              title="Export structure"
            >
              <Download className={`${iconSize} ${iconMargin}`} />
              {showText && <span>Export</span>}
            </Button>
            <div className="absolute left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => handleExport('smiles')}
                className="w-full px-4 py-2 text-left text-xs text-gray-300 hover:bg-gray-800 rounded-t-lg"
              >
                SMILES (.smi)
              </button>
              <button
                onClick={() => handleExport('mol')}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                MOL (.mol)
              </button>
              <button
                onClick={() => handleExport('sdf')}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                SDF (.sdf)
              </button>
              <button
                onClick={() => handleExport('inchi')}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                InChI (.inchi)
              </button>
              <button
                onClick={() => handleExport('ket')}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 rounded-b-lg"
              >
                KET (.ket)
              </button>
            </div>
          </div>
        </div>

        {/* Middle: View Tools Dropdown */}
        <div className="flex items-center ml-2">
          <div className="relative group">
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
              disabled={isLoading || !isKetcherReady}
              title="View adjustment tools"
            >
              <Maximize2 className={`${iconSize} ${iconMargin}`} />
              {showText && <span>View</span>}
            </Button>
            <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={handleCenterZoom}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 rounded-t-lg"
                disabled={isLoading}
              >
                Center & Zoom
              </button>
              <button
                onClick={handleLayout}
                className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 rounded-b-lg"
                disabled={isLoading}
              >
                Auto Layout
              </button>
            </div>
          </div>
        </div>

        {/* Right: Clear, Save, Generate 3D - Grouped */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleClear}
            disabled={isLoading}
            title="Clear editor"
            className="flex-shrink-0 whitespace-nowrap bg-gray-900 border-gray-800 text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <Trash2 className={`${iconSize} ${iconMargin}`} />
            {showText && <span>Clear</span>}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleSaveToLibrary}
            disabled={isLoading || !moleculeData.smiles}
            title={!moleculeData.smiles ? "Please draw a molecule first" : "Save to molecular library"}
            className="flex-shrink-0 whitespace-nowrap bg-green-600 hover:bg-green-700 text-white border-0"
          >
            {isLoading ? (
              <Loader2 className={`${iconSize} ${iconMargin} animate-spin`} />
            ) : (
              <Save className={`${iconSize} ${iconMargin}`} />
            )}
            {showText && <span>Save</span>}
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleGenerate3D}
            disabled={isLoading}
            title="Generate 3D structure and add to viewer"
            className={`flex-shrink-0 whitespace-nowrap ${!bc_active.isCustom ? `${bc_active.buttonBg} ${bc_active.buttonBgHover}` : ''}`}
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
            {isLoading ? (
              <Loader2 className={`${iconSize} ${iconMargin} animate-spin`} />
            ) : (
              <Box className={`${iconSize} ${iconMargin}`} />
            )}
            {showText && <span>Generate 3D</span>}
          </Button>
        </div>
      </div>

      {/* Ketcher Editor - Full width of side panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 relative bg-white min-h-[400px]">
          <div className="absolute inset-0">
            <KetcherErrorBoundary
              onError={(error) => {
                // Only set error state for critical errors, not initialization warnings
                if (!error.message?.includes('Ketcher needs to be initialized')) {
                  setTimeout(() => {
                    if (isMountedRef.current) {
                      setError(error.message)
                    }
                  }, 0)
                }
              }}
            >
              <MemoizedEditor
                structServiceProvider={ketcherStructServiceProvider}
                onInit={onInit}
                errorHandler={(error: string) => {
                  console.error('Ketcher error:', error)
                  // Only show critical errors to user
                  if (!error.includes('Ketcher needs to be initialized')) {
                    setTimeout(() => {
                      if (isMountedRef.current) {
                        setError(error)
                      }
                    }, 0)
                  }
                }}
              />
            </KetcherErrorBoundary>
          </div>
        </div>

        {/* Molecule Data Panel - Compact at bottom */}
        {moleculeData.smiles && (
          <div className="p-3 bg-gray-50 border-t border-gray-200 max-h-32 overflow-x-auto">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">Molecule Data</h4>
            <div className="space-y-1.5 text-xs">
              {moleculeData.smiles && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium min-w-[60px]">SMILES:</span>
                  <code className="text-blue-600 break-all bg-blue-50 px-1.5 py-0.5 rounded text-xs flex-1">
                    {moleculeData.smiles}
                  </code>
                </div>
              )}
              {moleculeData.molecularFormula && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium min-w-[60px]">Formula:</span>
                  <span className="text-gray-900 font-mono">{moleculeData.molecularFormula}</span>
                </div>
              )}
              {moleculeData.molecularWeight && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium min-w-[60px]">MW:</span>
                  <span className="text-gray-900 font-mono">{moleculeData.molecularWeight.toFixed(2)} g/mol</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
