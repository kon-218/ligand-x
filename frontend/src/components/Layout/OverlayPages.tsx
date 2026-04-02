'use client'

import { useUIStore, type OverlayId } from '@/store/ui-store'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Settings,
  HelpCircle,
  User,
  FlaskConical,
  ArrowLeft,
  X,
  Plus,
  ScanSearch,
  Target,
  Activity,
  Flame,
  GitBranch,
  Sparkles,
  Beaker,
  Zap,
  Waves,
  Atom,
  Layers,
  Scissors,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { experimentTools, toolCategories, getToolsByCategory, type ToolCategory } from '@/lib/tools-config'
import { accentColorClasses } from '@/components/Tools/shared/types'
import { useQCStore } from '@/store/qc-store'

const iconMap: Record<string, React.ReactNode> = {
  ScanSearch: <ScanSearch className="w-6 h-6" />,
  Target: <Target className="w-6 h-6" />,
  Activity: <Activity className="w-6 h-6" />,
  Flame: <Flame className="w-6 h-6" />,
  GitBranch: <GitBranch className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  Beaker: <Beaker className="w-6 h-6" />,
  Zap: <Zap className="w-6 h-6" />,
  FlaskConical: <FlaskConical className="w-6 h-6" />,
  Waves: <Waves className="w-6 h-6" />,
  Atom: <Atom className="w-6 h-6" />,
  Layers: <Layers className="w-6 h-6" />,
  Scissors: <Scissors className="w-6 h-6" />,
}

interface QCWorkflowCard {
  id: string
  name: string
  description: string
  iconName: string
  accentColor: string
  calculationType?: 'standard' | 'fukui' | 'conformer' | 'bde'
  workflow?: 'optimize' | 'ir' | 'properties'
}

const QC_WORKFLOW_CARDS: QCWorkflowCard[] = [
  {
    id: 'qc-optimize',
    name: 'Geometry Optimization',
    description: 'Find the lowest-energy 3D structure of your molecule.',
    iconName: 'FlaskConical',
    accentColor: 'blue',
    calculationType: 'standard',
    workflow: 'optimize',
  },
  {
    id: 'qc-ir',
    name: 'IR Spectrum & Thermochemistry',
    description: 'Compute vibrational frequencies, IR spectrum, and ΔG/ΔH thermochemistry.',
    iconName: 'Waves',
    accentColor: 'purple',
    calculationType: 'standard',
    workflow: 'ir',
  },
  {
    id: 'qc-properties',
    name: 'Electronic Properties',
    description: 'Single-point calculation for charges, HOMO/LUMO gap, and dipole moment.',
    iconName: 'Atom',
    accentColor: 'teal',
    calculationType: 'standard',
    workflow: 'properties',
  },
  {
    id: 'qc-fukui',
    name: 'Fukui Indices',
    description: 'Identify electrophilic and nucleophilic attack sites on your molecule.',
    iconName: 'Zap',
    accentColor: 'orange',
    calculationType: 'fukui',
  },
  {
    id: 'qc-conformer',
    name: 'Conformer Search',
    description: 'Enumerate and rank low-energy conformers with r2SCAN-3c refinement.',
    iconName: 'Layers',
    accentColor: 'green',
    calculationType: 'conformer',
  },
  {
    id: 'qc-bde',
    name: 'Bond Dissociation Energy',
    description: 'Calculate BDE for every bond in the molecule to identify weak points.',
    iconName: 'Scissors',
    accentColor: 'indigo',
    calculationType: 'bde',
  },
  {
    id: 'qc-custom',
    name: 'Custom QC',
    description: 'Full ORCA quantum chemistry with custom method, basis set, and properties.',
    iconName: 'Zap',
    accentColor: 'blue',
  },
]

const categoryOrder: ToolCategory[] = ['preparation', 'simulations', 'free-energy', 'analysis']

interface OverlayWrapperProps {
  children: React.ReactNode
  title: string
  icon: React.ReactNode
  iconBg?: string
  showSidebar?: boolean
}

function OverlayWrapper({ children, title, icon, iconBg = "from-cyan-500/20 to-blue-500/20", showSidebar = false }: OverlayWrapperProps) {
  const { closeOverlay, sidebarWidth } = useUIStore()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 bg-gray-900"
      style={{ left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-800 bg-gray-900">
          <button
            onClick={closeOverlay}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center", iconBg)}>
            {icon}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{title}</h1>
          </div>
          <button
            onClick={closeOverlay}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </motion.div>
  )
}

function ComingSoonContent({ description }: { description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <p className="text-gray-400 max-w-md mb-8">
        {description}
      </p>
      <div className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-500">
        Coming Soon
      </div>
    </div>
  )
}

const dummyProjects = [
  { name: 'CDK2 Inhibitor Series', description: 'Relative binding free energy calculations for a series of CDK2 inhibitors', experiments: 8, updated: '2 hours ago' },
  { name: 'EGFR Mutant Docking', description: 'AutoDock Vina screen against EGFR T790M and L858R mutants', experiments: 5, updated: '1 day ago' },
  { name: 'BACE1 Lead Optimization', description: 'MD simulations and ADMET profiling for BACE1 lead series', experiments: 12, updated: '3 days ago' },
  { name: 'PDE5 Fragment Screen', description: 'Fragment-based docking campaign against PDE5A binding pocket', experiments: 3, updated: '1 week ago' },
  { name: 'JAK2 Selectivity Study', description: 'Quantum chemistry and free energy perturbation for JAK2/JAK3 selectivity', experiments: 6, updated: '2 weeks ago' },
]

function ProjectsOverlay() {
  const { closeOverlay, sidebarWidth } = useUIStore()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 bg-gray-950"
      style={{ left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={closeOverlay}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(255,177,59,0.2), rgba(255,140,0,0.2))' }}>
                  <FolderOpen className="w-6 h-6" style={{ color: '#FFB13B' }} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Projects</h1>
                  <p className="text-sm text-gray-400">Organise your molecular research campaigns</p>
                </div>
              </div>
              <div className="flex-1" />
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: '#FFB13B' }}
              >
                <Plus className="w-4 h-4" />
                New Project
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 py-8 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dummyProjects.map((project) => (
              <button
                key={project.name}
                className="group relative p-5 rounded-xl text-left transition-all duration-300 bg-gray-900 border border-gray-800 hover:border-transparent hover:shadow-lg"
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ boxShadow: '0 0 30px rgba(255, 177, 59, 0.12)' }}
                />
                {/* Hover border */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none border-2"
                  style={{ borderColor: '#FFB13B' }}
                />

                <div className="relative flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-gray-800"
                    style={{ color: '#FFB13B' }}
                  >
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white mb-1">{project.name}</h3>
                    <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2 mb-3">
                      {project.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span>{project.experiments} experiments</span>
                      <span>·</span>
                      <span>Updated {project.updated}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}


function SettingsOverlay() {
  return (
    <OverlayWrapper
      title="Settings"
      icon={<Settings className="w-6 h-6 text-cyan-400" />}
    >
      <ComingSoonContent description="Configure your application preferences. This feature is coming soon." />
    </OverlayWrapper>
  )
}

function SupportOverlay() {
  return (
    <OverlayWrapper
      title="Support"
      icon={<HelpCircle className="w-6 h-6 text-cyan-400" />}
    >
      <ComingSoonContent description="Get help and documentation. This feature is coming soon." />
    </OverlayWrapper>
  )
}

function AccountOverlay() {
  return (
    <OverlayWrapper
      title="Account"
      icon={<User className="w-6 h-6 text-white" />}
      iconBg="from-purple-500 to-pink-500"
    >
      <ComingSoonContent description="Manage your account settings and profile. This feature is coming soon." />
    </OverlayWrapper>
  )
}

function NewExperimentOverlay() {
  const { closeOverlay, setActiveTool, addExperimentTool, sidebarWidth } = useUIStore()
  const { setPendingInitialState } = useQCStore()

  const handleToolSelect = (toolId: string) => {
    addExperimentTool(toolId as any)
    setActiveTool(toolId as any)
    closeOverlay()
  }

  const handleQCWorkflowSelect = (card: QCWorkflowCard) => {
    if (card.calculationType) {
      setPendingInitialState({ calculationType: card.calculationType, workflow: card.workflow })
    }
    addExperimentTool('quantum-chemistry')
    setActiveTool('quantum-chemistry')
    closeOverlay()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 bg-gray-950"
      style={{ left: 0, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={closeOverlay}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                  <FlaskConical className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">New Experiment</h1>
                  <p className="text-sm text-gray-400">
                    Choose a computational tool to start your analysis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tool Categories */}
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
          {categoryOrder.map((category) => {
            const tools = getToolsByCategory(category)
            if (tools.length === 0) return null

            const categoryInfo = toolCategories[category]

            return (
              <section key={category}>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white">{categoryInfo.name}</h2>
                  <p className="text-sm text-gray-500">{categoryInfo.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tools.flatMap((tool) => {
                    const cards: { id: string; name: string; description: string; iconName: string; accent: string; onClick: () => void }[] =
                      tool.id === 'quantum-chemistry'
                        ? QC_WORKFLOW_CARDS.map((card) => ({
                            id: card.id,
                            name: card.name,
                            description: card.description,
                            iconName: card.iconName,
                            accent: card.accentColor,
                            onClick: () => handleQCWorkflowSelect(card),
                          }))
                        : [{
                            id: tool.id as string,
                            name: tool.name,
                            description: tool.description,
                            iconName: tool.iconName,
                            accent: tool.accentColor || 'blue',
                            onClick: () => handleToolSelect(tool.id as string),
                          }]

                    return cards.map(({ id, name, description, iconName, accent, onClick }) => (
                      <button
                        key={id}
                        onClick={onClick}
                        className={cn(
                          "group relative p-5 rounded-xl text-left transition-all duration-300",
                          "bg-gray-900 border border-gray-800",
                          "hover:border-transparent hover:shadow-lg",
                        )}
                      >
                        {/* Hover glow effect */}
                        <div
                          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                          style={{
                            boxShadow: accent === 'purple' ? '0 0 30px rgba(168, 85, 247, 0.15)' :
                              accent === 'indigo' ? '0 0 30px rgba(99, 102, 241, 0.15)' :
                              accent === 'green' ? '0 0 30px rgba(34, 197, 94, 0.15)' :
                              accent === 'orange' ? '0 0 30px rgba(249, 115, 22, 0.15)' :
                              accent === 'cyan' ? '0 0 30px rgba(6, 182, 212, 0.15)' :
                              accent === 'teal' ? '0 0 30px rgba(20, 184, 166, 0.15)' :
                              '0 0 30px rgba(59, 130, 246, 0.15)',
                          }}
                        />

                        {/* Hover border */}
                        <div
                          className={cn(
                            "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                            "pointer-events-none border-2",
                            accent === 'purple' && "border-purple-500",
                            accent === 'indigo' && "border-indigo-500",
                            accent === 'green' && "border-green-500",
                            accent === 'orange' && "border-orange-500",
                            accent === 'cyan' && "border-cyan-500",
                            accent === 'teal' && "border-teal-500",
                            accent === 'blue' && "border-blue-500",
                          )}
                        />

                        <div className="relative flex items-start gap-4">
                          <div
                            className={cn(
                              "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                              "bg-gray-800 text-gray-400",
                              accent === 'purple' && "group-hover:bg-purple-500/20 group-hover:text-purple-400",
                              accent === 'indigo' && "group-hover:bg-indigo-500/20 group-hover:text-indigo-400",
                              accent === 'green' && "group-hover:bg-green-500/20 group-hover:text-green-400",
                              accent === 'orange' && "group-hover:bg-orange-500/20 group-hover:text-orange-400",
                              accent === 'cyan' && "group-hover:bg-cyan-500/20 group-hover:text-cyan-400",
                              accent === 'teal' && "group-hover:bg-teal-500/20 group-hover:text-teal-400",
                              accent === 'blue' && "group-hover:bg-blue-500/20 group-hover:text-blue-400",
                            )}
                          >
                            {iconMap[iconName]}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white mb-1 group-hover:text-white transition-colors">
                              {name}
                            </h3>
                            <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2">
                              {description}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

const overlayComponents: Partial<Record<NonNullable<OverlayId>, React.ComponentType>> = {
  'projects': ProjectsOverlay,
  'settings': SettingsOverlay,
  'support': SupportOverlay,
  'account': AccountOverlay,
  'new-experiment': NewExperimentOverlay,
}

export function OverlayPages() {
  const { activeOverlay } = useUIStore()

  return (
    <AnimatePresence mode="wait">
      {activeOverlay && overlayComponents[activeOverlay] && (
        (() => {
          const Component = overlayComponents[activeOverlay]
          return <Component key={activeOverlay} />
        })()
      )}
    </AnimatePresence>
  )
}
