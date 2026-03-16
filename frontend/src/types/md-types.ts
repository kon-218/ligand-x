// MD Optimization Types

export type SimulationLength = 'short' | 'medium' | 'long' | 'custom'

export type LigandInputMethod = 'existing' | 'smiles' | 'structure' | 'none'

export type ChargeMethod = 'mmff94' | 'gasteiger' | 'am1bcc' | 'orca'

export type ForcefieldMethod = 'openff-2.2.0' | 'gaff' | 'gaff2'

export type BoxShape = 'dodecahedron' | 'cubic'

export interface MDParameters {
  simulation_length: SimulationLength
  nvt_steps?: number
  npt_steps?: number
  temperature: number
  pressure: number
  ionic_strength: number
  preview_before_equilibration?: boolean
  pause_at_minimized?: boolean
  minimization_only?: boolean
  charge_method?: ChargeMethod
  forcefield_method?: ForcefieldMethod
  box_shape?: BoxShape
  production_steps?: number
  production_report_interval?: number
  padding_nm?: number
}

export interface LigandInput {
  method: LigandInputMethod
  // For existing ligand selection
  ligand_id?: string
  ligand_type?: 'ligand' | 'edited' | 'docked'
  // For SMILES input
  smiles?: string
  generate_conformer?: boolean
  // For structure file
  file_data?: string
  file_name?: string
  preserve_pose?: boolean
}

export interface MDOptimizationConfig {
  protein_data?: string
  protein_id?: string
  protein_name?: string
  ligand_name?: string
  ligand_input: LigandInput
  parameters: MDParameters
  preview_before_equilibration?: boolean
  preview_acknowledged?: boolean
  pause_at_minimized?: boolean
  minimization_only?: boolean
  minimized_acknowledged?: boolean
}

export interface MDOutputFiles {
  [key: string]: string | undefined
  final_structure?: string
  trajectory?: string
  topology?: string
  analysis?: string
  parameters?: string
  log?: string
}

export interface MDAnalysis {
  rmsd?: number[]
  energy?: number[]
  temperature?: number[]
  pressure?: number[]
  volume?: number[]
  density?: number[]
}

export interface MDResult {
  status: string
  success: boolean
  job_id?: string
  output_files?: MDOutputFiles
  analysis?: MDAnalysis
  execution_time?: number
  final_energy?: number
  average_rmsd?: number
  error?: string
  message?: string
  workflow_stage?: string
  minimization_only?: boolean
  total_atoms?: number
  completed_stages?: string[]
}

export interface TrajectoryFrame {
  frame_number: number
  pdb_data: string
  timestamp?: number
}

export interface TrajectoryInfo {
  num_frames: number
  duration: number
  timestep: number
  temperature: number
  pressure: number
}

export interface TrajectoryAnalysisResult {
  time_ns: number[]
  rmsd_angstrom: number[]
  rmsf_angstrom: number[]
  rg_angstrom: number[]
  residue_labels: string[]
  n_frames: number
  n_residues: number
}

