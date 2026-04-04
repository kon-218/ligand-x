import type { ToolId } from '@/store/ui-store'
import type { AccentColor } from '@/components/Tools/shared/types'

export interface ToolConfig {
  id: ToolId
  name: string
  iconName: string
  description: string
  accentColor?: AccentColor
  service?: string
  isDefault?: boolean
  category?: 'preparation' | 'simulations' | 'free-energy' | 'analysis'
}

export const toolsConfig: ToolConfig[] = [
  {
    id: 'input',
    name: 'Input',
    iconName: 'Download',
    description: 'Load structures from PDB, files, or SMILES',
    isDefault: true,
  },
  {
    id: 'protein-cleaning',
    name: 'Protein Cleaning',
    iconName: 'Droplets',
    description: 'Clean protein structures with PDBFixer',
    service: 'structure',
    isDefault: true,
  },
  {
    id: 'library',
    name: 'Library',
    iconName: 'Library',
    description: 'Molecule library management',
    service: 'structure',
    isDefault: false,
  },
  {
    id: 'editor',
    name: 'Editor',
    iconName: 'PenTool',
    description: 'Edit molecular structures',
    isDefault: true,
  },
  {
    id: 'pocket-finder',
    name: 'Pocket Finder',
    iconName: 'ScanSearch',
    description: 'Detect druggable binding sites with fpocket',
    accentColor: 'purple',
    service: 'structure',
    isDefault: false,
    category: 'preparation',
  },
  {
    id: 'docking',
    name: 'Molecular Docking',
    iconName: 'Target',
    description: 'Predict protein-ligand binding poses',
    accentColor: 'indigo',
    service: 'docking',
    isDefault: false,
    category: 'simulations',
  },
  {
    id: 'md-optimization',
    name: 'MD Optimization',
    iconName: 'Activity',
    description: 'Optimize protein-ligand complexes',
    accentColor: 'green',
    service: 'md',
    isDefault: false,
    category: 'simulations',
  },
  {
    id: 'abfe',
    name: 'ABFE Calculation',
    iconName: 'Flame',
    description: 'Compute absolute binding free energy',
    accentColor: 'orange',
    service: 'abfe',
    isDefault: false,
    category: 'free-energy',
  },
  {
    id: 'rbfe',
    name: 'RBFE Calculation',
    iconName: 'GitBranch',
    description: 'Compute relative binding free energy between ligands',
    accentColor: 'cyan',
    service: 'rbfe',
    isDefault: false,
    category: 'free-energy',
  },
  {
    id: 'boltz2',
    name: 'Boltz-2 Prediction',
    iconName: 'Sparkles',
    description: 'Predict binding affinity with deep learning',
    accentColor: 'purple',
    service: 'boltz2',
    isDefault: false,
    category: 'simulations',
  },
  {
    id: 'admet',
    name: 'ADMET Analysis',
    iconName: 'Beaker',
    description: 'Predict pharmacokinetic and toxicity properties',
    accentColor: 'pink',
    service: 'admet',
    isDefault: false,
    category: 'analysis',
  },
  {
    id: 'quantum-chemistry',
    name: 'Quantum Chemistry',
    iconName: 'Zap',
    description: 'ORCA quantum chemistry calculations',
    accentColor: 'blue',
    service: 'qc',
    isDefault: false,
    category: 'analysis',
  },
  {
    id: 'results',
    name: 'Results Browser',
    iconName: 'BarChart3',
    description: 'Browse all calculation results',
    isDefault: true,
  },
]

export const defaultTools = toolsConfig.filter(t => t.isDefault)
export const experimentTools = toolsConfig.filter(t => !t.isDefault && t.id !== 'library')

export const toolCategories = {
  preparation: {
    name: 'Preparation',
    description: 'Prepare structures for simulations',
  },
  simulations: {
    name: 'Simulations',
    description: 'Run molecular simulations and predictions',
  },
  'free-energy': {
    name: 'Free Energy',
    description: 'Calculate binding free energies',
  },
  analysis: {
    name: 'Analysis',
    description: 'Analyze molecular properties',
  },
} as const

export type ToolCategory = keyof typeof toolCategories

/** New Experiment overlay “Load tools” FAB — fixed gateway blue (sidebar button uses base colour). */
export const EXPERIMENT_ENTRY_BUTTON_CLASS =
  'bg-blue-600 hover:bg-blue-700 border-blue-500'

export function getToolById(id: ToolId): ToolConfig | undefined {
  return toolsConfig.find(t => t.id === id)
}

export function getToolsByCategory(category: ToolCategory): ToolConfig[] {
  return experimentTools.filter(t => t.category === category)
}
