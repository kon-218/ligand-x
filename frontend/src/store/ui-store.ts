import { create } from 'zustand'

export type ToolId =
  | 'input'
  | 'visualization'
  | 'docking'
  | 'md-optimization'
  | 'boltz2'
  | 'editor'
  | 'admet'
  | 'library'
  | 'quantum-chemistry'
  | 'protein-cleaning'
  | 'abfe'
  | 'rbfe'
  | 'pocket-finder'
  | 'results'
  | null

export type OverlayId =
  | 'projects'
  | 'library'
  | 'settings'
  | 'support'
  | 'account'
  | 'new-experiment'
  | null

interface UIStore {
  // Side panel state
  isSidePanelExpanded: boolean
  activeTool: ToolId
  sidePanelWidth: number // Width in pixels (for non-editor tools)
  editorSidePanelWidth: number // Width in pixels for editor (starts larger)
  sidebarWidth: number // Width in pixels for the sidebar navigation column
  setActiveTool: (tool: ToolId) => void
  setSidePanelWidth: (width: number) => void
  setEditorSidePanelWidth: (width: number) => void
  setSidebarWidth: (width: number) => void
  toggleSidePanel: () => void
  closeSidePanel: () => void

  // Notifications
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: number
  }>
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  removeNotification: (id: string) => void

  // Modal state
  modalContent: React.ReactNode | null
  setModalContent: (content: React.ReactNode | null) => void

  // Editor tool messages
  editorMessage: {
    type: 'success' | 'error' | null
    message: string | null
  } | null
  setEditorMessage: (message: { type: 'success' | 'error', message: string } | null) => void

  // Editor tool state
  editorHasChanges: boolean
  setEditorHasChanges: (hasChanges: boolean) => void

  // Recent PDB IDs
  recentPdbIds: string[]
  addRecentPdbId: (id: string) => void

  // Service availability status (keyed by service name)
  serviceStatus: Record<string, boolean>
  setServiceStatus: (status: Record<string, boolean>) => void

  // Experiment tools added to the current project
  addedExperimentTools: ToolId[]
  addExperimentTool: (toolId: ToolId) => void
  addMultipleExperimentTools: (toolIds: ToolId[]) => void
  removeExperimentTool: (toolId: ToolId) => void
  clearExperimentTools: () => void

  // Overlay pages (render on top of viewer without unmounting it)
  activeOverlay: OverlayId
  setActiveOverlay: (overlay: OverlayId) => void
  closeOverlay: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  // Side panel
  isSidePanelExpanded: false,
  activeTool: null,
  sidePanelWidth: 640, // Default width in pixels (for non-editor tools)
  editorSidePanelWidth: 800, // Default width in pixels for editor (larger default, ~50% of typical 1920px viewport)
  sidebarWidth: 260, // Default width in pixels for sidebar navigation

  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      isSidePanelExpanded: tool !== null,
    })),

  setSidePanelWidth: (width) =>
    set({ sidePanelWidth: Math.max(320, Math.min(1200, width)) }), // Clamp between 320px and 1200px

  setEditorSidePanelWidth: (width) =>
    set({ editorSidePanelWidth: Math.max(320, Math.min(1200, width)) }), // Clamp between 320px and 1200px

  setSidebarWidth: (width) =>
    set({ sidebarWidth: Math.max(200, Math.min(360, width)) }), // Clamp between 200px and 360px

  toggleSidePanel: () =>
    set((state) => ({
      isSidePanelExpanded: !state.isSidePanelExpanded,
      activeTool: state.isSidePanelExpanded ? null : state.activeTool,
    })),

  closeSidePanel: () =>
    set({
      isSidePanelExpanded: false,
      activeTool: null,
    }),

  // Notifications
  notifications: [],

  addNotification: (type, message) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          id: Math.random().toString(36).substr(2, 9),
          type,
          message,
          timestamp: Date.now(),
        },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Modal
  modalContent: null,
  setModalContent: (content) => set({ modalContent: content }),

  // Editor tool messages
  editorMessage: null,
  setEditorMessage: (message) => set({ editorMessage: message }),

  // Editor tool state
  editorHasChanges: false,
  setEditorHasChanges: (hasChanges) => set({ editorHasChanges: hasChanges }),

  // Recent PDB IDs
  recentPdbIds: [],
  addRecentPdbId: (id) =>
    set((state) => {
      const upperId = id.toUpperCase()
      const filtered = state.recentPdbIds.filter((pi) => pi !== upperId)
      return {
        recentPdbIds: [upperId, ...filtered].slice(0, 3),
      }
    }),

  // Service availability status
  serviceStatus: {},
  setServiceStatus: (status) => set({ serviceStatus: status }),

  // Experiment tools added to the current project
  addedExperimentTools: [],
  addExperimentTool: (toolId) =>
    set((state) => {
      if (!toolId || state.addedExperimentTools.includes(toolId)) return state
      return { addedExperimentTools: [...state.addedExperimentTools, toolId] }
    }),
  addMultipleExperimentTools: (toolIds) =>
    set((state) => {
      const validToolIds = toolIds.filter(
        (id) => id && !state.addedExperimentTools.includes(id)
      )
      if (validToolIds.length === 0) return state
      return {
        addedExperimentTools: [...state.addedExperimentTools, ...validToolIds],
      }
    }),
  removeExperimentTool: (toolId) =>
    set((state) => ({
      addedExperimentTools: state.addedExperimentTools.filter((t) => t !== toolId),
    })),
  clearExperimentTools: () => set({ addedExperimentTools: [] }),

  // Overlay pages
  activeOverlay: null,
  setActiveOverlay: (overlay) =>
    set((state) => ({
      activeOverlay: overlay,
      // Deselect tool for projects and new-experiment, otherwise keep activeTool but minimize panel
      activeTool: overlay === 'projects' || overlay === 'new-experiment' ? null : state.activeTool,
      // Keep side panel expanded for library, close for other overlays
      isSidePanelExpanded: overlay && overlay !== 'library' ? false : state.isSidePanelExpanded,
    })),
  closeOverlay: () => set({ activeOverlay: null }),
}))
