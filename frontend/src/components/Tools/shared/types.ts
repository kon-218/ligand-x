// Unified types for workflow tools

export interface WorkflowStep {
  id: number
  label: string
  description?: string
}

export interface StructureOption {
  id: string
  name: string
  type?: 'protein' | 'ligand' | 'complex' | 'edited' | 'docked'
  source?: 'current_structure' | 'library' | 'uploaded' | string
  smiles?: string
  pdb_data?: string
  sdf_data?: string
  added_at?: string
}

export interface ExecutionState {
  isRunning: boolean
  progress: number
  progressMessage: string
  completedStages?: string[]
  error?: string | null
}

export interface WorkflowConfig {
  title: string
  description: string
  icon: React.ReactNode
  steps: WorkflowStep[]
  accentColor: 'cyan' | 'green' | 'purple' | 'orange' | 'pink'
}

export type AccentColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'magenta'
  | 'teal'
  | 'indigo'
  | 'cyan'
  | 'amber'
  | 'fuchsia'
  | 'rose'

export const accentColorClasses: Record<AccentColor, {
  bg: string
  bgHover: string
  bgLight: string
  text: string
  border: string
  borderLight: string
  gradient: string
}> = {
  blue: {
    bg: 'bg-blue-500',
    bgHover: 'hover:bg-blue-600',
    bgLight: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500',
    borderLight: 'border-blue-700/40',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  green: {
    bg: 'bg-green-500',
    bgHover: 'hover:bg-green-600',
    bgLight: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500',
    borderLight: 'border-green-700/40',
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  purple: {
    bg: 'bg-purple-500',
    bgHover: 'hover:bg-purple-600',
    bgLight: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500',
    borderLight: 'border-purple-700/40',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  orange: {
    bg: 'bg-orange-500',
    bgHover: 'hover:bg-orange-600',
    bgLight: 'bg-orange-500/20',
    text: 'text-orange-400',
    border: 'border-orange-500',
    borderLight: 'border-orange-700/40',
    gradient: 'from-orange-500/20 to-amber-500/20',
  },
  pink: {
    bg: 'bg-pink-500',
    bgHover: 'hover:bg-pink-600',
    bgLight: 'bg-pink-500/20',
    text: 'text-pink-400',
    border: 'border-pink-500',
    borderLight: 'border-pink-700/40',
    gradient: 'from-pink-500/20 to-rose-500/20',
  },
  /** App base preset "Magenta" — matches `baseColorConfigs.magenta` / New Experiment button, not Tailwind pink-500 */
  magenta: {
    bg: 'bg-[#ea0674]',
    bgHover: 'hover:bg-[#c50562]',
    bgLight: 'bg-[#ea0674]/20',
    text: 'text-[#fb7eb5]',
    border: 'border-[#ea0674]',
    borderLight: 'border-[#ea0674]/40',
    gradient: 'from-[#ea0674]/20 to-[#9d174d]/20',
  },
  teal: {
    bg: 'bg-teal-500',
    bgHover: 'hover:bg-teal-600',
    bgLight: 'bg-teal-500/20',
    text: 'text-teal-400',
    border: 'border-teal-500',
    borderLight: 'border-teal-700/40',
    gradient: 'from-teal-500/20 to-cyan-500/20',
  },
  indigo: {
    bg: 'bg-indigo-500',
    bgHover: 'hover:bg-indigo-600',
    bgLight: 'bg-indigo-500/20',
    text: 'text-indigo-400',
    border: 'border-indigo-500',
    borderLight: 'border-indigo-700/40',
    gradient: 'from-indigo-500/20 to-violet-500/20',
  },
  cyan: {
    bg: 'bg-cyan-500',
    bgHover: 'hover:bg-cyan-600',
    bgLight: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500',
    borderLight: 'border-cyan-700/40',
    gradient: 'from-cyan-500/20 to-sky-500/20',
  },
  amber: {
    bg: 'bg-amber-500',
    bgHover: 'hover:bg-amber-600',
    bgLight: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500',
    borderLight: 'border-amber-700/40',
    gradient: 'from-amber-500/20 to-yellow-500/20',
  },
  fuchsia: {
    bg: 'bg-fuchsia-500',
    bgHover: 'hover:bg-fuchsia-600',
    bgLight: 'bg-fuchsia-500/20',
    text: 'text-fuchsia-400',
    border: 'border-fuchsia-500',
    borderLight: 'border-fuchsia-700/40',
    gradient: 'from-fuchsia-500/20 to-pink-500/20',
  },
  rose: {
    bg: 'bg-rose-500',
    bgHover: 'hover:bg-rose-600',
    bgLight: 'bg-rose-500/20',
    text: 'text-rose-400',
    border: 'border-rose-500',
    borderLight: 'border-rose-700/40',
    gradient: 'from-rose-500/20 to-pink-500/20',
  },
}

