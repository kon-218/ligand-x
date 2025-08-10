// Docking workflow type definitions

export interface GridBox {
  center_x: number
  center_y: number
  center_z: number
  size_x: number
  size_y: number
  size_z: number
}

export interface DockingParams {
  gridPadding: number
  exhaustiveness: number
  scoringFunction: 'vina' | 'ad4' | 'vinardo'
  numPoses: number
  maxPosesReturned: number
  energyRange: number
  useVinaApi: boolean
}

export interface DockingPose {
  mode: number
  affinity: number
  rmsd_lb: number
  rmsd_ub: number
}

export interface DockingResults {
  success: boolean
  poses?: DockingPose[]
  best_affinity?: number
  binding_strength?: string
  num_poses?: number
  log?: string  // PDBQT poses data (legacy, for backward compatibility)
  poses_pdbqt?: string  // PDBQT poses data (raw from Vina)
  poses_sdf?: string  // SDF poses data with preserved bond orders (from backend via RDKit/OpenBabel)
  poses_pdb?: string  // PDB poses data converted by backend via OpenBabel (preferred for visualization)
  error?: string
  results?: Array<{
    ligand_name: string
    status: string
    result: DockingResults
    error?: string
  }>
}

export interface LigandOption {
  id: string
  name: string
}

export interface BatchDockingJob {
  id: string
  ligandId: string
  ligandName: string
  receptorName?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  results?: DockingResults
  error?: string
  createdAt: number
  completedAt?: number
}

export interface BatchDockingConfig {
  protein_pdb: string
  ligands: Array<{
    id: string
    name: string
    data: string
    format: 'sdf' | 'pdb'
    resname: string
  }>
  grid_padding: number
  grid_box?: GridBox  // Pre-calculated grid box from UI
  docking_params: {
    exhaustiveness: number
    num_modes: number
    energy_range: number
    scoring_function: 'vina' | 'ad4' | 'vinardo'
  }
  use_api: boolean
}

export const DEFAULT_DOCKING_PARAMS: DockingParams = {
  gridPadding: 5.0,
  exhaustiveness: 32,
  scoringFunction: 'vina',
  numPoses: 9,
  maxPosesReturned: 5,
  energyRange: 100.0,
  useVinaApi: true,
}
