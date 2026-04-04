'use client'

import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Download,
  Settings,
  Atom,
  PenTool,
  BarChart3,
  X,
  Zap,
  CheckCircle2,
  AlertCircle,
  Droplets,
  Plus,
  HelpCircle,
  User,
  Loader2,
  ScanSearch,
  Target,
  Activity,
  Flame,
  GitBranch,
  Sparkles,
  Beaker,
  Library,
} from 'lucide-react'
import { useUIStore, type ToolId } from '@/store/ui-store'
import { api } from '@/lib/api-client'
import { useMolecularStore } from '@/store/molecular-store'
import { useMDStore } from '@/store/md-store'
import { useBoltz2Store } from '@/store/boltz2-store'
import { useQCStore } from '@/store/qc-store'
import { usePreferencesStore } from '@/store/preferences-store'
import { baseColorConfigs } from '@/lib/base-color-config'
import { useBaseColor, type UseBaseColorReturn } from '@/hooks/use-base-color'
import { cn } from '@/lib/utils'
import { useHydration } from '@/hooks/use-hydration'
import { useEditorPreload } from '@/hooks/use-editor-preload'
import { preloadEditorBundle } from '@/components/Tools/EditorTool'
import { defaultTools, toolsConfig, type ToolConfig } from '@/lib/tools-config'
import type { AccentColor } from '@/components/Tools/shared/types'
import { accentColorClasses } from '@/components/Tools/shared/types'
import { useWarmAccent } from '@/hooks/use-warm-accent'

const ToolLoadingFallback = () => {
  const bc_active = useBaseColor()
  return (
    <div className="flex items-center justify-center h-full p-8">
      <Loader2
        className={`w-6 h-6 animate-spin ${!bc_active.isCustom ? bc_active.text : ''}`}
        style={bc_active.isCustom ? bc_active.styles?.text : undefined}
      />
    </div>
  )
}

const InputTool = dynamic(() => import('@/components/Tools/InputTool').then(m => m.InputTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const DockingTool = dynamic(() => import('@/components/Tools/DockingTool').then(m => m.DockingTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const MDOptimizationTool = dynamic(() => import('@/components/Tools/MDOptimizationTool').then(m => m.MDOptimizationTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const Boltz2Tool = dynamic(() => import('@/components/Tools/Boltz2Tool').then(m => m.Boltz2Tool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const EditorTool = dynamic(() => import('@/components/Tools/EditorTool').then(m => m.EditorTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const ADMETTool = dynamic(() => import('@/components/Tools/ADMETTool').then(m => m.ADMETTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const LibraryTool = dynamic(() => import('@/components/Tools/LibraryTool').then(m => m.LibraryTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const QuantumChemistryTool = dynamic(() => import('@/components/Tools/QuantumChemistryTool').then(m => m.QuantumChemistryTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const ProteinCleaningTool = dynamic(() => import('@/components/Tools/ProteinCleaningTool').then(m => m.ProteinCleaningTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const PocketFinderTool = dynamic(() => import('@/components/Tools/PocketFinderTool').then(m => m.PocketFinderTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const ABFETool = dynamic(() => import('@/components/Tools/ABFETool').then(m => m.ABFETool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const RBFETool = dynamic(() => import('@/components/Tools/RBFETool').then(m => m.RBFETool), {
  loading: ToolLoadingFallback,
  ssr: false,
})
const ResultsTool = dynamic(() => import('@/components/Tools/Results').then(m => m.ResultsTool), {
  loading: ToolLoadingFallback,
  ssr: false,
})

const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 360

const iconMap: Record<string, React.ReactNode> = {
  Download: <Download className="w-5 h-5" />,
  Droplets: <Droplets className="w-5 h-5" />,
  PenTool: <PenTool className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  Library: <Library className="w-5 h-5" />,
  ScanSearch: <ScanSearch className="w-5 h-5" />,
  Target: <Target className="w-5 h-5" />,
  Activity: <Activity className="w-5 h-5" />,
  Flame: <Flame className="w-5 h-5" />,
  GitBranch: <GitBranch className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  Beaker: <Beaker className="w-5 h-5" />,
}

const componentMap: Record<string, React.ComponentType> = {
  input: InputTool,
  'protein-cleaning': ProteinCleaningTool,
  library: LibraryTool,
  editor: EditorTool,
  'pocket-finder': PocketFinderTool,
  docking: DockingTool,
  'md-optimization': MDOptimizationTool,
  abfe: ABFETool,
  rbfe: RBFETool,
  boltz2: Boltz2Tool,
  admet: ADMETTool,
  'quantum-chemistry': QuantumChemistryTool,
  results: ResultsTool,
}

interface Tool {
  id: ToolId
  name: string
  icon: React.ReactNode
  component: React.ComponentType
  description: string
  accentColor?: AccentColor
  service?: string
}

function configToTool(config: ToolConfig): Tool {
  return {
    id: config.id,
    name: config.name,
    icon: iconMap[config.iconName] || <Download className="w-5 h-5" />,
    component: componentMap[config.id as string] || InputTool,
    description: config.description,
    accentColor: config.accentColor,
    service: config.service,
  }
}

const sidebarTools: Tool[] = defaultTools.map(configToTool)

const allTools: Tool[] = toolsConfig.map(configToTool)

function getAccentColorHex(accentColor: AccentColor | undefined): string {
  const colorMap: Record<AccentColor, string> = {
    'blue': '#2563eb',
    'green': '#16a34a',
    'purple': '#a855f7',
    'orange': '#ea580c',
    'pink': '#ec4899',
    'teal': '#14b8a6',
    'indigo': '#4f46e5',
    'cyan': '#06b6d4',
    'amber': '#d97706',
    'fuchsia': '#c026d3',
    'rose': '#e11d48',
  }
  return accentColor ? colorMap[accentColor] : '#06b6d4'
}

export function SidePanel() {
  const hydrated = useHydration()
  useEditorPreload()

  const {
    isSidePanelExpanded,
    activeTool,
    setActiveTool,
    sidePanelWidth,
    setSidePanelWidth,
    editorSidePanelWidth,
    setEditorSidePanelWidth,
    sidebarWidth,
    setSidebarWidth,
    editorMessage,
    editorHasChanges,
    serviceStatus,
    setServiceStatus,
    addedExperimentTools,
    setActiveOverlay,
  } = useUIStore()
  const { isAdmetRunning, isDockingRunning } = useMolecularStore()
  const { isRunning: isMDRunning } = useMDStore()
  const { isRunning: isBoltz2Running } = useBoltz2Store()
  const { isRunning: isQCRunning } = useQCStore()

  const [healthCheckComplete, setHealthCheckComplete] = useState(false)
  const [everAvailableServices, setEverAvailableServices] = useState<Set<string>>(new Set())

  useEffect(() => {
    const check = async () => {
      const status = await api.getServicesHealth()
      if (status !== null) {
        setServiceStatus(status)
        setHealthCheckComplete(true)
        setEverAvailableServices(prev => {
          const next = new Set(prev)
          Object.entries(status).forEach(([svc, up]) => { if (up) next.add(svc) })
          return next
        })
      } else if (!healthCheckComplete) {
        setHealthCheckComplete(true)
      }
    }

    // Defer health check to not block initial render - use requestIdleCallback or setTimeout
    let timeoutId: NodeJS.Timeout
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = (window as any).requestIdleCallback(() => {
        check()
      }, { timeout: 2000 })
      const interval = setInterval(check, 30_000)
      return () => {
        (window as any).cancelIdleCallback(idleId)
        clearInterval(interval)
      }
    } else {
      // Fallback: defer by 100ms to let UI render first
      timeoutId = setTimeout(check, 100)
      const interval = setInterval(check, 30_000)
      return () => {
        clearTimeout(timeoutId)
        clearInterval(interval)
      }
    }
  }, [setServiceStatus, healthCheckComplete])

  const isServiceAvailable = (service: string | undefined) => {
    if (!service) return true
    if (!hydrated || !healthCheckComplete) return true
    return serviceStatus[service] === true || everAvailableServices.has(service)
  }

  const visibleDefaultTools = sidebarTools.filter(tool => isServiceAvailable(tool.service))

  const allVisibleTools = allTools.filter(tool => isServiceAvailable(tool.service))

  const addedExperimentToolsInSidebar = allVisibleTools.filter(
    tool => addedExperimentTools.includes(tool.id) && !visibleDefaultTools.find(t => t.id === tool.id)
  )

  useEffect(() => {
    if (!hydrated || !healthCheckComplete) return
    if (activeTool && !allVisibleTools.find(t => t.id === activeTool)) {
      setActiveTool(null)
    }
  }, [allVisibleTools, activeTool, setActiveTool, hydrated, healthCheckComplete])

  const [editorEverOpened, setEditorEverOpened] = useState(false)

  useEffect(() => {
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
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [hoveredTool, setHoveredTool] = useState<ToolId | null>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const sidebarResizeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeTool === 'editor') {
      setEditorEverOpened(true)
    }
  }, [activeTool])

  const handleToolClick = (toolId: ToolId) => {
    if (activeTool === toolId) {
      if (isSidePanelExpanded) {
        setActiveTool(null)
      } else {
        // Just re-assigning sets isSidePanelExpanded to true
        setActiveTool(toolId)
      }
    } else {
      setActiveTool(toolId)
    }
  }

  const activeToolData = allVisibleTools.find((t) => t.id === activeTool)

  useEffect(() => {
    if (activeTool === 'editor' && typeof window !== 'undefined') {
      const calculateEditorWidth = () => {
        const viewportWidth = window.innerWidth
        const availableWidth = viewportWidth - sidebarWidth
        const halfWidth = availableWidth / 2
        setEditorSidePanelWidth(halfWidth)
      }
      calculateEditorWidth()
      window.addEventListener('resize', calculateEditorWidth)
      return () => window.removeEventListener('resize', calculateEditorWidth)
    }
  }, [activeTool, sidebarWidth, setEditorSidePanelWidth])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }, [])

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizingSidebar(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newExpandedWidth = e.clientX - sidebarWidth
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
  }, [isResizing, activeTool, sidebarWidth, setSidePanelWidth, setEditorSidePanelWidth])

  useEffect(() => {
    if (!isResizingSidebar) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
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
  }, [isResizingSidebar, setSidebarWidth])

  const { baseColor } = usePreferencesStore()
  const bc = baseColorConfigs[baseColor]
  const bc_active = useBaseColor()
  const wa = useWarmAccent()
  const wac = wa.config

  if (!hydrated) {
    return (
      <div className="h-full bg-gray-950 border-r border-gray-800 flex flex-col" style={{ width: DEFAULT_SIDEBAR_WIDTH }} suppressHydrationWarning>
        {/* Branding Section */}
        <div className="h-14 px-4 flex items-center border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${bc.gradientFrom} to-blue-600 flex items-center justify-center shadow-lg ${bc.shadowGlow}`}>
              <Atom className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Ligand-X</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider -mt-0.5">Precision Molecular Lab</p>
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 border-b border-gray-800/50">
          <div
            className={cn(
              'w-full h-8 rounded-md text-white font-medium text-sm flex items-center justify-center gap-2 border shadow-sm transition-colors',
              !bc_active.isCustom && `${bc_active.buttonBg} ${bc_active.buttonBgHover} ${bc_active.buttonBorder}`
            )}
            style={
              bc_active.isCustom
                ? { backgroundColor: bc_active.hexValue, borderColor: bc_active.hexValue }
                : undefined
            }
          >
            <Plus className="w-4 h-4 shrink-0 text-white" />
            New Experiment
          </div>
        </div>
      </div>
    )
  }

  const expandedWidth = activeTool === 'editor' ? editorSidePanelWidth : sidePanelWidth
  const totalWidth = isSidePanelExpanded ? sidebarWidth + expandedWidth : sidebarWidth

  return (
    <motion.div
      className={cn(
        "sidebar-container h-full bg-gray-950 flex relative overflow-hidden"
      )}
      style={{ willChange: 'width' }}
      initial={{ width: sidebarWidth }}
      animate={{ width: totalWidth }}
      transition={(isResizing || isResizingSidebar) ? { duration: 0 } : {
        duration: 0.2,
        ease: [0.4, 0, 0.2, 1],
        type: 'tween'
      }}
      suppressHydrationWarning
    >
      {/* Custom Right Border - Transparent in Header (top 56px) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-px z-[60] pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, transparent 56px, ${isSidePanelExpanded ? '#374151' : '#1F2937'} 56px)`
        }}
      />

      {/* Resize Handle for expanded panel */}
      {isSidePanelExpanded && (
        <div
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 bg-transparent",
          )}
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Resizable Sidebar */}
      <motion.div
        className="flex flex-col bg-gray-950 relative z-50 h-full"
        style={{ width: sidebarWidth }}
        initial={{ width: DEFAULT_SIDEBAR_WIDTH }}
        animate={{ width: sidebarWidth }}
        transition={isResizingSidebar ? { duration: 0 } : {
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1]
        }}
        suppressHydrationWarning
      >
        {/* Sidebar Resize Handle */}
        {!isSidePanelExpanded && (
          <div
            ref={sidebarResizeRef}
            onMouseDown={handleSidebarMouseDown}
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-50 bg-transparent",
            )}
            style={{ touchAction: 'none' }}
          />
        )}

        {/* Branding Section */}
        <div className="h-14 px-4 flex items-center border-b border-gray-800/50">
          <button onClick={() => setActiveOverlay(null)} className="flex items-center gap-3 outline-none focus:outline-none border border-transparent">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg ${!bc_active.isCustom ? `bg-gradient-to-br ${bc_active.gradientFrom} to-blue-600 ${bc_active.shadowGlow}` : ''}`}
              style={bc_active.isCustom ? {
                background: `linear-gradient(to bottom right, ${bc_active.hexValue}, #1e40af)`,
                boxShadow: `0 8px 16px rgba(${bc_active.rgbString}, 0.2)`,
              } : undefined}
            >
              <Atom className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-lg font-bold text-white tracking-tight">Ligand-X</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider -mt-0.5">Precision Molecular Lab</p>
            </div>
          </button>
        </div>

        {/* Projects Button */}
        <div className="px-3 py-2.5 border-b border-gray-800/50">
          <button
            onClick={() => setActiveOverlay('projects')}
            className={cn(
              'w-full h-8 rounded-md border text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm outline-none focus:outline-none',
              !wa.isCustom && wac && `${wac.buttonBg} ${wac.buttonBgHover} ${wac.buttonBorder}`
            )}
            style={wa.isCustom && wa.customStyles ? wa.customStyles.sidePanelButton : undefined}
            onMouseEnter={(e) => {
              if (wa.isCustom) {
                e.currentTarget.style.backgroundColor = `rgba(${wa.rgbString}, 0.85)`
                e.currentTarget.style.borderColor = `rgba(${wa.rgbString}, 0.85)`
              }
            }}
            onMouseLeave={(e) => {
              if (wa.isCustom && wa.customStyles) {
                e.currentTarget.style.backgroundColor = wa.customStyles.hexValue
                e.currentTarget.style.borderColor = wa.customStyles.hexValue
              }
            }}
          >
            Projects
          </button>
        </div>

        {/* New Experiment — user base colour (preset or custom) */}
        <div className="px-3 py-2.5 border-b border-gray-800/50">
          <button
            type="button"
            onClick={() => setActiveOverlay('new-experiment')}
            className={cn(
              'w-full h-8 rounded-md text-white font-medium text-sm flex items-center justify-center gap-2 transition-all shadow-sm outline-none focus:outline-none border',
              !bc_active.isCustom && `${bc_active.buttonBg} ${bc_active.buttonBgHover} ${bc_active.buttonBorder}`
            )}
            style={
              bc_active.isCustom
                ? { backgroundColor: bc_active.hexValue, borderColor: bc_active.hexValue }
                : undefined
            }
            onMouseEnter={(e) => {
              if (bc_active.isCustom) {
                const el = e.currentTarget
                el.style.backgroundColor = `rgba(${bc_active.rgbString}, 0.85)`
                el.style.borderColor = `rgba(${bc_active.rgbString}, 0.85)`
              }
            }}
            onMouseLeave={(e) => {
              if (bc_active.isCustom) {
                const el = e.currentTarget
                el.style.backgroundColor = bc_active.hexValue
                el.style.borderColor = bc_active.hexValue
              }
            }}
          >
            <Plus className="w-4 h-4 shrink-0 text-white" />
            New Experiment
          </button>
        </div>

        {/* Tool Navigation */}
        <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar">
          <div className="space-y-0.5">
            {/* Default tools */}
            {visibleDefaultTools.map((tool) => {
              const isToolRunning =
                (tool.id === 'admet' && isAdmetRunning) ||
                (tool.id === 'docking' && isDockingRunning) ||
                (tool.id === 'md-optimization' && isMDRunning) ||
                (tool.id === 'boltz2' && isBoltz2Running) ||
                (tool.id === 'quantum-chemistry' && isQCRunning)

              const isActive = activeTool === tool.id
              const isBaseColor = !tool.accentColor
              const accentHex = getAccentColorHex(tool.accentColor)
              const isHovered = hoveredTool === tool.id
              const isColored = isActive || isHovered

              return (
                <button
                  key={tool.id}
                  onClick={() => handleToolClick(tool.id)}
                  onMouseEnter={() => {
                    setHoveredTool(tool.id)
                    if (tool.id === 'editor') {
                      preloadEditorBundle()
                    }
                  }}
                  onMouseLeave={() => setHoveredTool(null)}
                  className={cn(
                    'w-full rounded-lg flex items-center gap-3 px-3 py-2.5 border border-transparent',
                    'transition-all duration-200 text-left',
                    'group relative outline-none focus:outline-none',
                    isActive
                      ? (isBaseColor
                        ? `${!bc_active.isCustom ? `${bc_active.bgLight} ${bc_active.text} ${bc_active.borderLight}` : ''}`
                        : 'opacity-100')
                      : (isHovered && !isBaseColor ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200')
                  )}
                  style={!isBaseColor && isColored ? {
                    backgroundColor: `color-mix(in srgb, ${accentHex} ${isActive ? '10%' : '8%'}, transparent)`,
                    color: accentHex,
                    borderColor: `color-mix(in srgb, ${accentHex} 20%, transparent)`,
                  } : (isBaseColor && isActive && bc_active.isCustom) ? {
                    backgroundColor: `rgba(${bc_active.rgbString}, 0.1)`,
                    color: bc_active.hexValue,
                    borderColor: `rgba(${bc_active.rgbString}, 0.2)`,
                  } : undefined}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    isActive && !bc_active.isCustom
                      ? bc_active.bgLighter
                      : (isActive && bc_active.isCustom ? '' : "bg-gray-800")
                  )}
                    style={!isBaseColor && isColored ? { color: accentHex } : (isBaseColor && isActive && bc_active.isCustom) ? {
                      backgroundColor: `rgba(${bc_active.rgbString}, 0.2)`,
                      color: bc_active.hexValue,
                    } : (isBaseColor && isActive && !bc_active.isCustom) ? {
                      color: bc_active.hexValue,
                    } : undefined}
                  >
                    {isToolRunning ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : '#6b7280') }} />
                    ) : (
                      <div className="w-4 h-4" style={{ color: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : undefined) }}>
                        {tool.icon}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium truncate">{tool.name}</span>
                  {isToolRunning && (
                    <div className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : '#6b7280') }} />
                  )}
                </button>
              )
            })}

            {/* Added experiment tools shown below default tools */}
            {addedExperimentToolsInSidebar.length > 0 && (
              <>
                <div className="h-px bg-gray-800 my-2" />
                {addedExperimentToolsInSidebar.map((tool) => {
                  const isToolRunning =
                    (tool.id === 'admet' && isAdmetRunning) ||
                    (tool.id === 'docking' && isDockingRunning) ||
                    (tool.id === 'md-optimization' && isMDRunning) ||
                    (tool.id === 'boltz2' && isBoltz2Running) ||
                    (tool.id === 'quantum-chemistry' && isQCRunning)

                  const isActive = activeTool === tool.id
                  const isBaseColor = !tool.accentColor
                  const accentHex = getAccentColorHex(tool.accentColor)
                  const isHovered = hoveredTool === tool.id
                  const isColored = isActive || isHovered

                  return (
                    <button
                      key={tool.id}
                      onClick={() => handleToolClick(tool.id)}
                      onMouseEnter={() => setHoveredTool(tool.id)}
                      onMouseLeave={() => setHoveredTool(null)}
                      className={cn(
                        'w-full rounded-lg flex items-center gap-3 px-3 py-2.5 border border-transparent',
                        'transition-all duration-200 text-left',
                        'group relative outline-none focus:outline-none',
                        isActive
                          ? (isBaseColor
                            ? `${!bc_active.isCustom ? `${bc_active.bgLight} ${bc_active.text} ${bc_active.borderLight}` : ''}`
                            : 'opacity-100')
                          : (isHovered && !isBaseColor ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200')
                      )}
                      style={!isBaseColor && isColored ? {
                        backgroundColor: `color-mix(in srgb, ${accentHex} ${isActive ? '10%' : '8%'}, transparent)`,
                        color: accentHex,
                        borderColor: `color-mix(in srgb, ${accentHex} 20%, transparent)`,
                      } : (isBaseColor && isActive && bc_active.isCustom) ? {
                        backgroundColor: `rgba(${bc_active.rgbString}, 0.1)`,
                        color: bc_active.hexValue,
                        borderColor: `rgba(${bc_active.rgbString}, 0.2)`,
                      } : undefined}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                        isActive && !bc_active.isCustom
                          ? bc_active.bgLighter
                          : (isActive && bc_active.isCustom ? '' : "bg-gray-800")
                      )}
                        style={!isBaseColor && isColored ? { color: accentHex } : (isBaseColor && isActive && bc_active.isCustom) ? {
                          backgroundColor: `rgba(${bc_active.rgbString}, 0.2)`,
                          color: bc_active.hexValue,
                        } : (isBaseColor && isActive && !bc_active.isCustom) ? {
                          color: bc_active.hexValue,
                        } : undefined}
                      >
                        {isToolRunning ? (
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : '#6b7280') }} />
                        ) : (
                          <div className="w-4 h-4" style={{ color: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : undefined) }}>
                            {tool.icon}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium truncate">{tool.name}</span>
                      {isToolRunning && (
                        <div className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: isActive ? (isBaseColor ? bc_active.hexValue : accentHex) : (isColored && !isBaseColor ? accentHex : '#6b7280') }} />
                      )}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-gray-800/50 p-2 space-y-0.5">
          <button
            onClick={() => setActiveOverlay('settings')}
            className="w-full rounded-lg flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors outline-none focus:outline-none border border-transparent"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">Settings</span>
          </button>
          <button
            onClick={() => setActiveOverlay('support')}
            className="w-full rounded-lg flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors outline-none focus:outline-none border border-transparent"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">Support</span>
          </button>
          <button
            onClick={() => setActiveOverlay('account')}
            className="w-full rounded-lg flex items-center gap-3 px-3 py-2.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors outline-none focus:outline-none border border-transparent"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-gray-200 truncate">Dr. Aris Thorne</span>
              <span className="text-[10px] text-gray-500">Lead Researcher</span>
            </div>
          </button>
        </div>

        {/* Status Footer */}
        <div className="px-3 py-2 border-t border-gray-800/50 flex items-center gap-2 text-xs text-gray-500">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Engine Ready</span>
          <span className={`${!bc_active.isCustom ? bc_active.textMid : ''} ml-auto truncate`} style={bc_active.isCustom ? { color: bc_active.hexValue } : undefined}>Project: Active</span>
        </div>
      </motion.div>

      {/* Tool Content Area */}
      {/* Editor Tool - Always mounted once opened, shown/hidden with CSS */}
      {editorEverOpened && (
        <motion.div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: '#0F172A' }}
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
          {/* Tool Header - matches main Header height (h-14 = 56px) */}
          {activeTool === 'editor' && isSidePanelExpanded && (
            <div className="border-b border-gray-800/50 overflow-x-auto [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-gray-800 [&::-webkit-scrollbar-thumb]:bg-gray-600 bg-gray-950">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="relative flex items-center justify-between px-4 h-14 min-w-fit"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <div className={`p-2.5 rounded-lg flex-shrink-0 ${!bc_active.isCustom ? bc_active.bgLight : ''}`} style={bc_active.isCustom ? {
                    backgroundColor: `rgba(${bc_active.rgbString}, 0.2)`
                  } : undefined}>
                    <PenTool className={`w-5 h-5 ${!bc_active.isCustom ? bc_active.text : ''}`} style={bc_active.isCustom ? { color: bc_active.hexValue } : undefined} />
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
                  className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0 relative z-10 ml-auto outline-none focus:outline-none border border-transparent"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </motion.div>
            </div>
          )}

          {/* Tool Content */}
          <div className="flex-1 overflow-hidden custom-scrollbar">
            <EditorTool />
          </div>
        </motion.div>
      )}

      {/* Other Tools */}
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
            className="flex-1 flex flex-col overflow-hidden relative z-0"
            style={{ backgroundColor: '#0F172A' }}
            suppressHydrationWarning
          >
            {/* Tool Header - matches main Header height (h-14 = 56px) */}
            {activeToolData && (
              <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800/50 bg-gray-950">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg" style={{
                    backgroundColor: activeToolData.accentColor && !(!activeToolData.accentColor)
                      ? `${getAccentColorHex(activeToolData.accentColor)}20`
                      : bc_active.isCustom
                      ? `rgba(${bc_active.rgbString}, 0.2)`
                      : `rgba(${bc.hexRgb}, 0.2)`
                  }}>
                    <div className="w-5 h-5" style={{ color: activeToolData.accentColor && !(!activeToolData.accentColor) ? getAccentColorHex(activeToolData.accentColor) : (bc_active.isCustom ? bc_active.hexValue : `#${bc.hexValue.slice(1)}`) }}>
                      {activeToolData.icon}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white flex items-center">
                      {activeToolData.name}
                      {activeToolData.id === 'md-optimization' && isMDRunning && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2" style={{ color: activeToolData.accentColor ? getAccentColorHex(activeToolData.accentColor) : (bc_active.isCustom ? bc_active.hexValue : getAccentColorHex(undefined)) }} />
                      )}
                      {activeToolData.id === 'boltz2' && isBoltz2Running && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2" style={{ color: activeToolData.accentColor ? getAccentColorHex(activeToolData.accentColor) : (bc_active.isCustom ? bc_active.hexValue : getAccentColorHex(undefined)) }} />
                      )}
                      {activeToolData.id === 'docking' && isDockingRunning && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2" style={{ color: activeToolData.accentColor ? getAccentColorHex(activeToolData.accentColor) : (bc_active.isCustom ? bc_active.hexValue : getAccentColorHex(undefined)) }} />
                      )}
                      {activeToolData.id === 'admet' && isAdmetRunning && (
                        <Loader2 className="w-4 h-4 animate-spin ml-2" style={{ color: activeToolData.accentColor ? getAccentColorHex(activeToolData.accentColor) : (bc_active.isCustom ? bc_active.hexValue : getAccentColorHex(undefined)) }} />
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
