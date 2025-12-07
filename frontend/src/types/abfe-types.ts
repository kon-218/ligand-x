// ABFE Calculation Types

export interface ABFEParameters {
    simulation_time_ns?: number
    lambda_windows?: number
    equilibration_steps?: number
    production_steps?: number
    n_iterations?: number  // Number of simulation iterations (deprecated, use production_length_ns)
    steps_per_iteration?: number  // Steps per iteration (deprecated)
    fast_mode?: boolean  // Fast mode: fewer iterations for faster results (default: true)

    // New parameters for fine-grained control
    equilibration_length_ns?: number  // Equilibration time in nanoseconds
    production_length_ns?: number  // Production time in nanoseconds
    n_checkpoints?: number  // Number of checkpoints during production (deprecated, use production_n_checkpoints)
    protocol_repeats?: number  // Number of independent repetitions (default: 3)
    time_per_iteration_ps?: number  // Time per iteration in picoseconds (default: 2.5 ps)

    // Production checkpoint settings
    production_n_checkpoints?: number  // Number of checkpoints for production phase (default: 10)
    production_checkpoint_interval_ns?: number  // Direct checkpoint interval for production phase in nanoseconds
    production_checkpoint_mode?: 'number' | 'interval'  // Which mode is active: 'number' or 'interval'

    // Equilibration checkpoint settings
    equilibration_n_checkpoints?: number  // Number of checkpoints for equilibration phase (default: 5)
    equilibration_checkpoint_interval_ns?: number  // Direct checkpoint interval for equilibration phase in nanoseconds
    equilibration_checkpoint_mode?: 'number' | 'interval'  // Which mode is active: 'number' or 'interval'

    temperature?: number
    pressure?: number
    ionic_strength?: number
    charge_method?: 'am1bcc' | 'am1bccelf10' | 'nagl' | 'espaloma'
    ligand_forcefield?: string
}

export interface ABFECalculationConfig {
    protein_id?: string
    protein_data?: string
    ligand_id?: string
    ligand_data?: string
    ligand_name?: string
    parameters?: ABFEParameters
}

export interface ABFEResult {
    job_id: string
    status: 'submitted' | 'preparing' | 'running' | 'completed' | 'failed' | 'not_found'
    binding_free_energy_kcal_mol?: number
    ligand_id?: string
    protein_id?: string
    job_dir?: string
    error?: string
    message?: string
    results?: {
        binding_free_energy_kcal_mol?: number
        ligand_id?: string
        protein_id?: string
        job_dir?: string
    }
    parsedResults?: ABFEParsedResults
}

export interface ABFEParsedResults {
    job_id: string
    dg_results: Array<{
        ligand: string
        dg_kcal_mol: number
        uncertainty_kcal_mol: number
    }>
    dg_raw: Array<{
        leg: string
        ligand: string
        dg_kcal_mol: number
        uncertainty_kcal_mol: number
    }>
    ligands: string[]
    job_dir?: string
    error?: string
}

export interface StructureOption {
    id: string
    name: string
    type: 'protein' | 'ligand' | 'complex' | 'edited' | 'docked'
    source?: string
    added_at?: string
}

export interface ABFEJob {
    job_id: string
    status: 'submitted' | 'preparing' | 'running' | 'completed' | 'failed' | 'not_found'
    ligand_id?: string
    protein_id?: string
    binding_free_energy_kcal_mol?: number
    created_at?: string
    updated_at?: string
    error?: string
    job_dir?: string
}

// Detailed Analysis Types
export interface ABFEAnalysisData {
    job_id: string
    legs: ABFELegAnalysis[]
    convergence_data: ABFEConvergenceData | null
    thermodynamic_cycle: ABFEThermodynamicCycle | null
    output_files: ABFEOutputFiles
    error?: string
}

export interface ABFELegAnalysis {
    leg_name: string  // 'complex' | 'solvent'
    leg_type: 'complex' | 'solvent'
    repeat_num?: number  // Repeat/attempt number (0, 1, 2, etc.)
    status: 'completed' | 'running' | 'failed' | 'pending'
    free_energy_kT?: number
    free_energy_kcal_mol?: number
    uncertainty_kcal_mol?: number
    n_lambda_windows?: number
    n_iterations?: number

    // Analysis plots (base64 encoded or URLs)
    overlap_matrix_path?: string
    replica_exchange_matrix_path?: string
    replica_state_timeseries_path?: string

    // MBAR analysis data
    mbar_analysis?: ABFEMBARAnalysis

    // Timing info
    timing_data?: ABFETimingData
}

export interface ABFEMBARAnalysis {
    free_energy_in_kT: number
    standard_error_in_kT: number
    number_of_uncorrelated_samples: number
    n_equilibrium_iterations: number
    statistical_inefficiency: number
}

export interface ABFETimingData {
    iteration_seconds: number
    average_seconds_per_iteration: number
    estimated_time_remaining: string
    estimated_total_time: string
    ns_per_day: number
    percent_complete: number
}

export interface ABFEConvergenceData {
    // Forward/reverse analysis
    forward_reverse_available: boolean
    checkpoints: ABFEConvergenceCheckpoint[]
}

export interface ABFEConvergenceCheckpoint {
    iteration: number
    percent_complete: number
    leg: string
    free_energy_kT: number
    standard_error_kT: number
    n_uncorrelated_samples: number
}

export interface ABFEThermodynamicCycle {
    // Thermodynamic cycle components
    dg_complex: number  // ΔG(complex)
    dg_complex_error: number
    dg_solvent: number  // ΔG(solvent)
    dg_solvent_error: number
    dg_restraint_correction?: number  // Standard state correction
    dg_binding: number  // ΔG(binding) = ΔG(solvent) - ΔG(complex) + correction
    dg_binding_error: number
}

export interface ABFEOutputFiles {
    logs: ABFEFileInfo[]
    structures: ABFEFileInfo[]
    trajectories: ABFEFileInfo[]
    analysis_plots: ABFEFileInfo[]
}

export interface ABFEFileInfo {
    filename: string
    path: string
    size_bytes: number
    leg: string
    file_type: 'log' | 'structure' | 'trajectory' | 'plot' | 'data'
    description?: string
    repeat_num?: number
    leg_dir?: string  // Directory name for file retrieval
}
