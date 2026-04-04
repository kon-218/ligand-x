'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { useUIStore, type OverlayId, type ToolId } from '@/store/ui-store'
import { usePreferencesStore } from '@/store/preferences-store'
import { baseColorConfigs, BASE_COLOR_LABELS, type BaseColorName } from '@/lib/base-color-config'
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
  Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  experimentTools,
  toolCategories,
  getToolsByCategory,
  EXPERIMENT_ENTRY_BUTTON_CLASS,
  type ToolCategory,
} from '@/lib/tools-config'
import { accentColorClasses, type AccentColor } from '@/components/Tools/shared/types'

function isAccentColor(value: string): value is AccentColor {
  return value in accentColorClasses
}

/** Icon tile hover glow — matches service accent (not user base colour). */
const EXPERIMENT_CARD_ICON_HOVER_GLOW: Record<AccentColor, string> = {
  blue: 'group-hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]',
  green: 'group-hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]',
  purple: 'group-hover:shadow-[0_0_15px_rgba(168,85,247,0.2)]',
  orange: 'group-hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]',
  pink: 'group-hover:shadow-[0_0_15px_rgba(236,72,153,0.2)]',
  teal: 'group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)]',
  indigo: 'group-hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]',
  cyan: 'group-hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]',
  amber: 'group-hover:shadow-[0_0_15px_rgba(217,119,6,0.2)]',
  fuchsia: 'group-hover:shadow-[0_0_15px_rgba(192,38,211,0.2)]',
  rose: 'group-hover:shadow-[0_0_15px_rgba(225,29,72,0.2)]',
}
import { useQCStore } from '@/store/qc-store'
import { warmAccentConfigs, WARM_ACCENT_LABELS, type WarmAccentPreset } from '@/lib/accent-config'
import { useBaseColor } from '@/hooks/use-base-color'
import { useWarmAccent } from '@/hooks/use-warm-accent'

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

/** Map overlay selection ids (tool ids or QC workflow card ids) to sidebar ToolIds for bulk add. */
function resolveExperimentToolsFromSelection(selectedIds: Set<string>): {
  toolIds: ToolId[]
  qcCardForPending: QCWorkflowCard | null
} {
  const raw: ToolId[] = []
  let qcCardForPending: QCWorkflowCard | null = null
  let hasQc = false
  for (const id of selectedIds) {
    const card = QC_WORKFLOW_CARDS.find((c) => c.id === id)
    if (card) {
      hasQc = true
      qcCardForPending = card
    } else {
      raw.push(id as ToolId)
    }
  }
  if (hasQc) raw.push('quantum-chemistry')
  return { toolIds: [...new Set(raw)], qcCardForPending: hasQc ? qcCardForPending : null }
}

const categoryOrder: ToolCategory[] = ['preparation', 'simulations', 'free-energy', 'analysis']

interface OverlayWrapperProps {
  children: React.ReactNode
  title: string
  icon: React.ReactNode
  iconBg?: string
  showSidebar?: boolean
}

function OverlayWrapper({ children, title, icon, iconBg, showSidebar = false }: OverlayWrapperProps) {
  const { closeOverlay, sidebarWidth } = useUIStore()
  const bc_active = useBaseColor()
  const useThemedIconBg = iconBg === undefined
  const iconBoxClass = useThemedIconBg
    ? cn(
        'w-8 h-8 rounded-lg flex items-center justify-center border',
        !bc_active.isCustom && `bg-gradient-to-br ${bc_active.gradientFromLight} to-blue-500/20 ${bc_active.borderLight}`,
      )
    : cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center', iconBg)
  const iconBoxStyle =
    useThemedIconBg && bc_active.isCustom
      ? {
          background: `linear-gradient(to bottom right, rgba(${bc_active.rgbString}, 0.2), rgba(59, 130, 246, 0.1))`,
          borderColor: `rgba(${bc_active.rgbString}, 0.2)`,
        }
      : undefined

  return (
    <div
      className="fixed z-50 bg-gray-900"
      style={{ left: sidebarWidth, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 flex-shrink-0 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={closeOverlay}
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className={iconBoxClass} style={iconBoxStyle}>
              <div className="scale-75 origin-center">{icon}</div>
            </div>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
          <button
            onClick={closeOverlay}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
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
  const wa = useWarmAccent()
  const ac = wa.config
  const cs = wa.customStyles
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  const headerIconClass = wa.isCustom
    ? 'w-14 h-14 rounded-2xl flex items-center justify-center border relative overflow-hidden'
    : cn(
        'w-14 h-14 rounded-2xl flex items-center justify-center border relative overflow-hidden',
        ac!.iconBg,
        ac!.iconBorder,
        ac!.iconBgGradient
      )
  const headerIconStyle: CSSProperties | undefined = wa.isCustom && cs
    ? { ...cs.projectsHeaderIconBox, boxShadow: cs.projectsHeaderIconBoxShadow }
    : undefined

  return (
    <div
      className="fixed z-50 bg-gray-950"
      style={{ left: sidebarWidth, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full overflow-y-auto pb-12">
        {/* Top Navigation Bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 flex-shrink-0 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50">
          <button
            onClick={closeOverlay}
            className="group flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to Workspace
          </button>
        </div>

        {/* Header */}
        <div className="w-full">
          <div className="max-w-6xl mx-auto px-6 pt-10 pb-8 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className={headerIconClass} style={headerIconStyle}>
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                <FolderOpen
                  className={cn('w-7 h-7', !wa.isCustom && ac!.iconColor)}
                  style={wa.isCustom && cs ? cs.folderIcon : undefined}
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Projects</h1>
                <p className="text-sm text-gray-400 mt-1">Organise your molecular research campaigns</p>
              </div>
            </div>

            <button
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-900 transition-all hover:scale-105',
                !wa.isCustom &&
                  `bg-gradient-to-r ${ac!.gradientFrom} ${ac!.gradientTo} ${ac!.gradientHoverFrom} ${ac!.gradientHoverTo} ${ac!.shadowGlow} ${ac!.shadowGlowHover}`
              )}
              style={wa.isCustom && cs ? cs.projectsNewButton : undefined}
              onMouseEnter={(e) => {
                if (wa.isCustom && cs) Object.assign(e.currentTarget.style, cs.projectsNewButtonHover)
              }}
              onMouseLeave={(e) => {
                if (wa.isCustom && cs) Object.assign(e.currentTarget.style, cs.projectsNewButton)
              }}
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {dummyProjects.map((project, index) => (
              <button
                key={project.name}
                className="group relative p-6 rounded-2xl text-left transition-all duration-300 bg-gray-900/40 border border-gray-800/80 hover:bg-gray-800/50 hover:border-gray-700 backdrop-blur-sm overflow-hidden"
                onMouseEnter={() => setHoveredCard(index)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* Subtle background glow on hover */}
                <div
                  className={cn(
                    'absolute inset-0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br',
                    !wa.isCustom && ac!.cardGlowGradient
                  )}
                  style={wa.isCustom && cs ? cs.cardGlowOverlay : undefined}
                />

                {/* Border glow */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ boxShadow: wa.isCustom && cs ? cs.cardBorderGlow : ac!.cardBorderGlow }}
                />

                <div className="relative flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 bg-gray-950 border border-gray-800 group-hover:scale-105',
                      !wa.isCustom && `${ac!.cardIconBorderHover} ${ac!.cardIconHoverShadow}`
                    )}
                    style={
                      wa.isCustom && cs
                        ? hoveredCard === index
                          ? { ...cs.cardIconCellHover }
                          : cs.cardIconCell
                        : undefined
                    }
                  >
                    <FolderOpen
                      className={cn(
                        'w-5 h-5 transition-colors',
                        !wa.isCustom && 'text-gray-500',
                        !wa.isCustom && ac!.cardIconColor
                      )}
                      style={
                        wa.isCustom && cs
                          ? hoveredCard === index
                            ? cs.cardIconFolderHover
                            : cs.cardIconFolder
                          : undefined
                      }
                    />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="font-semibold text-gray-100 mb-1 group-hover:text-white transition-colors">{project.name}</h3>
                    <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2 mb-4 leading-relaxed">
                      {project.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-600 group-hover:text-gray-500">
                      <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" />{project.experiments} experiments</span>
                      <span>·</span>
                      <span className="truncate">Updated {project.updated}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

type ThemeSwatch = { key: string; hex: string; label: string }

function SettingsThemePickerCard({
  title,
  description,
  presets,
  selectedPresetKey,
  onSelectPreset,
  isCustom,
  customHex,
  onApplyCustomHex,
  colorInputId,
}: {
  title: string
  description: string
  presets: ThemeSwatch[]
  selectedPresetKey: string
  onSelectPreset: (key: string) => void
  isCustom: boolean
  customHex: string
  onApplyCustomHex: (hex: string) => void
  colorInputId: string
}) {
  const [hexDraft, setHexDraft] = useState(customHex)
  useEffect(() => {
    setHexDraft(customHex)
  }, [customHex])

  const pickerValue = /^#[0-9A-Fa-f]{6}$/.test(customHex) ? customHex : '#6b7280'

  return (
    <div className="rounded-2xl border border-gray-700/50 bg-gray-800/20 p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-100 tracking-tight">{title}</h3>
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed max-w-lg">{description}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {presets.map(({ key, hex, label }) => (
          <button
            key={key}
            type="button"
            title={label}
            onClick={() => onSelectPreset(key)}
            className={cn(
              'h-10 w-10 shrink-0 rounded-full border-2 transition-all outline-none',
              'focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
              !isCustom && selectedPresetKey === key
                ? 'scale-110 border-white shadow-lg shadow-black/25'
                : 'border-transparent opacity-80 hover:opacity-100'
            )}
            style={{ backgroundColor: hex }}
          />
        ))}

        <label
          htmlFor={colorInputId}
          className={cn(
            'relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-all outline-none',
            'focus-within:ring-2 focus-within:ring-white/30 focus-within:ring-offset-2 focus-within:ring-offset-gray-950',
            isCustom
              ? 'scale-110 border-white shadow-lg shadow-black/25 ring-1 ring-white/10'
              : 'border-dashed border-gray-500 bg-gray-950/80 hover:border-gray-400'
          )}
          style={isCustom ? { backgroundColor: pickerValue } : undefined}
          title="Custom colour"
        >
          <input
            id={colorInputId}
            type="color"
            value={pickerValue}
            onChange={(e) => onApplyCustomHex(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 rounded-full"
            aria-label="Pick custom colour"
          />
          {!isCustom && <Palette className="pointer-events-none h-4 w-4 text-gray-500" strokeWidth={1.75} />}
        </label>
      </div>

      <div
        className={cn(
          'mt-4 flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
          isCustom ? 'border-gray-600/70 bg-gray-900/55' : 'border-gray-800/70 bg-gray-900/30'
        )}
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-gray-500">Hex</span>
        <input
          type="text"
          value={hexDraft}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="#000000"
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value
            setHexDraft(v)
            if (/^#[0-9A-Fa-f]{6}$/i.test(v)) onApplyCustomHex(v)
          }}
          onBlur={() => {
            if (/^#[0-9A-Fa-f]{6}$/i.test(hexDraft)) onApplyCustomHex(hexDraft)
            else setHexDraft(customHex)
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
        />
      </div>
    </div>
  )
}

function SettingsOverlay() {
  const {
    baseColor,
    setBaseColor,
    customColorMode,
    customColorHex,
    setCustomColor,
    warmAccentPreset,
    setWarmAccentPreset,
    warmAccentCustomMode,
    warmAccentCustomHex,
    setWarmAccentCustomHex,
  } = usePreferencesStore()
  const bc_active = useBaseColor()
  const isCustom = customColorMode
  const isWarmCustom = warmAccentCustomMode

  const basePresets: ThemeSwatch[] = (Object.keys(baseColorConfigs) as BaseColorName[]).map((name) => ({
    key: name,
    hex: baseColorConfigs[name].hexValue,
    label: BASE_COLOR_LABELS[name],
  }))

  const warmPresets: ThemeSwatch[] = (Object.keys(warmAccentConfigs) as WarmAccentPreset[]).map((name) => ({
    key: name,
    hex: warmAccentConfigs[name].hexValue,
    label: WARM_ACCENT_LABELS[name],
  }))

  return (
    <OverlayWrapper
      title="Settings"
      icon={
        <Settings
          className={cn('w-6 h-6', !bc_active.isCustom && bc_active.text)}
          style={bc_active.isCustom ? bc_active.styles?.text : undefined}
        />
      }
    >
      <div className="p-6 space-y-6 max-w-2xl">
        <SettingsThemePickerCard
          title="Base colour"
          description="Curated presets plus a custom swatch. Choosing custom applies it immediately; presets return to the built-in palette."
          presets={basePresets}
          selectedPresetKey={baseColor}
          onSelectPreset={(key) => setBaseColor(key as BaseColorName)}
          isCustom={isCustom}
          customHex={customColorHex}
          onApplyCustomHex={setCustomColor}
          colorInputId="settings-base-color-input"
        />

        <SettingsThemePickerCard
          title="Projects &amp; Library accent"
          description="Warm accent for the Projects button, Library “Tools” actions, and related highlights."
          presets={warmPresets}
          selectedPresetKey={warmAccentPreset}
          onSelectPreset={(key) => setWarmAccentPreset(key as WarmAccentPreset)}
          isCustom={isWarmCustom}
          customHex={warmAccentCustomHex}
          onApplyCustomHex={setWarmAccentCustomHex}
          colorInputId="settings-warm-accent-color-input"
        />

        <div className="rounded-xl border border-gray-700/40 bg-gray-800/25 px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Preferences save automatically. The last swatch in each row opens the system colour picker; hex is optional for precise values.
          </p>
        </div>
      </div>
    </OverlayWrapper>
  )
}

function SupportOverlay() {
  const bc_active = useBaseColor()

  return (
    <OverlayWrapper
      title="Support"
      icon={
        <HelpCircle
          className={cn('w-6 h-6', !bc_active.isCustom && bc_active.text)}
          style={bc_active.isCustom ? bc_active.styles?.text : undefined}
        />
      }
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
  const { closeOverlay, setActiveTool, addExperimentTool, addMultipleExperimentTools, sidebarWidth } =
    useUIStore()
  const bc_active = useBaseColor()
  const { setPendingInitialState } = useQCStore()
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(() => new Set())

  const handleToolSelect = (toolId: string) => {
    addExperimentTool(toolId as ToolId)
    setActiveTool(toolId as ToolId)
    closeOverlay()
  }

  const handleToolClick = (toolId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      setSelectedToolIds((prev) => {
        const next = new Set(prev)
        if (next.has(toolId)) next.delete(toolId)
        else next.add(toolId)
        return next
      })
      return
    }
    handleToolSelect(toolId)
  }

  const handleQCWorkflowSelect = (card: QCWorkflowCard) => {
    if (card.calculationType) {
      setPendingInitialState({ calculationType: card.calculationType, workflow: card.workflow })
    }
    addExperimentTool('quantum-chemistry')
    setActiveTool('quantum-chemistry')
    closeOverlay()
  }

  const handleQCWorkflowClick = (card: QCWorkflowCard, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      setSelectedToolIds((prev) => {
        const next = new Set(prev)
        if (next.has(card.id)) next.delete(card.id)
        else next.add(card.id)
        return next
      })
      return
    }
    handleQCWorkflowSelect(card)
  }

  return (
    <div
      className="fixed z-50 bg-gray-950"
      style={{ left: sidebarWidth, top: 0, right: 0, bottom: 0 }}
    >
      <div className="flex flex-col h-full overflow-y-auto pb-12">
        {/* Top Navigation Bar */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 flex-shrink-0 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/50">
          <button
            onClick={closeOverlay}
            className="group flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Back to Workspace
          </button>
        </div>

        {/* Header */}
        <div className="w-full">
          <div className="max-w-6xl mx-auto px-6 pt-10 pb-8">
            <div className="flex items-center gap-5">
              <div
                className={cn(
                  'w-14 h-14 rounded-2xl flex items-center justify-center border relative overflow-hidden',
                  !bc_active.isCustom && `bg-gradient-to-br ${bc_active.gradientFromLight} to-blue-500/10 ${bc_active.borderLight}`,
                )}
                style={
                  bc_active.isCustom
                    ? {
                        background: `linear-gradient(to bottom right, rgba(${bc_active.rgbString}, 0.2), rgba(59, 130, 246, 0.1))`,
                        borderColor: `rgba(${bc_active.rgbString}, 0.2)`,
                        boxShadow: `0 0 30px rgba(${bc_active.rgbString}, 0.15)`,
                      }
                    : { boxShadow: `0 0 30px rgba(${bc_active.rgbString}, 0.15)` }
                }
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
                <FlaskConical
                  className={cn('w-7 h-7', !bc_active.isCustom && bc_active.text)}
                  style={bc_active.isCustom ? bc_active.styles?.text : undefined}
                />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">New Experiment</h1>
                <div className="space-y-1 mt-1">
                  <p className="text-sm text-gray-400">
                    Choose a computational tool to start your analysis
                  </p>
                  <p className="text-xs text-gray-500">
                    Hold Ctrl and click to select multiple tools
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tool Categories */}
        <div className="max-w-6xl mx-auto px-6 space-y-12 w-full">
          {categoryOrder.map((category) => {
            const tools = getToolsByCategory(category)
            if (tools.length === 0) return null

            const categoryInfo = toolCategories[category]

            return (
              <section key={category}>
                <div className="mb-5">
                  <h2 className="text-xl font-bold text-white tracking-tight">{categoryInfo.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">{categoryInfo.description}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {tools.flatMap((tool) => {
                    const cards: {
                      id: string
                      name: string
                      description: string
                      iconName: string
                      accent: string
                      onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
                    }[] =
                      tool.id === 'quantum-chemistry'
                        ? QC_WORKFLOW_CARDS.map((card) => ({
                          id: card.id,
                          name: card.name,
                          description: card.description,
                          iconName: card.iconName,
                          accent: card.accentColor,
                          onClick: (e) => handleQCWorkflowClick(card, e),
                        }))
                        : [{
                          id: tool.id as string,
                          name: tool.name,
                          description: tool.description,
                          iconName: tool.iconName,
                          accent: tool.accentColor || 'blue',
                          onClick: (e) => handleToolClick(tool.id as string, e),
                        }]

                    return cards.map(({ id, name, description, iconName, accent, onClick }) => {
                      const accentKey: AccentColor = isAccentColor(accent) ? accent : 'blue'
                      const ac = accentColorClasses[accentKey]
                      return (
                      <button
                        key={id}
                        type="button"
                        onClick={onClick}
                        className={cn(
                          'group relative p-6 rounded-2xl text-left transition-all duration-300',
                          'bg-gray-900/40 border border-gray-800/80 backdrop-blur-sm overflow-hidden',
                          'hover:bg-gray-800/50 hover:border-gray-700',
                          selectedToolIds.has(id) && 'border-2 scale-[1.02]',
                          selectedToolIds.has(id) && accent === 'purple' && 'border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.3)]',
                          selectedToolIds.has(id) && accent === 'indigo' && 'border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.3)]',
                          selectedToolIds.has(id) && accent === 'green' && 'border-green-500/60 shadow-[0_0_20px_rgba(34,197,94,0.3)]',
                          selectedToolIds.has(id) && accent === 'orange' && 'border-orange-500/60 shadow-[0_0_20px_rgba(249,115,22,0.3)]',
                          selectedToolIds.has(id) && accent === 'cyan' && 'border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.3)]',
                          selectedToolIds.has(id) && accent === 'teal' && 'border-teal-500/60 shadow-[0_0_20px_rgba(20,184,166,0.3)]',
                          selectedToolIds.has(id) && accent === 'blue' && 'border-blue-500/60 shadow-[0_0_20px_rgba(59,130,246,0.3)]',
                          selectedToolIds.has(id) && accent === 'pink' && 'border-pink-500/60 shadow-[0_0_20px_rgba(236,72,153,0.3)]',
                          selectedToolIds.has(id) && accent === 'amber' && 'border-amber-500/60 shadow-[0_0_20px_rgba(217,119,6,0.3)]',
                        )}
                      >
                        {/* Hover glow effect */}
                        <div
                          className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none"
                          style={{
                            backgroundImage: accent === 'purple' ? 'linear-gradient(to bottom right, #a855f7, transparent)' :
                              accent === 'indigo' ? 'linear-gradient(to bottom right, #6366f1, transparent)' :
                                accent === 'green' ? 'linear-gradient(to bottom right, #22c55e, transparent)' :
                                  accent === 'orange' ? 'linear-gradient(to bottom right, #f97316, transparent)' :
                                    accent === 'pink' ? 'linear-gradient(to bottom right, #ec4899, transparent)' :
                                      accent === 'cyan' ? 'linear-gradient(to bottom right, #06b6d4, transparent)' :
                                        accent === 'amber' ? 'linear-gradient(to bottom right, #d97706, transparent)' :
                                          accent === 'teal' ? 'linear-gradient(to bottom right, #14b8a6, transparent)' :
                                            'linear-gradient(to bottom right, #3b82f6, transparent)'
                          }}
                        />

                        {/* Border glow */}
                        <div
                          className={cn(
                            "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none",
                          )}
                          style={{
                            boxShadow: accent === 'purple' ? 'inset 0 0 0 1px rgba(168, 85, 247, 0.2)' :
                              accent === 'indigo' ? 'inset 0 0 0 1px rgba(99, 102, 241, 0.2)' :
                                accent === 'green' ? 'inset 0 0 0 1px rgba(34, 197, 94, 0.2)' :
                                  accent === 'orange' ? 'inset 0 0 0 1px rgba(249, 115, 22, 0.2)' :
                                    accent === 'pink' ? 'inset 0 0 0 1px rgba(236, 72, 153, 0.2)' :
                                      accent === 'cyan' ? 'inset 0 0 0 1px rgba(6, 182, 212, 0.2)' :
                                        accent === 'amber' ? 'inset 0 0 0 1px rgba(217, 119, 6, 0.2)' :
                                          accent === 'teal' ? 'inset 0 0 0 1px rgba(20, 184, 166, 0.2)' :
                                            'inset 0 0 0 1px rgba(59, 130, 246, 0.2)'
                          }}
                        />

                        <div className="relative flex items-start gap-4">
                          <div
                            className={cn(
                              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300',
                              'bg-gray-950/90 border border-gray-800/90',
                              ac.text,
                              'group-hover:scale-105 group-hover:border-gray-600',
                              EXPERIMENT_CARD_ICON_HOVER_GLOW[accentKey],
                            )}
                          >
                            {iconMap[iconName]}
                          </div>

                          <div className="flex-1 min-w-0 pt-0.5">
                            <h3 className="font-semibold text-gray-100 mb-1 group-hover:text-white transition-colors">
                              {name}
                            </h3>
                            <p className="text-sm text-gray-500 group-hover:text-gray-400 transition-colors line-clamp-2 leading-relaxed">
                              {description}
                            </p>
                          </div>
                        </div>
                      </button>
                      )
                    })
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {selectedToolIds.size > 0 && (
          <div className="fixed bottom-6 right-6 z-40">
            <button
              type="button"
              onClick={() => {
                const { toolIds, qcCardForPending } = resolveExperimentToolsFromSelection(selectedToolIds)
                if (qcCardForPending?.calculationType) {
                  setPendingInitialState({
                    calculationType: qcCardForPending.calculationType,
                    workflow: qcCardForPending.workflow,
                  })
                }
                addMultipleExperimentTools(toolIds)
                closeOverlay()
              }}
              className={cn(
                'px-6 py-3 rounded-xl font-semibold transition-all duration-300 text-white border',
                'hover:scale-105 shadow-lg hover:shadow-xl shadow-blue-500/25',
                EXPERIMENT_ENTRY_BUTTON_CLASS
              )}
            >
              Load {selectedToolIds.size} Tool{selectedToolIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
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

  if (!activeOverlay) return null

  const Component = overlayComponents[activeOverlay]
  if (!Component) return null

  return <Component />
}
