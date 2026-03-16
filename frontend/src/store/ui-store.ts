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

interface UIStore {
  // Side panel state
  isSidePanelExpanded: boolean
  activeTool: ToolId
  sidePanelWidth: number // Width in pixels (for non-editor tools)
  editorSidePanelWidth: number // Width in pixels for editor (starts larger)
  sidebarIconsWidth: number // Width in pixels for the sidebar icons column
  setActiveTool: (tool: ToolId) => void
  setSidePanelWidth: (width: number) => void
  setEditorSidePanelWidth: (width: number) => void
  setSidebarIconsWidth: (width: number) => void
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
}

export const useUIStore = create<UIStore>((set) => ({
  // Side panel
  isSidePanelExpanded: false,
  activeTool: null,
  sidePanelWidth: 640, // Default width in pixels (for non-editor tools)
  editorSidePanelWidth: 800, // Default width in pixels for editor (larger default, ~50% of typical 1920px viewport)
  sidebarIconsWidth: 80, // Default width in pixels for sidebar icons column

  setActiveTool: (tool) =>
    set((state) => ({
      activeTool: tool,
      isSidePanelExpanded: tool !== null,
    })),

  setSidePanelWidth: (width) =>
    set({ sidePanelWidth: Math.max(320, Math.min(1200, width)) }), // Clamp between 320px and 1200px

  setEditorSidePanelWidth: (width) =>
    set({ editorSidePanelWidth: Math.max(320, Math.min(1200, width)) }), // Clamp between 320px and 1200px

  setSidebarIconsWidth: (width) =>
    set({ sidebarIconsWidth: Math.max(60, Math.min(200, width)) }), // Clamp between 60px and 200px

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
}))
