import { create } from 'zustand'
import type { MolecularStructure, VisualizationState, VisualizationStyle, SurfaceType, ColorTheme, ADMETResult } from '@/types/molecular'
import type { GridBox } from '@/types/docking'
import type { PluginContext } from 'molstar/lib/mol-plugin/context'
import type { MolstarViewerHandle } from '@/components/MolecularViewer/MolecularViewer'
import { BlobRegistry, generateBlobId } from '@/lib/blob-registry'

// Structure tab interface - stores blob IDs instead of raw data
interface StructureTab {
  id: string
  structureId: string // Reference to structure_id
  pdbBlobId: string | null // Reference to PDB data in BlobRegistry
  sdfBlobId: string | null // Reference to SDF data in BlobRegistry
  xyzBlobId: string | null // Reference to XYZ data in BlobRegistry
  metadata: MolecularStructure['metadata'] // Lightweight metadata
  smiles?: string // SMILES string (small, can stay in store)
  format?: MolecularStructure['format']
  source?: MolecularStructure['source']
  components?: MolecularStructure['components']
  ligands?: MolecularStructure['ligands']
  librarySave?: MolecularStructure['library_save']
  name: string
  createdAt: number
  visualizationState: VisualizationState // Each tab maintains its own visualization settings
  cameraState?: any // Camera snapshot state from Molstar
}

/**
 * Helper to store a MolecularStructure and return a StructureTab
 * Heavy data (pdb_data, sdf_data, xyz_data) goes to BlobRegistry
 */
function storeStructureData(structure: MolecularStructure, name?: string): StructureTab {
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Store heavy data in BlobRegistry
  let pdbBlobId: string | null = null
  let sdfBlobId: string | null = null
  let xyzBlobId: string | null = null

  if (structure.pdb_data) {
    pdbBlobId = generateBlobId('pdb')
    BlobRegistry.set(pdbBlobId, structure.pdb_data, 'pdb')
  }
  if (structure.sdf_data) {
    sdfBlobId = generateBlobId('sdf')
    BlobRegistry.set(sdfBlobId, structure.sdf_data, 'sdf')
  }
  if (structure.xyz_data) {
    xyzBlobId = generateBlobId('xyz')
    BlobRegistry.set(xyzBlobId, structure.xyz_data, 'xyz')
  }

  return {
    id: tabId,
    structureId: structure.structure_id,
    pdbBlobId,
    sdfBlobId,
    xyzBlobId,
    metadata: structure.metadata,
    smiles: structure.smiles,
    format: structure.format,
    source: structure.source,
    components: structure.components,
    ligands: structure.ligands,
    librarySave: structure.library_save,
    name: name || structure.structure_id || 'Unnamed',
    createdAt: Date.now(),
    visualizationState: {
      ...initialVisualizationState,
      // Small molecules (SDF format, not docked poses) should default to ball-and-stick,
      // not cartoon — cartoon has no secondary structure to render for non-polymers and
      // will internally fall back to ball-and-stick without multipleBonds, hiding double bonds.
      style: (sdfBlobId && !structure.metadata?.is_docked_pose && !structure.metadata?.is_boltz2_pose)
        ? 'stick'
        : initialVisualizationState.style,
    },
  }
}

/**
 * Helper to reconstruct a MolecularStructure from a StructureTab
 * Fetches heavy data from BlobRegistry
 */
export function getStructureFromTab(tab: StructureTab): MolecularStructure {
  return {
    structure_id: tab.structureId,
    pdb_data: tab.pdbBlobId ? BlobRegistry.get(tab.pdbBlobId) || '' : '',
    sdf_data: tab.sdfBlobId ? BlobRegistry.get(tab.sdfBlobId) || undefined : undefined,
    xyz_data: tab.xyzBlobId ? BlobRegistry.get(tab.xyzBlobId) || undefined : undefined,
    smiles: tab.smiles,
    format: tab.format,
    source: tab.source,
    metadata: tab.metadata,
    components: tab.components,
    ligands: tab.ligands,
    library_save: tab.librarySave,
  }
}

/**
 * Helper to get just the PDB data for a tab (most common use case)
 */
export function getPdbDataForTab(tab: StructureTab | null): string | null {
  if (!tab || !tab.pdbBlobId) return null
  return BlobRegistry.get(tab.pdbBlobId)
}

/**
 * Helper to clean up blob data when removing a tab
 */
function cleanupTabBlobs(tab: StructureTab): void {
  if (tab.pdbBlobId) BlobRegistry.delete(tab.pdbBlobId)
  if (tab.sdfBlobId) BlobRegistry.delete(tab.sdfBlobId)
  if (tab.xyzBlobId) BlobRegistry.delete(tab.xyzBlobId)
}

// Input file preview tab interface
interface InputFileTab {
  id: string
  name: string
  content: string
  createdAt: number
}

// Image file preview tab interface
interface ImageFileTab {
  id: string
  name: string
  imageUrl: string
  createdAt: number
  /** When set, library 2D viewer reuses this tab instead of opening duplicates */
  libraryMoleculeId?: number
}

// Docking results interface
interface DockingPose {
  mode: number
  affinity: number
  rmsd_lb: number
  rmsd_ub: number
}

interface DockingResults {
  success: boolean
  poses?: DockingPose[]
  best_affinity?: number
  binding_strength?: string
  num_poses?: number
  log?: string  // PDBQT poses data (legacy, for backward compatibility)
  poses_pdbqt?: string  // PDBQT poses data (raw from Vina)
  poses_sdf?: string  // SDF poses data with preserved bond orders (from backend via RDKit/OpenBabel)
  poses_pdb?: string  // PDB poses data converted by backend via OpenBabel (preferred for visualization)
  error?: string
}

interface MolecularStore {
  // Structure tabs
  structureTabs: StructureTab[]
  activeTabId: string | null
  addStructureTab: (structure: MolecularStructure, name?: string) => void
  removeStructureTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void

  // Animation tab (reusable tab for vibrational mode animations)
  animationTabId: string | null
  openAnimationTab: (structure: MolecularStructure, name?: string) => string // Creates or updates animation tab, returns tab ID

  // Conformer tab (reusable tab for conformer browsing)
  conformerTabId: string | null
  openConformerTab: (structure: MolecularStructure, name?: string) => string // Creates or updates conformer tab, returns tab ID

  // Input file preview tabs
  inputFileTabs: InputFileTab[]
  addInputFileTab: (content: string, name?: string) => string // Returns tab ID
  updateInputFileTab: (tabId: string, content: string) => void
  removeInputFileTab: (tabId: string) => void

  // Image file preview tabs
  imageFileTabs: ImageFileTab[]
  addImageFileTab: (
    imageUrl: string,
    name?: string,
    options?: { libraryMoleculeId?: number }
  ) => string // Returns tab ID
  removeImageFileTab: (tabId: string) => void

  // Structure data (legacy - for backward compatibility)
  currentStructure: MolecularStructure | null
  setCurrentStructure: (structure: MolecularStructure | null) => void

  // Visualization state
  visualizationState: VisualizationState
  setVisualizationStyle: (style: VisualizationStyle) => void
  toggleSurface: (show: boolean) => void
  setSurfaceType: (type: SurfaceType) => void
  setSurfaceOpacity: (opacity: number) => void
  toggleComponent: (component: 'protein' | 'ligands' | 'water' | 'ions', show: boolean) => void
  setBackgroundColor: (color: number) => void
  setColorTheme: (theme: ColorTheme) => void

  // Animation state
  spinSpeed: number
  setSpinSpeed: (speed: number) => void

  // Viewer reference (will be set from component)
  viewerRef: MolstarViewerHandle | PluginContext | null
  setViewerRef: (ref: MolstarViewerHandle | PluginContext | null) => void

  // Docking results and status (persists across tab switches)
  dockingResults: DockingResults | null
  setDockingResults: (results: DockingResults | null) => void
  selectedPoseIndex: number | null
  setSelectedPoseIndex: (index: number | null) => void
  isDockingRunning: boolean
  setIsDockingRunning: (running: boolean) => void
  dockingProgress: number
  setDockingProgress: (progress: number) => void
  dockingStatus: string
  setDockingStatus: (status: string) => void
  // Original protein PDB data (before any docked poses are added) - persists across tab switches
  originalProteinPDB: string | null
  setOriginalProteinPDB: (pdb: string | null) => void

  // Loading and error states
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  error: string | null
  setError: (error: string | null) => void

  // ADMET results and status
  admetResults: ADMETResult | null
  setAdmetResults: (results: ADMETResult | null) => void
  isAdmetRunning: boolean
  setIsAdmetRunning: (running: boolean) => void

  // Editor import trigger
  pendingEditorImport: boolean
  setPendingEditorImport: (pending: boolean) => void

  // Tautomer exploration trigger (set by LibraryTool to pre-load SMILES in InputTool)
  pendingTautomerSmiles: string | null
  setPendingTautomerSmiles: (smiles: string | null) => void

  // Pending docking grid box (set by PocketFinderTool when sending a pocket to Docking)
  pendingDockingGridBox: GridBox | null
  setPendingDockingGridBox: (gridBox: GridBox | null) => void

  // Library sync state
  libraryLastUpdated: number
  refreshLibrary: () => void

  // Reset function
  reset: () => void
}

const initialVisualizationState: VisualizationState = {
  style: 'cartoon',
  showSurface: false,
  surfaceType: 'vdw',
  surfaceOpacity: 0.7,
  showProtein: true,
  showLigands: true,
  showWater: true, // Show water by default
  showIons: false,
  backgroundColor: 0xffffff, // White background (clean look, avoids Mol* logo contrast)
  colorTheme: 'default',
}

export const useMolecularStore = create<MolecularStore>((set, get) => ({
  // Initial state
  structureTabs: [],
  activeTabId: null,
  animationTabId: null,
  conformerTabId: null,
  inputFileTabs: [],
  imageFileTabs: [],
  currentStructure: null,
  visualizationState: initialVisualizationState,
  viewerRef: null,
  dockingResults: null,
  selectedPoseIndex: null,
  isDockingRunning: false,
  dockingProgress: 0,
  dockingStatus: '',
  originalProteinPDB: null,
  isLoading: false,
  error: null,
  spinSpeed: 0.3, // Slower default spin speed
  admetResults: null,
  isAdmetRunning: false,
  pendingEditorImport: false,
  pendingTautomerSmiles: null,
  pendingDockingGridBox: null,
  libraryLastUpdated: 0,

  // Tab Actions
  addStructureTab: (structure, name) => {
    // Use helper to store heavy data in BlobRegistry
    const newTab = storeStructureData(structure, name)
    set((state) => ({
      structureTabs: [...state.structureTabs, newTab],
      activeTabId: newTab.id,
      currentStructure: structure, // Keep full structure for backward compat
      visualizationState: newTab.visualizationState,
      error: null,
    }))
  },

  openAnimationTab: (structure, name) => {
    const state = get()
    const existingTabId = state.animationTabId
    const existingTab = existingTabId ? state.structureTabs.find(t => t.id === existingTabId) : null

    if (existingTab) {
      // Update existing animation tab with new structure data
      // Clean up old blob data
      if (existingTab.pdbBlobId) BlobRegistry.delete(existingTab.pdbBlobId)
      if (existingTab.sdfBlobId) BlobRegistry.delete(existingTab.sdfBlobId)
      if (existingTab.xyzBlobId) BlobRegistry.delete(existingTab.xyzBlobId)

      // Store new data
      let pdbBlobId: string | null = null
      let xyzBlobId: string | null = null
      if (structure.pdb_data) {
        pdbBlobId = generateBlobId('pdb')
        BlobRegistry.set(pdbBlobId, structure.pdb_data, 'pdb')
      }
      if (structure.xyz_data) {
        xyzBlobId = generateBlobId('xyz')
        BlobRegistry.set(xyzBlobId, structure.xyz_data, 'xyz')
      }

      const updatedTab: StructureTab = {
        ...existingTab,
        structureId: structure.structure_id,
        pdbBlobId,
        sdfBlobId: null,
        xyzBlobId,
        metadata: structure.metadata,
        name: name || existingTab.name,
      }

      set((state) => ({
        structureTabs: state.structureTabs.map(t => t.id === existingTabId ? updatedTab : t),
        activeTabId: existingTabId,
        currentStructure: structure,
        error: null,
      }))
      return existingTabId!
    } else {
      // Create new animation tab
      const newTab = storeStructureData(structure, name || 'Animation')
      set((state) => ({
        structureTabs: [...state.structureTabs, newTab],
        activeTabId: newTab.id,
        animationTabId: newTab.id,
        currentStructure: structure,
        visualizationState: newTab.visualizationState,
        error: null,
      }))
      return newTab.id
    }
  },

  openConformerTab: (structure, name) => {
    const state = get()
    const existingTabId = state.conformerTabId
    const existingTab = existingTabId ? state.structureTabs.find(t => t.id === existingTabId) : null

    if (existingTab) {
      // Update existing conformer tab with new structure data
      // Clean up old blob data
      if (existingTab.pdbBlobId) BlobRegistry.delete(existingTab.pdbBlobId)
      if (existingTab.sdfBlobId) BlobRegistry.delete(existingTab.sdfBlobId)
      if (existingTab.xyzBlobId) BlobRegistry.delete(existingTab.xyzBlobId)

      // Store new data
      let pdbBlobId: string | null = null
      let xyzBlobId: string | null = null
      if (structure.pdb_data) {
        pdbBlobId = generateBlobId('pdb')
        BlobRegistry.set(pdbBlobId, structure.pdb_data, 'pdb')
      }
      if (structure.xyz_data) {
        xyzBlobId = generateBlobId('xyz')
        BlobRegistry.set(xyzBlobId, structure.xyz_data, 'xyz')
      }

      const updatedTab: StructureTab = {
        ...existingTab,
        structureId: structure.structure_id,
        pdbBlobId,
        sdfBlobId: null,
        xyzBlobId,
        metadata: structure.metadata,
        name: name || existingTab.name,
      }

      set((state) => ({
        structureTabs: state.structureTabs.map(t => t.id === existingTabId ? updatedTab : t),
        activeTabId: existingTabId,
        currentStructure: structure,
        error: null,
      }))
      return existingTabId!
    } else {
      // Create new conformer tab
      const newTab = storeStructureData(structure, name || 'Conformers')
      set((state) => ({
        structureTabs: [...state.structureTabs, newTab],
        activeTabId: newTab.id,
        conformerTabId: newTab.id,
        currentStructure: structure,
        visualizationState: newTab.visualizationState,
        error: null,
      }))
      return newTab.id
    }
  },

  addInputFileTab: (content, name) => {
    const tabId = `input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newTab: InputFileTab = {
      id: tabId,
      name: name || 'ORCA Input File',
      content,
      createdAt: Date.now(),
    }
    set((state) => ({
      inputFileTabs: [...state.inputFileTabs, newTab],
      activeTabId: tabId,
      error: null,
    }))
    return tabId
  },

  updateInputFileTab: (tabId, content) => {
    set((state) => ({
      inputFileTabs: state.inputFileTabs.map(tab =>
        tab.id === tabId ? { ...tab, content } : tab
      ),
    }))
  },

  removeInputFileTab: (tabId) => {
    const state = get()
    const updatedTabs = state.inputFileTabs.filter(tab => tab.id !== tabId)

    // If we're removing the active tab, we need to switch to another tab
    if (state.activeTabId === tabId) {
      // Prefer switching to the most recent structure tab
      if (state.structureTabs.length > 0) {
        // Get the most recent structure tab (last in array)
        const lastStructureTab = state.structureTabs[state.structureTabs.length - 1]
        set({
          inputFileTabs: updatedTabs,
          activeTabId: lastStructureTab.id,
          currentStructure: getStructureFromTab(lastStructureTab),
          visualizationState: lastStructureTab.visualizationState,
        })
      } else if (updatedTabs.length > 0) {
        // No structure tabs, switch to another input file tab
        set({
          inputFileTabs: updatedTabs,
          activeTabId: updatedTabs[updatedTabs.length - 1].id,
        })
      } else {
        // No tabs left at all
        set({
          inputFileTabs: updatedTabs,
          activeTabId: null,
          currentStructure: null,
        })
      }
    } else {
      // Not removing the active tab, just update the list
      set({
        inputFileTabs: updatedTabs,
      })
    }
  },

  addImageFileTab: (imageUrl, name, options) => {
    const state = get()
    const libId = options?.libraryMoleculeId
    if (libId != null) {
      const existing = state.imageFileTabs.find((t) => t.libraryMoleculeId === libId)
      if (existing) {
        const tabName = name || existing.name
        set({
          imageFileTabs: state.imageFileTabs.map((t) =>
            t.id === existing.id ? { ...t, imageUrl, name: tabName } : t
          ),
          activeTabId: existing.id,
          error: null,
        })
        return existing.id
      }
    }

    const tabId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newTab: ImageFileTab = {
      id: tabId,
      name: name || 'Image',
      imageUrl,
      createdAt: Date.now(),
      ...(libId != null ? { libraryMoleculeId: libId } : {}),
    }
    set((s) => ({
      imageFileTabs: [...s.imageFileTabs, newTab],
      activeTabId: tabId,
      error: null,
    }))
    return tabId
  },

  removeImageFileTab: (tabId) => {
    const state = get()
    const updatedTabs = state.imageFileTabs.filter(tab => tab.id !== tabId)

    // If we're removing the active tab, we need to switch to another tab
    if (state.activeTabId === tabId) {
      // Prefer switching to the most recent structure tab
      if (state.structureTabs.length > 0) {
        // Get the most recent structure tab (last in array)
        const lastStructureTab = state.structureTabs[state.structureTabs.length - 1]
        set({
          imageFileTabs: updatedTabs,
          activeTabId: lastStructureTab.id,
          currentStructure: getStructureFromTab(lastStructureTab),
          visualizationState: lastStructureTab.visualizationState,
        })
      } else if (updatedTabs.length > 0) {
        // No structure tabs, switch to another image file tab
        set({
          imageFileTabs: updatedTabs,
          activeTabId: updatedTabs[updatedTabs.length - 1].id,
        })
      } else {
        // No tabs left at all
        set({
          imageFileTabs: updatedTabs,
          activeTabId: null,
          currentStructure: null,
        })
      }
    } else {
      // Not removing the active tab, just update the list
      set({
        imageFileTabs: updatedTabs,
      })
    }
  },

  removeStructureTab: (tabId) => {
    const state = get()
    const removedTab = state.structureTabs.find((t) => t.id === tabId)
    const newTabs = state.structureTabs.filter((t) => t.id !== tabId)
    const wasActive = state.activeTabId === tabId

    // Clean up blob data for the removed tab
    if (removedTab) {
      cleanupTabBlobs(removedTab)
    }

    if (wasActive && newTabs.length > 0) {
      // Switch to the previous tab or the first one
      const currentIndex = state.structureTabs.findIndex((t) => t.id === tabId)
      const newActiveTab = newTabs[Math.max(0, currentIndex - 1)]
      set({
        structureTabs: newTabs,
        activeTabId: newActiveTab.id,
        currentStructure: getStructureFromTab(newActiveTab),
        visualizationState: newActiveTab.visualizationState,
      })
    } else if (wasActive && newTabs.length === 0 && state.inputFileTabs.length > 0) {
      // If no structure tabs left but input file tabs exist, switch to first input file tab
      set({
        structureTabs: newTabs,
        activeTabId: state.inputFileTabs[0].id,
        currentStructure: null,
      })
    } else if (newTabs.length === 0) {
      set({
        structureTabs: [],
        activeTabId: null,
        currentStructure: null,
        visualizationState: initialVisualizationState, // Reset to default when no tabs remain
      })
    } else {
      set({ structureTabs: newTabs })
    }
  },

  setActiveTab: (tabId) => {
    const state = get()
    const structureTab = state.structureTabs.find((t) => t.id === tabId)
    const inputFileTab = state.inputFileTabs.find((t) => t.id === tabId)
    const imageFileTab = state.imageFileTabs.find((t) => t.id === tabId)
    const currentTab = state.structureTabs.find((t) => t.id === state.activeTabId)

    if (structureTab) {
      // Save current visualization state to the current tab before switching
      if (currentTab) {
        const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
        if (tabIndex !== -1) {
          // Capture camera state
          let cameraState = undefined
          const viewer = state.viewerRef as any
          const plugin = viewer?.plugin || (viewer?.canvas3d ? viewer : null)

          if (plugin?.canvas3d?.camera) {
            try {
              cameraState = plugin.canvas3d.camera.getSnapshot()
              // console.log('📸 Captured camera state for tab:', currentTab.name)
            } catch (e) {
              console.warn('Failed to capture camera state:', e)
            }
          }

          const updatedTabs = [...state.structureTabs]
          updatedTabs[tabIndex] = {
            ...currentTab,
            visualizationState: state.visualizationState,
            cameraState: cameraState || currentTab.cameraState, // Keep existing if capture failed
          }
          set({
            structureTabs: updatedTabs,
            activeTabId: tabId,
            currentStructure: getStructureFromTab(structureTab),
            visualizationState: structureTab.visualizationState,
          })
          return
        }
      }

      // If no current tab, just switch
      set({
        activeTabId: tabId,
        currentStructure: getStructureFromTab(structureTab),
        visualizationState: structureTab.visualizationState,
      })
    } else if (inputFileTab) {
      // Switching to an input file tab
      // Save current visualization state to the current structure tab before switching
      if (currentTab) {
        const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
        if (tabIndex !== -1) {
          // Capture camera state
          let cameraState = undefined
          const viewer = state.viewerRef as any
          const plugin = viewer?.plugin || (viewer?.canvas3d ? viewer : null)

          if (plugin?.canvas3d?.camera) {
            try {
              cameraState = plugin.canvas3d.camera.getSnapshot()
            } catch (e) {
              console.warn('Failed to capture camera state:', e)
            }
          }

          const updatedTabs = [...state.structureTabs]
          updatedTabs[tabIndex] = {
            ...currentTab,
            visualizationState: state.visualizationState,
            cameraState: cameraState || currentTab.cameraState,
          }
          set({
            structureTabs: updatedTabs,
            activeTabId: tabId,
            // Don't change currentStructure when switching to input file tab
          })
          return
        }
      }

      // If no current tab, just switch
      set({
        activeTabId: tabId,
        // Don't change currentStructure when switching to input file tab
      })
    } else if (imageFileTab) {
      // Switching to an image file tab
      // Save current visualization state to the current structure tab before switching
      if (currentTab) {
        const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
        if (tabIndex !== -1) {
          // Capture camera state
          let cameraState = undefined
          const viewer = state.viewerRef as any
          const plugin = viewer?.plugin || (viewer?.canvas3d ? viewer : null)

          if (plugin?.canvas3d?.camera) {
            try {
              cameraState = plugin.canvas3d.camera.getSnapshot()
            } catch (e) {
              console.warn('Failed to capture camera state:', e)
            }
          }

          const updatedTabs = [...state.structureTabs]
          updatedTabs[tabIndex] = {
            ...currentTab,
            visualizationState: state.visualizationState,
            cameraState: cameraState || currentTab.cameraState,
          }
          set({
            structureTabs: updatedTabs,
            activeTabId: tabId,
            // Don't change currentStructure when switching to image file tab
          })
          return
        }
      }

      // If no current tab, just switch
      set({
        activeTabId: tabId,
        // Don't change currentStructure when switching to image file tab
      })
    }
  },

  // Actions
  setCurrentStructure: (structure) => set({ currentStructure: structure, error: null }),

  setVisualizationStyle: (style) => {
    const state = get()
    const newVisState = { ...state.visualizationState, style }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  toggleSurface: (show) => {
    const state = get()
    const newVisState = { ...state.visualizationState, showSurface: show }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  setSurfaceType: (surfaceType) => {
    const state = get()
    const newVisState = { ...state.visualizationState, surfaceType }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  setSurfaceOpacity: (surfaceOpacity) => {
    const state = get()
    const newVisState = { ...state.visualizationState, surfaceOpacity }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  toggleComponent: (component, show) => {
    const state = get()
    const key = `show${component.charAt(0).toUpperCase() + component.slice(1)}` as keyof VisualizationState
    const newVisState = {
      ...state.visualizationState,
      [key]: show,
    }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  setBackgroundColor: (backgroundColor) => {
    const state = get()
    const newVisState = { ...state.visualizationState, backgroundColor }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  setColorTheme: (colorTheme) => {
    const state = get()
    const newVisState = { ...state.visualizationState, colorTheme }

    // Update the current tab's visualization state
    if (state.activeTabId) {
      const tabIndex = state.structureTabs.findIndex((t) => t.id === state.activeTabId)
      if (tabIndex !== -1) {
        const updatedTabs = [...state.structureTabs]
        updatedTabs[tabIndex] = {
          ...updatedTabs[tabIndex],
          visualizationState: newVisState,
        }
        set({
          visualizationState: newVisState,
          structureTabs: updatedTabs,
        })
        return
      }
    }

    set({ visualizationState: newVisState })
  },

  setSpinSpeed: (spinSpeed) => set({ spinSpeed }),

  setViewerRef: (ref) => set({ viewerRef: ref }),

  setDockingResults: (dockingResults) => set({ dockingResults }),

  setSelectedPoseIndex: (selectedPoseIndex) => set({ selectedPoseIndex }),

  setIsDockingRunning: (isDockingRunning) => set({ isDockingRunning }),

  setDockingProgress: (dockingProgress) => set({ dockingProgress }),

  setDockingStatus: (dockingStatus) => set({ dockingStatus }),

  setOriginalProteinPDB: (originalProteinPDB) => set({ originalProteinPDB }),

  setIsLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  setAdmetResults: (admetResults) => set({ admetResults }),

  setIsAdmetRunning: (isAdmetRunning) => set({ isAdmetRunning }),

  setPendingEditorImport: (pendingEditorImport) => set({ pendingEditorImport }),

  setPendingTautomerSmiles: (pendingTautomerSmiles) => set({ pendingTautomerSmiles }),

  setPendingDockingGridBox: (gridBox) => set({ pendingDockingGridBox: gridBox }),

  refreshLibrary: () => set({ libraryLastUpdated: Date.now() }),

  reset: () => {
    // Clean up all blob data before resetting
    const state = get()
    for (const tab of state.structureTabs) {
      cleanupTabBlobs(tab)
    }

    set({
      structureTabs: [],
      activeTabId: null,
      inputFileTabs: [],
      imageFileTabs: [],
      currentStructure: null,
      visualizationState: initialVisualizationState,
      dockingResults: null,
      selectedPoseIndex: null,
      isDockingRunning: false,
      dockingProgress: 0,
      dockingStatus: '',
      originalProteinPDB: null,
      isLoading: false,
      error: null,
      admetResults: null,
      isAdmetRunning: false,
      pendingEditorImport: false,
      pendingTautomerSmiles: null,
      pendingDockingGridBox: null,
    })
  },
}))
