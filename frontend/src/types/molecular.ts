// Molecular Types

export interface Atom {
  index: number
  symbol: string
  x: number
  y: number
  z: number
  residue_name: string
  residue_number: number
  chain: string
  charge?: number
}

export interface Bond {
  index: number
  atom1_index: number
  atom2_index: number
  order: number
}

export interface Residue {
  name: string
  number: number
  chain: string
  atoms: Atom[]
}

export interface Chain {
  id: string
  residues: Residue[]
}

export interface Ligand {
  id: string
  name: string
  residue_name: string
  residue_number: number
  chain_id: string
  smiles: string
  molecular_weight?: number
  logp?: number
  pdb_data?: string
  sdf_data?: string
}

export interface MolecularStructure {
  structure_id: string
  filename?: string
  format?: 'pdb' | 'sdf' | 'mol2' | 'cif' | 'xyz'
  pdb_data: string
  sdf_data?: string
  xyz_data?: string
  smiles?: string
  atoms?: Atom[]
  bonds?: Bond[]
  residues?: Residue[]
  chains?: Chain[]
  ligands?: { [key: string]: Ligand }
  library_save?: {
    saved: boolean
    molecule_id?: number
    already_exists?: boolean
    error?: string
  }
  metadata?: any
  source?: string
  components?: any
}

// Visualization Types
export type VisualizationStyle = 'cartoon' | 'stick' | 'sphere' | 'line' | 'cross'
export type SurfaceType = 'vdw' | 'ses' | 'sas' | 'ms'
export type ColorTheme = 'element' | 'residue' | 'chain' | 'secondary' | 'hydrophobicity' | 'default' | 'striped' | 'custom' | 'fukui' | 'uncertainty'

export interface VisualizationState {
  style: VisualizationStyle
  showSurface: boolean
  surfaceType: SurfaceType
  surfaceOpacity: number
  colorTheme: ColorTheme
  showLigands: boolean
  showWater: boolean
  showProtein?: boolean
  showIons?: boolean
  backgroundColor: number
  zoom?: number
  center?: [number, number, number]
  rotation?: [number, number, number, number]
}

// Docking Types
export interface GridBox {
  center_x: number
  center_y: number
  center_z: number
  size_x: number
  size_y: number
  size_z: number
}

export interface DockingConfig {
  center_x: number
  center_y: number
  center_z: number
  size_x: number
  size_y: number
  size_z: number
  exhaustiveness: number
  num_modes: number
  energy_range: number
}

export interface DockingResult {
  pdb_data: string
  score: number
  rmsd_lb: number
  rmsd_ub: number
  model_number: number
}

// ADMET Prediction Types
export interface ADMETPropertyGroup {
  [key: string]: string
}

export interface ADMETResult {
  Physicochemical?: ADMETPropertyGroup
  Absorption?: ADMETPropertyGroup
  Distribution?: ADMETPropertyGroup
  Metabolism?: ADMETPropertyGroup
  Excretion?: ADMETPropertyGroup
  Toxicity?: ADMETPropertyGroup
  _metadata?: {
    canonical_smiles?: string
    molecule_name?: string
    cached?: boolean
    cached_at?: string
  }
}

export interface ADMETRequest {
  smiles?: string
  smiles_list?: string[]
  pdb_data?: string
  molecule_name?: string
  molecule_names?: string[]
}

export interface ADMETBatchResult {
  success: boolean
  batch: boolean
  total: number
  valid: number
  cached: number
  predicted: number
  duplicates_removed: number
  already_cached: number
  invalid_count: number
  invalid_smiles?: Array<{
    smiles: string
    error: string
  }>
  results: Array<{
    smiles: string
    canonical_smiles?: string
    molecule_name?: string
    result?: ADMETResult
    error?: string
    valid: boolean
    cached?: boolean
  }>
}
