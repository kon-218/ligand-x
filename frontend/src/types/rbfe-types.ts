// RBFE (Relative Binding Free Energy) Calculation Types

export type LigandInputMethod = 'existing' | 'smiles' | 'structure'
export type NetworkTopology = 'mst' | 'radial' | 'maximal'
export type DockingMode = 'existing_poses' | 'run_docking' | 'skip'
export type AtomMapperType = 'kartograf' | 'lomap' | 'lomap_relaxed'

export interface LigandSelection {
  id: string
  name: string
  source: 'library' | 'current_structure' | 'uploaded'
  smiles?: string
  sdf_data?: string
  pdb_data?: string
  has_docked_pose?: boolean
  docking_affinity?: number  // Docking affinity in kcal/mol
}

export interface RBFEParameters {
  // Network settings
  network_topology?: NetworkTopology
  central_ligand?: string  // For radial networks

  // Atom mapper settings (NEW - OpenFE best practices)
  atom_mapper?: AtomMapperType  // Atom mapper for network creation (default: 'kartograf')
  atom_map_hydrogens?: boolean  // For Kartograf - include hydrogens in mapping (default: true)
  lomap_max3d?: number  // For LOMAP - max 3D distance for mapping (default: 1.0)

  // Simulation settings
  lambda_windows?: number
  equilibration_length_ns?: number
  production_length_ns?: number
  protocol_repeats?: number
  fast_mode?: boolean

  // Robustness settings
  robust?: boolean
  timestep_fs?: number
  hydrogen_mass?: number

  // System settings
  temperature?: number
  pressure?: number
  ionic_strength?: number

  // Charge settings
  charge_method?: 'am1bcc' | 'am1bccelf10' | 'nagl' | 'espaloma'
  ligand_forcefield?: string  // Forcefield for ligand (e.g., 'openff-2.0.0')

  // Compute settings
  compute_platform?: 'CUDA' | 'OpenCL' | 'CPU'
}

export interface RBFENetworkEdge {
  ligand_a: string
  ligand_b: string
  score: number
  mapping_info?: Record<string, any>
}

export interface RBFENetworkQuality {
  num_nodes: number
  num_edges: number
  avg_score: number
  min_score: number
  max_score: number
  quality: 'excellent' | 'good' | 'moderate' | 'poor' | 'estimated'
}

export interface RBFENetworkData {
  nodes: string[]
  edges: RBFENetworkEdge[]
  topology: NetworkTopology
  central_ligand?: string
  quality?: RBFENetworkQuality
  mapper_used?: AtomMapperType  // Atom mapper that was used to create this network
}

export interface RBFETransformationResult {
  name: string
  ligand_a?: string
  ligand_b?: string
  leg?: 'complex' | 'solvent'
  estimate_kcal_mol?: number
  uncertainty_kcal_mol?: number
  status: 'completed' | 'failed' | 'running' | 'pending'
  error?: string
  overlap_matrix?: number[][] | null
  overlap_matrix_path?: string
}

export interface RBFEDdGValue {
  ligand_a: string
  ligand_b: string
  ddg_kcal_mol: number
  uncertainty_kcal_mol: number
}

export interface RBFEResults {
  transformation_results: RBFETransformationResult[]
  ddg_values: RBFEDdGValue[]
  relative_affinities: Record<string, number>  // ligand_name -> relative ddG
  reference_ligand?: string
  // Per-transformation overlap matrices, keyed as "ligand_a|ligand_b"
  overlap_matrices?: Record<string, { complex?: number[][] | null; solvent?: number[][] | null }>
}

export interface DockedPoseInfo {
  ligand_id: string
  affinity_kcal_mol: number
  pose_pdb_path: string
  complex_pdb_path: string
  alignment_score?: number
  mcs_atoms?: number
}

export interface AlignedLigandInfo {
  id: string
  is_reference: boolean
  aligned_to?: string
  rmsd?: number
}

export interface AlignmentInfo {
  reference_ligand: string
  aligned_ligands: AlignedLigandInfo[]
  failed_ligands: Array<{ id: string; error: string }>
  alignment_method: string
}

export interface RBFEJob {
  job_id: string
  status: 'submitted' | 'preparing' | 'aligning' | 'docking' | 'docking_ready' | 'resuming' | 'running' | 'completed' | 'failed' | 'not_found' | 'cancelled'
  protein_id?: string
  num_ligands?: number
  network_topology?: NetworkTopology
  progress?: number
  message?: string
  network?: RBFENetworkData
  results?: RBFEResults
  // Alignment/docking results (available when status is 'docking_ready')
  alignment_info?: AlignmentInfo
  reference_ligand?: string
  docked_poses?: DockedPoseInfo[]
  docking_scores?: Record<string, number>
  docking_log?: string
  output_files?: {
    docked_poses_dir?: string
    console_log?: string
    docking_scores?: string
    alignment_info?: string
  }
  job_dir?: string
  created_at?: string
  updated_at?: string
  error?: string
}

export interface RBFECalculationConfig {
  protein_pdb: string
  ligands: Array<{
    id: string
    data: string
    format: 'sdf' | 'mol' | 'pdb'
    has_docked_pose?: boolean
    docking_affinity?: number  // Docking affinity in kcal/mol
  }>
  protein_id?: string
  network_topology?: NetworkTopology
  central_ligand?: string
  simulation_settings?: RBFEParameters
}

export interface BatchDockingConfig {
  protein_pdb: string
  ligands: Array<{
    id: string
    data: string
    format: 'sdf' | 'smiles'
  }>
  grid_box?: {
    center_x: number
    center_y: number
    center_z: number
    size_x: number
    size_y: number
    size_z: number
  }
  exhaustiveness?: number
  num_poses?: number
}

export interface BatchDockingResult {
  job_id: string
  status: string
  results?: Array<{
    ligand_id: string
    poses: Array<{
      affinity: number
      pdbqt_data: string
      sdf_data?: string
    }>
    best_affinity?: number
    error?: string
  }>
}

// Atom mapping preview types
export interface MappingPairResult {
  ligand_a: string
  ligand_b: string
  score: number
  num_mapped: number
  num_unique_a: number
  num_unique_b: number
  svgs: string[]  // [svg_mol_a, svg_mol_b] — raw SVG strings from RDKit
}

export interface MappingPreviewResult {
  job_id: string
  status: string
  pairs: MappingPairResult[]
  num_ligands: number
  atom_mapper: string
}

// Store state types
export interface RBFEStoreState {
  // Workflow state
  currentStep: number
  maxStep: number

  // Protein selection
  selectedProtein: string | null

  // Ligand selection (multi-select)
  availableLigands: LigandSelection[]
  selectedLigandIds: string[]

  // Docking mode
  dockingMode: DockingMode
  isDocking: boolean
  dockingProgress: number
  dockingStatus: string

  // Network configuration
  networkTopology: NetworkTopology
  centralLigand: string | null
  networkPreview: RBFENetworkData | null

  // RBFE Parameters
  rbfeParameters: RBFEParameters

  // Job Management
  jobs: RBFEJob[]
  activeJobId: string | null

  // Results
  rbfeResult: RBFEJob | null
  isRunning: boolean
  progress: number
  progressMessage: string
  jobId: string | null
}


