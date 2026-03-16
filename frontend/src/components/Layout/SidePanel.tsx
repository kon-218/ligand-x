'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Download,
  Eye,
  Microscope,
  Settings,
  Atom,
  PenTool,
  BarChart3,
  Library,
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Scissors,
  Magnet,
  Target,
  Activity,
  Flame,
  Sparkles,
  Beaker,
  Droplets,
  GitBranch,
  ScanSearch,
} from 'lucide-react'
import { useUIStore, type ToolId } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useMolecularStore } from '@/store/molecular-store'
import { useMDStore } from '@/store/md-store'
import { useBoltz2Store } from '@/store/boltz2-store'
import { useQCStore } from '@/store/qc-store'
import { cn } from '@/lib/utils'
import { InputTool } from '@/components/Tools/InputTool'
import { Loader2 } from 'lucide-react'
import { DockingTool } from '@/components/Tools/DockingTool'
import { MDOptimizationTool } from '@/components/Tools/MDOptimizationTool'
import { Boltz2Tool } from '@/components/Tools/Boltz2Tool'
import { EditorTool } from '@/components/Tools/EditorTool'
import { ADMETTool } from '@/components/Tools/ADMETTool'
import { LibraryTool } from '@/components/Tools/LibraryTool'
import { QuantumChemistryTool } from '@/components/Tools/QuantumChemistryTool'
import { ProteinCleaningTool } from '@/components/Tools/ProteinCleaningTool'
import { PocketFinderTool } from '@/components/Tools/PocketFinderTool'
import { ABFETool } from '@/components/Tools/ABFETool'
import { RBFETool } from '@/components/Tools/RBFETool'
import { ResultsTool } from '@/components/Tools/Results'
import { useHydration } from '@/hooks/use-hydration'
import { useEditorPreload, preloadEditor } from '@/hooks/use-editor-preload'
import { preloadEditorBundle } from '@/components/Tools/EditorTool'
import { accentColorClasses, type AccentColor } from '@/components/Tools/shared/types'

interface Tool {
  id: ToolId
  name: string
  icon: React.ReactNode
  component: React.ComponentType
  description: string
  accentColor?: AccentColor
  service?: string // matches key in SERVICE_URLS; undefined = always show
}

const tools: Tool[] = [
  {
    id: 'input',
    name: 'Input',
    icon: <Download className="w-5 h-5" />,
    component: InputTool,
    description: 'Load structures from PDB, files, or SMILES',
    accentColor: 'blue',
  },
  {
    id: 'protein-cleaning',
    name: 'Protein Cleaning',
    icon: <Droplets className="w-5 h-5" />,
    component: ProteinCleaningTool,
    description: 'Clean protein structures with PDBFixer',
    accentColor: 'teal',
    service: 'structure',
  },
  {
    id: 'library',
    name: 'Library',
    icon: <Library className="w-5 h-5" />,
    component: LibraryTool,
    description: 'Molecule library management',
    accentColor: 'blue',
    service: 'structure',
  },
  {
    id: 'editor',
    name: 'Editor',
    icon: <PenTool className="w-5 h-5" />,
    component: EditorTool,
    description: 'Edit molecular structures',
    accentColor: 'blue',
    service: 'ketcher',
  },
  {
    id: 'pocket-finder',
    name: 'Pocket Finder',
    icon: <ScanSearch className="w-5 h-5" />,
    component: PocketFinderTool,
    description: 'Detect druggable binding sites with fpocket',
    accentColor: 'purple',
    service: 'structure',
  },
  {
    id: 'docking',
    name: 'Molecular Docking',
    icon: <Target className="w-5 h-5" />,
    component: DockingTool,
    description: 'Predict protein-ligand binding poses',
    accentColor: 'indigo',
    service: 'docking',
  },
  {
    id: 'md-optimization',
    name: 'MD Optimization',
    icon: <Activity className="w-5 h-5" />,
    component: MDOptimizationTool,
    description: 'Optimize protein-ligand complexes',
    accentColor: 'green',
    service: 'md',
  },
  {
    id: 'abfe',
    name: 'ABFE Calculation',
    icon: <Flame className="w-5 h-5" />,
    component: ABFETool,
    description: 'Compute absolute binding free energy',
    accentColor: 'orange',
    service: 'abfe',
  },
  {
    id: 'rbfe',
    name: 'RBFE Calculation',
    icon: <GitBranch className="w-5 h-5" />,
    component: RBFETool,
    description: 'Compute relative binding free energy between ligands',
    accentColor: 'cyan',
    service: 'rbfe',
  },
  {
    id: 'boltz2',
    name: 'Boltz-2 Prediction',
    icon: <Sparkles className="w-5 h-5" />,
    component: Boltz2Tool,
    description: 'Predict binding affinity with deep learning',
    accentColor: 'purple',
    service: 'boltz2',
  },
  {
    id: 'admet',
    name: 'ADMET Analysis',
    icon: <Beaker className="w-5 h-5" />,
    component: ADMETTool,
    description: 'Predict pharmacokinetic and toxicity properties',
    accentColor: 'teal',
    service: 'admet',
  },
  {
    id: 'quantum-chemistry',
    name: 'Quantum Chemistry',
    icon: <Zap className="w-5 h-5" />,
    component: QuantumChemistryTool,
    description: 'ORCA quantum chemistry calculations',
    service: 'qc',
  },
  {
    id: 'results',
    name: 'Results Browser',
    icon: <BarChart3 className="w-5 h-5" />,
    component: ResultsTool,
    description: 'Browse all calculation results',
    accentColor: 'amber',
  },
]

export function SidePanel() {
  const hydrated = useHydration()
  // Enable editor preloading after component mounts
  useEditorPreload()

  const {
    isSidePanelExpanded,
    activeTool,
    setActiveTool,
    sidePanelWidth,
    setSidePanelWidth,
    editorSidePanelWidth,
    setEditorSidePanelWidth,
    sidebarIconsWidth,
    setSidebarIconsWidth,
    editorMessage,
    editorHasChanges,
    serviceStatus,
    setServiceStatus,
  } = useUIStore()
  const { isAdmetRunning, isDockingRunning } = useMolecularStore()
  const { isRunning: isMDRunning } = useMDStore()
  const { isRunning: isBoltz2Running } = useBoltz2Store()
  const { isRunning: isQCRunning } = useQCStore()

  // Track if initial health check has completed
  const [healthCheckComplete, setHealthCheckComplete] = useState(false)

  // Once a service is confirmed available, keep it visible even if a subsequent
  // health check fails (e.g. service is busy processing a long computation).
  // This prevents tools from disappearing from the sidebar during heavy workloads.
  const [everAvailableServices, setEverAvailableServices] = useState<Set<string>>(new Set())

  // Poll service health every 30 seconds
  useEffect(() => {
    const check = async () => {
      const status = await api.getServicesHealth()
      if (status !== null) {
        // Only update on a real response - don't wipe tabs on transient network errors
        setServiceStatus(status)
        setHealthCheckComplete(true)
        // Record any services that are currently up so we never hide them later
        setEverAvailableServices(prev => {
          const next = new Set(prev)
          Object.entries(status).forEach(([svc, up]) => { if (up) next.add(svc) })
          return next
        })
      } else if (!healthCheckComplete) {
        // First check failed: mark complete so we don't block indefinitely
        setHealthCheckComplete(true)
      }
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [setServiceStatus, healthCheckComplete])

  // Filter tools based on which services are available.
  // Before hydration/health check: only show tools that don't require a service.
  // After health check completes: show tools whose service is (or was ever) available.
  // A service that was once available stays visible even if a single poll returns false —
  // transient failures (e.g. service busy with a long job) must not collapse the sidebar.
  const visibleTools = tools.filter(tool =>
    !tool.service ||                              // no service required → always show
    (hydrated && healthCheckComplete && (
      serviceStatus[tool.service] === true ||     // currently up
      everAvailableServices.has(tool.service)     // was up at some point
    ))
  )

  // Auto-deselect active tool only if its service has never been confirmed available
  // (i.e. was never reachable, not just temporarily busy).
  useEffect(() => {
    if (activeTool && !visibleTools.find(t => t.id === activeTool)) {
      setActiveTool(null)
    }
  }, [visibleTools, activeTool, setActiveTool])

  // Track if Editor has ever been opened - once true, keep it mounted forever
  const [editorEverOpened, setEditorEverOpened] = useState(false)

  // Prefetch Ketcher on idle
  useEffect(() => {
    // Only prefetch if not already opened
    if (editorEverOpened) return;

    const prefetch = () => {
      console.log('Prefetching editor bundle on idle...')
      preloadEditorBundle()
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(prefetch, { timeout: 5000 })
      return () => (window as any).cancelIdleCallback(handle)
    } else {
      const timeout = setTimeout(prefetch, 3000)
      return () => clearTimeout(timeout)
    }
  }, [editorEverOpened])
  const [isResizing, setIsResizing] = useState(false)
  const [isResizingIcons, setIsResizingIcons] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)
  const iconsResizeRef = useRef<HTMLDivElement>(null)

  // Mark editor as opened when it becomes the active tool
  useEffect(() => {
    if (activeTool === 'editor') {
      setEditorEverOpened(true)
    }
  }, [activeTool])

  const handleToolClick = (toolId: ToolId) => {
    if (activeTool === toolId) {
      setActiveTool(null)
    } else {
      setActiveTool(toolId)
    }
  }

  const activeToolData = visibleTools.find((t) => t.id === activeTool)

  // Initialize editor width to 50% of viewport on first open
  useEffect(() => {
    if (activeTool === 'editor' && editorSidePanelWidth === 800 && typeof window !== 'undefined') {
      // On first open, set to 50% of current viewport if still at default
      const initialWidth = window.innerWidth * 0.5
      setEditorSidePanelWidth(initialWidth)
    }
  }, [activeTool, editorSidePanelWidth, setEditorSidePanelWidth])

  // Resize handler for side panel
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }, [])

  // Resize handler for icons column
  const handleIconsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizingIcons(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      // Subtract icons width from total width to get just the expanded panel width
      const newExpandedWidth = e.clientX - sidebarIconsWidth
      // Use separate width setter based on active tool
      if (activeTool === 'editor') {
        setEditorSidePanelWidth(newExpandedWidth)
      } else {
        setSidePanelWidth(newExpandedWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, activeTool, sidebarIconsWidth, setSidePanelWidth, setEditorSidePanelWidth])

  // Resize handler for icons column
  useEffect(() => {
    if (!isResizingIcons) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX
      setSidebarIconsWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingIcons(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizingIcons, setSidebarIconsWidth])

  // Calculate icon size based on sidebar width (scale from 16px at 60px width to 28px at 200px width)
  const iconSize = Math.max(16, Math.min(28, (sidebarIconsWidth - 60) / (200 - 60) * (28 - 16) + 16))
  const buttonHeight = Math.max(48, Math.min(80, (sidebarIconsWidth - 60) / (200 - 60) * (80 - 48) + 48))
  const padding = Math.max(4, Math.min(12, (sidebarIconsWidth - 60) / (200 - 60) * (12 - 4) + 4))

  // Prevent hydration mismatch by rendering initial state during SSR
  if (!hydrated) {
    return (
      <div className="h-full bg-gray-900 border-r border-gray-700 flex relative" style={{ width: sidebarIconsWidth }} suppressHydrationWarning>
        <div
          className="flex flex-col gap-1 bg-gray-950 relative"
          style={{ width: sidebarIconsWidth, padding: `${padding}px` }}
          suppressHydrationWarning
        >
          {visibleTools.map((tool) => (
            <button
              key={tool.id}
              className="w-full rounded-lg flex items-center justify-center bg-gray-800 text-gray-400 transition-all duration-200 hover:bg-gray-700"
              style={{ height: `${buttonHeight}px` }}
            >
              <div style={{ width: `${iconSize}px`, height: `${iconSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {tool.icon}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Calculate width based on active tool
  // Editor uses its own separate width that defaults larger
  const expandedWidth = activeTool === 'editor' ? editorSidePanelWidth : sidePanelWidth
  const totalWidth = isSidePanelExpanded ? sidebarIconsWidth + expandedWidth : sidebarIconsWidth

  return (
    <motion.div
      className={cn(
        "sidebar-container h-full bg-gray-900 flex relative overflow-hidden",
        isSidePanelExpanded ? "border-r border-gray-700" : "border-r border-gray-800"
      )}
      style={{ willChange: 'width' }}
      initial={{ width: sidebarIconsWidth }}
      animate={{ width: totalWidth }}
      transition={isResizing ? { duration: 0 } : {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1], // Custom cubic-bezier for smoother animation
        type: 'tween'
      }}
      suppressHydrationWarning
    >
      {/* Resize Handle */}
      {isSidePanelExpanded && (
        <div
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-50",
            "bg-gray-700 hover:bg-blue-500/70 hover:w-2 transition-all",
            isResizing && "w-2 bg-blue-500"
          )}
          style={{ touchAction: 'none' }}
          title="Drag to resize sidebar"
        />
      )}

      {/* Tool Icons Bar */}
      <motion.div
        className="flex flex-col gap-1 bg-gray-950 relative z-50"
        style={{
          width: sidebarIconsWidth,
          padding: `${padding}px`,
          willChange: 'width'
        }}
        initial={{ width: 80 }}
        animate={{ width: sidebarIconsWidth }}
        transition={isResizingIcons ? { duration: 0 } : {
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1]
        }}
        suppressHydrationWarning
      >
        {/* Resize Handle for Icons Column */}
        <div
          ref={iconsResizeRef}
          onMouseDown={handleIconsMouseDown}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-50",
            "bg-gray-700 hover:bg-blue-500/70 hover:w-2 transition-all",
            isResizingIcons && "w-2 bg-blue-500"
          )}
          style={{ touchAction: 'none' }}
          title="Drag to resize icons column"
        />

        {visibleTools.map((tool) => {
          const isToolRunning =
            (tool.id === 'admet' && isAdmetRunning) ||
            (tool.id === 'docking' && isDockingRunning) ||
            (tool.id === 'md-optimization' && isMDRunning) ||
            (tool.id === 'boltz2' && isBoltz2Running) ||
            (tool.id === 'quantum-chemistry' && isQCRunning)

          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              onMouseEnter={() => {
                // Preload editor bundle on hover for better UX
                if (tool.id === 'editor') {
                  preloadEditorBundle()
                }
              }}
              title={tool.name}
              className={cn(
                'w-full rounded-lg flex items-center justify-center',
                'transition-all duration-200',
                'hover:bg-gray-700 group relative',
                activeTool === tool.id
                  ? tool.accentColor
                    ? `${accentColorClasses[tool.accentColor].bg} text-white shadow-lg shadow-${tool.accentColor}-500/50`
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                  : 'bg-gray-800 text-gray-400'
              )}
              style={{ height: `${buttonHeight}px` }}
            >
              {isToolRunning ? (
                <Loader2
                  className="animate-spin text-blue-400"
                  style={{ width: `${iconSize}px`, height: `${iconSize}px`, aspectRatio: '1' }}
                />
              ) : (
                <div style={{ width: `${iconSize}px`, height: `${iconSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {tool.icon}
                </div>
              )}

              {/* Running indicator badge */}
              {isToolRunning && (
                <div
                  className="absolute top-1 right-1 bg-blue-500 rounded-full animate-pulse"
                  style={{
                    width: `${Math.max(8, iconSize * 0.6)}px`,
                    height: `${Math.max(8, iconSize * 0.6)}px`
                  }}
                />
              )}

              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                {tool.name}
                {isToolRunning && <span className="ml-2 text-blue-400">(Running...)</span>}
                <div className="text-xs text-gray-400 mt-1">{tool.description}</div>
              </div>
            </button>
          )
        })}
      </motion.div>

      {/* Tool Content Area */}
      {/* CRITICAL FIX: Keep Editor always mounted to prevent Ketcher re-initialization */}
      {/* Once the editor is opened, it stays mounted forever, just hidden with CSS */}

      {/* Editor Tool - Always mounted once opened, shown/hidden with CSS */}
      {editorEverOpened && (
        <motion.div
          className="flex-1 flex flex-col bg-gray-900 overflow-hidden"
          initial={false}
          suppressHydrationWarning
          animate={{
            opacity: activeTool === 'editor' && isSidePanelExpanded ? 1 : 0,
            display: activeTool === 'editor' && isSidePanelExpanded ? 'flex' : 'none'
          }}
          transition={{
            opacity: { duration: 0.15 },
            display: { delay: activeTool === 'editor' ? 0 : 0.15 }
          }}
        >
          {/* Tool Header */}
          {activeTool === 'editor' && isSidePanelExpanded && (
            <div className="border-b border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-gray-600">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="relative flex items-center justify-between p-4 h-[73px] min-w-fit"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <div className="p-2.5 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg flex-shrink-0">
                    <div className="w-5 h-5 text-blue-400">
                      <PenTool className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white flex items-center">
                      Editor
                    </h2>
                    <p className="text-xs text-gray-400">
                      Edit molecular structures
                    </p>
                  </div>
                </div>
                {(editorHasChanges || editorMessage) && (
                  <div className="absolute right-12 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 max-w-[calc(100%-200px)]">
                    {editorHasChanges && (
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-amber-500 text-xs font-medium">Unsaved</span>
                      </div>
                    )}
                    {editorMessage && (
                      <div className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium min-w-0 max-w-[300px]",
                        editorMessage.type === 'success'
                          ? "bg-green-500/10 border-green-500/20 text-green-400"
                          : "bg-red-500/10 border-red-500/20 text-red-400"
                      )}>
                        {editorMessage.type === 'success' ? (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                        )}
                        <span className="truncate" title={editorMessage.message || ''}>
                          {editorMessage.message}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setActiveTool(null)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0 relative z-10 ml-auto"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </motion.div>
            </div>
          )}

          {/* Tool Content - Always rendered once opened, visibility controlled by parent */}
          <div className="flex-1 overflow-hidden custom-scrollbar">
            <EditorTool />
          </div>
        </motion.div>
      )}

      {/* Other Tools - Use AnimatePresence for unmount/remount */}
      <AnimatePresence mode="wait" initial={false}>
        {isSidePanelExpanded && activeToolData && activeTool !== 'editor' && (
          <motion.div
            key={activeTool}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.15,
              ease: 'easeInOut'
            }}
            className="flex-1 flex flex-col bg-gray-900 overflow-hidden relative z-0"
            suppressHydrationWarning
          >
            {/* Tool Header */}
            {activeToolData && (
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  {activeToolData.accentColor ? (
                    <div className={`p-2.5 bg-gradient-to-br ${accentColorClasses[activeToolData.accentColor].gradient} rounded-lg`}>
                      <div className={`w-5 h-5 ${accentColorClasses[activeToolData.accentColor].text}`}>
                        {activeToolData.icon}
                      </div>
                    </div>
                  ) : (
                    <div className="text-blue-400">{activeToolData.icon}</div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center">
                      {activeToolData.name}
                      {activeToolData.id === 'md-optimization' && isMDRunning && (
                        <Loader2 className="w-4 h-4 animate-spin text-green-400 ml-2" />
                      )}
                      {activeToolData.id === 'boltz2' && isBoltz2Running && (
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400 ml-2" />
                      )}
                      {activeToolData.id === 'docking' && isDockingRunning && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-400 ml-2" />
                      )}
                      {activeToolData.id === 'admet' && isAdmetRunning && (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-400 ml-2" />
                      )}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {activeToolData.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveTool(null)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            )}

            {/* Tool Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <activeToolData.component />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
